import { createConfiguredDebugRecorder } from '../analysis-debug/configured';
import { ANALYSIS_VERSION } from '../analysis/types';
import type { AnalysisTask, DispatchBudget, JobLease, JobRepository, ProviderUsage, SafeEvent } from './contracts';
import { failureDisposition, safeFailure } from './failures';
import { executeProvider, taskInputBudget, validateTaskSize, type ProviderTransport } from './provider-executor';

export interface RunnerDependencies<Input> {
  repository: JobRepository<Input>;
  prepare(job: JobLease<Input>, signal: AbortSignal): Promise<AnalysisTask>;
  transport: ProviderTransport;
  budget: DispatchBudget;
  emit?(event: SafeEvent): void;
  heartbeatMs?: number;
}

/** A claimed job is always fenced by the repository, including error paths. */
export async function runJob<Input>(job: JobLease<Input>, deps: RunnerDependencies<Input>, shutdown: AbortSignal): Promise<void> {
  const leaseLost = new AbortController();
  const deadline = new AbortController();
  const signal = AbortSignal.any([shutdown, leaseLost.signal, deadline.signal]);
  const remaining = Date.parse(job.deadlineAt) - Date.now();
  if (!Number.isFinite(remaining) || remaining <= 0) return; // DB recovery owns expiry.
  const deadlineTimer = setTimeout(() => deadline.abort(), remaining);
  let heartbeatActive = false;
  let reservation: Awaited<ReturnType<JobRepository['admitDispatch']>> = null;
  let usage: ProviderUsage | null = null;
  let providerAttempts = job.providerAttempts;
  const diagnostic = createConfiguredDebugRecorder({jobId:job.id,applicationId:job.applicationId,attempt:job.attempt,task:job.task,model:deps.budget.model,promptVersion:ANALYSIS_VERSION,schemaVersion:job.task==='match_document.v1'?'match.v1':'verify.v1'});
  let diagnosticFinished = false;
  const emit = (event: SafeEvent) => { try { deps.emit?.(event); } catch { /* telemetry cannot change domain effects */ } };
  const heartbeat = setInterval(() => {
    if (heartbeatActive || signal.aborted) return;
    heartbeatActive = true;
    void deps.repository.heartbeat(job).then(valid => { if (!valid) leaseLost.abort(); })
      .catch(() => leaseLost.abort()).finally(() => { heartbeatActive = false; });
  }, deps.heartbeatMs ?? 10_000);
  const phase=async(value:'preparing'|'prepared'|'responded')=>{try{await deps.repository.recordPhase?.(job,value);}catch{/* Observability must not fail the job. */}};
  try {
    if (signal.aborted || !await deps.repository.authorizePreparation(job)) return;
    emit({event: 'started', jobId: job.id, task: job.task});
    await phase('preparing');
    const preparedTask = await deps.prepare(job, signal);
    await phase('prepared');
    const task = diagnostic ? diagnostic.wrapTask(preparedTask) : preparedTask;
    validateTaskSize(task, deps.budget);
    const requestBudget = {...deps.budget, maxInputTokens: taskInputBudget(task)};
    if (signal.aborted) return;
    reservation = await deps.repository.admitDispatch(job, requestBudget);
    if (!reservation) return;
    providerAttempts++;
    const result = await executeProvider(task, requestBudget, diagnostic ? diagnostic.wrapTransport(deps.transport) : deps.transport, signal, value => { usage = value; });
    if (signal.aborted) return;
    await phase('responded');
    const committed = await deps.repository.commit(job, result);
    await diagnostic?.finish({state:committed?'applied':'discarded'}); diagnosticFinished=true;
    emit({event: committed ? 'committed' : 'discarded', jobId: job.id, task: job.task});
  } catch (error) {
    // Shutdown, deadline and lost lease leave recovery to the database. In
    // particular process shutdown is NOT a durable user cancellation request.
    if (signal.aborted) return;
    const failure = safeFailure(error);
    await deps.repository.settleFailure(job, failureDisposition(failure, providerAttempts));
    await diagnostic?.finish({state:"failed",code:failure.code}); diagnosticFinished=true;
    emit({event: 'failed', jobId: job.id, task: job.task, code: failure.code});
  } finally {
    clearInterval(heartbeat);
    if (!diagnosticFinished) await diagnostic?.finish({state:"interrupted"});
    await diagnostic?.flush();
    clearTimeout(deadlineTimer);
    if (reservation) await deps.repository.finishReservation(reservation, usage);
  }
}
