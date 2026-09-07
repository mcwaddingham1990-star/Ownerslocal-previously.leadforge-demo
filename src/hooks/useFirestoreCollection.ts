import { useState, Dispatch, SetStateAction } from "react";
import { MOCK_SEED_DATA } from "../lib/mockSeedData";

type WithId = { id?: string };

/**
 * Standalone demo build: this app has no backend at all (see src/firebase.ts
 * -- the Firebase config it initializes points at nothing real). Every
 * collection the real app reads through this hook becomes local React state
 * instead, pre-populated from mockSeedData.ts. Edits update state
 * immediately (so the app is genuinely interactive, not frozen) but never
 * leave this browser tab and reset on reload -- there is no Firestore to
 * sync to, so this intentionally drops the real hook's sync/subscribe/retry
 * machinery entirely rather than pointing it at a fake project and letting
 * every write fail with a swallowed network error.
 */
export function useFirestoreCollection<T extends WithId>(
  collectionName: string,
  _businessId: string | undefined,
  options?: { normalize?: (item: T) => T; tenantField?: string; extraFilter?: { field: string; value: string | undefined } }
): [T[], Dispatch<SetStateAction<T[]>>, () => Promise<void>] {
  const [items, setItemsState] = useState<T[]>(() => {
    const seed = (MOCK_SEED_DATA[collectionName] as T[]) || [];
    return options?.normalize ? seed.map(options.normalize) : seed;
  });

  const setItems: Dispatch<SetStateAction<T[]>> = (value) => {
    setItemsState(prev => {
      const next = typeof value === "function" ? (value as (p: T[]) => T[])(prev) : value;
      return options?.normalize ? next.map(options.normalize) : next;
    });
  };

  const refresh = async () => {};

  return [items, setItems, refresh];
}
