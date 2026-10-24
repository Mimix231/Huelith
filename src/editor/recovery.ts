import { isDocument, type Document } from './types';

const DATABASE_NAME = 'spectrum-recovery';
const STORE = 'documents';

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Recovery data is independent of saving and can be evicted under browser quota pressure. */
export async function storeRecovery(documents: Document[]): Promise<void> {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readwrite');
      const store = transaction.objectStore(STORE);
      store.clear();
      for (const doc of documents) store.put(doc, doc.id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

export async function getRecovery(): Promise<Document[]> {
  const db = await database();
  try {
    const result = await new Promise<unknown[]>((resolve, reject) => {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return result.filter(isDocument);
  } finally {
    db.close();
  }
}
