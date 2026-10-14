import type { Transaction as TxRecord } from './types';

const DB_NAME = 'portfolio-tracker';
const DB_VERSION = 2;
const TX_STORE = 'transactions';
const PRICE_STORE = 'prices';
const MANUAL_STORE = 'manual_prices';
const SETTINGS_STORE = 'settings';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(TX_STORE)) {
          const s = db.createObjectStore(TX_STORE, { keyPath: 'id' });
          s.createIndex('symbol', 'symbol', { unique: false });
        }
        if (!db.objectStoreNames.contains(PRICE_STORE)) {
          db.createObjectStore(PRICE_STORE, { keyPath: 'symbol' });
        }
        if (!db.objectStoreNames.contains(MANUAL_STORE)) {
          db.createObjectStore(MANUAL_STORE, { keyPath: 'symbol' });
        }
        if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
          db.createObjectStore(SETTINGS_STORE, { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        dbPromise = null;
        reject(req.error);
      };
      req.onblocked = () => {
        console.warn('IndexedDB blocked by other tabs or processes');
      };
    } catch (err) {
      dbPromise = null;
      reject(err);
    }
  });
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
      })
  );
}

export async function getAllTransactions(): Promise<TxRecord[]> {
  return tx<TxRecord[]>(TX_STORE, 'readonly', (s) => s.getAll());
}

export async function putTransaction(t: TxRecord): Promise<void> {
  await tx(TX_STORE, 'readwrite', (s) => s.put(t));
}

export async function deleteTransaction(id: string): Promise<void> {
  await tx(TX_STORE, 'readwrite', (s) => s.delete(id));
}

export async function putPriceQuote(q: { symbol: string; price: number; fetchedAt: number }): Promise<void> {
  await tx(PRICE_STORE, 'readwrite', (s) => s.put(q));
}

export async function getPriceQuote(symbol: string): Promise<{ symbol: string; price: number; fetchedAt: number } | null> {
  return tx<{ symbol: string; price: number; fetchedAt: number } | undefined>(PRICE_STORE, 'readonly', (s) => s.get(symbol)).then((r) => r ?? null);
}

export async function getAllPriceQuotes(): Promise<Map<string, { price: number; fetchedAt: number }>> {
  const all = await tx<{ symbol: string; price: number; fetchedAt: number }[]>(PRICE_STORE, 'readonly', (s) => s.getAll());
  return new Map(all.map((q) => [q.symbol, { price: q.price, fetchedAt: q.fetchedAt }]));
}

export async function putManualPrice(p: { symbol: string; price: number; setAt: number }): Promise<void> {
  await tx(MANUAL_STORE, 'readwrite', (s) => s.put(p));
}

export async function getManualPrice(symbol: string): Promise<{ symbol: string; price: number; setAt: number } | null> {
  return tx<{ symbol: string; price: number; setAt: number } | undefined>(MANUAL_STORE, 'readonly', (s) => s.get(symbol)).then((r) => r ?? null);
}

export async function getAllManualPrices(): Promise<Map<string, { price: number; setAt: number }>> {
  const all = await tx<{ symbol: string; price: number; setAt: number }[]>(MANUAL_STORE, 'readonly', (s) => s.getAll());
  return new Map(all.map((p) => [p.symbol, { price: p.price, setAt: p.setAt }]));
}

export async function deleteManualPrice(symbol: string): Promise<void> {
  await tx(MANUAL_STORE, 'readwrite', (s) => s.delete(symbol));
}

export async function clearAllData(): Promise<void> {
  await tx(TX_STORE, 'readwrite', (s) => s.clear());
  await tx(PRICE_STORE, 'readwrite', (s) => s.clear());
  await tx(MANUAL_STORE, 'readwrite', (s) => s.clear());
}

export async function getSetting<T>(key: string): Promise<T | null> {
  const row = await tx<{ key: string; value: T } | undefined>(SETTINGS_STORE, 'readonly', (s) => s.get(key));
  return row?.value ?? null;
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  await tx(SETTINGS_STORE, 'readwrite', (s) => s.put({ key, value }));
}
