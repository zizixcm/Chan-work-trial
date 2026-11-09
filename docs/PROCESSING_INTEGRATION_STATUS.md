# Processing implementation status

**READY FOR SNAPSHOT — processing candidate, November 7/8, 2026.** No further feature changes planned while deployment freezes this candidate. This is not a claim that live model accuracy or the combined deployed UI has passed.

## Scope and authorization

Package A (PREP-01 fixtures/shared contracts/durable skeleton) is implemented. The coordinator subsequently relayed the human's authorization to continue the isolated integration, with four decisions: document completeness only (submission readiness deferred); actual adaptive scans/long-PDF investigation required for the first live trial; one cumulative $20 synthetic evaluation ceiling with deployment as the sole spend/execution owner; automatic clear-match links only after focused evaluation. This builder made no paid calls, built no UI, switched no existing application's mode, and applied no migration to shared application storage.

Deployment reports the existing provider account has zero credits. Live evaluation is externally blocked pending the user's provider-credit decision. Do not search for alternate credentials or count simulations as live accuracy evidence. Automatic mapping remains disabled.

## Shared protocol and bridge entry points

`lib/preparation/protocol.ts` exports strict runtime schemas and inferred DTOs:

- `processingRequestSchema`, `processingResultSchema`, `processingQuestionSchema`
- `processingEventSchema`, `preparationInvalidationSchema`, `applicationEventSchema`
- `preparationSnapshotSchema`, `evidenceCoverageSchema`, `revisionSchema`, `publicStateSchema`, `assessmentSchema`
- `ProcessingRequest`, `ProcessingResult`, `ApplicationEvent`, `PreparationSnapshot`
- `parseCompletenessRequest` / `parseCompletenessResult` reject current-release readiness requests/claims.
- `compareRevisions` compares decimal projection revisions numerically; `legacyAssessment` explicitly maps legacy `indeterminate` to `unknown`.

No consumer should use the internal synthetic harness types as public wire DTOs. Source authenticity and authorization are separate from shape validation.

`lib/preparation/service.ts`:

```ts
new PreparationService(pool)
service.accept({applicationId, userId}, intent)
service.snapshot({applicationId, userId})
service.events({applicationId, userId}, afterCursor)
service.result({applicationId, userId}, resultId, decimalRevision)
service.coverage({applicationId, userId}, coverageId, decimalRevision)
service.evidenceArtifact({applicationId, userId}, evidenceArtifactId)
service.answer(access, {questionId, expectedQuestionRevision, idempotencyKey, text})
service.cancel(access, {runId, expectedRunRevision, idempotencyKey})
```

`preparationIntentSchema` / `PreparationIntent`: commandId, idempotencyKey, objective (`understand_and_assess` / `resolve_gap`), assessmentScope, documentIds, requirementIds, origin `{kind,conversationId,artifactId,domainEventId}`, nullable uploadBatchId, expectedContentRevision, nullable retryOf. The trusted chat adapter establishes persisted request/card/domain-event ownership before this internal call. The service additionally checks membership, conversation, batch and document/request scope. Browser authority/fingerprints are not accepted.

Snapshot: `{preparation, activeRuns, currentResult, pendingQuestions, cursor}`. Events: `{resyncRequired, events, cursor}`. Exact result revision reads dynamically expose historical freshness, including intake-only changes. Reads never admit work. Result/event fingerprints identify actual result dependencies; the receipt retains its initial accepted-input fingerprint. Full inventory includes application identity, request subjects/purpose/applicability/collection/stage, active/historical versions and pending intake; seed IDs do not truncate it.

## Execution and ownership

- Migration **021_preparation_runtime.sql** creates opt-in runtime storage, questions, immutable coverage/results, stream, mapping provenance/gates, and atomic content/intake invalidation. It does not activate processing or grant spend. Chat owns migration 020.
- `lib/preparation/ownership.ts`: baseline by default; operator-only `transitionProcessorMode` advances epoch and fences outstanding borrower work. Lender jobs remain baseline. Outstanding cost reservations are retained.
- `PreparationWorker(service, planner, tools, readBlob, options).run(access, runId)` executes planner-selected inspect/read text/read image/propose mapping/ask/assess actions. Reservations, observations, questions and results persist; admission/dispatch/publication enforce membership, automatic versus explicit grant, epoch, input dependencies, leases and budgets.
- `lib/preparation/actions.ts` defines `PreparationPlanner` and `EvidenceTools`. `maximumCallMicros` is required. Optional SHA256 `configurationDigest` pins evaluated provider/model/prompt/tool settings; without it, mappings are confirmation-only. This builder does not supply or execute a paid provider adapter. Deployment owns its adapter and the global evaluation ledger.
- `runPreparationTick(service, worker, {dispatchPendingChatDelegations})` in `lib/preparation/runner.ts` invokes the chat crash-recovery hook, admits saved upload obligations, then executes one eligible run. Never invoke from GET. The deployment runner must wire the chat-owned hook; the processing module does not import chat UI/server surfaces.
- Upload obligations resolve actual batch/member/owner anchors to `artifactId: upload:<borrower_conversation_uploads.id>`. Non-upload work does not fabricate a batch. Equivalent actor/grant/objective/scope/input/anchor obligations coalesce. Distinct grants or explicit cards remain distinct. Stale saved intents get a fresh identity; other admission failures stop after three attempts with a durable reason.
- Per-preparation budget defaults to zero. Operator configuration and the deployment global ledger are required for paid work. Successor runs do not reset cumulative accounting. An uncertain provider outcome retains its reservation/unknown-cost flag.

## Mapping boundary

`deriveMappingActions` and `confirmPreparationMapping` are in `lib/preparation/mapping.ts`. Confirmation input: `{resultId, resultRevision, actionId, idempotencyKey}`. Confirmation rechecks current result/evidence revisions, active file/request scope, and manual rejection; it writes a visible reversible association with provenance. There is no replacement/removal capability.

Positive criterion citations can generate **confirmation-only suggestions**. A separate planner `propose_mapping` action must supply grounded identity/purpose/period/target support, clear relevance, no conflicts, and the evaluated configuration digest before a proposal is even eligible for automatic publication. Automatic publication additionally requires the operator-owned matching gate, current automatic permission, and the exact evaluated configuration. A globally enabled gate alone does not authorize an ambiguous/generic proposal. No gate has been enabled by this build.

## Fixtures and verification

`lib/preparation-pilot/README.md` documents the isolated harness. `scripts/materialize-prep01.ts <new-output-directory>` creates 20 deterministic synthetic PDF versions plus separate versioned manifest/oracle. Sources include exact duplicates, changed certification bytes/forms, scans and 48-page reports. The fixture manifest's page text is authored content, not claimed OCR output. The oracle is never provider input. C0–C5 readiness remains a future synthetic diagnostic, separate from current completeness-only publication.

Verified in `/tmp/proximity-prep01-fullcheck`, a source copy using the existing isolated deployment dependency tree without changing it:

- PASS: `npm run test:agent` — 103 unit tests plus TypeScript. Earlier shared dependency reads failed with ECANCELED; a later shared-checkout quick run also passed. No shared dependency installation was rewritten.
- PASS: PREP-01 disposable PostgreSQL integration: C0–C5, lease/revision fencing, restart, replay/concurrent dedup, cumulative budgets, cancellation and actor isolation/revocation.
- PASS: runtime disposable PostgreSQL integration applying actual migrations: admission/grants, borrower-only mode switch and lender preservation, real selected-page reading with scripted planner, persisted clarification/answer, worker → event → actual chat projection hydration, current/historical invalidation, mapping confirmation/replay and automatic denial, upload → runner → stable chat anchor.
- PASS: actual PDF capability test reads selected pages 24/25 of a 48-page report, recognizes no native text in a scan, renders its PNG, and rejects wrong hash/out-of-range pages.
- PASS: baseline jobs integration: borrower/lender dispatch, concurrent claims, stale commits, preferences, upload/recovery, human rejection and ownership. No provider calls.
- Blank/filled certificate and scanned application pages visually inspected; deterministic hashes and independent fact locators checked.
- Full production build and browser checklist: NOT RUN by this builder; deployment owns combined-candidate verification. Live semantic accuracy, latency/cost and mapping quality: NOT RUN, externally blocked.

## Current limits

- PDF tools are for synthetic pilot use. Production untrusted-file enablement still needs the hardened isolated-reader boundary.
- Selective positive evidence reads work; a confident global missing-evidence claim currently requires all active pages to have usable observations. Otherwise the planner must report unknown/coverage limits. This conservative guard is not the final optimized absence policy.
- Image citations preserve rendered-page provenance, but visual interpretation/quotation remains model output requiring evaluation; visible marks never authenticate signatures.
- Scoped text/native/image reading is implemented, not general OCR/table/email/office tool integration. Unsupported evidence stops honestly.
- No submission readiness, lender acceptance, credit approval, automatic waiver, auto-removal, or automatic linking before its quality gate.
