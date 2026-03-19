import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { AppState, List, SavedPrompt, Task } from './types';
import { Lock, WifiOff } from 'lucide-react';
import { loadStateFromIDB, saveStateToIDB, addToSyncQueue, getSyncQueue, removeFromSyncQueue } from './db';

const defaultState: AppState = {
  lists: [],
  tasks: [],
  savedPrompts: [],
};

interface AppContextType {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  addTask: (task: Omit<Task, 'id' | 'createdAt' | 'timer' | 'completed'>) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  addList: (name: string) => void;
  deleteList: (id: string) => void;
  reorderLists: (reorderedLists: List[]) => void;
  reorderTasks: (reorderedTasks: Task[]) => void;
  savePrompt: (name: string, prompt: string) => void;
  deletePrompt: (id: string) => void;
  importData: (data: string) => void;
  exportData: () => string;
  isOffline: boolean;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>(defaultState);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passcode, setPasscode] = useState(localStorage.getItem('gtd-passcode') || '');
  const [authError, setAuthError] = useState('');
  const [isLocked, setIsLocked] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const apiFetch = async (url: string, options: RequestInit = {}) => {
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string> || {})
    };
    if (passcode) {
      headers['Authorization'] = `Bearer ${passcode}`;
    }
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401) {
      localStorage.removeItem('gtd-passcode');
      setPasscode('');
      setIsLocked(true);
      if (passcode) {
        setAuthError('Invalid passcode');
      }
      throw new Error('Unauthorized');
    }
    return res;
  };

  const syncOfflineQueue = useCallback(async () => {
    if (isOffline) return;
    try {
      const queue = await getSyncQueue();
      for (const item of queue) {
        try {
          await apiFetch(item.url, {
            method: item.method,
            headers: { 'Content-Type': 'application/json' },
            body: item.body ? JSON.stringify(item.body) : undefined,
          });
          if (item.id !== undefined) {
            await removeFromSyncQueue(item.id);
          }
        } catch (e: any) {
          if (e.message === 'Unauthorized') break; // Stop syncing if unauthorized
          console.error('Failed to sync item', item, e);
        }
      }
    } catch (e) {
      console.error('Sync queue error', e);
    }
  }, [isOffline, passcode]);

  useEffect(() => {
    if (!isOffline) {
      syncOfflineQueue();
    }
  }, [isOffline, syncOfflineQueue]);

  useEffect(() => {
    // Periodically try to sync if online
    const interval = setInterval(() => {
      if (!isOffline) {
        syncOfflineQueue();
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [isOffline, syncOfflineQueue]);

  useEffect(() => {
    const loadData = async () => {
      try {
        const idbState = await loadStateFromIDB();
        if (idbState) {
          setState(idbState);
          setIsLoaded(true);
        }

        if (!isOffline) {
          const res = await apiFetch('/api/state');
          if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Failed to load state');
          }
          const data = await res.json();
          setState(data);
          await saveStateToIDB(data);
          setIsLoaded(true);
          setError(null);
          setIsLocked(false);
        }
      } catch (err: any) {
        console.error('Failed to load state', err);
        if (err.message === 'Unauthorized' || err.message.includes('Unauthorized')) {
          setIsLocked(true);
        } else if (!isLoaded) { // Only show error if we couldn't load from IDB either
          setError(err.message);
        }
      }
    };

    loadData();
  }, [passcode, isOffline]);

  const updateStateAndSync = async (newState: AppState, url: string, method: string, body?: any) => {
    setState(newState);
    await saveStateToIDB(newState);
    
    if (isOffline) {
      await addToSyncQueue(url, method, body);
    } else {
      try {
        await apiFetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: body ? JSON.stringify(body) : undefined
        });
      } catch (e) {
        console.error('API failed, adding to sync queue', e);
        await addToSyncQueue(url, method, body);
      }
    }
  };

  const addTask = async (task: Omit<Task, 'id' | 'createdAt' | 'timer' | 'completed'>) => {
    const newTask: Task = {
      ...task,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      completed: false,
      timer: { isRunning: false, elapsedTime: 0 },
    };
    
    const newState = { ...state, tasks: [newTask, ...state.tasks] };
    await updateStateAndSync(newState, '/api/tasks', 'POST', newTask);
  };

  const updateTask = async (id: string, updates: Partial<Task>) => {
    const newState = {
      ...state,
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    };
    await updateStateAndSync(newState, `/api/tasks/${id}`, 'PUT', updates);
  };

  const deleteTask = async (id: string) => {
    const newState = { ...state, tasks: state.tasks.filter((t) => t.id !== id) };
    await updateStateAndSync(newState, `/api/tasks/${id}`, 'DELETE');
  };

  const addList = async (name: string) => {
    const newList: List = { id: crypto.randomUUID(), name, isSystem: false, order: state.lists.length };
    const newState = { ...state, lists: [...state.lists, newList] };
    await updateStateAndSync(newState, '/api/lists', 'POST', newList);
  };

  const deleteList = async (id: string) => {
    const newState = {
      ...state,
      lists: state.lists.filter((l) => l.id !== id),
      tasks: state.tasks.filter((t) => t.listId !== id),
    };
    await updateStateAndSync(newState, `/api/lists/${id}`, 'DELETE');
  };

  const reorderLists = async (reorderedLists: List[]) => {
    const newState = { ...state, lists: reorderedLists };
    const updates = reorderedLists.map((list, index) => ({ id: list.id, order: index }));
    await updateStateAndSync(newState, '/api/lists/reorder', 'PUT', { updates });
  };

  const reorderTasks = async (reorderedTasks: Task[]) => {
    // We only reorder tasks within a specific list, so we need to merge them back
    // into the full tasks array.
    const listId = reorderedTasks[0]?.listId;
    if (!listId) return;

    // Get all tasks NOT in this list
    const otherTasks = state.tasks.filter(t => t.listId !== listId);
    
    // Combine other tasks with the newly ordered tasks
    const newTasks = [...reorderedTasks, ...otherTasks];
    
    const newState = { ...state, tasks: newTasks };
    const updates = reorderedTasks.map((task, index) => ({ id: task.id, order: index }));
    await updateStateAndSync(newState, '/api/tasks/reorder', 'PUT', { updates });
  };

  const savePrompt = async (name: string, prompt: string) => {
    const newPrompt: SavedPrompt = { id: crypto.randomUUID(), name, prompt };
    const newState = { ...state, savedPrompts: [...state.savedPrompts, newPrompt] };
    await updateStateAndSync(newState, '/api/prompts', 'POST', newPrompt);
  };

  const deletePrompt = async (id: string) => {
    const newState = { ...state, savedPrompts: state.savedPrompts.filter((p) => p.id !== id) };
    await updateStateAndSync(newState, `/api/prompts/${id}`, 'DELETE');
  };

  const importData = async (data: string) => {
    try {
      const parsed = JSON.parse(data);
      if (parsed.lists && parsed.tasks) {
        
        // Ensure tasks have required fields
        const processedTasks = parsed.tasks.map((t: any) => ({
          ...t,
          id: t.id || crypto.randomUUID(),
          createdAt: t.createdAt || Date.now(),
          timer: t.timer || { isRunning: false, elapsedTime: 0 },
          completed: !!t.completed,
          name: t.name || 'Untitled Task',
          listId: t.listId || 'inbox'
        }));

        const processedData = {
          ...parsed,
          tasks: processedTasks
        };

        const existingListIds = new Set(state.lists.map(l => l.id));
        const existingTaskIds = new Set(state.tasks.map(t => t.id));
        const existingPromptIds = new Set(state.savedPrompts.map(p => p.id));
        
        const newLists = (processedData.lists || []).filter((l: any) => !existingListIds.has(l.id));
        const newTasks = (processedData.tasks || []).filter((t: any) => !existingTaskIds.has(t.id));
        const newPrompts = (processedData.savedPrompts || []).filter((p: any) => !existingPromptIds.has(p.id));
        
        const newState = {
          lists: [...state.lists, ...newLists],
          tasks: [...state.tasks, ...newTasks],
          savedPrompts: [...state.savedPrompts, ...newPrompts]
        };

        await updateStateAndSync(newState, '/api/import', 'POST', processedData);
      } else {
        alert('Invalid data format');
      }
    } catch (e) {
      alert('Failed to parse import data');
    }
  };

  const exportData = () => {
    return JSON.stringify(state, null, 2);
  };

  if (isLocked) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-zinc-950 p-8 text-center">
        <div className="max-w-md w-full bg-zinc-900 p-8 rounded-2xl shadow-sm border border-zinc-800">
          <div className="w-12 h-12 bg-indigo-500/20 text-indigo-400 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock size={24} />
          </div>
          <h2 className="text-2xl font-bold text-zinc-100 mb-2">App Locked</h2>
          <p className="text-zinc-400 mb-6 text-sm">Enter your passcode to access the application.</p>
          <form onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const p = fd.get('passcode') as string;
            localStorage.setItem('gtd-passcode', p);
            setPasscode(p);
            setAuthError('');
          }}>
            <input
              type="password"
              name="passcode"
              placeholder="Enter passcode"
              className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 text-zinc-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-4"
              autoFocus
            />
            {authError && <p className="text-rose-400 text-sm mb-4">{authError}</p>}
            <button type="submit" className="w-full py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors">
              Unlock
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (error && !isLoaded) {
    const isMissingEnv = error.includes('environment variables are missing');
    const isNotFound = error.includes('Firestore Database not found');

    return (
      <div className="flex h-screen flex-col items-center justify-center bg-zinc-950 p-8 text-center">
        <div className="max-w-xl bg-zinc-900 p-8 rounded-2xl shadow-sm border border-rose-900/50">
          <h2 className="text-2xl font-bold text-rose-500 mb-4">
            {isNotFound ? 'Database Not Created' : 'Database Configuration Required'}
          </h2>
          <p className="text-zinc-400 mb-6 text-sm">{error}</p>
          
          {isMissingEnv && (
            <>
              <div className="text-left bg-zinc-950 p-4 rounded-lg text-xs font-mono text-zinc-300 overflow-x-auto border border-zinc-800">
                FIREBASE_PROJECT_ID="your-project-id"<br/>
                FIREBASE_CLIENT_EMAIL="your-client-email@your-project-id.iam.gserviceaccount.com"<br/>
                FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
              </div>
              <p className="text-zinc-500 mt-6 text-sm">
                Please add these environment variables in the AI Studio Secrets panel.
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  if (!isLoaded) {
    return <div className="flex h-screen items-center justify-center bg-zinc-950 text-zinc-500">Loading...</div>;
  }

  return (
    <AppContext.Provider
      value={{
        state,
        setState,
        addTask,
        updateTask,
        deleteTask,
        addList,
        deleteList,
        reorderLists,
        reorderTasks,
        savePrompt,
        deletePrompt,
        importData,
        exportData,
        isOffline,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useAppStore() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppStore must be used within an AppProvider');
  }
  return context;
}
