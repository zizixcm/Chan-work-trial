import type { Lane } from './contracts';

/** Persistence calls this with counters read under its scheduler/slot lock.
 * Never use a process-local counter for production fairness. */
export function selectSharedLane(input: {
  interactiveReady: boolean; backgroundReady: boolean;
  consecutiveInteractive: number; oldestBackgroundWaitMs: number;
}): Lane | null {
  if (input.backgroundReady && (!input.interactiveReady || input.consecutiveInteractive >= 3 || input.oldestBackgroundWaitMs >= 300_000)) {
    return 'background';
  }
  if (input.interactiveReady) return 'interactive';
  return null;
}
