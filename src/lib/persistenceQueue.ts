type PersistenceTask = () => Promise<void>;

const tails = new Map<string, Promise<void>>();
const active = new Set<Promise<void>>();

/**
 * Serializes persistence work per logical resource key while still allowing
 * unrelated collections to save in parallel.
 *
 * This closes a real stale-write race in optimistic UI flows: two fast state
 * updates used to launch two Firestore syncs at once, allowing the older
 * write to finish after the newer one and become the value seen after the
 * next login.
 */
export function enqueuePersistenceTask(key: string, task: PersistenceTask): Promise<void> {
  const previous = tails.get(key) ?? Promise.resolve();

  const run = previous
    .catch(() => undefined)
    .then(task);

  tails.set(key, run);
  active.add(run);

  void run.finally(() => {
    active.delete(run);
    if (tails.get(key) === run) {
      tails.delete(key);
    }
  }).catch(() => undefined);

  return run;
}

/**
 * Wait until every app-level persistence task is finished, including work
 * that is still queued behind another save or sitting in its retry delay.
 */
export async function waitForPersistenceQueue(): Promise<void> {
  while (active.size > 0) {
    await Promise.allSettled([...active]);
  }
}

export function hasPendingPersistenceTasks(): boolean {
  return active.size > 0;
}
