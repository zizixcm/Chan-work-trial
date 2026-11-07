# AI workflow behavioral tests and coverage

The requirements and edge-case matrix define expected behavior. Tests encode those expectations; they are not an independent guarantee that a model's interpretation is correct. Deterministic workflow tests use a simulated provider with the real queue, PostgreSQL transactions, preparation and output validators. Live-provider smoke checks use synthetic evidence and retain durable admission and spend controls.

## Repeatable checks

- `npm test`: input/output validation, citation integrity, bounded execution, retries, diagnostics, storage, review separation and criterion-derived fulfillment.
- `npm run typecheck`: application and worker contracts.
- `npm run test:jobs-integration`: isolated PostgreSQL authorization, ownership, idempotency, lease recovery, coalescing, submitted scope and reservation accounting.
- `npm run test:workflow-integration`: isolated PostgreSQL and private temporary blobs, simulated provider, durable batch barrier, expiration, late arrival, failed matching, automatic definition refresh, stale pickup/mid-call disposal, evidence removal and consent-off behavior. The provider is always simulated in this suite, even if real credentials exist.
- `npm run test:ai-integration`: authenticated HTTP upload, batch creation/finalization/status, duplicate response recovery, matching, aggregate checks, lender submission isolation and diagnostic access against a production build. Set `PORTAL_TEST_BUILD_DIR` to an isolated build directory. Default is simulated. `AI_SMOKE_REAL=1` explicitly uses the configured OpenRouter integration with a five-call cap and normal reservation limits.

The workflow fixture increases admission limits only inside its isolated simulated process so convergence tests do not wait for real-time quota windows. Admission policy is tested separately. It must never be repurposed to call a real provider with those fixture limits.

## Scenario traceability

“Partial” below is deliberate: a parser guard, fake-provider assertion or source inspection does not certify an entire operational scenario. This table covers every scenario in AI_WORKFLOW_EDGE_CASES.md and makes missing tests visible.

| Scenario | Automated evidence | Remaining boundary |
| --- | --- | --- |
| E01 malformed/oversized intake | storage tests validate rejects, bounded multipart and no saved metadata | Parser fuzzing beyond fixtures |
| E02 hostile/unsupported structure | storage tests for supported structures, corruption and protection | Malware scanning and exhaustive archive hardening |
| E03 saved but unprocessable CSV | analysis/backend tests reject preparation before dispatch | Detailed per-file remediation UI |
| E04 ambiguous extraction/formulas | analysis tests preserve literal cells | Labeled semantic/OCR/units evaluation; non-CSV remains unsupported |
| E05 oversized aggregate/catalog | analysis/backend size and coverage guards | Exhaustive boundary combinations and retrieval fallback |
| E06 interrupted persistence | storage tests for storage/DB errors and cleanup | Process-kill orphan reconciliation drill |
| E07 duplicate/lost response | HTTP AI suite replays saved batch member; storage duplicate tests | Duplicate intended for a different mapping still requires explicit organization |
| E08 missing/corrupt source | preparation hash/size tests and storage tests | Background scrubbing/restoration drill |
| E09 reusable extraction | No artifact cache implemented | Durable extraction cache and version invalidation tests |
| E10 combined batch evidence | workflow suite asserts one assessment containing both saved sources | Large concurrent-batch load experiment |
| E11 partial/abandoned batch | workflow suite expires manifest, preserves saved members, checks limitation and late arrival | Browser reopen/reselection journey; unsent bytes cannot be recovered automatically |
| E12 refresh/history failure | HTTP status path; scoped latest-per-target query | Browser network-loss injection and >100-job UI fixture |
| E13 failed matching with human links | workflow suite malformed matching response still yields aggregate check | Exhaustive preparation-failure UX |
| E14 mid-processing additions | jobs coalescing and workflow stale pickup tests | Broad interleaving stress test |
| E15 fulfilled evidence unlinked | workflow suite removes sources and checks no current fulfillment | Browser visual regression for old human review |
| E16 replacement | Workflow suite inserts immutable replacement, fences old result, excludes predecessor, reports unresolved links | Replacement API/UI and full A/B to B/C fault injection remain future work |
| E17 document deletion | Immutable document history and unlink workflow | Physical deletion is not supported; no destructive endpoint added |
| E18 changed definitions | workflow suite changes definition before pickup and during call, then converges | All catalog mutation combinations |
| E19 new/retired requirements | Workflow suite adds a requirement over existing uploads and retires it without breaking remaining checks | Larger catalog combinations |
| E20 consent toggles | jobs suite epochs/cancellation; workflow no automatic calls while off | No implicit historical backfill on enable; explicit current requests remain available |
| E21 many-to-many | HTTP AI suite matches one file to two requirements; workflow aggregates multiple files | Semantic relevance evaluation |
| E22 ambiguous relevance | analysis validators; ambiguous assignment adds a processing limitation | Labeled wrong-entity/period model benchmark |
| E23 human corrections | jobs unlink/rejection regression | Reject-unlinked and promote-existing-link product actions remain separate |
| E24 malformed model output | analysis/backend validator tests; workflow malformed matcher | Fuzzing and larger adversarial corpus |
| E25 conflicting/unknown findings | analysis validators and fulfillment tests prevent completion | Semantic contradiction detection benchmark |
| E26 partial fulfillment | fulfillment tests derive full/partial/unfulfilled/unknown from criteria | Current criteria are all mandatory; optional/alternative schema not implemented |
| E27 injected source instructions | No model tools; exact citation/schema validation tests | Semantic injection evaluation; true quotations do not prove valid conclusions |
| E28 human acceptance separation | review tests and submitted-scope integration | Future waiver rules remain out of scope |
| E29 duplicates/reanalysis | jobs receipt/cache/fencing tests; HTTP batch replay | Success reanalysis UI discoverability |
| E30 user/scope isolation | jobs parallel claims and scoped coalescing tests | Multi-process sustained race soak |
| E31 worker failure | jobs expired lease recovery and backend lost-heartbeat/shutdown tests | Process supervisor/health monitoring and real process-kill drill |
| E32 timeouts/rate errors | backend abort-ignoring transport, Retry-After and retry-bound tests | Compound outage load test |
| E33 uncertain commit/accounting | jobs repeat commit and conservative reservations; storage uncertain insert paths | Crash between domain commit, diagnostics and accounting |
| E34 budget/configuration | jobs admission/block/retry tests | Live budget reconciliation and tailored blocked UI |
| E35 fairness/burst load | scheduler tests; workflow held manual check does not starve matching | Measured throughput/p95 latency/backlog quotas |
| E36 discarded diagnostic | diagnostic tests distinguish validated/applied/discarded | Permanent discarded payload history is not enabled by default |
| E37 revoked authority | jobs membership, preference and role tests; worker admission tests | Full boundary permutation stress test |
| E38 lender submitted isolation | HTTP draft sentinel/download/diagnostic denial; jobs resubmission fence | Automatic lender reruns are not enabled; manual checks bind latest submission |
| E39 foreign IDs/stale tokens | jobs ownership/scope tests; HTTP batch ownership checks | Browser multi-tab race journey |
| E40 private diagnostics | diagnostic allowlist, expiry, size, redaction, path/symlink tests | Idle physical pruning and wider retention policy |
| E41 diagnostic failure/operations | diagnostic failure tests preserve domain outcomes | Production alerting, worker-health and disk-full drills |
| E42 model/schema upgrades | Analysis version included in snapshots; stale gates reject incompatible inputs | Mixed-version deployment drill and comparative model evaluation |
| E43 rollback/restore | Baseline Git checkpoint; all DB workflow tests apply migrations to disposable schemas | Full compatible database/blob restore drill; source tag is not data backup |

## Model evaluation policy

Gemini Flash is the new code/example-configuration default. Flash-Lite produced a false-fulfilled result on the missing-rent fixture, twice, including after prompt clarification. Flash correctly found the missing criterion but initially contradicted it in the legacy summary; the application now derives aggregate status from validated findings and retains contradictory provider summaries for diagnostics. This follows the specification's application-owned status rule; the expected partial-fulfillment test outcome was not weakened. Synthetic failure and success evidence is retained in `artifacts/ai-evaluations/`.

The model allowlist contains Flash and Flash-Lite with distinct per-million-token prices, verified against the [OpenRouter model catalog](https://openrouter.ai/api/v1/models) on November 7, 2026. Prices are pinned into each reservation so later configuration changes cannot rewrite historical accounting. Unknown models fail admission; there is no silent model fallback. Existing local `OPENROUTER_MODEL` overrides are preserved and must be reviewed before rollout.

Run the negative fixture with `OPENROUTER_MODEL=google/gemini-2.5-flash AI_SMOKE_CASE=missing-rent` plus the normal integration command. Add `AI_SMOKE_REAL=1` only for an authorized live check. The missing-rent fixture keeps property and tenant evidence but removes the rent field; it must produce partial fulfillment for the rent-roll requirement while the tenant-name requirement remains fulfilled.

A larger comparison must score correct links, missed links, false fulfillment, missing evidence, conflict detection, citation accuracy, unknown rate, latency and cost per current assessment. Add wrong-property, wrong-period, contradictory and injected-content examples before any production accuracy claim. Two labeled smoke fixtures are not a general review-quality certification.

## Rollout and rollback

Migration 013 is additive and preserves existing evidence. Apply it before running the new server or worker. The new worker reconciles durable mutation markers separately from stale-job disposal; batch wait is initially five minutes, a conservative configuration choice rather than a measured SLO. Results released with incomplete processing cannot derive fulfilled.

Tests run migrations only in disposable schemas. Shared preview deployment and shared-database migration are separate from this validation. Preserve the checkpoint tag and back up the database plus private blobs before a rollout. Returning to the checkpoint source does not remove the new tables or restore private data. Stop new workers before switching server/worker versions; do not drop workflow history as part of an ordinary source rollback.

## Verified results on November 7 2026

- All 42 unit tests pass, including contradictory-summary normalization and mandatory-criterion fulfillment.
- PostgreSQL jobs integration passes, including scoped coalescing, fencing, authority, model-specific reservation prices and unknown-model rejection.
- Workflow integration passes with 48 simulated provider calls across the scenario sequence, including bounded matching delay, reselection after abandonment, new/retired requirements and immutable replacement handling.
- A production build made from the staged integration tree passes compilation and TypeScript. The original HTTP regression suite and both complete/missing-rent simulated AI HTTP fixtures pass against that build.
- Live OpenRouter checks using Gemini Flash pass both complete and missing-rent fixtures, four calls each. The negative fixture remains partial rather than fulfilled; the separate tenant-name requirement is fulfilled. These are synthetic, bounded tests, not production accuracy measurements.
- Flash-Lite's two observed false-fulfilled negative-fixture attempts and Flash's initial contradictory-summary rejection informed the model/default and aggregation changes. Retained artifacts distinguish failures from subsequent passing results.

No shared-database migration, preview restart or production deployment was performed for this integration. Concurrent frontend changes in the shared workspace are excluded from the integration commit and the staged-tree build.
