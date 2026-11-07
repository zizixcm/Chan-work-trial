# AI workflow behavioral tests and coverage

The requirements and edge-case matrix define expected behavior. Tests encode those expectations; they are not an independent guarantee that a model's interpretation is correct. Deterministic workflow tests use a simulated provider with the real queue, PostgreSQL transactions, preparation and output validators. Live-provider smoke checks use synthetic evidence and retain durable admission and spend controls.

The maintained [workflow design](AI_WORKFLOW_DESIGN.md) records the decisions and recovery behavior these tests exercise. Behavior changes must update design, scenario status and test evidence together.

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
| E11 partial/abandoned batch | workflow suite expires manifest, preserves saved members, checks limitation and late arrival | Includes unassigned expiry/finalization and save recovery; browser reopen journey remains; unsent bytes cannot be recovered automatically |
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

The follow-up regression suite now covers F09 expired **and finalized** general-upload manifests with all members unsaved and no requirement association, plus normal-save recovery. F11 covers a newer clear match failing to hide another enabled borrower's ambiguity and resolution after that actor disables AI. F12 checks that old successful matches cannot resolve changed definitions. Both original defects were reproduced before the fixes. Remaining priorities include unrelated/continuous arrivals (F18), sustained multi-borrower reconciliation and finer dependency policies. See the [maintained design](AI_WORKFLOW_DESIGN.md).

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

## Coverage/freshness follow-up validation — November 7, 2026

All 42 unit tests, PostgreSQL jobs integration, expanded workflow integration (67 synthetic calls) and TypeScript checks pass. Added assertions cover expired/finalized unassigned manifests, late-save recovery, cross-user ambiguity, disabled-actor exclusion and outdated matching after definition changes. The first two regressions failed on the prior implementation before fixes. No paid model calls, migration changes or deployment were performed for this increment. The earlier build/live results above apply to the earlier integration baseline, not a new build of these fixes.

## Generalized document reader and evaluation follow-up — November 7, 2026

Reader fixtures exercise native/scanned PDF, XLSX hidden sheets/formulas, PNG/JPEG/WebP OCR, DOCX body/header paragraphs, TXT, plain/HTML EML with attachments, invalid hashes, damaged files, archive/XML rejection, excess page count, blank OCR and cancellation. Citations validate exact extracted values and retain page/cell/paragraph source locations. Unsupported-format sentinels now use ZIP rather than the newly supported PDF. The workflow suite also exercises real PDF extraction through automatic matching/assessment and private feedback capture, replay/conflict handling and cross-user denial.

Live comparisons retained in `artifacts/ai-evaluations/comparison-1794084619592.json` and `comparison-1794084816201.json`: 28 synthetic cases across Flash/Lite, 22 exact passes, two unexpected formula outcomes, four call/validation failures (including a 60-second timeout). No expected labels were weakened. Both models passed 11/14 in this small sample; default remains Flash. Modern DOCX/EML/TXT have reader tests but no live model fixture yet. See [evaluation policy and metrics](AI_PROMPTS_EVALS_AND_METRICS.md). This is not a production quality benchmark.

Final validation for this increment: all 47 unit tests pass; source TypeScript passes; isolated staged workflow integration passes with 74 simulated calls, while the combined concurrent backend tree passes with 87. These are different source snapshots, not a throughput comparison. Reader dependencies audit with zero reported vulnerabilities. The isolated staged production build passes compilation, TypeScript and route generation using webpack. Turbopack could not resolve dependencies through the temporary external node_modules symlink; this was a test-directory setup issue, not a source compilation failure.

### MSG reader follow-up

`tests/outlook-reader.test.ts` generates synthetic compound-file MSG fixtures. Tests cover upload acceptance, MIME scheduling allowlist, Unicode headers/body with source locations, HTML-to-text, attachment exclusion/limitations, RTF-only limitation, truncated/damaged input, and non-email item rejection. No paid model calls were made for MSG; prior live results remain v6 evidence.


## Evaluation oracle audit — 2026-11-07

The independent GPT-6 Astra review is recorded in [AI_EVAL_ORACLE_AUDIT.md](AI_EVAL_ORACLE_AUDIT.md). The old 22/28 result is an original-label count, not a reliable accuracy estimate: two formula labels were incorrect and four attempts failed before a validated result. Original reports remain unchanged.

The new suite has 30 completion coverage cases and four matching cases, authored against the package mapping specification. It covers full evidence, each individual omission, redundant copies, and duplicates that cannot replace missing evidence across financial statements, bank statements, tax documents and lease chains. These are narrow content-coverage slices, not full catalog or legal completeness. Conditional applicability, signatures, authority, full-format negative cases and real reviewed holdouts remain outstanding.

Scoring now checks criterion states and source groups. Eight scorer tests exercise false completion, incorrect citations, duplicate substitution, conflict states, prompt leakage, and explanation paraphrases/negation. Missing-reason lexical screens remain provisional and require semantic adjudication; passing that screen does not establish a correct explanation. Ambiguous correspondence relevance is unscored. New reports preserve synthetic fixtures, hashes, exact task prompts/schemas, and safe failure stages. Compare models only on the same executed cases. No new live model accuracy is claimed from this audit.
