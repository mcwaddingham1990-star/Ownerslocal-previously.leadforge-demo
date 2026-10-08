import { useRef, useState, Dispatch, SetStateAction } from "react";
import { MOCK_SEED_DATA } from "../lib/mockSeedData";
import { emitCollectionEvent } from "../lib/eventBus";

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
  const itemsRef = useRef(items);

  // Same create/update/delete events the real hook emits, so the event
  // cascades (Automation Engine, Event Engine subscribers) still run here.
  const setItems: Dispatch<SetStateAction<T[]>> = (value) => {
    const prev = itemsRef.current;
    const raw = typeof value === "function" ? (value as (p: T[]) => T[])(prev) : value;
    const next = options?.normalize ? raw.map(options.normalize) : raw;
    itemsRef.current = next;
    setItemsState(next);
    emitDiffEvents(collectionName, prev, next);
  };

  const refresh = async () => {};

  return [items, setItems, refresh];
}

function emitDiffEvents<T extends WithId>(collection: string, prev: T[], next: T[]): void {
  const prevMap = new Map(prev.map(item => [item.id, item]));
  const nextIds = new Set<string | undefined>();
  for (const item of next) {
    nextIds.add(item.id);
    const previous = prevMap.get(item.id);
    if (!previous) emitCollectionEvent({ collection, type: "created", item });
    else if (JSON.stringify(previous) !== JSON.stringify(item)) emitCollectionEvent({ collection, type: "updated", item, previous });
  }
  for (const item of prev) {
    if (!nextIds.has(item.id)) emitCollectionEvent({ collection, type: "deleted", item });
  }
}
