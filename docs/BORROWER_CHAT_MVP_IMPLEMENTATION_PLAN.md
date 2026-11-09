# Borrower upload and retrieval MVP implementation plan

Existing foundation scope: one borrower, one persistent conversation per application, document upload, durable processing feedback and grounded information retrieval. The next planned milestone is the agentic preparation pilot described below; the foundation implementation and its historical verification remain preserved.

## Implementation readiness: next agentic milestone

Read-only source review, November 7, 2026, following the user's request to move toward implementation. The upload/retrieval slice recorded below is existing foundation work, not the ceiling of the next milestone. **The next planned milestone is PREP-01 borrower preparation with one adaptive agent**, beginning with a backend-driven, synthetic pilot and then the single-conversation surface. No product code or data was changed in this readiness pass.

### What blocks starting, and what does not

| Item | Evidence / consequence | Resolution and completion condition |
|---|---|---|
| Conflicting next-scope instructions | Earlier plan excludes adaptive processing/history/readiness while both aligned designs and PREP-01 require them | Resolved for planning: preserve the existing narrow slice as foundation; the next milestone includes adaptive investigation and application readiness. No extra chats, submission controls or lender UI. |
| Shared working tree ownership | Many unrelated edits, including upload/job services and new conversation files; prior plan was concurrently narrowed | Before editing shared implementation files, capture the actual candidate and coordinate file ownership or use an isolated checkout containing the required current foundation. Do not stash/reset or build from HEAD while silently dropping uncommitted dependencies. This is an execution coordination task, not a new product decision. |
| Test oracle is prose only | PREP-01 has policy U1 and checkpoints but no exact document bytes, source locators or executable expected-state manifest | First implementation deliverable: deterministic synthetic fixture builder and independently checked oracle. Confirm each supporting fact, duplicate hash, signature-appearance limitation and checkpoint readiness before evaluating model outputs. |
| Existing/new protocol boundary | Context uses `indeterminate`; messages expose `responseState: not_requested`; shared processing designs use new states/objectives | First contract deliverable: explicit legacy adapters plus validated preparation/action/result schemas and migration sketch. Do not rename old DTOs in place or pretend existing jobs implement the new protocol. |
| Authoritative processor selection | `lib/postgres.ts` enqueues document work through `enqueueForDocument`; match commits schedule verify | Before enabling adaptive mutations, choose exactly one authoritative scheduler/writer per application scope. Initial isolated pilot writes only pilot state; baseline stays unchanged for normal applications. Routing switch and stale-generation fences are required before integrated rollout. |

These items can be resolved as the first implementation package. There is no need for another broad design cycle, new vendor, model migration or specialist-agent decision before beginning that package.

### Confirmed implementation gaps, in dependency order

1. **Preparation context and policy.** `lib/borrower-chat/context.ts` returns active draft documents and existing verify projections; it deliberately excludes removed/superseded versions and does not expose a historical evidence inventory or authoritative readiness policy. Preserve its meaning. Add a separate authorized inventory with version/removal roles and stage/policy references. Use U1 only in PREP-01; outside the synthetic fixture, missing authoritative policy produces undetermined readiness, never a guessed permission to submit.
2. **Durable adaptive execution.** `lib/backend/contracts.ts` allows only match/verify jobs; `mastra-transport.ts` performs a bounded single-step text call without tools. Keep that transport as a reusable capability. Add a small durable controller that requests a typed next action, validates it, dispatches a tool and checkpoints observations. The model chooses the action, not a switch that forces every document through the same stages. Reuse admission/lease/fencing primitives; do not introduce a second queue service.
3. **Reading and visual evidence.** `lib/analysis/readers/extract.ts` rejects PDFs over 12 pages and exposes text/OCR, not model page-image inspection. Add bounded page inventory/search/selection and image-evidence transport behind a capability interface. Native-text investigation can be developed first; PREP-01 appraisal/signature completion remains unproven until these tools work. Before a live visual trial, check the configured provider/model's supported inputs, validated output and accounting; do not assume the existing text transport supports images or fits $0.10.
4. **Authority and accounting.** Existing automatic borrower enqueue is not gated like the proposed revocable automatic-off policy. Implement the new explicit/automatic grant distinction before exposing its disable control or enabling adaptive automatic work. Planner, tool and continuation calls all debit run and cumulative preparation caps; successors cannot reset the budget. No paid calls in the first deterministic package.
5. **Borrower follow-through.** Conversation persistence exists, but messages are stored without generated response turns. Add grounded explanation/delegation turns and current preparation cards after backend contracts stabilize. A generic chat answer over old context is useful foundation but does not count as an adaptive preparation agent.

### Concrete first implementation package

**Package A — PREP-01 executable contract and isolated preparation skeleton.** Build no new chat UI in this package.

- Preserve the full six-request pilot ledger. Start with native-text evidence variants for contract/recovery development, while labeling visual/long-document portions as not yet demonstrated; retain actual scan/long-PDF fixture variants for the complete pilot.
- Materialize synthetic bytes and a versioned manifest: document IDs/hashes/locators, U1 policy and stage, active/history/removal relationships, checkpoint mutations and expected per-criterion findings/readiness. Neither filenames nor prompts include oracle conclusions.
- Define validated typed tool inputs/results and preparation/run/action state; adapt existing scoped reads and reader/match/verify capabilities. Use replay/fake provider responses for deterministic execution tests without implying model intelligence.
- Add an isolated persistence skeleton with revision fencing, replay identity and budget counters. Existing application traffic continues through the baseline. Any migrations run only in disposable test schemas until normal coordinated application migration is authorized.
- Demonstrate C0 → C1 → C2 ledger updates and C4/C5 invalidation semantics using checked observations; no real signature or appraisal-understanding claim from simulated outputs.

**Package A exit:** exact synthetic sources/oracle reviewed; duplicate bytes and changed bytes distinguishable; legacy contracts preserved; full inventory never silently truncated; stale/replayed commands cannot corrupt preparation state; tests discover and exercise the new behavior. This establishes a buildable base, not agent quality.

**Package B — adaptive investigation:** connect model-selected next actions to scoped tools, add selected-page/visual capability, and exercise all PREP-01 checkpoints. First use deterministic recovery tests; separately authorized live runs establish actual useful decisions, grounded answers, latency and cost. Stop or report unsupported capability honestly rather than weakening C3 appears_ready expectations.

**Package C — borrower experience and small pilot:** expose the same preparation record through the existing single conversation, targeted questions, source previews and grounded summaries; verify end-to-end borrower follow-through and only then consider limited enablement.

### Not blockers for starting Package A

- Final production spend thresholds, statistical accuracy certification, retention/deletion UI, multi-borrower sharing and specialist agents are deferred. Configurable caps and no deletion are sufficient to start.
- Real lender policy is needed before readiness claims for a real application, not before the synthetic U1 pilot.
- Provider credentials/live-call approval are needed for model evaluation, not deterministic fixtures/contracts. This pass does not request or expose credentials.
- A quiet window is required for full shared build/integration and later browser verification, not documentation or isolated contract work. The existing test wrapper checks port 3001; its current listening state was not probed here. Do not report the older blocked result as a fresh observation.

### Readiness-pass verification

Inspected current context/contracts/message route, fixed-task backend transport/contracts, PDF reader, enqueue path, package scripts and test wrapper. No tests or model calls were run; no migration/server/data actions were performed. Prior foundation pass counts remain historical. Next implementation must read relevant installed Next.js guides and use [TESTING.md](TESTING.md), including fresh candidate identification, quick checks and coordinated full/browser verification at the appropriate stage.


## Grounded retrieval implementation — focused current slice

This implementation follows the explicit request to start with **what is requested, what has been uploaded, and what is still missing**. The separate preparation-pilot planning remains future work and is not implemented by this slice.

- Three question buttons produce deterministic `grounded-answer.v1` responses from one authorized application snapshot. No model routing, free-text answer generation, readiness inference, historical search or processing dispatch is added.
- `POST /api/applications/{id}/conversation/answers` accepts only `{intent: requested|uploaded|missing, clientMessageId}`. It atomically saves the question and answer in the existing conversation. The same key/intent replays the original answer; a conflicting intent or preexisting plain-message key returns 409. Message history exposes `responseState: available` and `answerId` for these questions; ordinary text remains stored-only.
- `GET .../conversation/answers?before={messageSequence}` pages saved answers. Context revision equality determines freshness. Changed application/check snapshots make prior answers outdated; their original JSON remains stored, but current-response payloads withhold the obsolete answer. Ask again with a new key for current facts; retry never silently regenerates history.
- `GET .../conversation/answers?answerId={id}&sourceId={id}` resolves server-issued answer-local citations after access and freshness checks. Sources include revisioned request definitions, snapshot inventory, assessment records and exact document version/hash plus existing record/column/quote locators. Document links use the existing authorized original-file route. No page or evidence-artifact IDs are fabricated. Changed snapshots return 409; inaccessible answers return 404. This conservative first version does not provide historical source browsing.
- Missing-evidence answers distinguish reported current unmet criteria from no linked file, unassessed, pending, unavailable and stale checks. Unlinked evidence may exist; conditional and later-stage requests are not declared due now. Existing limitations/conflicts remain visible, and AI completeness is never lender acceptance.
- Migration `019_grounded_answers.sql` is additive. `BORROWER_GROUNDED_RETRIEVAL=1` enables the three questions and saved answer history in the borrower upload view. Apply pending migrations through the normal coordinated procedure before enabling. The flag defaults off independently of upload-history presentation.

Verification: 90 unit tests and TypeScript PASS in an isolated view of identical source using the matching release dependency tree; extended disposable-schema integration PASS for answer retry races, history, citations, stale-source rejection, authorization and no processing dispatch. Full build/integration is BLOCKED by the active shared preview on port 3001. HTTP/browser checks are NOT RUN against this candidate. No shared migration, feature enablement, model call or server restart was performed. See `artifacts/testing/grounded-retrieval-report.txt`.

## Existing foundation build order

1. **Foundation (existing):** authorized application read model and idempotent conversation/message storage. Stored messages do not schedule answers yet.
2. **Upload and persistent progress (current slice):** reuse the existing uploader and batch receipts. Atomically attach one stable conversation artifact per batch; recover all existing receipt history without processing historical evidence. Poll current authorized status; show per-file save outcomes and request checks as available. Refresh/reconnect must retain identity and never schedule jobs.
3. **Grounded retrieval (implemented subset):** the three explicit questions above use current authorized context with persistent deterministic answers and cited source details. General free-text/status answers and model turns remain future work; pending and stale checks are disclosed.
4. **Focused recovery and verification:** targeted clarifications when supported, upload retries, stale findings, revoked access, browser refresh and mobile/keyboard checks.

The foundation slice did not implement an adaptive preparation agent, full-application readiness or historical investigation. Those capabilities belong to the next milestone below. New orchestration services, multiple chats, human support and new submission/file-management controls remain outside scope. Existing upload processing, AI preference, manual corrections and submission boundaries remain authoritative.

## Contract reconciliation

- Persist display anchors independently from processing attempts. `artifactId` identifies the UI card; future citations use `evidenceArtifactId` for evidence provenance. Never invent citation artifacts from upload receipts.
- Preserve the existing baseline batch/job DTO behind an explicitly named `conversation-uploads.v1` read projection. It is not `processing-event.v1` and does not pretend existing jobs implement the proposed preparation protocol. Future shared processing adapters must map retry_wait to queued, blocked to waiting_input with owner/reason, cancelled to canceled, and stale results to superseded. Do not change current worker wire values in this slice.
- The context DTO’s `indeterminate` remains a legacy presentation value; future shared findings explicitly adapt it to `unknown`. Job completion never implies evidence sufficiency or lender acceptance.
- Polling is sufficient. The upload-history revision is an equality fingerprint, not an ordered event cursor. A separate `before` receipt ID paginates history; clients poll serially and abort abandoned pages. A later application event stream must adopt the shared opaque cursor rather than reuse this receipt cursor.
- Snapshot reads reauthorize the application/borrower and compute status/freshness in one transaction. Polling, reconnect and migration never enqueue processing or regenerate transcript summaries.
- Automatic policy and explicit requests remain owned by existing processing services. This slice adds no alternate authority grants, cancellation controls or policy semantics.

## Current slice implementation

Migration `018_conversation_uploads.sql` adds owner-bound batch-to-conversation anchors and a transactional batch-insert trigger. It also attaches existing receipts without rerunning work. Stable anchors are independent of browser acknowledgments, upload outcomes and processing attempts. The existing upload transaction already serializes application mutations; unique constraints deduplicate retries.

`GET /api/applications/{id}/conversation/uploads?before={receiptId}` returns ten cards plus an explicit older-page cursor, a snapshot fingerprint and polling interval. Each card hydrates the existing batch projection rather than copying mutable findings. Wrong-role and cross-application access is denied; history is scoped to the current borrower.

`BORROWER_CONVERSATION_UPLOADS=1` enables the upload-history section on the existing borrower upload view. It reuses existing upload controls and the latest-upload detail panel. This slice does not expose an unanswered chat composer. Turning off the presentation flag preserves receipts and progress. Apply migrations through the normal coordinated procedure before enabling; no shared migration or rollout is implied.

## Acceptance and verification

- Concurrent manifest retries create one conversation/card, including lost acknowledgment and partial/failed uploads.
- Reopening recovers all pages of receipt history, not only the latest batch; identities remain stable as outcomes change.
- Saved, pending, failed, unsupported, stale and unrequested checks remain distinct. No provider work is caused by history reads.
- Cross-application/owner linkage fails at the database boundary; revoked membership blocks history.
- Run `npm run test:agent` and isolated conversation integration. Full build/integration requires a coordinated quiet window per [TESTING.md](TESTING.md); record browser checks as unrun until exercised against the actual candidate.

## Current slice verification

Implemented the receipt anchors, polling projection and feature-gated history described above. **83 unit tests + TypeScript PASS** using an isolated view of identical source with matching release dependencies after workspace dependency reads stalled. The extended disposable-schema conversation integration **PASS** covers legacy backfill, concurrent replay, queued/running/failed progress, pagination, access isolation and polling without dispatch. Full checks are **BLOCKED** by the shared preview on port 3001; production build, HTTP and browser verification are **NOT RUN**. Migration 018 was exercised only in disposable schemas; the feature remains disabled by default. See [verification report](../artifacts/testing/conversation-upload-report.txt).

## Historical foundation implementation report — November 7, 2026

Retained from the previous plan. The P1/P2 references below name the **old** work packages, not the revised P1/P2 above. These are previously recorded implementation and verification claims; this planning pass did not inspect or rerun them. Existing current source must be checked before extending the foundation.

The first implementation slice adds the grounded context service, conversation/message persistence, migration `017_borrower_conversations.sql`, and borrower-only API routes. It does not enable the chat UI, schedule response generation, change uploads or run a shared migration.

| API | Current behavior |
| --- | --- |
| `GET /api/applications/{id}/context` | One consistent authorized snapshot: current files/requirements, conservative current assessments, immutable document/check source references, intake counts, explicit LOI availability and context revision. Overall application lifecycle remains null because no authoritative lifecycle was found. |
| `GET /api/applications/{id}/conversation?after=0&limit=50` | Read-only, paginated scrollback; returns null before explicit creation. Cursor is a decimal sequence string; limit 1–100. |
| `POST /api/applications/{id}/conversation` | Idempotent create-or-get for the authenticated application/borrower; no request body needed. |
| `POST /api/applications/{id}/conversation/messages` | Accepts only `{clientMessageId, text}`. Same ID/text replays; different text conflicts. Returns 201 for a new stored message or 200 for replay, with `responseState: not_requested`. It does not yet return 202 or create a pending AI turn. |

P1 read projection and the core conversation storage portion of P2 are implemented. P2 upload/card linkage and durable model turns remain for their corresponding upload/answer vertical slices; no inert jobs, unused activity tables or model dispatch were added. The LOI relation pins an existing immutable application document, with no provisioning/backfill endpoint. Exact-quote/locator authenticity still comes from the existing validated analysis pipeline; the read projection adds scope/shape/criterion checks and does not claim to re-read bytes.

Verification: **83 unit tests + TypeScript PASS**, and the focused PostgreSQL integration suite **PASS** (concurrent creation/sends, idempotency, pagination, revoked-access replay, LOI/message cross-application constraints, safe context projection and stale-result suppression). The workspace dependency tree stalled during module reads; the quick wrapper ran against the same source inodes in an isolated test view using the existing release dependency tree, whose dependency declarations and lockfile were verified identical. No workspace dependencies were replaced. Log: `artifacts/testing/borrower-chat-foundation-quick.txt`.

`npm run test:agent -- --full`: **BLOCKED**, wrapper refused because port 3001 is in use. Build/HTTP/browser checks: **NOT RUN**. The preview was not stopped or changed. Migration 017 was applied only in disposable test schemas; the shared application still needs its normal coordinated migration before these endpoints are used. No UI or live-model verification is claimed.


## Proposed agentic pilot specification — separate from current release slice

The following user-requested scenario defines the next agentic milestone, distinct from the recorded upload/retrieval foundation. The readiness section above establishes the implementation entry point. This scenario does not claim the current foundation meets it or authorize live evaluation or deployment.

## First end-to-end pilot: prepare one application for underwriting

**Scenario ID:** PREP-01. **Status:** deterministic synthetic fixture builder and simulated contract/recovery harness implemented; see `lib/preparation-pilot/README.md` and `docs/PROCESSING_INTEGRATION_STATUS.md`. No live model run was performed by the processing build. Readiness checkpoints below are retained as future synthetic diagnostics; the current integrated scope is document completeness only. This is a synthetic composite inspired by the five reviewed document cases, not an assessment of the real loan package. The policies below are explicitly authored test inputs, not claims about general lending rules. Keep this first scenario in this plan so the MVP has one concrete target.

### Borrower goal and initial conditions

One borrower is preparing **Cedar Court Holdings LLC**, property **18 Cedar Lane**, for an initial underwriting submission. The synthetic guarantor is **Alex Vale**; **Vale Family Trust** is a named related party. Review date is **July 31, 2026**, independent of execution date. One persistent conversation exists. The borrower asks:

> “I've already uploaded some documents. What do I still need before I send this for underwriting? Please use what is already there.”

The application is not yet submitted. Automatic checking is enabled, with actor-scoped results and configured hard caps. The agent may reuse current findings but must validate their dependencies. No loan approval, signature authentication, unrestricted-funds determination or professional appraisal opinion is requested. Source assertions such as a borrower's account inventory remain attributed assertions.

**Fixed test policy U1:** all pre-submission components below must be met or have an explicit recorded exception. There are no implicit waivers. Lender countersignature, trust-fund acceptability and appraisal acceptance may remain pending for this *initial underwriting submission*, provided identified uncertainty and version differences are disclosed. Their pending status does not make the underlying evidence complete or lender-accepted. Closing insurance is not a prerequisite at this stage. This policy is authoritative structured fixture data, versioned and cited; without U1 or a known stage the agent must not assume these permissions.

### Complete request ledger and independently defined gold criteria

| Request | Pre-submission criteria under U1 | Other obligations and expected handling |
|---|---|---|
| R1 — Borrower accounts | March, April and May 2026 statements for every declared borrower account, plus an attributed declaration identifying the account population. Statements identify borrower, consistent account identity, periods and complete page sets. | Statement coverage for one account is not proof there are no others. U1 accepts the declaration for initial submission; it is not independent bank verification. |
| R2 — Guarantor cash support | PFS, March–May cash-account statements, and an attributed explanation identifying which accounts support its cash figure. Identity, periods and numerical reconciliation must be supported. | Retirement assets do not substitute for the requested cash. Trust ownership and personal availability are separate. U1 permits the availability decision to remain lender-pending after disclosure. |
| R3 — Application and financing LOI | Application for the correct borrower/property with required borrower fields and visible borrower signature/date; financing LOI for the same transaction with visible borrower signature/date. | Lease LOI for another entity is not qualifying financing evidence. Lender countersignature/terms acceptance remain a disclosed lender obligation under U1. Visual marks do not authenticate signatures or signatory authority. |
| R4 — Appraisal package | Subject appraisal report identifying the intended lender, report/effective dates, plus the available review and a clear indication of which report it reviews. If a later report exists, identify it and disclose whether the review covers it. | Invoice is not a report. Under U1, operative-version selection and acceptance/update of the review may remain lender-pending; no new borrower appraisal order is demanded. Full valuation review is outside this test. |
| R5 — Ownership certification | Correct-entity form containing certifying name, owner/control fields and visible applicable borrower signature/date. | Filled ownership fields alone do not resolve blank certification execution fields. Legal authority and independent ownership verification remain lender responsibilities. |
| R6 — Closing insurance | No pre-submission criterion for this stage; retain request as later-closing/not assessed, with U1 source. | Insurance is absent throughout the main trajectory. Do not silently drop the request, claim it is supplied, or demand it as an immediate underwriting-submission blocker. |

Each component receives met/unmet/unknown and source/coverage support. Requirement assessments summarize their defined scope; readiness uses the U1 stage prerequisites, not a blanket “every request accepted” rule. Retain lender-owned obligations explicitly even when the preparation status becomes appears_ready.

### Evidence fixture specification

Labels below are for the human test designer. Use opaque runtime IDs; no labels encoding expected outcomes in provider input. Filenames may suggest a type but are never sufficient evidence. Future fixture generation must supply exact bytes, hashes and physical page/region or cell oracles; this specification does not pretend those artifacts already exist.

**Already saved before the opening question:**

| Evidence | Independently specified contents | Important setup |
|---|---|---|
| Business March statement | Cedar Court Holdings LLC, account B1, March cycle; all three pages present | Historical, current/non-removed version, unlinked to R1; discoverable in full inventory |
| PFS with cash schedule | Alex Vale, June 8 date; reported cash 60,000; attached schedule uses May 31 balances | Historical scanned four-page PDF, linked to R2; no authenticated signature claim |
| Retirement May statement | Alex Vale, May, Roth retirement account, 80,000 | Clearly identifies retirement purpose; does not supply requested cash-account evidence |
| Borrower application | Correct borrower/property; required fields, visible borrower signature/date present | One-page scan; later copy will be byte-identical |
| Other transaction LOI | Lease negotiation for Pine Court LLC at 90 Pine Road | Misleading generic LOI filename; wrong entity/property and purpose |
| Appraisal invoice | Correct subject and appraisal service charge; no valuation report | Correct subject alone cannot satisfy R4 |
| Ownership certificate v1 | Correct entity, populated owner/control entries; certification name/signature/date blank | Three-page PDF with form appearances; rendering-sensitive variant below |
| Business May statement | Same borrower/account B1, May cycle; all three pages present; references preceding April cycle | Latest upload, linked to R1; reference to April does not supply its statement |

Historical here means previously uploaded, not automatically superseded or stale. No account-population declaration, April statement, cash explanation, financing LOI, actual appraisal or executed ownership certificate is initially supplied. Other lender-request evidence is not hidden outside this manifest.

**Later evidence specified for the trajectory:** April B1 statement; March/April/May trust T1 checking statements; correct financing LOI; duplicate application; duplicate certificate v1; original appraisal A; revised appraisal B; appraisal review of A; and genuinely changed certificate v2. Trust statement May cash is 60,000. Its trust/account identity is explicit and is not the same legal owner as Alex individually.

Appraisals A and B are synthetic 48-page PDFs. Both identify the correct property and intended lender; A report date June 12, B July 14, effective date June 10 for both. Relevant identity/date/review facts are internally consistent. The review is dated June 15 and explicitly names A; it says nothing about accepting B. Place relevant sections beyond the current reader cap, with a usable contents/search structure. No private source document or real signature is copied into these fixtures.

### Checkpoints and expected borrower outcomes

The harness changes evidence only at the checkpoints below, once the prior observation is recorded. Within each checkpoint the agent controls tool order, parallelism, depth and ask-versus-investigate decisions. Progressive partial results are allowed; the settled expectations apply after the agent has had an admissible opportunity to investigate. If a needed tool or budget is unavailable, record the limitation as an incomplete demonstration, not an incorrect confident answer.

| Checkpoint | Borrower input / change | Required grounded outcome | Readiness |
|---|---|---|---|
| C0 — Use what is already there | Opening preparation question; no new files | Find historical March and current May for B1; April missing. Recognize PFS/application already supplied. Cash support, correct financing LOI, actual appraisal and executed certificate are unresolved; account population unknown. Preserve R6 as later-stage. | `not_ready`: known unmet prerequisites, with unknowns listed |
| C1 — Credit useful follow-ups | Upload April B1; all three trust statements; correct financing LOI with borrower signature/date but blank lender line; copies of application and certificate named “signed” | B1 months now covered; ask about other accounts only if still unresolved. Trust cash documents received, explanation/availability distinct. Correct LOI replaces the wrong-purpose evidence as support, without automatic destructive replacement. Application copy and certificate copy have identical hashes to originals; no new signature evidence. Appraisal still absent although not in this batch. | `not_ready`: certificate/appraisal and outstanding declarations/explanation remain |
| C2 — Resolve clarification and locate appraisal package | Borrower declares “B1 is the only borrower account. The PFS cash figure refers solely to trust account T1 using May 31 balances.” Upload A, B and review of A. | Store assertion; under U1 complete declared-population and reconciliation prerequisites after checking content/arithmetic. Trust availability remains lender-pending. Recognize actual reports and A-only review; flag B review/acceptance uncertainty to lender. Existing ownership certification is still unsigned. | `not_ready`: R5 remains a blocker outside the new appraisal batch |
| C3 — Supply a real correction | Upload certificate v2 with changed bytes, required entries and visible borrower signature/date; use existing correction/link controls if needed to make it current | Verify relevant execution evidence and version relationship; preserve v1 history. Resolve R5; do not repeat April, PFS or application requests. Full ledger covers R1–R6, with U1-disclosed lender obligations and later insurance retained. | `appears_ready` for initial underwriting submission under U1; not submitted, not accepted, not approved |
| C4 — Readiness can become stale | Through existing file controls, remove April from the active draft evidence set; ask readiness again | Immediately invalidate prior readiness. Retained historical April remains identifiable but must not silently count as active support or be restored. Suggest the permitted existing restore/link path rather than asking for needless reupload. Reassess current ledger. | `not_ready` once April's exclusion and missing active coverage are established |
| C5 — Recover without duplicate work | Borrower explicitly restores the same April file through existing controls | Reuse compatible extraction, refresh dependencies and current evidence coverage. No new file bytes or repeated inspection needed unless another dependency changed. | `appears_ready` under U1 again; lender decisions unchanged |

At C0–C2, a material visual ambiguity may make an individual check unknown rather than unmet; readiness is still not_ready while other established blockers exist. At C3, unknown required visual evidence prevents appears_ready. Never weaken the source standard just to reach the expected terminal state.

**Illustrative guidance, not exact text matching:**

C0: “I found March and May for your business account and your application is already here. Please add April and confirm whether there are other business accounts. The ownership form still needs its certification completed. I also need the cash-account evidence and financing LOI; the appraisal report is not in the saved package yet.” The agent may group/prioritize fewer actions first, with the complete ledger available. It must not overwhelm the borrower with one question per check.

C2: “The statements and your explanation now support the initial cash-document request. Your lender still needs to assess access to the trust funds. Both appraisals are here, but the review names the earlier one. The remaining borrower submission blocker is the ownership certificate—it is still the same unsigned copy.”

C3: “The package appears ready for initial underwriting submission under the recorded requirements. The lender still needs to resolve trust-fund availability, the financing LOI countersignature and acceptance of the revised appraisal. Insurance remains a closing item. You can review and send through the existing submission flow.” Do not say “approved,” “fully accepted,” “all requests complete,” or claim it has been sent.

### Agentic freedom and observable diligence

Available capabilities are inventory/current findings, text/table/OCR, selected-page search/render/inspection, evidence retrieval, duplicate/version comparison, grounded arithmetic, requirement assessment, clarification and readiness projection. The agent chooses them according to circumstances. Examples of equally acceptable approaches:

- Read statement identity/period text directly or reuse a compatible earlier artifact; both can establish the same coverage.
- Locate appraisal identity/review sections through contents, text search or a bounded skim; inspect additional pages when relevant. Do not require exact page order or exhaustive 48-page reading for narrow claims.
- Ask one combined account-population/reconciliation question, or separate them if doing so produces clearer guidance; continue independent appraisal/certificate work while waiting.
- Inspect certificate execution before matching unrelated files, or finish ready textual findings first. Either is valid if unresolved coverage remains honest.

Unacceptable shortcuts: rely on filenames, treat reference-to-April as the April statement, count retirement as cash, equate trust ownership to unrestricted individual access, assume a lender signature or appraisal acceptance, treat duplicates as progress, or infer a waiver from a shorter list. Blindly reading every page or rerunning every file is not a correctness failure by itself, but incurs avoidable cost/latency and should compare poorly with an equally correct selective approach.

### Small variants, not extra MVP workflows

After the main trajectory works, replay selected checkpoints with one change at a time:

- **Renderer disagreement:** a PDF viewer omits populated widget appearances. The agent can choose another rendering/field inspection; it must not claim a blank fact from the faulty view. Gold distinguishes populated owner fields from genuinely blank signature fields.
- **Insufficient visual capability or budget:** inability to verify the changed certificate leaves that criterion unknown and readiness undetermined at C3 if no known unmet prerequisites remain. Preserve progress and a specific resume dependency; count full-case completion as unachieved, not a false success.
- **Policy absent or changed:** unknown stage/policy prevents appears_ready; a pinned U2 requiring revised-appraisal acceptance before submission changes the readiness outcome. Only an authorized structured policy change can do that, not text embedded in the upload.
- **Disconnect/replay:** close after C1 saves and before results; replay the command and reconnect. One preparation record/cards, no duplicated domain effects, lost obligations or renewed spend merely from replay. In-flight provider retry billing may still be uncertain and must be recorded honestly.

### Pilot scorecard and acceptance decision

Record each checkpoint's source revisions, input/coverage manifest, criterion ledger, readiness, borrower-visible answer, actions/questions/owners, tools actually used, safe purpose codes, elapsed time and known/reserved/unknown cost. Future oracles must identify supporting fact atoms and allowable source alternatives, not just expected aggregate labels. Missing-evidence claims need coverage; cited locators alone do not prove entailment.

| Dimension | Main-trajectory acceptance evidence |
|---|---|
| Correctness | No false-ready checkpoint; expected gaps resolve only with qualifying evidence/policy; C3/C5 readiness is supported, not guessed |
| Full scope | All six requests accounted for; historical March found; missing certificate remains visible during appraisal work; removed April does not count silently |
| Helpfulness | Borrower understands the requested period/field and next action; no repeat demand for supplied PFS/application/April after resolution; trust/appraisal/LOI lender decisions are not misassigned to borrower |
| Agent judgment | At least the duplicate, historical-evidence and long-PDF cases demonstrate purposeful tool choice; acceptable alternate paths count equally |
| Continuity | Same preparation record survives questions, uploads, replay, removal/restoration; prior answer correctly becomes outdated |
| Grounding | Each material claim has appropriate document/structured-policy support or explicit uncertainty; no invented policy, signature authenticity or full valuation audit |
| Practicality | Report time to first useful guidance and settled checkpoint, number of unnecessary questions/repeated calls, and cost per checkpoint/cumulative preparation; compare paired cases to baseline before fixing production caps |

For this first pilot, the reviewed successful trajectory should have no uncorrected material factual or readiness error and should leave a reviewer able to identify the correct next action at every checkpoint. Do not score exact wording, exact tool sequence or a preselected number of calls. This is a small qualitative acceptance target, not the deferred statistical accuracy gate. Unsupported capabilities and budget-blocked outcomes are recorded explicitly; they cannot be relabeled as full scenario success.

No live calls are authorized by this specification, and $0.10 feasibility is unknown. The next work, after implementation is authorized, is to construct independently checked synthetic artifacts and wire this trajectory through a small preparation implementation slice—not to add more agents or broaden the UI.

