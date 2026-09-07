/**
 * Every Firestore-backed collection (useFirestoreCollection.ts) updates local
 * state optimistically before its write to Firestore resolves, so the UI
 * never blocks on the network. When that write actually fails (permission
 * denied, offline, oversized doc, etc.) the failure was previously only
 * console.error'd -- the change stayed visible and editable for the rest of
 * the session, then silently vanished the moment the page reloaded and
 * re-subscribed to the real (unwritten) server data, with no indication to
 * the user of what happened or why.
 *
 * This is a framework-agnostic pub/sub (no React import, mirrors
 * eventBus.ts) so it can be emitted from useFirestoreCollection/
 * firestoreService and consumed once at the top of the app to surface a
 * real, user-facing notification instead of a silent revert-on-reload.
 */
type Handler = (message: string) => void;

const listeners = new Set<Handler>();

export function emitSyncError(message: string): void {
  listeners.forEach((handler) => handler(message));
}

export function onSyncError(handler: Handler): () => void {
  listeners.add(handler);
  return () => {
    listeners.delete(handler);
  };
}
