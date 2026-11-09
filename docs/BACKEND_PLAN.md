# Backend orchestration and durable analysis plan

Design assignment completed November 6, 2026. The original assignment changed only this document. A subsequently user-authorized backend/AI implementation has begun; see the implementation handoff below. Queue persistence, HTTP wiring and runtime startup remain pending. No installs, migrations, service starts/restarts, secret reads or provider calls were performed by this backend owner.

## Authority, baseline, and recommendation

The current explicit assignment requires a queue and workers, with active **Verify completeness** actions prioritized over upload-triggered analysis. It supersedes the worker deferrals and synchronous analysis proposals in REQUIREMENTS.md §16, AI_PLAN.md, DATA_DESIGN.md, and PLATFORM_PLAN.md. Coordinator should reconcile those documents when integrating this plan; their obsolete constraints do not block this design. M1 remains fully usable with AI off. This does not change origination scope, authorize credit decisions, or permit inferred lender acceptance.

Static inspection found authenticated Next route handlers, `PostgresRepository`, a `pg` pool, private `LocalBlobStorage`, upload validation, and a synthetic Mastra/OpenRouter probe. `POST /api/documents` currently requires a single `requirementId` and returns `{id}`; `saveUpload` writes bytes then metadata. The current source has no durable analysis jobs, application analysis consent, matching execution, or verification endpoint. Do not confuse existing many-to-many schema with the expanded proposed analysis API. The shared checkout is being edited by other owners; these are inspection observations, not runtime certification.

Retain Docker PostgreSQL 17 at loopback port 5433 and host Next at `http://127.0.0.1:3001`. Propose **one additional host Node worker process**, using the same PostgreSQL and private data root, with no public listener. Platform owns its startup, environment loading, process supervision and shutdown. No Redis, Mastra HTTP server, Docker app service, port change, or hosting migration is needed.

Recommended queue: a narrow PostgreSQL-backed `analysis_jobs` table through existing `pg`, claimed with short `FOR UPDATE SKIP LOCKED` transactions. Its row is also the transactional outbox: the worker consumes the durable intent directly, so there is no second broker publication to lose. Keep this limited to two task kinds, leases, scheduling, and retries—not a general workflow engine. Database owner implements persistence; backend owns the scheduler and state-machine contract. This choice trades a new queue dependency for explicit responsibility for recovery and concurrency tests. If that responsibility cannot be maintained, pg-boss is the preferred library alternative; preserve the public contracts below.

## Queue evaluation and primary references

Primary documentation checked November 6, 2026; latest online APIs are not proof of installed package compatibility.

| Option | Assessment for this slice |
| --- | --- |
| Existing `pg` + narrow SQL queue (recommended) | Atomic document/job/receipt transaction and direct revision, promotion, fairness and fencing semantics. No new runtime dependency. We must implement and verify leases, backoff, recovery, housekeeping and operational visibility. PostgreSQL explicitly identifies SKIP LOCKED as useful for queue-like consumers, not general consistent reads. [PostgreSQL 17 SELECT](https://www.postgresql.org/docs/17/sql-select.html) |
| pg-boss | Strong alternative: PostgreSQL queue, priority, retries, expiration, heartbeats and dead letters; supports sending through an existing transaction adapter. Still needs domain authorization, idempotent result commits, consent fencing and scheduling policy. Introduces package/schema lifecycle coordination. Prefer it if job types or operators grow beyond this bounded slice. [Jobs](https://pgboss.io/api/jobs), [workers](https://pgboss.io/api/workers), [queues](https://pgboss.io/api/queues) |
| Graphile Worker | PostgreSQL and at-least-once execution with retries; a credible maintained alternative. We would still need application-level revision controls and a reserved-capacity/fairness adapter. No demonstrated advantage over existing pg for two task kinds. [Introduction](https://worker.graphile.org/docs) |
| BullMQ | Provides prioritized jobs. Its current documentation also includes a PostgreSQL backend, so it should not be described as exclusively Redis-based. Neither introducing its backend abstraction nor adding Redis is justified by this local slice. Reconsider if wider queue infrastructure is adopted. [Priorities](https://docs.bullmq.io/guide/jobs/prioritized), [PostgreSQL backend](https://docs.bullmq.io/guide/postgresql) |
| Next `after`, detached promises, process-local arrays | Not the durable delivery boundary. Installed Next docs describe `after` as response-adjacent work with route-duration constraints. Restart-safe scheduling must originate from committed database intent. |

Read installed Next guides `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` and `01-app/03-api-reference/04-functions/after.md`. Proposed handlers use Node runtime, awaited route params where required, and explicit private/no-store status responses; no caching of authorization-dependent results.

Mastra handles the bounded model execution inside a claimed job; the queue decides when and whether that execution may run. Mastra workflows describe ordered processing steps, but do not replace this application's admission, authorization or fairness policy. Begin with prepare → one Agent call → validate → conditional commit. A later Mastra workflow may encapsulate these stages without becoming a second retry authority. [Mastra workflows](https://mastra.ai/docs/workflows/overview)

## Service boundaries and ownership proposal

| Owner | Proposed files and responsibility |
| --- | --- |
| Backend | `lib/backend/contracts.ts`, `analysis-service.ts`, `job-runner.ts`, `scheduler.ts`, `provider-budget.ts`, `provider-executor.ts`; `workers/analysis-worker.ts`; new analysis/job/preference route handlers. Own HTTP validation, orchestration, job lifecycle, provider reliability and safe telemetry. |
| AI specialist | `lib/analysis/prepare-csv.ts`, `match.ts`, `verify.ts`, output schemas/citation validators, prompt/config version definitions and synthetic evaluation fixtures. Exports pure preparation/validation and task specifications; no queue SQL or independent scheduling/retries. Exact paths agreed before implementation. |
| Database | Forward SQL migration(s), `lib/jobs/postgres.ts` and analysis persistence, transaction interfaces and DTO additions in `lib/postgres.ts` / `lib/model.ts`. Own schema, constraints, receipt uniqueness, fenced commit and provenance writes. |
| Platform | Dependency/package/lockfile changes if any, worker launch script/config, environment documentation, Compose, README, preview coordination and process supervision. Existing backend-only `server-only` imports must be handled through an explicitly verified Node runtime boundary; do not assume importing Next adapters works under standalone tsx. |
| Frontend | Consent control, upload/job status, Verify action, polling, safe retry/cancel, coverage and attribution display. No provider or storage access. |
| Coordinator assigns shared edits | `lib/upload.ts`, `app/api/documents/route.ts`, `lib/runtime.ts`, `lib/authorization.ts`, `lib/ai.ts` and application snapshot route. Backend proposes upload orchestration changes; database implements transactional insert; AI and backend agree provider adapter exports before touching the existing probe. |

No worker fabricates a browser request/session. It uses a restricted internal job context and repository methods that recheck the initiating user's active membership. Extract runtime-neutral database/storage/provider services; keep Next-only guards in web entry points. Existing `lib/ai.ts` probe remains separate from consent, but must eventually share provider admission quotas.

## Task and input contracts

Two distinct tasks:

- `match_document.v1`: one exact saved file version against a snapshot of active application requirements. May create zero/many validated AI links and attributed criterion claims; ambiguous candidates remain inactive suggestions.
- `verify_requirement.v1`: one current requirement, its definition/criteria, and the current complete set of active linked evidence versions plus relevant allowed explanations/manual assertions. Reconcile supported evidence collectively; report incomplete/unknown explicitly. It does not merely rerun document classification. Unlinked uploads are excluded and the result states this scope. Unsupported linked files or missing criteria prevent an unqualified completeness result. This task does not add/remove links in v1. A successful match commit transaction also enqueues background verification for affected requirements against their complete post-commit evidence set. Replacement/removal invalidates and schedules reassessment while consent is enabled; pending equivalent verification can be promoted by either borrower or lender.

Initial supported preparation is the bounded CSV path in AI_PLAN.md. Accepted upload formats are broader than analyzable formats. Never drop unsupported files silently or silently truncate an evidence set. If combined input exceeds bounds, return a safe unsupported-scope outcome with a manual path; do not pretend partial inspection covered the application. No extraction/OCR expansion is implicit.

Internal payload (server-built and runtime validated; IDs are opaque text, revisions serialized decimal strings):

```ts
type AnalysisInputV1 = {
  payloadVersion: 1;
  task: 'match_document.v1' | 'verify_requirement.v1';
  applicationId: string;
  initiatedByUserId: string;
  trigger: 'upload' | 'user';
  consentEpoch: string;
  documentVersions: Array<{id: string; sha256: string; seriesId: string; version: number}>;
  requirements: Array<{id: string; definitionRevision: string; evidenceRevision: string}>;
  explanationRevisionIds: string[];
  manualAssertionRevisionIds: string[];
  mappingFingerprint: string;
  overrideRevision: string;
  inputFingerprint: string;
  parserVersion: string;
  promptVersion: string;
  schemaVersion: string;
  policyVersion: string;
  modelConfigVersion: string;
};
```

The persisted immutable input snapshot also includes bounded allowlisted requirement criteria/context required to reproduce validation. Queue payload holds IDs/revisions, never file bytes, credentials, private notes, filesystem paths or arbitrary provider URLs. Resolve private evidence just before dispatch. Model configuration is server-selected and pinned; browser callers cannot choose costly models, provider tools, prompts or budgets. Record configured and actual returned model/provider identifiers internally where available.

Task fingerprints hash canonical task kind + application + exact ordered evidence IDs/hashes + relevant definition/evidence/mapping/override/explanation/assertion revisions + consent epoch + parser/prompt/schema/policy/model configuration versions. Selected input sets are sorted and normalized before hashing. Include subject/period/criteria in the pinned definitions. Priority, trigger and UI request ID are not semantic inputs. No cross-application sharing, even for identical bytes.

## Durable enqueue and upload atomicity

1. Authorize borrower membership and application; validate file and optional zero/many requirement IDs. Preserve compatibility with legacy single ID; reject conflicting forms.
2. Write immutable private bytes before the SQL transaction. Durable-save acceptance needs file sync and directory-entry durability verified by the storage owner: current create-only write/link logic alone is not a power-loss durability certification.
3. In one database transaction, lock application/membership and consent; insert document/version, optional human links, draft selection, audit and upload receipt. If current opt-in is enabled and the profile is supported, insert the analysis run/job and its initial queued event. Capture **post-upload** revision tokens, so the upload does not stale its own job. Missing model credentials do not prevent saving: persist the opted-in intent as `blocked` with safe configuration reason. AI-off/unsupported uploads need no runnable job and return an explicit analysis disposition.
4. Commit then return saved-document identity and optional job DTO. No model request, preparation, or worker acknowledgment occurs on the upload HTTP path. Worker polling discovers the row after commit. Optional LISTEN/NOTIFY may reduce latency later; polling remains authoritative.
5. Unknown SQL commit outcome is resolved via the upload idempotency receipt on a fresh connection. Do not delete bytes while outcome is unknown. Known rollback leaves removable unreferenced bytes; cleanup is a separately owned, explicit reconciliation operation with a grace period. Never remove referenced historical versions.

The queue row is the outbox, not an after-response enqueue promise. A queue insertion failure rolls back metadata so there is no falsely acknowledged opted-in save without durable intent. Queue overload should persist a `blocked/admission_limit` intent with the upload, not fail a valid upload; explicit Verify can return 429 before enqueue. Limit one unresolved background intent per compatible input and expose backlog. Database unavailability prevents successful durable upload acknowledgment. AI provider unavailability does not.

## Persistence and lifecycle

Database owner reconciles these additions with planned `analysis_runs` and consent tables; avoid parallel competing run tables.

- `analysis_jobs`: public job ID, application/task/run ID, initiator/trigger, immutable input fingerprint, lane, state, phase, created/updated/available/deadline timestamps, state revision, attempt count, lease owner/token/expiry, cancellation flag/reason, safe error code, blocked reason, retry lineage. Unique live semantic input key within application, plus scoped mutation receipts for client idempotency.
- `analysis_runs`: immutable input/config snapshot, validated result reference and commit disposition. One run per job; each attempt has its own ID, fencing token, timing and safe usage metadata in `analysis_attempts`.
- `analysis_job_events`: bounded append-only lifecycle/audit history. Retain domain result/provenance as required by submission history; operational attempt logs may have a separately approved retention policy.
- Shared provider admission/budget rows: configuration identity, in-flight reservations, cooldown, token/request budgets, spending reservation and actual/unknown usage. No credential material.

State transitions:

| State | Meaning and next state |
| --- | --- |
| `queued` | Durable intent, due at availableAt; → running, blocked, cancelled, stale, or expired. |
| `running` | Current fenced lease; phases preparing/dispatching/validating/committing; → succeeded, retry_wait, failed, dead_letter, cancelled, stale, expired, or blocked before dispatch. |
| `retry_wait` | Transient failure or lost lease, scheduled bounded backoff; → running when due or terminal invalidation. |
| `blocked` | Configuration, budget or admission constraint; worker periodically reevaluates without provider calls; → queued if allowed before deadline, else expired/cancelled/stale. Not an endless retry loop. |
| `succeeded` | Validated result and all eligible domain writes committed atomically. May contain unknown/incomplete findings; it does not mean requirement accepted. |
| `failed` | Permanent input/validation failure; no automatic retry. |
| `dead_letter` | Retry exhaustion or repeated worker loss; durable diagnostic record, no automatic redrive. |
| `cancelled`, `stale`, `expired` | Terminal, no new domain output. Cancellation is requested intent; stale is changed authorization/consent/evidence; expired is elapsed total lifetime. |

Terminal states are immutable. Explicit retry creates a new job linked by `retryOfJobId`; it cannot reset an old fencing token or overwrite old results. Attempt-start/heartbeat/status changes do not increment application content/evidence revisions.

## Claim, dispatch, commit and recovery

Initial proposed defaults, configurable and subject to synthetic load verification: poll 1 second when work exists, idle backoff to 5 seconds; heartbeat every 10 seconds; lease 45 seconds; provider timeout 60 seconds; overall attempt deadline 90 seconds; at most 3 dispatched attempts; total queued lifetime 24 hours. A separate bounded recovery sweep runs every 10 seconds. Count repeated pre-dispatch crashes too, with a maximum of 5 total claimed attempts, so preparation failures cannot loop forever.

Claim a due job with SKIP LOCKED, increment its fencing token, create attempt and set lease using database time in one short transaction. Never keep a database transaction/connection locked over parsing or a model call. Heartbeats update only the current live token, and never extend the hard attempt deadline. On heartbeat failure, abort locally and refuse commit. Recovery checks expired leases, revokes their tokens, then schedules backoff or dead-letters. It does not rely on a user polling. The single-process baseline still requires fencing because a hung old process and replacement can overlap.

Before private read and immediately before provider dispatch, validate active initiating membership/role, enabled consent with exact epoch, selected current versions/hashes, current requirement and mapping/evidence tokens, overrides, lease, cancellation and deadline. Serialize dispatch admission with preference/replacement/membership writes under the database owner's common application-first lock order. A call admitted before consent revocation is already-started processing; network transmission cannot be atomically recalled by SQL. Recheck/abort promptly, without promising removal of bytes already sent.

At commit, lock application, initiating membership, consent and affected requirements in deterministic order, then job; recheck the complete snapshot, current attempt token, live lease/deadline and cancellation. Queue-only claim/heartbeat transactions must never acquire application locks after holding a job lock; this avoids a lock-order cycle. If anything relevant changed, record stale disposition and discard new usable output. Persist validated suggestions/coverage, allowed AI link events, active relation updates, affected evidence revisions, audit and job success in **one transaction**, uniquely keyed by run/operation. Compare input revisions before applying this job's own output increments; save resulting revisions for freshness checks. A no-op existing link keeps its original attribution and does not increment revisions.

This guarantees at-least-once execution with idempotent domain effects, **not exactly-once provider calls or billing**. A crash after provider response but before durable commit may require another call. A crash after commit is resolved from terminal job/result state and never needs another call. A late attempt cannot overwrite a recovered attempt. Retain uncertain usage reservations conservatively until reconciled; do not assume timeout means no cost.

## Priority, fairness and shared quotas

One process, two bounded execution slots by default:

- Slot A is reserved for interactive Verify/user analysis. Background work never borrows it. An idle reserved slot is an intentional latency tradeoff.
- Slot B is shared. Prefer interactive work, but when background work is eligible, dispatch it after at most three interactive selections on this slot or when the oldest eligible background job has waited five minutes. Within a lane select least-recently-served application then oldest job; maintain persistent dispatch counters/timestamps so restart does not reset fairness. Aging starts at original enqueue, not retry time; delayed retries still must become due.
- Default maximum running jobs per application is two; maximum background is one globally. Enforce counters/reservations transactionally, not only in local promises. A deployment-wide two-slot lease prevents accidental second worker startup doubling capacity.

A priority change cannot preempt an already-running provider call. Verify can start on reserved capacity if provider quota permits; otherwise it waits with a truthful status. No hard latency or queue-position promise. Fairness is conditional on eligible work, finite calls and available quotas, not a promise through an outage.

All provider consumers share account/model concurrency, request/token budgets, cooldown and spend reservations—including retries and the diagnostic probe. Never run one limiter per queue and assume aggregate compliance. Reserve enough request/token headroom for one configured interactive request; background cannot consume that reserve. Across sustained traffic, reserve a background turn at the next eligible quota window using the same 3:1/aging rule, otherwise rate limits can defeat slot fairness. If configured provider concurrency is one, explicitly expose degraded single-slot scheduling: use weighted turns, since physical simultaneous reservation is impossible.

Bound input/output tokens, call duration, provider requests per minute, per-job total attempts and daily/application spending. Proposed env names for platform: `AI_WORKER_ENABLED`, `AI_MAX_CONCURRENCY`, `AI_BACKGROUND_CONCURRENCY`, `AI_PROVIDER_TIMEOUT_MS`, `AI_MAX_INPUT_TOKENS`, `AI_MAX_OUTPUT_TOKENS`, `AI_REQUESTS_PER_MINUTE`, `AI_TOKENS_PER_MINUTE`, `AI_DAILY_BUDGET_USD`, `AI_APPLICATION_DAILY_BUDGET_USD`, plus existing model/key settings. These are proposals, not added configuration. Numerical spend limits/model prices require an approved model and budget; absent usable limits, do not dispatch. Reserve conservative maximum cost before calling and reconcile safe usage metadata afterward. No fallback model/provider that changes data handling or price outside the pinned allowlist.

## Deduplication, promotion and retry semantics

Client idempotency key is scoped to application + actor + operation; store the normalized request hash. Authenticate before lookup; identical replay returns the original receipt/job, changed request with same key returns 409. Semantic job uniqueness is separate from transport idempotency.

A request matching a compatible queued/retry-wait job returns the same job and can atomically promote its lane to interactive. Promotion preserves original enqueue time and never bypasses provider Retry-After/cooldown. An identical running job is reused; return processing rather than starting another call. An identical current succeeded result can be returned with `reused=true` after authorization and freshness checks. Historical/stale/cancelled/dead-letter jobs are not silently revived.

**Document matching and requirement verification are not interchangeable**, even with the same file. Verify generally creates its own exact-input job. Reuse a compatible validated preparation artifact (file hash + parser version), but no queued matching job becomes a multi-file verification job by renaming it. If a future composite workflow needs a queued matching prerequisite, promote that exact prerequisite and retain a separate verification identity. No such dependency graph is required initially. Concurrent matching may change evidence while Verify runs: the latter becomes stale and offers a fresh check, rather than silently accepting an old snapshot. Merely matching task names, document IDs, filenames or checksums is insufficient deduplication.

Retry only transient network failures, 408/429 and retryable upstream 5xx. Use exponential backoff with jitter, base 2 seconds and local cap 60 seconds; respect a longer valid provider Retry-After via shared availableAt/cooldown, without exceeding total lifetime. Maximum 3 provider attempts includes initial dispatch. Turn off SDK/provider-adapter automatic retries so retries do not multiply. Permanent malformed/unsupported input, citation/schema failures, unsafe output, authorization/consent changes and 400-class request errors do not automatically retry. 401/402/configuration errors block dispatch and surface an operator action, never a retry storm. Explicit user retry after a fix is budget/rate-limited and reconstructs current inputs. [OpenRouter errors and Retry-After](https://openrouter.ai/docs/api_reference/errors-and-debugging), [shared limits](https://openrouter.ai/docs/api_reference/limits)

No raw provider response is a safe HTTP error. Inspect both transport and returned error bodies; prefer non-streamed structured results for v1. Do not add an automatic model-based JSON repair loop.

## HTTP and public result contracts

All routes are proposed. Use existing session, same-origin mutation protections, application membership/role enforcement and bounded validation. Borrowers enqueue document matching and change preference. Both borrower and lender members may enqueue requirement verification and read safe status/results, subject to the same application consent. Cancel/retry requires the initiating actor or an explicit repository-defined application permission; no cross-role assumption bypasses consent. Inaccessible job/document/request IDs return 404; missing session 401; visible but role-forbidden operations 403. Job IDs confer no access. Use explicit application selector for multi-application accounts and scope every nested ID in SQL.

| Route | Contract |
| --- | --- |
| `POST /api/documents?applicationId=…` | Multipart file + optional requirement IDs + idempotency key. 201 `{id, document, analysis: {disposition: 'queued'|'blocked'|'disabled'|'unsupported', job?: JobDTO}}`. Preserve existing `id`. Saved upload success is distinct from AI state. |
| `PUT /api/applications/[id]/ai-preference` | `{enabled, expectedEpoch}`; returns `{enabled, epoch}`. Default off; borrower actor and consent-text version stored. On change increment epoch. Off cancels pending work and requests cancellation of running work in the same transaction; commit gates independently protect against races. Re-enable never revives old jobs or bulk-enqueues all old files. |
| `POST /api/documents/[id]/coverage-analysis` | `{expectedDocumentVersion, expectedChecklistRevision, consentEpoch, idempotencyKey}`; server resolves full task snapshot. 202 `{job, reused}`; 200 for reusable succeeded result. |
| `POST /api/requirements/[id]/verify-completeness` | `{expectedDefinitionRevision, expectedEvidenceRevision, consentEpoch, idempotencyKey}`. Pin current linked evidence, allowed assertions/explanations and criteria; enqueue interactive job. 202 `{job, reused}`; no long-held model HTTP request. |
| `GET /api/jobs/[id]` | 200 JobDTO, private/no-store, optional ETag tied to status revision. Reads only; never dispatches, retries, or heals leases. |
| `GET /api/jobs/[id]/result` | Authorized safe validated result if succeeded; 409 if unavailable. Historical result marked freshness current/stale, never applied on read. |
| `POST /api/jobs/[id]/cancel` | `{expectedJobRevision, idempotencyKey}`. Queued/blocked/retry becomes cancelled; running becomes cancellationRequested with best-effort abort, then terminal cancelled. Success already committed returns 409 completed; cancellation does not undo links. Duplicate cancellation is idempotent. |
| `POST /api/jobs/[id]/retry` | `{expectedJobRevision, idempotencyKey}`. Terminal eligible failure only; reauthorize, capture current inputs and return 202 with new/reused job. Conflict if still running; never silently reanalyze after staleness without explicit action. |

409 means stale/conflicting request; 422 unsupported explicit analysis; 429 actor/admission limit with Retry-After; configuration/provider failure is a durable job condition, not a lost upload. Consent off returns a clear disabled response for explicit analysis. Public state:

```ts
type JobDTO = {
  id: string;
  task: 'match_document.v1' | 'verify_requirement.v1';
  state: 'queued'|'running'|'retry_wait'|'blocked'|'succeeded'|'failed'|
         'dead_letter'|'cancelled'|'stale'|'expired';
  phase?: 'preparing'|'dispatching'|'validating'|'committing';
  revision: string;
  createdAt: string;
  updatedAt: string;
  nextAttemptAt?: string;
  cancellationRequested: boolean;
  canCancel: boolean;
  canRetry: boolean;
  safeCode?: string;
  message: string;
  pollAfterMs: number;
  resultUrl?: string;
  freshness: 'pending'|'current'|'stale';
};
```

Poll initially every 2 seconds, back off toward 10 seconds with jitter, pause hidden-tab polling and stop for terminal state. Refresh application coverage after success; browser disconnect does not cancel work. Phase is optional presentation context, not a fabricated completion percentage. Technical states map to plain text such as “Waiting to check,” “Checking,” “File saved; checks unavailable,” and “Documents changed; check again.”

Successful safe result envelope: `{schemaVersion:'analysis-result.v1', jobId, task, scope, freshness, appliedLinks, suggestions, coverage, warnings}`. `scope` contains exact authorized version/request IDs and observed revisions; `appliedLinks` includes human/model origin and provenance event IDs; `suggestions` are validated cited candidates; `coverage` contains criterion IDs, supported/unmet/unknown states, attributed sources and bounded reasons. Verify coverage includes `assessment: 'appears_complete'|'incomplete'|'unknown'` and `origin:'model'`, only appears_complete when the full explicit required scope is supported with no unresolved conflict/unsupported evidence. No criteria means unknown. AI owner defines the inner schemas and semantic validator; backend never accepts browser-supplied model results. Unknown/no-match is a successful task outcome, not necessarily a failure.

## Human authority, security and result freshness

Model links are “Linked by AI”; initiating a job does not imply human confirmation. Active links indicate relevance, coverage remains attributed assessment, and acceptance/waiver requires the existing explicit lender action. The worker cannot write lender-review decisions or confirmed financial facts. Verify cannot change review status or erase an exception. No credit decisions.

Commit checks human unlink/rejection/override suppression using stable evidence identity across runs and model/prompt upgrades. Existing human links remain. Rejected same-evidence links cannot be automatically recreated; materially new evidence may propose review, preserving rejection history. Manual corrections racing with results win through revision/fencing checks. Repeated matching with no new effect is a no-op. Never mutate immutable submissions; later working-draft changes appear separately. Read projections recompute current freshness from input tokens; a once-succeeded job may have a now-stale result without rewriting terminal history.

Worker private access uses application-scoped document metadata after membership/consent checks, reads stored keys through `BlobStorage`, and verifies length/hash. No public URLs, raw browser paths, directory scans, or user-selected external retrieval. Scope explanations and assertions through explicit allowlists; exclude lender-private notes. File/parser limits apply before sending content. File cells, filenames and requirement prose are untrusted data, never tool instructions. No autonomous tools, memory or external browsing in these tasks.

A membership revoked after enqueue invalidates its initiator's job; an authorized different member may explicitly enqueue fresh work. Do not let stale initiator identity become a service-account bypass. Current local database owner credentials remain an acknowledged baseline limitation; scoped repositories are required even before least-privilege database roles are introduced.

## Operations and observability

Platform starts one host worker with matching data root and DB environment; a DB-backed deployment lease/slot admission protects against duplicate starts. Provider credentials are optional: M1 runs and the worker can report disabled/configuration-blocked without calls. Worker readiness requires compatible migration version and database access; no automatic schema migration at worker startup. Separate small worker connection pool (proposed max 4) avoids exhausting Next's existing max-8 pool; database owner validates total capacity.

On SIGTERM stop claiming, abort/finish current calls within a bounded shutdown grace, and relinquish only fenced leases safely. Hard kill recovery uses database expiry. Persist worker heartbeat; absent worker heartbeat makes status say processing is unavailable, without inventing failure of the upload. No public health port is necessary; platform can inspect safe heartbeat/status via a local command. Polling outage backs off rather than busy-looping.

Log only correlation/job/attempt IDs, task/lane, state transitions, safe error category, model-config version, duration, counts and aggregate usage. No filenames, borrower names, source text, prompts, responses, full provider errors, storage keys, cookies, credentials or connection URLs. Disable/default-redact Mastra content tracing. Evidence belongs in access-controlled result storage, not logs.

Metrics: queued/due/blocked/running count by lane; oldest eligible wait; enqueue-to-dispatch p50/p95 by lane; provider/total duration; retries, dead letters and expired leases; stale/cancelled commits suppressed; reused/promoted jobs; attempts per successful result; provider 429/cooldown; token/spend reservations versus actual/unknown; worker heartbeat age; background fairness turns. Avoid application/user IDs as metric labels. Alert/report when interactive wait exceeds a proposed 30-second local target, background oldest eligible exceeds 10 minutes, or heartbeat is absent for 60 seconds; these are operational thresholds, not user promises. Expose safe dead-letter reason and explicit retry guidance to operators. No automatic dead-letter replay or destructive cleanup.

## Smallest sequenced implementation and verification

1. **Freeze contracts and ownership.** Coordinator reconciles superseded worker statements and assigns shared paths. Database/AI agree revision snapshots, consent policy, allowed coverage schema and suppression identity. Platform agrees standalone worker module loading and config names. No broad OCR, concentration extraction or general chat required.
2. **Database-only durability slice.** Database owner adds consent, runs/jobs/attempts/events, receipts, slot/budget rows, claim/recovery/fenced result methods and constraints in next available forward migration. Verify enqueue rollback, receipt replay and lease exclusion with synthetic records; no reset of existing data.
3. **Upload + simulated worker.** Backend integrates optional mappings and atomic upload/job intent; platform provisions worker command in an integration window. Use deterministic fake executor to demonstrate save returns while delayed analysis is pending; restart recovers job. AI off completes existing M1 journey with zero model calls.
4. **Real bounded matching path.** AI owner supplies CSV preparation/schema/prompt and citation validator. Backend supplies bounded Mastra/OpenRouter execution, budgets and conditional commit. Database applies attributed many-to-many links/suggestions/coverage atomically; frontend displays coverage and correction. One explicitly authorized budgeted synthetic real-provider run proves the vertical slice after offline gates. This plan itself authorizes no paid call.
5. **Interactive Verify.** Add current-requirement/current-evidence snapshot and task-specific combined evaluation. Wire reserved slot and fairness, polling/cancel/retry and unknown/unsupported handling. Demonstrate Verify progresses while upload jobs wait, without promising preemption of running calls.
6. **Coordinated acceptance.** Existing tests/typecheck and database verification with synthetic isolation; platform alone performs agreed build/restart. Record evidence in owner docs/README and distinguish mocked behavior from real provider output. No new test framework required.

Required meaningful failure/race checks within existing testing facilities:

| Scenario | Required evidence |
| --- | --- |
| SQL rollback / lost upload response / worker absent | No orphan job or acknowledged partial save; same receipt returns saved file and same job; restart eventually consumes durable intent. |
| Kill before dispatch, after provider response, after domain commit | Lease recovery; possible repeated paid call acknowledged in middle case; exactly one domain effect; committed result replay makes no further call. |
| Two claimers / old token late return | One valid lease per job; revoked attempt cannot commit. |
| AI off→on, replacement, requirement edit, manual unlink/override, membership revocation during delay | Old output cannot apply; manual state/history retained; new epoch never revives old work. |
| Duplicate input / different task / two-file Verify | Exact task inputs deduplicate or promote; matching and verification remain distinct; period/scope gaps and unsupported files stay explicit. |
| Queue saturation and continuous Verify load | Interactive reserved slot works; background receives eligible shared-slot turns; global rate/spend caps apply across both lanes and probe. |
| 429/Retry-After, timeout, malformed output, provider 401/402 | Bounded backoff/cooldown, no nested retries, safe terminal/blocked state, uploaded files intact. |
| Cancel before claim / during call / concurrent success | Pending work stops, running abort best effort, transaction ordering gives either cancelled-without-effects or committed success/409; no silent undo. |
| Cross-application IDs and lender-only notes | Scoped 404/403 and no leaked content in status/results/prompts/logs. |
| Partial many-to-many coverage and repeat matching | Correct provenance/counts, no duplicate criterion coverage, no human-link removal or false lender acceptance; old submissions unchanged. |

Prerequisites before dispatching real content: approved consent wording/provider handling, chosen model/configuration and numerical budget, supported synthetic CSV fixtures, transaction/revision APIs, worker startup handoff and offline concurrency gates. Real borrower data remains gated separately; this slice demonstrates a synthetic local workflow. No jobs or provider success are claimed by this document.


## Implementation handoff — backend/AI slice, November 6, 2026

The user subsequently authorized the AI and backend owners to begin implementation using a simple cheap model. Implemented backend-owned files:

- `lib/backend/contracts.ts`: runtime-neutral task, job lease, safe event and durable repository contracts. The database owner must implement these operations transactionally; no in-memory production queue substitutes for them.
- `provider-executor.ts` and `mastra-transport.ts`: one bounded Mastra/OpenRouter call using configurable `google/gemini-2.5-flash-lite` by default, no tools/memory/SDK retry or model fallback, safe errors, abort/timeout, JSON validation, bounded response and usage projection. The conservative default input bound is 24,000 UTF-8 bytes including a framing allowance, smaller than the AI builder's 80KB absolute ceiling. Oversize input is refused, never truncated.
- `prepare-analysis.ts`: connects actual AI CSV builders to an authorized private evidence-reader interface. Pinned hashes are verified. Unsupported linked formats are explicit Verify limitations; unsupported matching and corrupt/overlarge CSV fail safely.
- `job-runner.ts`, `failures.ts`, `scheduler.ts` and `workers/analysis-worker.ts`: leased execution, heartbeat abort, dispatch reservation, fenced commit interface, safe retry disposition, reserved/shared worker loops and recovery loop. The shared-lane selection policy must be called by the database adapter under its scheduler lock. The worker exports a function and does not start on import.
- `tests/backend.test.ts`: deterministic transport and repository doubles exercise bounds, late output, lease loss, quota denial, safe errors/backoff, fairness, usage accounting, and real AI task-builder integration. These are not PostgreSQL crash/race tests and do not establish durable-job readiness.

Pending owner integration: database schema and concrete `JobRepository` adapter; atomic upload enqueue and result/link/aggregate-enqueue transactions; authenticated HTTP routes/public status DTOs; provider account budgets/slot reservations; private reader wiring; platform environment/startup/signal supervision; frontend polling and consent. The existing diagnostic probe has not yet been moved to shared admission and must not run concurrently under a claim of global quota enforcement. Numerical spend caps and model price assumptions belong to the persisted budget configuration; the token defaults are not a monetary cap.

No routes invoke these modules yet and no worker process was started. M1 runtime remains unchanged. Backend/AI collaboration is authorized; coordination permission for database/platform was requested because the original backend assignment prohibited messaging those owners. No approval is inferred from elapsed time. Do not present this core slice as a completed upload-to-coverage feature.

Verification for this implementation: 13 backend tests passed; the combined backend/AI run passed 23 tests before one additional backend stale-commit case was added and verified. `npx tsc --noEmit --incremental false` passed after the implementation/type fix. No build, HTTP integration, database migration or real-provider check was run; those require the pending concrete adapters/runtime integration.

## End-to-end integration implementation — November 6, 2026

A subsequent direct user request to connect the feature end to end authorized the missing persistence/API/shared-upload implementation. That supersedes the preceding pending-coordination note. Backend now supplies migration `010_analysis_jobs.sql`, `lib/jobs/{core,postgres,service,http}.ts`, authenticated application preference/status and document/requirement/job command routes, atomic upload enqueue, AI-attributed active-link/event commits with aggregate verification enqueue, and human-unlink rejection memory. Both borrower and lender can Verify; only borrower can change application consent. The AI chat owns frontend, worker startup, diagnostic hookup, migration/preview coordination and real synthetic smoke runs.

The repository runs against existing PostgreSQL using short application-scoped transactions, global scheduling locks, persisted slot leases/fencing tokens, private evidence reads, shared job-budget reservations, bounded recovery and current-input fingerprints. Normal `text/csv; charset=utf-8` uploads are recognized. Upload may omit a request or select several; original bytes and manual links remain available with AI off. Existing upload error behavior for an invalid selected request remains HTTP 400.

Initial executable admission is deliberately limited to `google/gemini-2.5-flash-lite`, reserving costs at configured-in-code input/output rates (0.10/0.40 USD per million tokens). A different model blocks until an explicit pricing configuration is implemented. Defaults are USD 0.10/day globally and USD 0.05/day/application, overridable by `AI_DAILY_BUDGET_USD` / `AI_APPLICATION_DAILY_BUDGET_USD`; request rate defaults to 20/minute. Unknown usage retains its conservative cost reservation. These limits apply to queued analysis; the existing diagnostic connection probe remains a separate consumer, so do not claim universal provider quota enforcement. No price guarantee beyond the pinned initial assumption is implied.

Backend verification: `npx tsx tests/jobs.integration.ts` passed in an isolated temporary PostgreSQL schema, with no provider calls and no shared fixture changes. It checks atomic upload/queue creation, concurrent request receipts and slot claims, membership revocation, recovery fencing, duplicate result commit, transactional aggregate enqueue, rejection persistence, consent-off, cross-application privacy, stale definition suppression and nondispatch configuration blocks. The integration chat reported its authenticated HTTP/worker flow passing with a simulated provider. Real-provider acceptance remains owned by that chat and is not claimed by these mocked/race checks.

Real-provider compatibility follow-up: the provider schema is now passed through Mastra native structured output, without a second model or repair pass. Local evidence/schema/cap validators remain authoritative. The AI owner simplified only the provider-facing schema after Google's schema-complexity rejection. Offline measurement of the actual active demo (7 requirements, 31 criteria) produced a 10,887-byte request including structural schema and framing, below the 24,000-byte conservative limit. The separate 42-item reference catalog is not the current active checklist and was not used to justify a budget increase. Extended PostgreSQL checks also passed explicit retry of blocked work and terminalization after provider-attempt exhaustion.

Final integration handoff: the AI owner reported a successful isolated real OpenRouter end-to-end test using two model calls after switching to native structured output, explicit source-cell addresses (`csv-review.v4`) and temperature 0. The flow saved an authenticated upload, created an AI-attributed active link, persisted aggregate completeness, supported both roles' Verify reuse, and enforced AI-off. Backend did not make provider calls. Local app/worker restart and inspector activation are handled by the AI integration owner; see its runtime acceptance record for live preview status. Backend persistence/race tests and the strict evidence validator remain separate from model-quality evidence; this synthetic pass is not a claim of broad document or production readiness.

## Personal AI preferences and independent lender verification — November 6, 2026

AI preferences now belong to the authenticated user across applications. Both roles may update their own setting through the existing preference API; the application parameter only establishes membership. New personal preferences default off. Historical application preferences and job results are retained, but old application-scoped fingerprints are no longer reused as current personal results.

Migration `011_lender_analysis_authority.sql` adds borrower/lender job authority. Migration `012_personal_ai_preferences.sql` adds `user_ai_preferences`. Both are additive. Apply with `npm run db:migrate`, build the combined frontend/backend, then restart the web process and analysis worker together. Stop the old worker before enabling the new runtime so old application-wide gating cannot process new jobs. No shared runtime or database migration was performed by this backend change.

Borrower upload/background and explicit borrower checks require the initiating user's opt-in. Turning that setting off cancels only that user's borrower jobs across applications. Explicit lender verification authorizes one check regardless of either person's mode setting; it never enables automatic processing or changes another person's preference. Lender checks retain membership, current-role, evidence, definition and lease fencing. Deduplication and cached results include initiating user and authority. Job DTOs expose `consentScope`, `ownedByCurrentUser` and actor-aware cancel/retry capabilities; frontend filters accordingly.

Validation: full TypeScript check; 40 unit tests; isolated PostgreSQL integration exercising all migrations, real worker preparation/admission/validation/commit with simulated transport, borrower-off lender checks, toggles during a running check, cross-user and cross-application preference isolation, concurrent revision checks, scope/user dedup, cached reuse, cancel/retry ownership, membership revocation/role downgrade and stale evidence. No paid provider calls. Publication/build and live browser smoke remain the platform/frontend owners' coordinated step.

## Borrower application selection — November 6, 2026

`GET /api/borrower/applications` returns `{applications:[{id,borrower_name,property_name,address,transaction_type,requested_amount,created_at}]}` for the authenticated user's active borrower memberships, newest first with ID tie-breaking. Empty lists are valid; lender-only memberships are excluded even for mixed-role users. The domain has no closed/archived application state, so “active” means active membership. Submitted applications remain accessible/listed. Responses are private/no-store and unauthenticated requests receive 401.

Existing workspace APIs accept explicit `applicationId` and authorize that membership without falling back when unknown/revoked. Document-ID requests now also reject a supplied application ID that differs from the document's owning application. Frontend owns the landing list, explicit selection, and selected-workspace route. No schema changes or data fabrication required.

Validation: full TypeScript check; production build in isolated temporary checkout; existing HTTP integration extended with unauthenticated/empty/single/multiple/mixed-role/submitted/revoked listing, explicit unauthorized/nonexistent selection, selected workspace content isolation, ambiguous unselected access, and selected document mismatch. All passed. Shared running build, data, and processes were untouched.

Follow-up combined frontend/backend validation also passed after refreshing the isolated build: root landing 200, authorized `/borrower/[applicationId]` 200 for both selected apps, missing/unauthorized/revoked selection 404, and lender-only membership rejected by borrower workspace route. No shared runtime restart.

## Explicit Send for review publication boundary — November 6, 2026

Borrowers retain live draft access. Lender snapshots (including generic application API), document downloads/previews, submitted AI evidence and links, direct job reads, diagnostic traces, and review writes now respect the latest immutable `submissions` package. No submission yields an empty lender evidence/checklist and waiting state. Unsent uploads and mapping changes cannot change lender evidence, AI fingerprints, or submitted-review currentness. A new send replaces the visible package and invalidates old running lender AI work. Prior immutable submissions and submission-scoped review history remain stored/visible as history; legacy reviews are exposed only if included in the frozen manifest with published evidence.

`POST /api/applications/[id]/submit` requires borrower membership and `{idempotencyKey,expectedRevision,expectedContentRevision}`. It locks the application, rejects stale revisions, verifies selected file availability/hash, captures `build_submission_manifest`, and inserts the existing immutable submission and attachments atomically. Same-key same-source replay returns the original receipt; changed source tokens conflict. Partial and empty packages are allowed as explicit sends without a completeness claim. Borrower snapshots include `draft:{revision,contentRevision,hasUnsentChanges}` and both roles receive `submission:null|{id,revisionNumber,submittedAt}`. No preference/consent is changed by sending. Lender reviews and explicit AI requests require `expectedSubmissionId` so a new send cannot silently change their evidence scope.

No new migration or automatic submission/backfill. Existing drafts remain private until explicitly sent; prior submissions remain usable. Coordinated publication must restart both web and analysis worker so the previous worker cannot continue processing live lender evidence. Shared runtime and data were not modified during this implementation.

Validation passed: full TypeScript, 40 unit tests, isolated production build with combined frontend, PostgreSQL job integration (including unsent-change stability and resend fencing), authenticated HTTP integration (first send, draft direct URL denial, generic API boundary, post-send unsent uploads/unlinks, stale revision/idempotency/role checks, resend, submitted reviews and application isolation), and end-to-end simulated AI integration with 3 simulated calls. AI tests verify prompt exclusion of unsent uploads and direct diagnostic draft trace denial. No paid provider calls.

## Login-free local demo role switching — November 6, 2026

`LOCAL_DEMO_MODE=1` explicitly enables the demo session resolver only for loopback Host values. Fresh no-cookie visits resolve the existing `borrower@proximitty.example` seed; the only other identity is `lender@proximitty.example`. Missing accounts fail closed (503), malformed roles fail (400), and no caller-supplied identity is accepted. `getPortalSession` preserves normal Better Auth when the flag is absent/off. `/api/session` adds `userId`, `demoMode`, and `demoRole` without credentials.

`POST /api/demo/role` accepts only `{role:'borrower'|'lender',applicationId?:string}` with the normal same-origin/local mutation guard. It sets an HttpOnly SameSite=Strict role cookie and returns `{role,applicationId,redirectTo}`. The selected app survives only if the target seed has an active matching-role membership, otherwise the response selects that role's landing page. GET cannot change role. Disabled mode returns 404 for switching and ignores the demo cookie for authentication. Application membership, borrower-only writes, personal preferences, and lender submission publication checks remain enforced using the resolved user's server identity.

Publication: set `LOCAL_DEMO_MODE=1` only in the local web runtime and restart it with the combined frontend. No migration, password disclosure, seed replacement, or auth deletion. `.env.example` defaults the flag to 0. No runtime/environment changes were made by backend implementation.

Validation: combined isolated production build/typecheck; full normal-mode HTTP integration; `tests/demo.integration.ts` (run with `node_modules/.bin/tsx`) for fresh no-cookie entry, demo login redirect, both role switches and selected apps, no GET/unknown role/arbitrary identity, cross-origin and raw nonlocal Host rejection, invalid cookies, missing seed fail-closed, draft download denial before send and availability after send, and disabled-mode normal authentication. Tests used disposable PostgreSQL schemas and no shared fixtures.

## Bulk borrower upload and requirement tiles audit — November 6, 2026

Existing APIs support the redesigned UI without a new migration: the multi-file client queue sends one multipart `file` per `POST /api/documents?applicationId=...`. Omit requirement fields for unassigned upload; use `requirementId` or repeated `requirementIds` for one/many explicit mappings. Personal-AI-enabled CSV uploads atomically queue matching; validated relevant matches create suppression-aware mappings and queue aggregate verification for each affected requirement. Unsupported/off/failed analysis does not remove saved documents. AI parsing remains CSV-only; PDF/XLSX/images remain uploadable/manually organizable.

Poll `/api/applications/[id]/analysis` (alias `/api/ai/status?applicationId=...`) for `preference`, `jobs`, and `links`; refresh application snapshot after link/result changes. Tiles must select own borrower jobs (`ownedByCurrentUser`, `consentScope`) and only use `verify.v1` results from `succeeded` plus `freshness=current`. `appears_complete`, `incomplete`, and `unknown` are distinct; limitations/conflicts/gaps are retained. Matching success alone never establishes completeness. Missing or stale results must not imply green/completed. Poll cadence is a hint, not a processing-time promise. Enabling preference does not retroactively process existing files; explicit document coverage-analysis or requirement verify endpoints can request a check.

Organize uses existing PUT/DELETE `/api/documents/[documentId]/requirements/[requirementId]?applicationId=...&expectedEvidenceRevision=...`, returning `{changed,snapshot}` and rejecting stale mutations with 409. Mapping can be zero/many, files remain stored, and manual unlink suppresses future model relinking. Audit fixed the one missing check: manual mappings now reject lender-owned requirements, matching the upload guard.

Validation: source TypeScript; isolated production build using stable frontend plus updated backend; 24 focused analysis/worker tests; isolated jobs integration including suppression, personal preference, ownership and lender-owned mapping guard; full HTTP integration including repeated multipart requirementIds; simulated AI HTTP/worker test proving one unassigned CSV creates links and current owned verify DTOs for two requirements (4 simulated calls total including submitted lender check). Submission privacy/concurrency checks remain green. No shared runtime changes or paid calls. Frontend visual redesign is validated/published separately by its owner.

## Automatic new-upload AI and soft draft removal — November 7, 2026

New borrower analysis jobs now carry explicit `automatic=true` authority, independent of historical personal preferences/epochs. CSV uploads queue matching atomically even when the old preference is off; matching, aggregate verification, manual checks, freshness, retries, and reconciliation all preserve that authority. Status exposes `automaticUploads:true`; stored preferences/history are not silently rewritten. Legacy jobs retain their original preference checks. The reconciler only rematches documents already authorized by a new automatic job (or their replacement versions), so deployment/invalidation alone does not backfill old unrequested files. CSV remains the actual analysis format; unsupported formats are saved for manual association/review.

`DELETE /api/documents/[id]?applicationId=...&expectedContentRevision=...` requires active borrower membership and current draft content revision, returns `{changed,snapshot}`, rejects stale changes with 409 and cross-app/missing documents with 404, and replays completed removal as `changed:false`. It records a soft-removal marker, excludes the file from current borrower lists/downloads, removes all current associations, excludes it from future submissions, and cancels/fences borrower jobs containing it. Removed files cannot be relinked or rematched by reconciliation. Original bytes, immutable documents, and prior submissions are retained. Lender access remains tied to the last submitted package until resend; current lender download access ends after the new package omits the file. Existing exact-content deduplication against retained documents remains in place; removal is not a byte purge or history reset.

Apply additive `014_automatic_analysis_and_draft_removal.sql` before the new runtime. Stop the old analysis worker during coordinated publication, migrate, build/restart web and worker. No shared migration/runtime/data reset was performed here.

Validation passed: isolated combined production build/typecheck; 42 unit tests; jobs integration; full workflow integration with 77 simulated calls including old-preference-off first upload, no legacy backfill, batch barriers/recovery, membership/freshness, running-job removal fencing and no resurrection; AI HTTP/worker integration with 4 simulated calls (no preference-enable step, unsupported PDF preserved, submitted-only lender evidence); full authenticated HTTP integration with removal idempotency/stale/role/application checks, association exclusion, retained bytes, lender old-sent access, resend removal and historical submission attachment preservation. No paid model calls. Frontend owner is removing the obsolete borrower preference controls/copy and completing the Upload/By file/By requirement flow checks.

## Explicit re-upload recovery — November 7, 2026

Removed files are now recoverable through a fresh Choose files upload batch. The existing duplicate-attachment path restores the retained document ID only when the server-created batch is newer than the latest removal, is open, and its member has not already saved a document. SHA/name/target requirement must match the batch manifest. Old batch receipts and retries cannot undo removal, including a second removal after a prior restoration.

Restoration runs under the application mutation lock, retains bytes and immutable submission history, marks the file included in the live draft, and restores only an explicitly selected target requirement. Unassigned re-upload does not implicitly revive old mappings or suppression decisions. It queues a new automatic check with a restoration timestamp in the fingerprint; canceled old worker tokens stay fenced. The restored draft remains private until Send for review. Repeated upload retries after a successful restore are normal harmless deduplication.

Additive migration `015_explicit_draft_restore.sql` adds restoration metadata without modifying migration014. Frontend must treat fresh Choose files as a new batch; Retry retains the original batch and is intentionally denied after removal. No separate restore endpoint or destructive byte purge was introduced.

Validation: workflow integration passed with 79 simulated calls including original-batch rejection, fresh targeted restoration, retained ID, late old-model denial, repeated removal and retry rejection. Full HTTP suite passed including remove→resend exclusion→new batch explicit re-upload→borrower-only restored draft→send→lender access. Latest isolated production build/typecheck passed. Simultaneous reader/format changes are owned and evaluated by the AI owner; their scheduling allowlist hunks in core/reconcile were preserved, and combined publication remains contingent on their final readiness. No shared runtime or database changes were made here.

### Applied migration 013 repair (2026-11-07)

Publication exposed that migration 013 had been expanded after application. The original bytes were recovered and verified against the live ledger SHA-256 (`2dd73351b154a2fcc170d2672729309575b6f582901a03384b73136a1a07c2eb`). Migration 013 is restored to those exact bytes; reservation pricing columns and subject/application context invalidation additions now live in forward migration 016. No migration ledger rewrite or database reset is needed. Source and captured release were both repaired. An isolated rehearsal replayed the exact live 001–013 history, upgraded through 016, and reran the migrator as a no-op; prior ledger rows and a sentinel user remained unchanged, and the new columns/triggers were verified.

### Bulk upload processing status (2026-11-07)

`GET /api/upload-batches?id=<batch>&applicationId=<app>` keeps its existing fields and adds typed per-member `updated`, `validity`, and `matching`, plus `processing` (see `lib/jobs/batch-status.ts`). Readability/processable validity passes only when the current fenced worker attempt persisted `prepared`; successful model output alone is not a validity signal. Missing telemetry is `unknown`. Upload failures, unsupported input, stale work, retries and blocks remain explicit. No percentages or polling side effects are used.

`processing.documentsSettled` requires a closed batch and no unfinished member matching. `processing.requirements` contains requirements linked to new/restored files, including former links removed after this batch began and predecessor links affected by replacement. Unchanged duplicate reuse adds no completeness work. `processing.needsReview` is separate from terminal progress: unmatched/ambiguous files, missing validity, errors and non-fulfilled completeness results need review even if processing ends.

Completeness claims now wait for all open upload batches and nonterminal matching in the application, including matching older than five minutes. Worker expiry/recovery resolves abandoned work; elapsed time alone no longer bypasses it. This conservative application barrier also waits for overlapping uploads. Reconciliation compares requirement evidence/context and its associated batch/matching changes before scheduling a replacement, avoiding model calls on unrelated unchanged requirements. Global unresolved intake can still mark a historical assessment stale without paying to rerun it.

Focused validation covers two-file sequencing, exactly one affected aggregate check, no new calls for a previously assessed unrelated requirement, pending matching beyond five minutes, unsaved/unassigned manifests, duplicate reuse, removed-file former links, durable extraction phases, successful matching with missing telemetry, and unreadable bytes never dispatched. Publish the web build and restart the worker together; no new migration for this feature.
