import { db } from "../firebase";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  getDocFromServer,
  getDocsFromServer
} from "firebase/firestore";
import { auth } from "../firebase";

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

// Global connection check
export async function validateConnection() {
  try {
    await getDocFromServer(doc(db, "test", "connection"));
  } catch (error) {
    if (error instanceof Error && error.message.includes("the client is offline")) {
      console.error("Please check your Firebase configuration or network status.");
    }
  }
}

// Hardened error handler required by SKILL.md
export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid || null,
      email: auth.currentUser?.email || localStorage.getItem("ownerslocal_logged_in_user_email") || null
    },
    operationType,
    path
  };
  console.error("Firestore Error: ", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Firestore rejects undefined values anywhere inside a document. UI records
 * commonly use optional fields, so remove undefined properties recursively
 * before persisting while preserving arrays and all other values.
 */
function removeUndefined(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(removeUndefined);
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, nestedValue]) => nestedValue !== undefined)
        .map(([key, nestedValue]) => [key, removeUndefined(nestedValue)])
    );
  }

  return value;
}

/**
 * Syncs changes from a local state array back to Firestore.
 * Performs highly efficient individual document writes and deletions.
 */
export async function syncArrayToFirestore(
  collectionName: string,
  oldArray: any[],
  newArray: any[],
  businessId: string | undefined
) {
  if (!businessId) return;

  const oldMap = new Map(oldArray.map((item) => [item.id, item]));
  
  // 1. Identify additions or updates
  for (const item of newArray) {
    if (!item.id) continue;
    const oldItem = oldMap.get(item.id);
    
    // Check if the item is new or has fields that changed
    if (!oldItem || JSON.stringify(oldItem) !== JSON.stringify(item)) {
      const docRef = doc(db, collectionName, item.id);
      try {
        await setDoc(docRef, removeUndefined({
          ...item,
          businessId,
          updatedAt: new Date().toISOString()
        }) as Record<string, unknown>);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `${collectionName}/${item.id}`);
      }
    }
  }

  // 2. Identify deletions
  const newSet = new Set(newArray.map((item) => item.id));
  for (const item of oldArray) {
    if (!item.id) continue;
    if (!newSet.has(item.id)) {
      const docRef = doc(db, collectionName, item.id);
      try {
        await deleteDoc(docRef);
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `${collectionName}/${item.id}`);
      }
    }
  }
}

/**
 * Subscribes to a Firestore collection filtered by businessId, optionally
 * narrowed by one extra equality filter (e.g. `notifications` also scopes
 * reads to `recipientEmail` -- the security rule requires it, and Firestore
 * denies the entire listen request if the query doesn't already guarantee
 * every possible result satisfies the rule).
 */
export function subscribeToCollection(
  collectionName: string,
  businessId: string,
  onUpdate: (data: any[]) => void,
  onError?: (error: unknown) => void,
  extraFilter?: { field: string; value: string }
) {
  const constraints = [where("businessId", "==", businessId)];
  if (extraFilter) constraints.push(where(extraFilter.field, "==", extraFilter.value));
  const q = query(collection(db, collectionName), ...constraints);

  return onSnapshot(
    q,
    (snapshot) => {
      const items: any[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        // Exclude internal sync properties when feeding back to UI state
        const { businessId: _, updatedAt: __, ...uiData } = data;
        items.push({ id: docSnap.id, ...uiData });
      });
      onUpdate(items);
    },
    (error) => {
      if (onError) {
        onError(error);
        return;
      }
      handleFirestoreError(error, OperationType.LIST, collectionName);
    }
  );
}

/**
 * Subscribes to a collection using an explicit tenant field. Employee records
 * historically used `businessEmail` before the rest of the app standardized
 * on `businessId`; keeping this read path prevents valid employees from
 * disappearing while newer writes continue adding `businessId`.
 */
export function subscribeToCollectionByField(
  collectionName: string,
  tenantField: string,
  businessId: string,
  onUpdate: (data: any[]) => void,
  onError?: (error: unknown) => void
) {
  const q = query(collection(db, collectionName), where(tenantField, "==", businessId));

  return onSnapshot(
    q,
    (snapshot) => {
      const items: any[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const { businessId: _, updatedAt: __, ...uiData } = data;
        items.push({ id: docSnap.id, ...uiData });
      });
      onUpdate(items);
    },
    (error) => onError?.(error)
  );
}

/**
 * One-off, bypass-the-local-cache read of a collection, filtered by
 * businessId. The realtime onSnapshot listener in subscribeToCollection
 * normally keeps state current, but a Firestore JS SDK listener that hits a
 * permission-denied/unavailable error terminates permanently rather than
 * retrying — so a stuck view needs a way to force a brand-new server read
 * rather than waiting on a listener that's already dead. Used by manual
 * "Refresh" actions in the UI.
 */
export async function fetchCollectionFromServer(collectionName: string, businessId: string, tenantField = "businessId"): Promise<any[]> {
  const q = query(collection(db, collectionName), where(tenantField, "==", businessId));
  const snapshot = await getDocsFromServer(q);
  const items: any[] = [];
  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    const { businessId: _, updatedAt: __, ...uiData } = data;
    items.push({ id: docSnap.id, ...uiData });
  });
  return items;
}
