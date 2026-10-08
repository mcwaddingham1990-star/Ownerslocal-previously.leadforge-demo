/**
 * Standalone demo build: vite.config.ts aliases every `firebase/firestore`
 * import to this file. Everything is re-exported from the real SDK (doc,
 * collection, query, where, serverTimestamp... are pure helpers), except the
 * calls that would talk to a server. The demo's Firebase config points at
 * nothing real, so those calls would otherwise never settle -- a save button
 * would sit on "Saving..." forever. Here writes succeed instantly without
 * storing anything, and reads come back empty, so the app updates its
 * in-memory demo data (see src/hooks/useFirestoreCollection.ts) exactly as
 * it would after a real save.
 */
export * from "@firebase/firestore";

const emptySnapshot = (ref?: any): any => ({
  id: ref?.id,
  ref,
  exists: () => false,
  data: () => undefined,
  get: () => undefined,
  docs: [],
  empty: true,
  size: 0,
  forEach: () => {},
  docChanges: () => []
});

export async function setDoc(..._args: any[]): Promise<void> {}
export async function updateDoc(..._args: any[]): Promise<void> {}
export async function deleteDoc(..._args: any[]): Promise<void> {}
export async function addDoc(ref: any, ..._args: any[]): Promise<any> {
  return { id: `demo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, parent: ref };
}
export async function waitForPendingWrites(..._args: any[]): Promise<void> {}

export function writeBatch(..._args: any[]): any {
  const batch: any = {
    set: () => batch,
    update: () => batch,
    delete: () => batch,
    commit: async () => {}
  };
  return batch;
}

export async function runTransaction(_db: any, updateFunction: (transaction: any) => Promise<any>): Promise<any> {
  const transaction: any = {
    get: async (ref: any) => emptySnapshot(ref),
    set: () => transaction,
    update: () => transaction,
    delete: () => transaction
  };
  return updateFunction(transaction);
}

export async function getDoc(ref: any): Promise<any> { return emptySnapshot(ref); }
export async function getDocFromServer(ref: any): Promise<any> { return emptySnapshot(ref); }
export async function getDocFromCache(ref: any): Promise<any> { return emptySnapshot(ref); }
export async function getDocs(..._args: any[]): Promise<any> { return emptySnapshot(); }
export async function getDocsFromServer(..._args: any[]): Promise<any> { return emptySnapshot(); }
export async function getDocsFromCache(..._args: any[]): Promise<any> { return emptySnapshot(); }

// Delivers one empty snapshot (so listeners waiting for a first result stop
// "loading") and never anything after that.
export function onSnapshot(ref: any, ...args: any[]): () => void {
  const handler = args.find(arg => typeof arg === "function" || (arg && typeof arg.next === "function"));
  const next = typeof handler === "function" ? handler : handler?.next;
  const timer = setTimeout(() => { try { next?.(emptySnapshot(ref)); } catch (err) { console.error(err); } }, 0);
  return () => clearTimeout(timer);
}
