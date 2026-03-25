import express from "express";
import { createServer as createViteServer } from "vite";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";
import zlib from "zlib";
import pcapp from "pcap-parser";
import dnsPacket from "dns-packet";

let db: Firestore | null = null;

let lastDnsPackets: any[] = [];
let lastPcapLogs: string[] = [];

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
app.use(['/api', '/mcp', '/ingest'], (req, res, next) => {
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
app.post("/ingest/pcap", (req, res) => {
  try {
    lastPcapLogs = [];
    const log = (msg: string) => {
      const timestamp = new Date().toISOString();
      const logMsg = `[${timestamp}] ${msg}`;
      lastPcapLogs.push(logMsg);
      console.log(logMsg);
    };

    log("Started receiving PCAP stream");

    const gunzip = zlib.createGunzip();
    req.pipe(gunzip);

    const parser = pcapp.parse(gunzip);
    const packets: any[] = [];
    let linkLayerType = 1;
    let totalPackets = 0;
    let skippedPackets = 0;
    let parseErrors = 0;

    parser.on('globalHeader', (header: any) => {
      linkLayerType = header.network;
      log(`Global header received. Link layer type: ${linkLayerType}`);
    });

    parser.on('packet', (packet: any) => {
      totalPackets++;
      if (totalPackets % 1000 === 0) {
         log(`Processed ${totalPackets} packets...`);
      }
      try {
        const buffer = packet.data;
        let offset = 0;
        let etherType = 0;

        if (linkLayerType === 1) { // Ethernet
          if (buffer.length < 14) { skippedPackets++; return; }
          etherType = buffer.readUInt16BE(12);
          offset = 14;
        } else if (linkLayerType === 113) { // Linux SLL
          if (buffer.length < 16) { skippedPackets++; return; }
          etherType = buffer.readUInt16BE(14);
          offset = 16;
        } else if (linkLayerType === 101 || linkLayerType === 12) { // Raw IP
          offset = 0;
          const version = buffer[0] >> 4;
          if (version === 4) etherType = 0x0800;
          else if (version === 6) etherType = 0x86dd;
          else { skippedPackets++; return; }
        } else if (linkLayerType === 0 || linkLayerType === 108) { // Loopback
          if (buffer.length < 4) { skippedPackets++; return; }
          const family = buffer.readUInt32LE(0);
          if (family === 2 || family === 0x02000000 || buffer[0] === 0x45) etherType = 0x0800;
          else if (family === 24 || family === 28 || family === 30 || family === 0x1c000000 || family === 0x18000000 || family === 0x1e000000 || (buffer[0] >> 4) === 6) etherType = 0x86dd;
          else { skippedPackets++; return; }
          offset = 4;
        } else {
          skippedPackets++;
          return;
        }

        while (etherType === 0x8100 && offset + 4 <= buffer.length) {
          etherType = buffer.readUInt16BE(offset + 2);
          offset += 4;
        }

        let protocol = 0;
        let srcIp = '';
        let dstIp = '';

        if (etherType === 0x0800) { // IPv4
          if (buffer.length < offset + 20) { skippedPackets++; return; }
          const ihl = buffer[offset] & 0x0F;
          protocol = buffer[offset + 9];
          srcIp = `${buffer[offset+12]}.${buffer[offset+13]}.${buffer[offset+14]}.${buffer[offset+15]}`;
          dstIp = `${buffer[offset+16]}.${buffer[offset+17]}.${buffer[offset+18]}.${buffer[offset+19]}`;
          offset += ihl * 4;
        } else if (etherType === 0x86DD) { // IPv6
          if (buffer.length < offset + 40) { skippedPackets++; return; }
          protocol = buffer[offset + 6];
          srcIp = buffer.slice(offset + 8, offset + 24).toString('hex').match(/.{1,4}/g)?.join(':') || '';
          dstIp = buffer.slice(offset + 24, offset + 40).toString('hex').match(/.{1,4}/g)?.join(':') || '';
          offset += 40;
        } else {
          skippedPackets++;
          return;
        }

        if (protocol === 17) { // UDP
          if (buffer.length < offset + 8) { skippedPackets++; return; }
          const srcPort = buffer.readUInt16BE(offset);
          const dstPort = buffer.readUInt16BE(offset + 2);
          const udpLength = buffer.readUInt16BE(offset + 4);
          offset += 8;

          if (srcPort === 53 || dstPort === 53 || srcPort === 5353 || dstPort === 5353) {
            const dnsPayload = buffer.slice(offset, offset + udpLength - 8);
            const dns = dnsPacket.decode(dnsPayload);
            packets.push({
              timestamp: packet.header.timestampSeconds * 1000 + Math.floor(packet.header.timestampMicroseconds / 1000),
              srcIp,
              dstIp,
              srcPort,
              dstPort,
              dns
            });
          } else {
            skippedPackets++;
          }
        } else {
          skippedPackets++;
        }
      } catch (e: any) {
        parseErrors++;
        if (parseErrors <= 5) {
          log(`Packet parse error (showing first 5): ${e.message}`);
        }
      }
    });

    parser.on('end', () => {
      log(`Finished parsing PCAP. Total packets: ${totalPackets}, Skipped: ${skippedPackets}, Parse errors: ${parseErrors}, DNS packets found: ${packets.length}`);
      lastDnsPackets = packets;
      res.json({ success: true, count: packets.length, logs: lastPcapLogs });
    });

    parser.on('error', (err: any) => {
      log(`PCAP parser error: ${err.message}`);
      res.status(400).json({ error: 'Failed to parse PCAP', logs: lastPcapLogs });
    });

    gunzip.on('error', (err: any) => {
      log(`Gunzip error: ${err.message}`);
      res.status(400).json({ error: 'Failed to decompress', logs: lastPcapLogs });
    });

  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/dns-traffic", (req, res) => {
  res.json({ packets: lastDnsPackets, logs: lastPcapLogs });
});

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

app.put("/api/tasks/reorder", async (req, res) => {
  try {
    const firestore = getDb();
    const { updates } = req.body; // Array of { id, order }
    const batch = firestore.batch();
    
    for (const update of updates) {
      batch.update(firestore.collection('tasks').doc(update.id), { order: update.order });
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
