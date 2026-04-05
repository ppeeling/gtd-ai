import React, { createContext, useContext, useEffect, useState } from 'react';
import { AppState, List, SavedPrompt, Task } from './types';
import { LogIn, WifiOff } from 'lucide-react';
import { auth, db, googleProvider, signInWithPopup } from './firebase';
import { collection, doc, setDoc, updateDoc, deleteDoc, onSnapshot, writeBatch } from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';

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
  geminiApiKey: string;
  setGeminiApiKey: (key: string) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>(defaultState);
  const [isLoaded, setIsLoaded] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [authError, setAuthError] = useState('');
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [geminiApiKey, setGeminiApiKeyState] = useState(localStorage.getItem('gtd-gemini-key') || '');

  const setGeminiApiKey = (key: string) => {
    localStorage.setItem('gtd-gemini-key', key);
    setGeminiApiKeyState(key);
  };

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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!isAuthReady || !user) {
      if (isAuthReady && !user) {
        setIsLoaded(true); // Stop loading if we know we're not logged in
      }
      return;
    }

    const unsubTasks = onSnapshot(collection(db, 'tasks'), (snapshot) => {
      const tasks = snapshot.docs.map(doc => doc.data() as Task);
      setState(s => ({ ...s, tasks: tasks.sort((a, b) => (a.order || 0) - (b.order || 0)) }));
    }, (error) => console.error(error));

    const unsubLists = onSnapshot(collection(db, 'lists'), (snapshot) => {
      const lists = snapshot.docs.map(doc => doc.data() as List);
      setState(s => ({ ...s, lists: lists.sort((a, b) => (a.order || 0) - (b.order || 0)) }));
    }, (error) => console.error(error));

    const unsubPrompts = onSnapshot(collection(db, 'saved_prompts'), (snapshot) => {
      const prompts = snapshot.docs.map(doc => doc.data() as SavedPrompt);
      setState(s => ({ ...s, savedPrompts: prompts }));
    }, (error) => console.error(error));

    setIsLoaded(true);

    return () => {
      unsubTasks();
      unsubLists();
      unsubPrompts();
    };
  }, [user, isAuthReady]);

  const addTask = async (task: Omit<Task, 'id' | 'createdAt' | 'timer' | 'completed'>) => {
    const newTask: Task = {
      ...task,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      completed: false,
      timer: { isRunning: false, elapsedTime: 0 },
    };
    
    // Optimistic update
    setState(s => ({ ...s, tasks: [newTask, ...s.tasks] }));
    await setDoc(doc(db, 'tasks', newTask.id), newTask);
  };

  const updateTask = async (id: string, updates: Partial<Task>) => {
    setState(s => ({
      ...s,
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    }));
    await updateDoc(doc(db, 'tasks', id), updates);
  };

  const deleteTask = async (id: string) => {
    setState(s => ({ ...s, tasks: s.tasks.filter((t) => t.id !== id) }));
    await deleteDoc(doc(db, 'tasks', id));
  };

  const addList = async (name: string) => {
    const newList: List = { id: crypto.randomUUID(), name, isSystem: false, order: state.lists.length };
    setState(s => ({ ...s, lists: [...s.lists, newList] }));
    await setDoc(doc(db, 'lists', newList.id), newList);
  };

  const deleteList = async (id: string) => {
    setState(s => ({
      ...s,
      lists: s.lists.filter((l) => l.id !== id),
      tasks: s.tasks.filter((t) => t.listId !== id),
    }));
    
    const batch = writeBatch(db);
    batch.delete(doc(db, 'lists', id));
    state.tasks.filter(t => t.listId === id).forEach(t => {
      batch.delete(doc(db, 'tasks', t.id));
    });
    await batch.commit();
  };

  const reorderLists = async (reorderedLists: List[]) => {
    setState(s => ({ ...s, lists: reorderedLists }));
    const batch = writeBatch(db);
    reorderedLists.forEach((list, index) => {
      batch.update(doc(db, 'lists', list.id), { order: index });
    });
    await batch.commit();
  };

  const reorderTasks = async (reorderedTasks: Task[]) => {
    const listId = reorderedTasks[0]?.listId;
    if (!listId) return;

    const otherTasks = state.tasks.filter(t => t.listId !== listId);
    const newTasks = [...reorderedTasks, ...otherTasks];
    
    setState(s => ({ ...s, tasks: newTasks }));
    
    const batch = writeBatch(db);
    reorderedTasks.forEach((task, index) => {
      batch.update(doc(db, 'tasks', task.id), { order: index });
    });
    await batch.commit();
  };

  const savePrompt = async (name: string, prompt: string) => {
    const newPrompt: SavedPrompt = { id: crypto.randomUUID(), name, prompt };
    setState(s => ({ ...s, savedPrompts: [...s.savedPrompts, newPrompt] }));
    await setDoc(doc(db, 'saved_prompts', newPrompt.id), newPrompt);
  };

  const deletePrompt = async (id: string) => {
    setState(s => ({ ...s, savedPrompts: s.savedPrompts.filter((p) => p.id !== id) }));
    await deleteDoc(doc(db, 'saved_prompts', id));
  };

  const importData = async (data: string) => {
    try {
      const parsed = JSON.parse(data);
      if (parsed.lists && parsed.tasks) {
        const batch = writeBatch(db);
        
        const existingListIds = new Set(state.lists.map(l => l.id));
        const existingTaskIds = new Set(state.tasks.map(t => t.id));
        const existingPromptIds = new Set(state.savedPrompts.map(p => p.id));
        
        (parsed.lists || []).forEach((l: any) => {
          if (!existingListIds.has(l.id)) batch.set(doc(db, 'lists', l.id), l);
        });
        
        (parsed.tasks || []).forEach((t: any) => {
          if (!existingTaskIds.has(t.id)) {
            const processedTask = {
              ...t,
              id: t.id || crypto.randomUUID(),
              createdAt: t.createdAt || Date.now(),
              timer: t.timer || { isRunning: false, elapsedTime: 0 },
              completed: !!t.completed,
              name: t.name || 'Untitled Task',
              listId: t.listId || 'inbox'
            };
            batch.set(doc(db, 'tasks', processedTask.id), processedTask);
          }
        });
        
        (parsed.savedPrompts || []).forEach((p: any) => {
          if (!existingPromptIds.has(p.id)) batch.set(doc(db, 'saved_prompts', p.id), p);
        });
        
        await batch.commit();
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

  const handleLogin = async () => {
    try {
      setAuthError('');
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      setAuthError(err.message || 'Failed to sign in');
    }
  };

  if (!isAuthReady || (!isLoaded && user)) {
    return <div className="flex h-screen items-center justify-center bg-zinc-950 text-zinc-500">Loading...</div>;
  }

  if (!user) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-zinc-950 p-8 text-center">
        <div className="max-w-md w-full bg-zinc-900 p-8 rounded-2xl shadow-sm border border-zinc-800">
          <div className="w-12 h-12 bg-indigo-500/20 text-indigo-400 rounded-full flex items-center justify-center mx-auto mb-4">
            <LogIn size={24} />
          </div>
          <h2 className="text-2xl font-bold text-zinc-100 mb-2">Sign In</h2>
          <p className="text-zinc-400 mb-6 text-sm">Authenticate to access your GTD Master data.</p>
          
          {authError && <p className="text-rose-400 text-sm mb-4">{authError}</p>}
          
          <button 
            onClick={handleLogin}
            className="w-full py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
          >
            Sign in with Google
          </button>
        </div>
      </div>
    );
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
        geminiApiKey,
        setGeminiApiKey,
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
