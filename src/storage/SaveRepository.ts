import { openDB, type IDBPDatabase } from 'idb';
import { migrate, type SaveData } from './schema';

const DB_NAME = 'adam-adventure';
const STORE = 'kv';
const SAVE_KEY = 'save';
const LS_KEY = 'adam-adventure-save';

/**
 * Local-first persistence. IndexedDB is primary; localStorage is a fallback for browsers
 * where IDB is unavailable (e.g. some private modes). No network, no login.
 */
export class SaveRepository {
  private dbPromise: Promise<IDBPDatabase> | null = null;

  constructor(private readonly idbFactory: IDBFactory | undefined = typeof indexedDB !== 'undefined' ? indexedDB : undefined) {}

  private db(): Promise<IDBPDatabase> | null {
    if (!this.idbFactory) return null;
    if (!this.dbPromise) {
      // idb's openDB uses the global indexedDB; tests inject fake-indexeddb globally.
      this.dbPromise = openDB(DB_NAME, 1, {
        upgrade(db) {
          if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
        },
      });
    }
    return this.dbPromise;
  }

  async load(): Promise<SaveData> {
    try {
      const db = await this.db();
      if (db) {
        const raw = await db.get(STORE, SAVE_KEY);
        if (raw) return migrate(raw);
      }
    } catch {
      /* fall through to localStorage */
    }
    try {
      const ls = typeof localStorage !== 'undefined' ? localStorage.getItem(LS_KEY) : null;
      if (ls) return migrate(JSON.parse(ls));
    } catch {
      /* ignore */
    }
    return migrate(null);
  }

  async save(data: SaveData): Promise<void> {
    const payload = { ...data, updatedAt: Date.now() };
    try {
      const db = await this.db();
      if (db) {
        await db.put(STORE, payload, SAVE_KEY);
        return;
      }
    } catch {
      /* fall back */
    }
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(LS_KEY, JSON.stringify(payload));
    } catch {
      /* storage full or blocked — game keeps running in memory */
    }
  }

  async reset(): Promise<void> {
    try {
      const db = await this.db();
      if (db) await db.delete(STORE, SAVE_KEY);
    } catch {
      /* ignore */
    }
    try {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(LS_KEY);
    } catch {
      /* ignore */
    }
  }

  exportJson(data: SaveData): string {
    return JSON.stringify({ app: 'adam-adventure', exportedAt: new Date().toISOString(), data }, null, 2);
  }

  importJson(text: string): SaveData {
    const parsed = JSON.parse(text) as { app?: string; data?: unknown };
    if (parsed.app !== 'adam-adventure' || !parsed.data) throw new Error('Not an Adam Adventure backup file');
    return migrate(parsed.data);
  }

  /** Ask the browser to keep our data even under storage pressure. */
  async requestPersistence(): Promise<boolean> {
    try {
      if (typeof navigator !== 'undefined' && navigator.storage?.persist) return await navigator.storage.persist();
    } catch {
      /* ignore */
    }
    return false;
  }
}

export const saveRepository = new SaveRepository();
