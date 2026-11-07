# Analysis-run inspector

Implemented read-only developer UI at `/internal/analysis-runs` and `/internal/analysis-runs/[id]`, backed by protected GET endpoints at `/api/internal/analysis-runs` and `/api/internal/analysis-runs/[id]`. The inspector does not run models, enqueue jobs, retry, revalidate or change application state. No fabricated records are seeded.

## Access and configuration

Both pages require a Better Auth session and an exact user-ID match in `ANALYSIS_DEBUG_USER_IDS` (comma-separated IDs). API requests independently enforce the same check before opening diagnostic storage, along with the application's localhost restriction. Missing session is 401; authenticated non-developers are 403 in the API; pages hide behind 404. Being a lender or borrower alone gives no access. The allowlist grants global operator access to captured applications, not application-membership-scoped access. Only explicitly trusted developers belong here.

`ANALYSIS_DEBUG_CAPTURE=1` opts a worker into source-content capture through `createConfiguredDebugRecorder`. Capture is off when absent. Capture does not turn on application AI consent. The platform owner must configure the approved developer user IDs and capture preference for the intended processes; this implementation did not edit environment files, credentials, startup commands or preview runtime. Never place these values in `NEXT_PUBLIC_*` configuration. Obtain the authenticated ID through existing account administration, not by exposing session tokens.

Diagnostic data is fetched client-side from authenticated endpoints with `Cache-Control: private, no-store`, `Vary: Cookie` and `nosniff`. The page server renders only the inspector shell after authorization, not document content embedded in a cacheable page. Refresh is manual. No provider calls occur during reads.

## What is captured

Each actual attempt has its own random diagnostic ID, associated job/application IDs and attempt number. It records actual dispatched instructions/input, configured model, explicit prompt/schema versions, raw returned text, parsed JSON, validated output, validation status, safe usage and provider duration. Raw response is saved before executor JSON/schema validation, including malformed JSON. Token absence means unknown, never zero. Present validators expose generic schema/evidence errors; field paths are not invented.

Domain completion is a separate `finish` call after the existing fenced commit. A validated response does not imply a commit. A rejected commit is shown as discarded; without a precise repository reason the inspector does not pretend to know whether it was consent, revision or fencing. Detailed applied changes are shown only if the integration supplies the actual committed receipt. No successful commit is inferred from output content.

Capture accepts only prepared model task content. Never pass the entire job snapshot, request, headers, environment, provider error object or lender-private notes. The existing preparer must continue its allowlisted prompt construction. Credential-pattern redaction is defense in depth, not a claim that arbitrary secrets embedded in source text can always be detected. The UI marks redaction and truncation explicitly. Exact text is available only when neither occurred. Original authorized files remain the authoritative evidence.

## Storage and retention

`LocalDebugStore` is a private diagnostic sidecar under the existing `PORTAL_DATA_DIR/analysis-debug` (default `.data/analysis-debug`), not a job queue, authoritative result repository or second business database. It uses 0700 directories and atomic 0600 JSON-file replacement, UUID-only paths and no-follow reads. The local operator and host remain trusted. Raw data never goes to console logs, public files or provider error responses.

Each captured text field is capped at 96,000 UTF-8 bytes; each serialized record is capped at 800,000 bytes. Oversize records or disk failures are reported through `flush().storageFailed` and cannot change domain commits. Reads list the newest 200 retained records. Expiry is seven days from attempt creation; expired records are inaccessible immediately, and physical cleanup occurs on writes or explicit `store.prune()`. The storage cap is enforced on each write; concurrent writers can briefly exceed it. Idle stopped deployments need platform-owned periodic pruning if strict physical deletion deadlines are required. Retention does not remove original uploaded evidence, domain audit history or seeded data.

## Backend integration contract

No shared backend files were edited by the inspector owner. Existing durable repository/API/startup gaps still determine whether live analysis jobs exist. The adapter itself is implemented and exercised against the real provider executor using synthetic transport; a functioning upload-to-worker flow is not claimed.

The backend owner should create one recorder per job attempt **after preparation authorization**, and use it as follows (sketch; keep existing cancellation, reservation and commit gates):

```ts
const recorder = createConfiguredDebugRecorder({
  jobId: job.id,
  applicationId: job.applicationId,
  attempt: job.attempt,
  task: job.task,
  model: budget.model,
  promptVersion: preparedTask.version, // explicit actual version
  schemaVersion: job.task === 'match_document.v1' ? 'match.v1' : 'verify.v1',
});
const result = await executeProvider(
  recorder ? recorder.wrapTask(preparedTask) : preparedTask,
  budget,
  recorder ? recorder.wrapTransport(transport) : transport,
  signal,
  onUsage,
);
const committed = await repository.commit(job, result); // existing fenced transaction
await recorder?.finish({
  state: committed ? 'applied' : 'discarded',
  code: committed ? undefined : 'commit_rejected',
  // appliedChanges: actualCommittedReceipt, only if available
});
```

On failures, call `finish({state:'failed', code: safeFailure.code})`; on shutdown/lost lease/aborted execution use `interrupted` rather than claiming a failed durable job. In `finally`, flush pending writes. A diagnostic storage failure may emit a fixed safe diagnostic-unavailable event, never raw error text. The wrapper ignores adapter responses returned after abort and never revives a closed record. Capture is observational and must not resurrect a lease, start retries, change consent or apply a result. Current interfaces return a boolean from commit; actual change receipts require a separately coordinated repository contract.

## Verification

`tests/analysis-debug.test.ts` uses temporary private files and synthetic provider responses. It checks default-deny access, API authorization before storage, no-store error responses, raw malformed JSON retention, schema rejection, distinction between validation and application, redaction/truncation, disk failure isolation, late-response suppression, persistence across instances, permissions, path/symlink rejection and expiry cleanup. No real provider calls, runtime restart, migrations or live borrower data are needed.

## Connected local runtime

The job runner now creates an optional per-attempt recorder, captures task input and provider output schema, wraps transport before JSON/schema validation, and records applied/discarded/failed/interrupted outcomes. The diagnostic store is separate from authoritative PostgreSQL jobs. Local capture is enabled; the exact seeded demo lender user ID is allowlisted, while borrower access was verified denied. Open `/internal/analysis-runs` after signing in as the demo lender. New real runs appear after borrower opt-in and supported CSV upload or an explicit check. Isolated test runs are cleaned up and are not inserted into the demo history.
