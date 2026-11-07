import type { AnalysisTask, DispatchBudget, ProviderResult, ProviderUsage } from './contracts';
import { AnalysisFailure, safeFailure } from './failures';

export const DEFAULT_ANALYSIS_MODEL = 'google/gemini-2.5-flash';
export const DEFAULT_BUDGET: Readonly<DispatchBudget> = Object.freeze({
  model: DEFAULT_ANALYSIS_MODEL, maxInputTokens: 24_000, maxOutputTokens: 4_000, timeoutMs: 60_000,
});
export interface ProviderTransport {
  generate(input: {instructions: string; prompt: string; outputSchema?: AnalysisTask['outputSchema']; budget: DispatchBudget; signal: AbortSignal}):
    Promise<{text: string; usage?: ProviderUsage}>;
}

export function validateBudget(budget: DispatchBudget): void {
  if (!/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._:-]+$/.test(budget.model)) throw new AnalysisFailure('configuration_required');
  for (const [value, max] of [[budget.maxInputTokens, 100_000], [budget.maxOutputTokens, 16_000], [budget.timeoutMs, 90_000]]) {
    if (!Number.isSafeInteger(value) || value <= 0 || value > max) throw new AnalysisFailure('configuration_required');
  }
}

/** Conservative UTF-8 byte ceiling rather than a guessed chars/4 token estimate.
 * The extra allowance covers the fixed message framing; repository admission
 * reserves the full configured input/output maximum, not this estimate. */
export function validateTaskSize(task: AnalysisTask, budget: DispatchBudget): void {
  validateBudget(budget);
  if (Buffer.byteLength(task.instructions, 'utf8') + Buffer.byteLength(task.prompt, 'utf8') + Buffer.byteLength(JSON.stringify(task.outputSchema ?? {}), 'utf8') + 512 > budget.maxInputTokens) {
    throw new AnalysisFailure('unsupported_input');
  }
}

function usageOnly(usage?: ProviderUsage): ProviderUsage {
  const safe: ProviderUsage = {};
  for (const key of ['inputTokens', 'outputTokens'] as const) {
    const value = usage?.[key];
    if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) safe[key] = value;
  }
  return safe;
}

/** Exactly one SDK invocation. Queue owns retries. A caller must have a durable
 * dispatch reservation before calling; this module never bypasses the queue. */
export async function executeProvider<T>(
  task: AnalysisTask<T>, budget: DispatchBudget, transport: ProviderTransport, signal: AbortSignal,
  onUsage?: (usage: ProviderUsage) => void,
): Promise<ProviderResult<T>> {
  validateTaskSize(task, budget);
  if (signal.aborted) throw new AnalysisFailure('cancelled');
  const timeout = new AbortController();
  const combined = AbortSignal.any([signal, timeout.signal]);
  let abortListener: (() => void) | undefined;
  const timer = setTimeout(() => timeout.abort(), budget.timeoutMs);
  try {
    // Race also bounds adapters that fail to honor AbortSignal. Their late output
    // is ignored; billing may still occur and remains conservatively reserved.
    const aborted = new Promise<never>((_, reject) => {
      abortListener = () => reject(new AnalysisFailure(signal.aborted ? 'cancelled' : 'provider_timeout'));
      combined.addEventListener('abort', abortListener, {once: true});
      if (combined.aborted) abortListener();
    });
    const response = await Promise.race([transport.generate({instructions: task.instructions, prompt: task.prompt, outputSchema: task.outputSchema, budget, signal: combined}), aborted]);
    if (combined.aborted) throw new AnalysisFailure(signal.aborted ? 'cancelled' : 'provider_timeout');
    const usage = usageOnly(response.usage);
    onUsage?.(usage);
    if (Buffer.byteLength(response.text, 'utf8') > budget.maxOutputTokens * 16) throw new AnalysisFailure('invalid_output');
    let value: T;
    try { value = task.validate(JSON.parse(response.text)); }
    catch { throw new AnalysisFailure('invalid_output'); }
    return {value, model: budget.model, usage};
  } catch (error) {
    if (signal.aborted) throw new AnalysisFailure('cancelled');
    if (timeout.signal.aborted) throw new AnalysisFailure('provider_timeout');
    throw safeFailure(error);
  } finally {
    clearTimeout(timer);
    if (abortListener) combined.removeEventListener('abort', abortListener);
  }
}
