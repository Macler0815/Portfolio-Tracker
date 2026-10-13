import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'portfolio-icloud';
const STORE = 'file-handles';
const HANDLE_KEY = 'portfolio-json';

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    },
  });
  return dbPromise;
}

export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && 'showSaveFilePicker' in window && 'showOpenFilePicker' in window;
}

export async function getSavedFileHandle(): Promise<FileSystemFileHandle | null> {
  try {
    const db = await getDB();
    return (await db.get(STORE, HANDLE_KEY)) ?? null;
  } catch {
    return null;
  }
}

export async function saveFileHandle(handle: FileSystemFileHandle): Promise<void> {
  const db = await getDB();
  await db.put(STORE, handle, HANDLE_KEY);
}

export async function clearFileHandle(): Promise<void> {
  const db = await getDB();
  await db.delete(STORE, HANDLE_KEY);
}

export async function pickSaveLocation(): Promise<FileSystemFileHandle | null> {
  try {
    const handle = await window.showSaveFilePicker!({
      suggestedName: 'portfolio.json',
      types: [
        {
          description: 'Portfolio JSON',
          accept: { 'application/json': ['.json'] },
        },
      ],
    });
    await saveFileHandle(handle);
    return handle;
  } catch {
    return null;
  }
}

export async function pickLoadLocation(): Promise<FileSystemFileHandle | null> {
  try {
    const [handle] = await window.showOpenFilePicker!({
      types: [
        {
          description: 'Portfolio JSON',
          accept: { 'application/json': ['.json'] },
        },
      ],
      multiple: false,
    });
    await saveFileHandle(handle);
    return handle;
  } catch {
    return null;
  }
}

export async function writeToHandle(handle: FileSystemFileHandle, data: unknown): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(JSON.stringify(data, null, 2));
  await writable.close();
}

export async function readFromHandle(handle: FileSystemFileHandle): Promise<unknown> {
  const file = await handle.getFile();
  const text = await file.text();
  return JSON.parse(text);
}

export async function verifyPermission(handle: FileSystemFileHandle, readWrite: boolean): Promise<boolean> {
  const opts: FileSystemHandlePermissionDescriptor = {};
  if (readWrite) opts.mode = 'readwrite';
  if ((await handle.queryPermission?.(opts)) === 'granted') return true;
  if ((await handle.requestPermission?.(opts)) === 'granted') return true;
  return false;
}
