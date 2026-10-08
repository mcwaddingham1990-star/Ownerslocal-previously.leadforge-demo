/**
 * The Event Engine's pub/sub core. Framework-agnostic (no React import) so
 * it can be emitted from anywhere, not just inside components. Every
 * Firestore-backed collection auto-emits through this via
 * useFirestoreCollection — no call site needs to remember to wire anything.
 */
export type CollectionEventType = "created" | "updated" | "deleted";

export interface CollectionEvent<T = any> {
  collection: string;
  type: CollectionEventType;
  item: T;
  previous?: T;
}

type Handler = (evt: CollectionEvent) => void;

const listeners = new Map<string, Set<Handler>>();

export function emitCollectionEvent(evt: CollectionEvent): void {
  listeners.get(evt.collection)?.forEach((handler) => handler(evt));
}

export function onCollectionEvent(collection: string, handler: Handler): () => void {
  if (!listeners.has(collection)) {
    listeners.set(collection, new Set());
  }
  const handlers = listeners.get(collection)!;
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}

/**
 * Separate channel for changes that arrive from the server snapshot rather
 * than from a write made in this browser (e.g. a website lead form, a
 * Customer Portal booking or approval, a Stripe payment webhook, or another
 * signed-in user). Kept apart from the channel above on purpose: the
 * existing cascades there assume "this client made the write" and must not
 * start firing for every other session's writes too. Only the Automation
 * Engine listens here, and it de-duplicates through its run claims.
 */
const remoteListeners = new Map<string, Set<Handler>>();

export function hasRemoteCollectionListeners(collection: string): boolean {
  return (remoteListeners.get(collection)?.size || 0) > 0;
}

export function emitRemoteCollectionEvent(evt: CollectionEvent): void {
  remoteListeners.get(evt.collection)?.forEach((handler) => handler(evt));
}

export function onRemoteCollectionEvent(collection: string, handler: Handler): () => void {
  if (!remoteListeners.has(collection)) {
    remoteListeners.set(collection, new Set());
  }
  const handlers = remoteListeners.get(collection)!;
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}
