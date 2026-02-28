import React, { createContext, useContext, useEffect, useState } from 'react';
import { AppState, List, SavedPrompt, Task } from './types';
import { Lock } from 'lucide-react';

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
  savePrompt: (name: string, prompt: string) => void;
  deletePrompt: (id: string) => void;
  importData: (data: string) => void;
  exportData: () => string;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>(defaultState);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passcode, setPasscode] = useState(localStorage.getItem('gtd-passcode') || '');
  const [authError, setAuthError] = useState('');
  const [isLocked, setIsLocked] = useState(false);

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

  useEffect(() => {
    apiFetch('/api/state')
      .then(async res => {
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to load state');
        }
        return res.json();
      })
      .then(data => {
        setState(data);
        setIsLoaded(true);
        setError(null);
        setIsLocked(false);
      })
      .catch(err => {
        console.error('Failed to load state', err);
        if (err.message !== 'Unauthorized') {
          setError(err.message);
        }
      });
  }, [passcode]);

  const addTask = async (task: Omit<Task, 'id' | 'createdAt' | 'timer' | 'completed'>) => {
    const newTask: Task = {
      ...task,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      completed: false,
      timer: { isRunning: false, elapsedTime: 0 },
    };
    
    // Optimistic update
    setState((s) => ({ ...s, tasks: [...s.tasks, newTask] }));
    
    try {
      await apiFetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTask)
      });
    } catch (e) {
      console.error(e);
    }
  };

  const updateTask = async (id: string, updates: Partial<Task>) => {
    setState((s) => ({
      ...s,
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    }));
    
    try {
      await apiFetch(`/api/tasks/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
    } catch (e) {
      console.error(e);
    }
  };

  const deleteTask = async (id: string) => {
    setState((s) => ({ ...s, tasks: s.tasks.filter((t) => t.id !== id) }));
    
    try {
      await apiFetch(`/api/tasks/${id}`, { method: 'DELETE' });
    } catch (e) {
      console.error(e);
    }
  };

  const addList = async (name: string) => {
    const newList: List = { id: crypto.randomUUID(), name, isSystem: false };
    setState((s) => ({ ...s, lists: [...s.lists, newList] }));
    
    try {
      await apiFetch('/api/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newList)
      });
    } catch (e) {
      console.error(e);
    }
  };

  const deleteList = async (id: string) => {
    setState((s) => ({
      ...s,
      lists: s.lists.filter((l) => l.id !== id),
      tasks: s.tasks.filter((t) => t.listId !== id),
    }));
    
    try {
      await apiFetch(`/api/lists/${id}`, { method: 'DELETE' });
    } catch (e) {
      console.error(e);
    }
  };

  const savePrompt = async (name: string, prompt: string) => {
    const newPrompt: SavedPrompt = { id: crypto.randomUUID(), name, prompt };
    setState((s) => ({ ...s, savedPrompts: [...s.savedPrompts, newPrompt] }));
    
    try {
      await apiFetch('/api/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPrompt)
      });
    } catch (e) {
      console.error(e);
    }
  };

  const deletePrompt = async (id: string) => {
    setState((s) => ({ ...s, savedPrompts: s.savedPrompts.filter((p) => p.id !== id) }));
    
    try {
      await apiFetch(`/api/prompts/${id}`, { method: 'DELETE' });
    } catch (e) {
      console.error(e);
    }
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

        setState((s) => {
          const existingListIds = new Set(s.lists.map(l => l.id));
          const existingTaskIds = new Set(s.tasks.map(t => t.id));
          const existingPromptIds = new Set(s.savedPrompts.map(p => p.id));
          
          const newLists = (processedData.lists || []).filter((l: any) => !existingListIds.has(l.id));
          const newTasks = (processedData.tasks || []).filter((t: any) => !existingTaskIds.has(t.id));
          const newPrompts = (processedData.savedPrompts || []).filter((p: any) => !existingPromptIds.has(p.id));
          
          return {
            lists: [...s.lists, ...newLists],
            tasks: [...s.tasks, ...newTasks],
            savedPrompts: [...s.savedPrompts, ...newPrompts]
          };
        });
        await apiFetch('/api/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(processedData)
        });
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

  if (error) {
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
        savePrompt,
        deletePrompt,
        importData,
        exportData,
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
