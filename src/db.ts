import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { AppState, List, SavedPrompt, Task } from './types';

interface GTDDB extends DBSchema {
  state: {
    key: string;
    value: any;
  };
  syncQueue: {
    key: number;
    value: {
      id?: number;
      url: string;
      method: string;
      body?: any;
      timestamp: number;
    };
    indexes: { 'by-timestamp': number };
  };
}

let dbPromise: Promise<IDBPDatabase<GTDDB>>;

export function initDB() {
  if (!dbPromise) {
    dbPromise = openDB<GTDDB>('gtd-master-db', 1, {
      upgrade(db) {
        db.createObjectStore('state');
        const syncStore = db.createObjectStore('syncQueue', {
          keyPath: 'id',
          autoIncrement: true,
        });
        syncStore.createIndex('by-timestamp', 'timestamp');
      },
    });
  }
  return dbPromise;
}

export async function saveStateToIDB(state: AppState) {
  const db = await initDB();
  await db.put('state', state, 'app-state');
}

export async function loadStateFromIDB(): Promise<AppState | undefined> {
  const db = await initDB();
  return db.get('state', 'app-state');
}

export async function addToSyncQueue(url: string, method: string, body?: any) {
  const db = await initDB();
  await db.add('syncQueue', {
    url,
    method,
    body,
    timestamp: Date.now(),
  });
}

export async function getSyncQueue() {
  const db = await initDB();
  return db.getAllFromIndex('syncQueue', 'by-timestamp');
}

export async function removeFromSyncQueue(id: number) {
  const db = await initDB();
  await db.delete('syncQueue', id);
}
