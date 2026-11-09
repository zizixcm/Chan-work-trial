import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat, readFile, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createDebugRecorder, captureText, RETENTION_MS } from '../lib/analysis-debug/capture';
import { LocalDebugStore } from '../lib/analysis-debug/store';
import { isDebugDeveloper } from '../lib/analysis-debug/access';
import { executeProvider, DEFAULT_BUDGET } from '../lib/backend/provider-executor';
import type { DebugRun, DebugStore } from '../lib/analysis-debug/types';

const metadata = {jobId: 'job-1', applicationId: 'app-1', attempt: 1, task: 'match_document.v1', model: DEFAULT_BUDGET.model, promptVersion: 'csv-review.v1', schemaVersion: 'match.v1'};
function memoryStore() {
  const records: DebugRun[] = [];
  const store: DebugStore = {save: async run => {records.push(structuredClone(run));}, list: async () => [], get: async id => records.findLast(row => row.id === id) ?? null};
  return {store, records};
}
const task = {instructions: 'Return JSON.', prompt: 'Synthetic document.', validate: (raw: unknown) => {
  assert.deepEqual(raw, {ok: true}); return raw;
}};

test('developer allowlist denies absent config, role names, prefix matches and missing identity', () => {
  assert.equal(isDebugDeveloper('user-1', undefined), false);
  assert.equal(isDebugDeveloper('lender', 'user-1'), false);
  assert.equal(isDebugDeveloper('user', 'user-1'), false);
  assert.equal(isDebugDeveloper('', ''), false);
  assert.equal(isDebugDeveloper('user-1', ' user-1, user-2 '), true);
});

test('raw malformed JSON is persisted before executor rejection without error-object leaks', async () => {
  const {store, records} = memoryStore();
  const recorder = createDebugRecorder(metadata, store);
  await assert.rejects(executeProvider(recorder.wrapTask(task), DEFAULT_BUDGET,
    recorder.wrapTransport({generate: async () => ({text: 'not JSON'})}), new AbortController().signal), {code: 'invalid_output'});
  assert.equal(records.at(-1)?.response?.text, 'not JSON');
  assert.equal(records.at(-1)?.validation?.status, 'invalid_json');
  await recorder.finish({state: 'failed', code: 'invalid_output'});
  assert.equal(records.at(-1)?.validation?.status, 'invalid_json');
});

test('schema rejection preserves parsed response; successful validation does not imply application', async () => {
  for (const text of ['{"bad":true}', '{"ok":true}']) {
    const {store, records} = memoryStore();
    const recorder = createDebugRecorder(metadata, store);
    const call = executeProvider(recorder.wrapTask(task), DEFAULT_BUDGET,
      recorder.wrapTransport({generate: async () => ({text, usage: {inputTokens: 10, outputTokens: -1}})}), new AbortController().signal);
    if (text.includes('bad')) await assert.rejects(call, {code: 'invalid_output'}); else await call;
    await recorder.flush();
    assert.equal(records.at(-1)?.parsed?.text, text);
    assert.deepEqual(records.at(-1)?.usage, {inputTokens: 10});
    assert.equal(records.at(-1)?.validation?.status, text.includes('bad') ? 'invalid_schema' : 'passed');
    assert.equal(records.some(row => row.state === 'applied'), false);
    await recorder.finish({state: 'discarded', code: 'commit_rejected'});
    assert.equal(records.at(-1)?.state, 'discarded');
  }
});

test('captured text is bounded and redacts credential patterns', () => {
  const captured = captureText('api_key=secretvalue Bearer abc.def sk-or-v1-12345678901234567890');
  assert.equal(captured.redacted, true);
  assert.equal(captured.text.includes('secretvalue'), false);
  assert.equal(captured.text.includes('abc.def'), false);
  const clipped = captureText('💚'.repeat(30), 9);
  assert.ok(Buffer.byteLength(clipped.text) <= 9);
  assert.equal(clipped.truncated, true);
  assert.equal(clipped.text.includes('\uFFFD'), false);
});

test('diagnostic write failure does not turn valid provider output into failure', async () => {
  const recorder = createDebugRecorder(metadata, {save: async () => {throw new Error('disk full');}, list: async () => [], get: async () => null});
  const result = await executeProvider(recorder.wrapTask(task), DEFAULT_BUDGET,
    recorder.wrapTransport({generate: async () => ({text: '{"ok":true}'})}), new AbortController().signal);
  assert.deepEqual(result.value, {ok: true});
  assert.equal((await recorder.flush()).storageFailed, true);
});

test('aborted transport late response cannot overwrite terminal diagnostic state', async () => {
  const {store, records} = memoryStore();
  const recorder = createDebugRecorder(metadata, store);
  await assert.rejects(executeProvider(recorder.wrapTask(task), {...DEFAULT_BUDGET, timeoutMs: 5}, recorder.wrapTransport({
    generate: () => new Promise(resolve => setTimeout(() => resolve({text: '{"ok":true}'}), 30)),
  }), new AbortController().signal), {code: 'provider_timeout'});
  await recorder.finish({state: 'failed', code: 'provider_timeout'});
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(records.at(-1)?.state, 'failed');
  assert.equal(records.at(-1)?.response, undefined);
});

test('private store persists across instances, hides expired runs, prunes and rejects paths/symlinks', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'analysis-debug-'));
  try {
    const store = new LocalDebugStore(root);
    const recorder = createDebugRecorder(metadata, store);
    await recorder.finish({state: 'applied', appliedChanges: {linksCreated: 1}});
    const reloaded = new LocalDebugStore(root);
    assert.equal((await reloaded.get(recorder.id))?.state, 'applied');
    assert.equal((await stat(path.join(root, `${recorder.id}.json`))).mode & 0o777, 0o600);
    const listing = await reloaded.list();
    assert.equal(listing.length, 1);
    assert.equal('appliedChanges' in listing[0], false);
    assert.equal(await store.get('../secrets'), null);
    const symlinkId = '11111111-1111-1111-1111-111111111111';
    await symlink(path.join(root, `${recorder.id}.json`), path.join(root, `${symlinkId}.json`));
    assert.equal(await store.get(symlinkId), null);
    const expired = new LocalDebugStore(root, () => Date.now() + RETENTION_MS + 1000);
    assert.equal(await expired.get(recorder.id), null);
    await expired.prune();
    await assert.rejects(readFile(path.join(root, `${recorder.id}.json`)), {code: 'ENOENT'});
  } finally { await rm(root, {recursive: true, force: true}); }
});

test('HTTP denies access before touching storage and sends no-store for every outcome', async () => {
  const {readDebugRequest} = await import('../lib/analysis-debug/read-handler');
  const {UploadError} = await import('../lib/validation');
  const request = new Request('http://127.0.0.1:3001/api/internal/analysis-runs');
  for (const status of [401, 403]) {
    let touched = false;
    const response = await readDebugRequest(request, {
      authorize: async () => {throw new UploadError('Denied', status);},
      store: () => {touched = true; return memoryStore().store;},
    });
    assert.equal(response.status, status); assert.equal(touched, false);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
  }
  const response = await readDebugRequest(request, {authorize: async () => {}, store: () => memoryStore().store}, 'missing');
  assert.equal(response.status, 404);
  const failed = await readDebugRequest(request, {authorize: async () => {}, store: () => {throw new Error('private error payload');}});
  assert.equal(failed.status, 503);
  assert.equal((await failed.text()).includes('private error payload'), false);
});

test('validation diagnostics retain safe issue identifiers rather than upstream error text', async () => {
  const {AnalysisValidationError} = await import('../lib/analysis/types');
  const {store,records}=memoryStore();
  const recorder=createDebugRecorder(metadata,store);
  const wrapped=recorder.wrapTask({...task,validate(){throw new AnalysisValidationError('missing_criteria');}});
  assert.throws(()=>wrapped.validate({}),{issue:'missing_criteria'});
  await recorder.flush();
  assert.equal(records.at(-1)?.validation?.message,'Schema or evidence validation failed: missing_criteria.');
});
