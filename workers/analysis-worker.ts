import { setTimeout as delay } from 'node:timers/promises';
import { runJob, type RunnerDependencies } from '../lib/backend/job-runner';
import type { Slot } from '../lib/backend/contracts';

/** Runtime-neutral entry point; platform supplies environment/process signals,
 * database supplies the durable adapter. Does not start on import. */
export async function runAnalysisWorker<Input>(
  owner: string, deps: RunnerDependencies<Input>, signal: AbortSignal,
): Promise<void> {
  const sleep = (ms: number) => delay(ms, undefined, {signal}).catch(() => {});
  const report = () => { try { deps.emit?.({event: 'infrastructure_error', code: 'internal_error'}); } catch {} };
  const lane = async (slot: Slot) => {
    while (!signal.aborted) {
      try {
        const job = await deps.repository.claim(slot, owner);
        if (job) await runJob(job, deps, signal);
        else await sleep(1_000);
      } catch { report(); await sleep(5_000); }
    }
  };
  const recovery = async () => {
    while (!signal.aborted) {
      try { await deps.repository.recover(); } catch { report(); }
      await sleep(10_000);
    }
  };
  await Promise.all([lane('interactive'), lane('shared'), recovery()]);
}
