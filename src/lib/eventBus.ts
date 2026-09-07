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
