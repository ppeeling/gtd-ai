import express from "express";
import { createServer as createViteServer } from "vite";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";

let db: Firestore | null = null;

function getDb() {
  if (!db) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!projectId || !clientEmail || !privateKey) {
      throw new Error('Firebase environment variables are missing. Please configure FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY.');
    }

    if (getApps().length === 0) {
      initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
    }
    db = getFirestore();
  }
  return db;
}

const app = express();
app.use(express.json({ limit: '50mb' }));
const PORT = 3000;

// Authentication Middleware
app.use(['/api', '/mcp'], (req, res, next) => {
  const configuredPasscode = process.env.APP_PASSCODE;
  if (!configuredPasscode) {
    return next();
  }
  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${configuredPasscode}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

// Email Webhook
app.post("/api/webhooks/email", async (req, res) => {
  try {
    const firestore = getDb();
    
    // Handle different webhook formats (SendGrid, Mailgun, Postmark, etc.)
    const subject = req.body.subject || req.body.Subject || req.body['subject'];
    const text = req.body.text || req.body.TextBody || req.body['body-plain'];
    const html = req.body.html || req.body.HtmlBody || req.body['body-html'];
    
    if (!subject) {
      return res.status(400).json({ error: "Missing subject" });
    }

    const newTask = {
      id: uuidv4(),
      listId: 'inbox',
      name: subject,
      completed: false,
      timer: { isRunning: false, elapsedTime: 0 },
      createdAt: Date.now(),
      notes: text || html || '',
    };

    await firestore.collection('tasks').doc(newTask.id).set(newTask);
    res.json({ success: true, task: newTask });
  } catch (error: any) {
    console.error("Email webhook error:", error);
    res.status(500).json({ error: error.message });
  }
});

// MCP Server Setup
const mcp = new McpServer({
  name: "GTD Master",
  version: "1.0.0"
});

mcp.tool("list_tasks", "List all tasks", {}, async () => {
  try {
    const firestore = getDb();
    const tasksSnap = await firestore.collection('tasks').get();
    const tasks = tasksSnap.docs.map(d => d.data());
    return {
      content: [{ type: "text", text: JSON.stringify(tasks, null, 2) }]
    };
  } catch (error: any) {
    return {
      content: [{ type: "text", text: `Error: ${error.message}` }],
      isError: true
    };
  }
});

mcp.tool("add_task", "Add a new task", {
  name: z.string().describe("The name of the task"),
  listId: z.string().optional().describe("The ID of the list to add the task to (defaults to 'inbox')")
}, async ({ name, listId }) => {
  try {
    const firestore = getDb();
    const newTask = {
      id: uuidv4(),
      listId: listId || 'inbox',
      name,
      completed: false,
      timer: { isRunning: false, elapsedTime: 0 },
      createdAt: Date.now()
    };
    await firestore.collection('tasks').doc(newTask.id).set(newTask);
    return {
      content: [{ type: "text", text: `Task added successfully: ${JSON.stringify(newTask)}` }]
    };
  } catch (error: any) {
    return {
      content: [{ type: "text", text: `Error: ${error.message}` }],
      isError: true
    };
  }
});

mcp.tool("update_task", "Update an existing task", {
  id: z.string().describe("The ID of the task to update"),
  name: z.string().optional().describe("The new name of the task"),
  completed: z.boolean().optional().describe("Whether the task is completed"),
  listId: z.string().optional().describe("The ID of the list to move the task to")
}, async ({ id, name, completed, listId }) => {
  try {
    const firestore = getDb();
    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (completed !== undefined) updates.completed = completed;
    if (listId !== undefined) updates.listId = listId;
    
    await firestore.collection('tasks').doc(id).update(updates);
    return {
      content: [{ type: "text", text: `Task updated successfully` }]
    };
  } catch (error: any) {
    return {
      content: [{ type: "text", text: `Error: ${error.message}` }],
      isError: true
    };
  }
});

const mcpTransports = new Map<string, SSEServerTransport>();

app.get("/mcp/sse", async (req, res) => {
  const transport = new SSEServerTransport("/mcp/messages", res);
  mcpTransports.set(transport.sessionId, transport);
  
  res.on('close', () => {
    mcpTransports.delete(transport.sessionId);
  });

  await mcp.connect(transport);
});

app.post("/mcp/messages", async (req, res) => {
  const sessionId = req.query.sessionId as string;
  const transport = mcpTransports.get(sessionId);
  
  if (transport) {
    await transport.handlePostMessage(req, res, req.body);
  } else {
    res.status(404).json({ error: "Session not found" });
  }
});

// API Routes
app.get("/api/state", async (req, res) => {
  try {
    const firestore = getDb();
    const [listsSnap, tasksSnap, promptsSnap] = await Promise.all([
      firestore.collection('lists').get(),
      firestore.collection('tasks').get(),
      firestore.collection('saved_prompts').get()
    ]);
    
    let lists = listsSnap.docs.map(d => d.data());
    lists.sort((a, b) => (a.order || 0) - (b.order || 0));
    const tasks = tasksSnap.docs.map(d => d.data());
    const savedPrompts = promptsSnap.docs.map(d => d.data());

    if (lists.length === 0) {
      const defaultLists = [
        { id: 'inbox', name: 'Inbox', isSystem: true },
        { id: 'next-actions', name: 'Next Actions', isSystem: true },
        { id: 'waiting-for', name: 'Waiting For', isSystem: true },
        { id: 'projects', name: 'Projects', isSystem: true },
        { id: 'someday-maybe', name: 'Someday/Maybe', isSystem: true },
      ];
      const batch = firestore.batch();
      defaultLists.forEach(l => {
        batch.set(firestore.collection('lists').doc(l.id), l);
      });
      await batch.commit();
      lists = defaultLists;
    }
    
    res.json({ lists, tasks, savedPrompts });
  } catch (error: any) {
    if (error.code === 5 || error.message?.includes('NOT_FOUND')) {
      res.status(500).json({ error: 'Firestore Database not found. Please go to the Firebase Console, navigate to "Firestore Database" in the left sidebar, and click "Create database".' });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// Lists
app.post("/api/lists", async (req, res) => {
  try {
    const firestore = getDb();
    const { id, name, isSystem, order } = req.body;
    await firestore.collection('lists').doc(id).set({ id, name, isSystem: !!isSystem, order: order || 0 });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/lists/reorder", async (req, res) => {
  try {
    const firestore = getDb();
    const { updates } = req.body; // Array of { id, order }
    const batch = firestore.batch();
    
    for (const update of updates) {
      batch.update(firestore.collection('lists').doc(update.id), { order: update.order });
    }
    
    await batch.commit();
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/lists/:id", async (req, res) => {
  try {
    const firestore = getDb();
    const id = req.params.id;
    const batch = firestore.batch();
    batch.delete(firestore.collection('lists').doc(id));
    
    const tasksSnap = await firestore.collection('tasks').where('listId', '==', id).get();
    tasksSnap.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    await batch.commit();
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Tasks
app.post("/api/tasks", async (req, res) => {
  try {
    const firestore = getDb();
    const task = req.body;
    await firestore.collection('tasks').doc(task.id).set(task);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/tasks/:id", async (req, res) => {
  try {
    const firestore = getDb();
    const updates = req.body;
    await firestore.collection('tasks').doc(req.params.id).update(updates);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/tasks/:id", async (req, res) => {
  try {
    const firestore = getDb();
    await firestore.collection('tasks').doc(req.params.id).delete();
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Saved Prompts
app.post("/api/prompts", async (req, res) => {
  try {
    const firestore = getDb();
    const prompt = req.body;
    await firestore.collection('saved_prompts').doc(prompt.id).set(prompt);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/prompts/:id", async (req, res) => {
  try {
    const firestore = getDb();
    await firestore.collection('saved_prompts').doc(req.params.id).delete();
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Import Data
app.post("/api/import", async (req, res) => {
  try {
    const firestore = getDb();
    const { lists, tasks, savedPrompts } = req.body;
    
    const batch = firestore.batch();
    
    const [oldLists, oldTasks, oldPrompts] = await Promise.all([
      firestore.collection('lists').get(),
      firestore.collection('tasks').get(),
      firestore.collection('saved_prompts').get()
    ]);
    
    const existingListIds = new Set(oldLists.docs.map(d => d.id));
    const existingTaskIds = new Set(oldTasks.docs.map(d => d.id));
    const existingPromptIds = new Set(oldPrompts.docs.map(d => d.id));
    
    lists?.forEach((l: any) => {
      if (!existingListIds.has(l.id)) {
        batch.set(firestore.collection('lists').doc(l.id), l);
      }
    });
    tasks?.forEach((t: any) => {
      if (!existingTaskIds.has(t.id)) {
        batch.set(firestore.collection('tasks').doc(t.id), t);
      }
    });
    savedPrompts?.forEach((p: any) => {
      if (!existingPromptIds.has(p.id)) {
        batch.set(firestore.collection('saved_prompts').doc(p.id), p);
      }
    });
    
    await batch.commit();
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
