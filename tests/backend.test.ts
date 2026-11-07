import test from 'node:test';
import assert from 'node:assert/strict';
import type { AnalysisTask, JobLease, JobRepository, ProviderResult, FailureDisposition } from '../lib/backend/contracts';
import { AnalysisFailure, failureDisposition, safeFailure } from '../lib/backend/failures';
import { DEFAULT_BUDGET, executeProvider, type ProviderTransport } from '../lib/backend/provider-executor';
import { runJob } from '../lib/backend/job-runner';
import { selectSharedLane } from '../lib/backend/scheduler';
import { createAnalysisPreparer, type AnalysisSnapshot } from '../lib/backend/prepare-analysis';
import { createHash } from 'node:crypto';

const task: AnalysisTask = {instructions: 'Return JSON', prompt: 'Synthetic', validate: raw => {
  assert.deepEqual(raw, {ok: true}); return raw;
}};
const transport: ProviderTransport = {generate: async () => ({text: '{"ok":true}', usage: {inputTokens: 10, outputTokens: 5}})};
const signal = () => new AbortController().signal;
const lease = (): JobLease => ({id: 'job', applicationId: 'app', task: 'match_document.v1', lane: 'background', token: '1', attempt: 1,
  providerAttempts: 0, deadlineAt: new Date(Date.now() + 1_000).toISOString(), input: {}});

function repository() {
  const calls: string[] = [];
  let failure: FailureDisposition | undefined;
  let committed: ProviderResult | undefined;
  const repo: JobRepository = {
    claim: async () => null, recover: async () => {}, heartbeat: async () => true,
    authorizePreparation: async () => {calls.push('authorize'); return true;},
    admitDispatch: async () => {calls.push('admit'); return {id: 'reservation'};},
    commit: async (_job, result) => {calls.push('commit'); committed = result; return true;},
    settleFailure: async (_job, value) => {calls.push('failure'); failure = value;},
    finishReservation: async (_reservation, usage) => {calls.push(usage ? 'known-usage' : 'unknown-usage');},
  };
  return {repo, calls, failure: () => failure, committed: () => committed};
}

test('one bounded call validates JSON and reports only safe usage', async () => {
  let calls = 0;
  const result = await executeProvider(task, DEFAULT_BUDGET, {generate: async input => {
    calls++; assert.equal(input.budget.model, DEFAULT_BUDGET.model);
    return {text: '{"ok":true}', usage: {inputTokens: 9, outputTokens: -1}};
  }}, signal());
  assert.equal(calls, 1); assert.deepEqual(result.usage, {inputTokens: 9});
});

test('oversize input and pre-cancelled requests never call provider', async () => {
  let calls = 0;
  const never: ProviderTransport = {generate: async () => {calls++; throw Error('must not call');}};
  await assert.rejects(executeProvider({...task, prompt: 'x'.repeat(30_000)}, DEFAULT_BUDGET, never, signal()), {code: 'unsupported_input'});
  await assert.rejects(executeProvider({...task, outputSchema: {type: 'object', description: 'x'.repeat(30_000)}}, DEFAULT_BUDGET, never, signal()), {code: 'unsupported_input'});
  const cancel = new AbortController(); cancel.abort();
  await assert.rejects(executeProvider(task, DEFAULT_BUDGET, never, cancel.signal), {code: 'cancelled'});
  assert.equal(calls, 0);
});

test('timeout bounds an abort-ignoring transport without consuming late output', async () => {
  let validated = false;
  await assert.rejects(executeProvider({...task, validate: () => {validated = true;}}, {...DEFAULT_BUDGET, timeoutMs: 10}, {
    generate: () => new Promise(resolve => setTimeout(() => resolve({text: '{}'}), 30)),
  }, signal()), {code: 'provider_timeout'});
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(validated, false);
});

test('invalid JSON/output fails once without leaking source or repairing', async () => {
  for (const text of ['PRIVATE SOURCE is not JSON', '{"unexpected":"private"}']) {
    await assert.rejects(executeProvider(task, DEFAULT_BUDGET, {generate: async () => ({text})}, signal()),
      error => error instanceof AnalysisFailure && error.message === 'invalid_output');
  }
});

test('retry policy respects Retry-After, exhausts attempts and blocks configuration', () => {
  const failure = safeFailure({statusCode: 429, responseHeaders: {'retry-after': '120'}, message: 'SECRET'}, 0);
  assert.equal(failure.message, 'rate_limited');
  assert.equal(failureDisposition(failure, 1, 0, () => 0).availableAt, '1970-01-01T00:02:00.000Z');
  assert.equal(failureDisposition(failure, 3).state, 'dead_letter');
  assert.equal(failureDisposition(safeFailure({statusCode: 402}), 1).state, 'blocked');
  assert.equal(failureDisposition(new AnalysisFailure('invalid_output'), 1).state, 'failed');
});

test('fenced worker authorizes, admits, commits and accounts in order', async () => {
  const store = repository();
  await runJob(lease(), {repository: store.repo, prepare: async () => {store.calls.push('prepare'); return task;}, transport, budget: DEFAULT_BUDGET}, signal());
  assert.deepEqual(store.calls, ['authorize', 'prepare', 'admit', 'commit', 'known-usage']);
  assert.deepEqual(store.committed()?.value, {ok: true});
});

test('denied dispatch never calls provider', async () => {
  const store = repository(); let providerCalls = 0;
  store.repo.admitDispatch = async () => null;
  await runJob(lease(), {repository: store.repo, prepare: async () => task, budget: DEFAULT_BUDGET,
    transport: {generate: async () => {providerCalls++; return {text: '{}'};}}}, signal());
  assert.equal(providerCalls, 0); assert.equal(store.committed(), undefined);
});

test('stale commit is discarded but provider usage is still accounted', async () => {
  const store = repository(); const events: string[] = [];
  store.repo.commit = async () => false;
  await runJob(lease(), {repository: store.repo, prepare: async () => task, budget: DEFAULT_BUDGET, transport,
    emit: value => events.push(value.event)}, signal());
  assert.deepEqual(events, ['started', 'discarded']);
  assert.equal(store.committed(), undefined); assert.ok(store.calls.includes('known-usage'));
});

test('lost heartbeat prevents a late provider response from committing', async () => {
  const store = repository(); store.repo.heartbeat = async () => false;
  await runJob(lease(), {repository: store.repo, prepare: async () => task, budget: DEFAULT_BUDGET, heartbeatMs: 5,
    transport: {generate: () => new Promise(resolve => setTimeout(() => resolve({text: '{"ok":true}'}), 30))}}, signal());
  assert.equal(store.committed(), undefined); assert.equal(store.failure(), undefined);
  assert.ok(store.calls.includes('unknown-usage'));
});

test('shutdown is not recorded as user cancellation and malformed output accounts usage', async () => {
  const store = repository(); const shutdown = new AbortController(); shutdown.abort();
  await runJob(lease(), {repository: store.repo, prepare: async () => task, budget: DEFAULT_BUDGET, transport}, shutdown.signal);
  assert.equal(store.calls.length, 0);
  await runJob(lease(), {repository: store.repo, prepare: async () => task, budget: DEFAULT_BUDGET,
    transport: {generate: async () => ({text: 'bad', usage: {inputTokens: 10}})}}, signal());
  assert.equal(store.failure()?.state, 'failed'); assert.ok(store.calls.includes('known-usage'));
});

test('shared slot gives background its turn and ages old work', () => {
  const both = {interactiveReady: true, backgroundReady: true, consecutiveInteractive: 0, oldestBackgroundWaitMs: 0};
  assert.equal(selectSharedLane(both), 'interactive');
  assert.equal(selectSharedLane({...both, consecutiveInteractive: 3}), 'background');
  assert.equal(selectSharedLane({...both, oldestBackgroundWaitMs: 300_000}), 'background');
  assert.equal(selectSharedLane({...both, interactiveReady: false, backgroundReady: false}), null);
});

test('unsupported linked file is an explicit Verify limitation, never silently omitted', async () => {
  const prepare = createAnalysisPreparer(async () => {throw Error('must not read unsupported file');});
  const job: JobLease<AnalysisSnapshot> = {...lease(), task: 'verify_requirement.v1', input: {
    documents: [{id: 'pdf', sha256: 'a'.repeat(64), contentType: 'application/pdf'}],
    requirements: [{id: 'r', title: 'Rent roll', subject: 'property', period: '2026', criteria: [{id: 'c', description: 'Current roll'}]}],
  }};
  const built = await prepare(job, signal());
  assert.match(built.prompt, /not supported/);
  assert.throws(() => built.validate({schemaVersion: 'verify.v1', requirementId: 'r', assessment: 'appears_complete',
    checks: [{criterionId: 'c', state: 'met', reason: 'yes', evidence: []}], missingEvidence: [], conflicts: [], limitations: []}));
});

test('real CSV task preparation and provider validation compose for both job kinds', async () => {
  const bytes = Buffer.from('Property,Date\nDemo Plaza,2026-11-01\n');
  const prepare = createAnalysisPreparer(async () => bytes);
  const input: AnalysisSnapshot = {
    documents: [{id: 'doc', sha256: createHash('sha256').update(bytes).digest('hex'), contentType: 'text/csv'}],
    requirements: [{id: 'r', title: 'Current report', subject: 'Demo Plaza', period: 'November 2026', criteria: [{id: 'c', description: 'November report'}]}],
  };
  const evidence = [{documentId: 'doc', record: 2, column: 2, quote: '2026-11-01'}];
  const checks = [{criterionId: 'c', state: 'met', reason: 'November date', evidence}];
  for (const kind of ['match_document.v1', 'verify_requirement.v1'] as const) {
    const built = await prepare({...lease(), task: kind, input}, signal());
    const output = kind === 'match_document.v1'
      ? {schemaVersion: 'match.v1', classification: {kind: 'other_table', reason: 'Report', evidence}, requirements: [{requirementId: 'r', relevance: {state: 'relevant', reason: 'Report date', evidence}, checks}]}
      : {schemaVersion: 'verify.v1', requirementId: 'r', assessment: 'appears_complete', checks, missingEvidence: [], conflicts: [], limitations: []};
    const result = await executeProvider(built, DEFAULT_BUDGET, {generate: async input => {
      assert.ok(input.outputSchema, 'native schema reaches transport');
      return {text: JSON.stringify(output)};
    }}, signal());
    assert.deepEqual(result.value, output);
    await assert.rejects(executeProvider(built, DEFAULT_BUDGET, {generate: async () => ({text: JSON.stringify(output).replaceAll('2026-11-01', 'invented')})}, signal()), {code: 'invalid_output'});
  }
});
