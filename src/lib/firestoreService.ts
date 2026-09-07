import { subscribeActiveShifts } from "./mockGpsStore";

/**
 * Standalone demo build: this app has no backend at all (see src/firebase.ts
 * and src/hooks/useFirestoreCollection.ts). Every export here keeps the real
 * file's exact signature so every caller works unmodified, but only
 * `subscribeToCollection("active_shifts", ...)` -- InteractiveMapPage.tsx's
 * live GPS feed, the one direct Firestore read in the whole app that
 * useFirestoreCollection.ts doesn't already cover -- has real behavior,
 * backed by mockGpsStore.ts. Everything else here is dead code in the demo
 * (nothing else calls it) and is stubbed out rather than reimplemented.
 */

export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
  };
}

export async function validateConnection() {
  // No real backend to validate against.
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  console.error("Firestore Error (demo, no real backend): ", { error, operationType, path });
}

export async function syncArrayToFirestore(
  _collectionName: string,
  _oldArray: any[],
  _newArray: any[],
  _businessId: string | undefined
) {
  // No-op -- useFirestoreCollection.ts's mock keeps everything in local
  // React state instead of syncing anywhere.
}

export function subscribeToCollection(
  collectionName: string,
  businessId: string,
  onUpdate: (data: any[]) => void,
  _onError?: (error: unknown) => void,
  _extraFilter?: { field: string; value: string }
) {
  if (collectionName === "active_shifts") {
    return subscribeActiveShifts(shifts => {
      const items = shifts
        .filter(s => s.businessId === businessId)
        .map(({ businessId: _b, updatedAt: _u, ...uiData }) => uiData);
      onUpdate(items);
    });
  }
  onUpdate([]);
  return () => {};
}

export function subscribeToCollectionByField(
  _collectionName: string,
  _tenantField: string,
  _businessId: string,
  onUpdate: (data: any[]) => void,
  _onError?: (error: unknown) => void
) {
  onUpdate([]);
  return () => {};
}

export async function fetchCollectionFromServer(_collectionName: string, _businessId: string, _tenantField = "businessId"): Promise<any[]> {
  return [];
}
