/**
 * One gate every "mark this job Completed" path goes through (Jobs edit,
 * Scheduling, Dispatch, Map, Job Tracking final closeout). App mounts
 * <CompletionGuard/>, which checks the job's Owner Protection items and,
 * if important ones are missing, asks for an acknowledgment first.
 * Resolves true to go ahead, false if the user backed out. With nothing
 * mounted (tests, public pages) it always resolves true.
 */
type GuardHandler = (jobId: string) => Promise<boolean>;

let handler: GuardHandler | null = null;

export function registerCompletionGuard(next: GuardHandler | null): void {
  handler = next;
}

export function confirmJobCompletion(jobId: string): Promise<boolean> {
  return handler ? handler(jobId) : Promise.resolve(true);
}
