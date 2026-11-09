import { AnalysisValidationError } from '../analysis/types';
import { randomUUID } from 'node:crypto';
import type { AnalysisTask } from '../backend/contracts';
import type { ProviderTransport } from '../backend/provider-executor';
import type { CapturedText, DebugMetadata, DebugRun, DebugStore } from './types';

export const CAPTURE_BYTES = 96_000;
export const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
/** Defense in depth, not a substitute for only passing approved task content.
 * Never pass headers, environment, credentials, private notes or error objects. */
export function captureText(text: string, limit = CAPTURE_BYTES): CapturedText {
  const safe = text
    .replace(/\b(?:sk-or-v1-|sk-)[a-zA-Z0-9_-]{12,}/g, '[REDACTED]')
    .replace(/\bBearer\s+[a-zA-Z0-9._~+\/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(/((?:api[_-]?key|authorization|cookie|password|secret)\s*["']?\s*[:=]\s*["']?)[^\s,"'}]+/gi, '$1[REDACTED]');
  const bytes = Buffer.byteLength(safe);
  // Decode only complete code points at the byte boundary.
  const clipped = Buffer.from(safe).subarray(0, limit).toString('utf8').replace(/\uFFFD$/, '');
  return {text: clipped, bytes, truncated: bytes > limit, redacted: safe !== text};
}
function json(value: unknown): CapturedText { return captureText(JSON.stringify(value) ?? 'null'); }
function safeLabel(value: string): string { return /^[a-zA-Z0-9._:/-]{1,160}$/.test(value) ? value : 'unavailable'; }

/** One recorder per attempt. Captures only the prompt actually dispatched.
 * Write failures are isolated from domain work. Call flush before worker exit. */
export function createDebugRecorder(metadata: DebugMetadata, store: DebugStore) {
  const now = new Date();
  const run: DebugRun = {
    id: randomUUID(), jobId: safeLabel(metadata.jobId), applicationId: safeLabel(metadata.applicationId),
    attempt: Number.isSafeInteger(metadata.attempt) && metadata.attempt > 0 ? metadata.attempt : 1,
    task: safeLabel(metadata.task), model: safeLabel(metadata.model),
    promptVersion: safeLabel(metadata.promptVersion), schemaVersion: safeLabel(metadata.schemaVersion),
    state: 'prepared', createdAt: now.toISOString(), updatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + RETENTION_MS).toISOString(),
  };
  let pending = Promise.resolve();
  let storageFailed = false;
  let closed = false;
  const persist = () => {
    run.updatedAt = new Date().toISOString();
    const snapshot = structuredClone(run);
    pending = pending.then(() => store.save(snapshot)).catch(() => { storageFailed = true; });
    return pending;
  };
  return {
    id: run.id,
    wrapTask<T>(task: AnalysisTask<T>): AnalysisTask<T> {
      return {...task, validate(raw) {
        try {
          const value = task.validate(raw);
          if (!closed) {
            run.validated = json(value); run.state = 'validated';
            run.validation = {status: 'passed', message: 'Schema and evidence validation passed.'};
            void persist();
          }
          return value;
        } catch (error) {
          if (!closed) {
            run.state = 'invalid';
            run.validation = {status: 'invalid_schema', message: error instanceof AnalysisValidationError ? `Schema or evidence validation failed: ${error.issue}.` : 'Schema or evidence validation failed.'};
            void persist();
          }
          throw error;
        }
      }};
    },
    wrapTransport(transport: ProviderTransport): ProviderTransport {
      return {generate: async input => {
        if (!closed && !input.signal.aborted) {
          run.model = safeLabel(input.budget.model);
          run.input = {instructions: captureText(input.instructions), prompt: captureText(input.prompt)};
          if ("outputSchema" in input && input.outputSchema) run.input.schema = json(input.outputSchema);
          await persist();
        }
        if (input.signal.aborted) throw new Error('Analysis dispatch cancelled');
        const started = Date.now();
        const response = await transport.generate(input);
        // Ignore adapters returning after cancellation/timeout; never revive records.
        if (closed || input.signal.aborted) return response;
        run.durationMs = Date.now() - started;
        run.response = captureText(response.text); run.state = 'responded';
        run.usage = {};
        for (const key of ['inputTokens', 'outputTokens'] as const) {
          const value = response.usage?.[key];
          if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) run.usage[key] = value;
        }
        if (Buffer.byteLength(response.text) > input.budget.maxOutputTokens * 16) {
          run.state = 'invalid';
          run.validation = {status: 'response_too_large', message: 'Response exceeded the executor output limit.'};
        } else {
          try { run.parsed = json(JSON.parse(response.text)); }
          catch {
            run.state = 'invalid';
            run.validation = {status: 'invalid_json', message: 'Response was not valid JSON.'};
          }
        }
        // Persist raw response before returning to executor JSON/schema validation.
        await persist();
        return response;
      }};
    },
    async finish(outcome: {state: 'applied' | 'discarded' | 'failed' | 'interrupted'; code?: string; appliedChanges?: unknown}) {
      if (closed) return;
      closed = true; run.state = outcome.state;
      if (outcome.code) run.code = safeLabel(outcome.code);
      if (outcome.appliedChanges !== undefined) run.appliedChanges = json(outcome.appliedChanges);
      await persist();
    },
    async flush() { await pending; return {storageFailed}; },
  };
}
