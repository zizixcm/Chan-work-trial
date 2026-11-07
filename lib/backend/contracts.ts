import type { JSONSchema7 } from 'json-schema';
/** Runtime-neutral contracts shared by the web service and standalone worker. */
export type TaskKind = 'match_document.v1' | 'verify_requirement.v1';
export type Lane = 'interactive' | 'background';
export type Slot = 'interactive' | 'shared';
export type JobState = 'queued' | 'running' | 'retry_wait' | 'blocked' | 'succeeded' |
  'failed' | 'dead_letter' | 'cancelled' | 'stale' | 'expired';
export type SafeCode = 'provider_timeout' | 'provider_unavailable' | 'rate_limited' |
  'configuration_required' | 'budget_exhausted' | 'invalid_output' | 'unsupported_input' |
  'cancelled' | 'lease_lost' | 'internal_error';

export interface AnalysisTask<T = unknown> {
  instructions: string;
  prompt: string;
  outputSchema?: JSONSchema7;
  validate(raw: unknown): T;
}
export interface ProviderUsage {
  inputTokens?: number;
  outputTokens?: number;
}
export interface ProviderResult<T = unknown> {
  value: T;
  usage: ProviderUsage;
  model: string;
}
export interface JobLease<Input = unknown> {
  id: string;
  applicationId: string;
  task: TaskKind;
  lane: Lane;
  token: string;
  attempt: number;
  providerAttempts: number;
  deadlineAt: string;
  input: Input;
}
export interface FailureDisposition {
  state: 'retry_wait' | 'failed' | 'dead_letter' | 'blocked' | 'cancelled';
  code: SafeCode;
  availableAt?: string;
}
export interface DispatchReservation {
  id: string;
}

/** Each method is a short DB transaction. Never hold locks over provider I/O.
 * All writes compare the lease token. Invalid authorization/consent/revision gates
 * atomically mark stale/cancelled and return null/false; they never return content.
 * Database owner implements this interface; there is intentionally no in-memory
 * production substitute for durable enqueue, reservations or result commits.
 */
export interface JobRepository<Input = unknown> {
  /** Atomically claim slot AND job, applying lane fairness, application quotas,
   * due time, max claims and database-clock deadlines. Increment fencing token.
   * Interactive slot may never claim background work. */
  claim(slot: Slot, owner: string): Promise<JobLease<Input> | null>;
  /** Renew only if token, cancellation flag and hard deadline remain valid. */
  heartbeat(job: JobLease<Input>): Promise<boolean>;
  /** Recheck authorization/consent/revisions before any private file read. */
  authorizePreparation(job: JobLease<Input>): Promise<boolean>;
  /** Immediately before dispatch, atomically recheck all gates and reserve shared
   * provider concurrency/tokens/spend, or mark blocked/stale and return null.
   * Counts a provider attempt. All callers, including the probe, share quotas. */
  admitDispatch(job: JobLease<Input>, budget: DispatchBudget): Promise<DispatchReservation | null>;
  /** Recheck gates, persist validated output + links/provenance + success together.
   * Match commits enqueue affected aggregate Verify jobs in the same transaction.
   * Duplicate commits are no-ops; human rejection memory wins. */
  commit(job: JobLease<Input>, result: ProviderResult): Promise<boolean>;
  /** Fenced disposition write; terminal/cancelled/stale jobs cannot be resurrected. */
  settleFailure(job: JobLease<Input>, failure: FailureDisposition): Promise<void>;
  /** Record known usage or keep conservative unknown-charge reservation. This
   * accounting is allowed after a lost job lease and is idempotent by reservation.
   * Missing token fields mean UNKNOWN, never zero. Retain the unaccounted cost
   * ceiling until reconciliation, including when usage is an empty object. */
  finishReservation(reservation: DispatchReservation, usage: ProviderUsage | null): Promise<void>;
  /** Sweep expired leases, revoke tokens and retry/dead-letter using DB time.
   * Also expire old queued jobs; browser polling never performs recovery. */
  recover(): Promise<void>;
  /** Optional metadata-only telemetry; failures must not change domain outcomes. */
  recordPhase?(job:JobLease<Input>,phase:'preparing'|'prepared'|'responded'):Promise<void>;
}
export interface DispatchBudget {
  model: string;
  maxInputTokens: number;
  maxOutputTokens: number;
  timeoutMs: number;
}
export interface SafeEvent {
  event: 'started' | 'committed' | 'discarded' | 'failed' | 'infrastructure_error';
  jobId?: string;
  task?: TaskKind;
  code?: SafeCode;
}
