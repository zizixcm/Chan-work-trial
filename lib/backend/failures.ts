import type { FailureDisposition, SafeCode } from './contracts';

export class AnalysisFailure extends Error {
  constructor(readonly code: SafeCode, readonly retryAfterMs?: number) {
    super(code); // Deliberately exclude upstream text, headers and response bodies.
    this.name = 'AnalysisFailure';
  }
}

function retryAfter(headers: unknown, now: number): number | undefined {
  if (!headers || typeof headers !== 'object') return undefined;
  const value = headers instanceof Headers ? headers.get('retry-after') :
    (headers as Record<string, unknown>)['retry-after'];
  if (typeof value !== 'string') return undefined;
  const seconds = Number(value);
  const ms = value.trim() !== '' && Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - now;
  return Number.isFinite(ms) && ms >= 0 ? Math.min(ms, 86_400_000) : undefined;
}

/** Never infer retryability by matching provider message text. */
export function safeFailure(error: unknown, now = Date.now()): AnalysisFailure {
  if (error instanceof AnalysisFailure) return error;
  if (!error || typeof error !== 'object') return new AnalysisFailure('internal_error');
  const e = error as {status?: unknown; statusCode?: unknown; responseHeaders?: unknown; code?: unknown; id?: unknown};
  // Mastra throws structured-output errors before the transport can return text.
  // Match stable SDK identifiers, never raw error messages or response contents.
  if (['STRUCTURED_OUTPUT_TRUNCATED','STRUCTURED_OUTPUT_OBJECT_UNDEFINED','STRUCTURED_OUTPUT_SCHEMA_VALIDATION_FAILED'].includes(String(e.id))) return new AnalysisFailure('invalid_output');
  const status = e.statusCode ?? e.status;
  if (status === 429) return new AnalysisFailure('rate_limited', retryAfter(e.responseHeaders, now));
  if (status === 401 || status === 403) return new AnalysisFailure('configuration_required');
  if (status === 402) return new AnalysisFailure('budget_exhausted');
  if (status === 408 || status === 504) return new AnalysisFailure('provider_timeout');
  if (typeof status === 'number' && status >= 500 && status <= 599) return new AnalysisFailure('provider_unavailable');
  if (typeof status === 'number' && status >= 400 && status <= 499) return new AnalysisFailure('unsupported_input');
  if (['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ECONNREFUSED'].includes(String(e.code))) {
    return new AnalysisFailure('provider_unavailable');
  }
  return new AnalysisFailure('internal_error');
}

export function failureDisposition(
  error: AnalysisFailure, providerAttempts: number, now = Date.now(), random = Math.random,
): FailureDisposition {
  if (error.code === 'cancelled') return {state: 'cancelled', code: error.code};
  if (error.code === 'configuration_required' || error.code === 'budget_exhausted') {
    return {state: 'blocked', code: error.code};
  }
  if (['provider_timeout', 'provider_unavailable', 'rate_limited'].includes(error.code)) {
    if (providerAttempts >= 3) return {state: 'dead_letter', code: error.code};
    const cap = Math.min(60_000, 2_000 * 2 ** Math.max(0, providerAttempts - 1));
    const delay = Math.max(cap * (0.5 + Math.max(0, Math.min(1, random())) / 2), error.retryAfterMs ?? 0);
    return {state: 'retry_wait', code: error.code, availableAt: new Date(now + delay).toISOString()};
  }
  return {state: 'failed', code: error.code};
}
