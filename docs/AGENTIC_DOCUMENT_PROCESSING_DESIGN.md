# Agentic document processing design

Design proposal, November 7, 2026. Companion: [Borrower chat platform design](BORROWER_CHAT_PLATFORM_DESIGN.md). This document records the agreed product direction, proposed MVP and implementation contracts. It does not claim implementation or runtime verification. The main design is below; detailed contracts, evidence rules and evaluation references follow in appendices.

## 1. Product goal and agreed decisions

**High-level goal: act as a helpful agent to the borrower and help them prepare their application.** Make lender requests understandable, recognize evidence already supplied, resolve uncertainty where possible, and guide the borrower toward the next useful action with minimal unnecessary work.

Document matching, evidence assessment and submission readiness serve that goal. The experience should answer: **What have you already accomplished, what still needs attention, and how can I help you move forward?** A technically correct list of deficiencies is insufficient if it leaves the borrower confused or repeatedly asks for evidence already available.

The borrower MVP uses one borrower and one persistent conversation per existing application, with the application, LOI association and lender requests assumed to exist. The borrower conversation agent owns the interaction; the durable document-processing agent performs the evidence investigation that supports it. Together they maintain continuity as files arrive, explain specific gaps in plain language, distinguish borrower actions from lender responsibilities, and help assemble the intended submission. They do not guarantee approval or invent lender requirements. Application records—not chat memory—own state; AI completeness, lender acceptance and credit approval remain distinct.

| Decision | Agreed direction |
|---|---|
| New uploads | Process automatically after durable save, disclose at upload and provide a disable control; no automatic historical backfill |
| Matching | Auto-link clear matches after focused quality checks; make links visible/reversible, preserve human corrections and ask about ambiguity |
| Timing | Agent chooses whether to assess saved evidence now or wait for related arrivals, within enforced time/cost limits |
| Privacy | Private chats and actor-scoped results initially; shared evidence follows existing application permissions; low-priority product expansion |
| Pilot success | Balance useful accuracy, responsiveness and cost through practical end-to-end evaluation; large statistical release gates deferred |
| Spend | Hard configurable caps; $0.10/run remains provisional until measured, not authorization for live calls |

## 2. The agent's job: establish application submission readiness

**Supporting mission:** help the borrower prepare the application by evaluating the lender's applicable requests against authorized current and historical evidence. Determine what is satisfied, what is not, what cannot yet be determined, and what will move the package toward its intended submission. Actively investigate resolvable gaps and produce an evidence-grounded application-level assessment. Classifying the newest files is only one possible means to that goal.

### Understand the whole application

Maintain a revisioned working view of every applicable request: purpose, subject, period, required components, conditions, stage, supporting evidence, unresolved questions and next-action owner. Inventory the authorized evidence universe, including unlinked files, prior uploads, duplicate/replacement relationships and relevant earlier assessments. Retrieval can select content to read; it cannot silently narrow the set of requests being evaluated. An application-wide answer requires every applicable request to be accounted for, including explicit unknowns.

Historical evidence can supply earlier statement periods, original agreements, amendments or context that the newest upload lacks. Reuse valid observations, but recheck them against today's selected requirement revision and the intended review date. Superseded or removed draft versions are not automatically current support; retain their historical role where authorized, respect removal/publication policy, and do not silently restore links. A review of an old report does not accept its replacement. An ambiguous later lender list does not waive omitted requests.

An explicit application-readiness request includes relevant authorized historical evidence in scope. This is different from blanket background reprocessing of all historical files, which remains disabled by default. Ordinary new-upload processing may retrieve relevant history to resolve affected requirements; it should not claim application readiness from that subset alone.

### Investigate until there is a useful, defensible answer

The agent chooses its next action according to the borrower's present need and the uncertainty that most affects useful progress. Explaining a confusing request or identifying the correct replacement can be the right action even before a full readiness assessment is warranted. It can inspect, compare, retrieve, assess, ask, wait or finish, revising its plan as evidence arrives. These are decisions, not mandatory stages. Examples of competent behavior include:

- Search existing authorized uploads and prior findings before asking the borrower to supply something that may already be present.
- Combine complementary files and inspect cross-requirement evidence when that can resolve a gap; do not assume one requirement maps to one file.
- Check purpose, parties, periods, required content and material inconsistencies rather than stopping at a plausible category match.
- Try another supported reading approach when extraction fails or contradicts visible evidence; do not equate unreadability with absence.
- Investigate conflicts and version relationships instead of choosing the most convenient document; seek clarification only when available evidence cannot reasonably resolve the issue.
- Prioritize submission blockers and questions that resolve several dependent checks; credit already-resolved gaps and avoid repeated requests.

Use every relevant authorized capability that can materially improve the answer within the configured budget. The objective is successful evidence resolution, not minimizing tool calls for its own sake. Conversely, repeated calls on unchanged input without a prospect of new evidence are not diligence. When a useful investigation requires an unavailable tool, more budget, borrower clarification or lender judgment, preserve progress and identify that specific dependency instead of returning a generic failure or inventing certainty.

### Help the borrower act, then follow through

The interaction should explain why an item is requested, what acceptable evidence needs to show, where the supplied material falls short, and the simplest useful next step. Prefer a short prioritized action list with optional details over an undifferentiated ledger of deficiencies. Offer grounded preparation help: point to the relevant page or field, identify the period/version to obtain, organize supplied evidence, or draft a factual explanation for borrower review. Do not fabricate values, signatures, attestations or lender policy, or send a draft externally without authorization.

Keep an application preparation record of unresolved obligations, resolved gaps, pending questions and action owners. The processor supplies evidence and actions; the conversation agent handles explanation and borrower collaboration without becoming a second source of truth. New uploads, answers and authorized requirement changes trigger reconsideration of affected obligations. Continue useful independent work while one question is pending. A technical retry, new chat or browser reconnect must not make the borrower repeat supplied information.

There is no requirement to finish the entire application before offering useful help. A request-specific answer is legitimate when clearly scoped; a claim of overall readiness requires the complete application assessment below. Finishing a worker run is not completion of the borrower's preparation goal. Persist the unresolved work and its resume trigger, including whether borrower input, lender action, new evidence or operator budget is needed; do not restart endlessly while nothing changes.

### Selective reading is an agent decision

Model the agent as a capable lender document reviewer with finite attention, not as the lender's decision authority. For a long or image-bearing PDF, it may skim selected pages to identify purpose, party and period, then inspect relevant sections. It may start elsewhere when context already identifies the document. There is no fixed first-page count, mandatory second renderer or universal parse → match → validate → complete pipeline. Independent investigations may proceed concurrently.

The depth of inspection follows the claim being made. A cover may establish identity; checking a signature needs the relevant execution area; completeness may require examining schedules, attachments and related documents. The agent tracks actual inspected coverage and reads further when a material uncertainty warrants it. Rendering a page does not mean it was inspected, and a relevant snippet cannot establish absence elsewhere in the document.

### Finish with an application-level readiness assessment

Return a complete request ledger and a concise summary: satisfied requests with evidence; missing or deficient components; unresolved uncertainty; lender-owned decisions; and prioritized borrower actions. Explain what changed since the prior assessment and which scope/stage was evaluated. Conditional applicability needs a sourced policy/decision, not an invented exemption.

Proposed application-level `submissionReadiness` is distinct from each requirement's assessment:

| State | Meaning |
|---|---|
| `appears_ready` | All applicable prerequisites for the selected submission stage are supported or have an authoritative permitted exception; no material unresolved coverage or blocker remains |
| `not_ready` | At least one established submission prerequisite is unmet; list known blockers and any additional unknowns |
| `undetermined` | No established unmet prerequisite settles the answer, but incomplete coverage, unclear applicability/policy or another material uncertainty prevents a readiness conclusion |

Derive this projection deterministically from grounded request findings and the authoritative submission policy, not a model's optimistic summary. Closing-only requests need not block underwriting submission unless policy says so. If the lender permits incomplete submission, distinguish “can submit with disclosed exceptions” from “all requirements satisfied”; do not infer that permission. Review/acceptance that occurs after submission is not itself a pre-submission blocker. The agent reports readiness; the borrower still explicitly reviews and submits through the existing workflow, and the lender retains acceptance and credit decisions.

A bounded run may finish with useful partial findings while the readiness obligation remains unresolved. Budget exhaustion, a failed reader or pending uploads cannot convert unknowns into met checks. Changes invalidate affected findings and the readiness projection, and durable continuation resumes the unresolved work. Authorization, integrity, source validation, freshness and hard resource bounds are enforced by the runtime around the agent's choices.

## 3. Available capabilities and MVP scope

| Capability | What the agent can use it for | Scope |
|---|---|---|
| Inspect file identity and prior findings | Check saved bytes/type/hash; reuse duplicates and compatible extraction | Existing primitives to wrap |
| Read text, tables and OCR | Extract authorized evidence with original-source locators | Existing bounded readers to wrap |
| Inventory/search/read selected PDF pages | Identify long documents; inspect relevant sections without assuming full coverage | Proposed capability; current reader cap is insufficient |
| Inspect page images and form appearances | Resolve a material scan/layout/visible-signature question; choose an alternate renderer if evidence conflicts | Proposed bounded capability; visual presence is not authenticity |
| Retrieve supporting evidence | Find an already-saved PFS, trust document or related report linked elsewhere | New scoped capability; pin every added dependency; reading does not mutate links |
| Match and assess | Interpret purpose, parties, periods and combined evidence against requirements | Reuse bounded model tasks, selected adaptively |
| Compare facts and versions | Grounded arithmetic/date comparisons; account-period coverage; identify which report a review references | Deterministic calculations plus cited semantic findings |
| Explain and prepare next actions | Supply sourced requirement explanations, exact gaps and proposed evidence organization or factual clarification drafts for the conversation agent | Grounded assistance; borrower reviews assertions and consequential changes |
| Ask or route review | Resolve a specific ambiguity, request evidence or identify a lender-owned decision | Typed persisted question/action; no implied external delivery |

Use one processing agent with tools initially. Specialist subagents are optional later, only if they improve measured outcomes enough to justify complexity and cost. Keep PostgreSQL, private blob storage and the standalone worker; no new queue vendor or general graph service is required.

The borrower surface remains upload and grounded guidance/retrieval: no new chat management, multi-borrower sharing, human-support delivery, LOI provisioning, chat-driven replacement/removal/organization or submission controls. Proposed evidence organization is presented as suggestions or policy-approved clear matches; other corrections and explicit sending use existing controls. Readiness guidance does not expand lender workflows.

The proposed experience includes selective visual/long-PDF reading, but those capabilities are **not established in the current app**. A first implementation can expose unavailable capability as an honest manual-review/unknown outcome. Demonstrating all five cases below requires implementing and evaluating the necessary reading tools. Attachment expansion, signature authentication, full professional appraisal review and unrestricted large-package reasoning remain outside the initial promise.

## 4. State and borrower-facing results

Persist immutable document versions, extraction/visual artifacts, inspection coverage, findings, relationships and their source revisions. Separate these dimensions:

| Dimension | Meaning |
|---|---|
| File processing | Saved/readable/limited/failed; a technical failure is not missing business evidence |
| Mapping | Relevant/irrelevant/ambiguous; relevance does not establish sufficiency |
| Criterion | Met/unmet/unknown, with supporting citations or a specific gap |
| AI assessment | Appears complete/incomplete/unknown for the pinned evidence and requirement definition |
| Human review | Not sent/pending/accepted/changes requested/waived under the existing lender service |

An application-readiness result additionally carries `submissionReadiness`, intended submission stage, authoritative policy revision, full request-ledger reference, evidence-universe coverage reference, known blockers, unknowns, permitted exceptions and the dependency fingerprint. This is an additive proposed result contract; per-requirement events alone cannot establish it.

Each result explains **what changed, what remains unresolved, the scope inspected, and the next action's owner**. It includes exact input revisions, citations, coverage/limitations/conflicts and permitted actions. A follow-up may resolve a gap, introduce a conflict or make no substantive change. Count files as intake progress, never as evidence of completeness.

Missing evidence means absence within a sufficiently inspected scope; unreadable, uninspected or ambiguously applicable evidence remains unknown. All-account coverage requires an account population basis, not simply several statements. A limitation can be localized to specific criteria only when supported by a coverage/dependency justification; uncertainty about relevance keeps the broader blocker.

Require visible distinction between borrower actions, lender decisions and later closing items. A displayed lender-review obligation does not mean anyone has been notified. Citation locators open the original permitted version, not a replacement. Borrower explanations are attributed assertions, not waivers or proof of authority.

## 5. Durable delegation and recovery

Saved uploads, explicit preparation/readiness requests, answers to pending questions and authorized requirement changes can trigger processing through durable domain commands/outbox obligations. Chat and non-chat upload paths use the same coordinator. Processing continues without a long-lived chat request; stopping a chat response does not stop the run.

The coordinator constructs `process_application_evidence.v1` with authenticated actor/application scope, immutable document IDs/hashes, requirement revisions, authority policy and input fingerprint. The processor checkpoints its chosen actions and returns versioned progress, questions and results. The borrower agent updates one stable artifact and summarizes only meaningful settled changes. The exact reconciled contract is in Appendix B.

Reauthorize before reads, provider dispatch and publication. Fenced commits compare the actual dependency fingerprint; changed evidence invalidates affected findings immediately and coalesces successor work. Preserve human mapping corrections and submitted lender snapshots. A late result may remain historical but cannot become current.

Replay uses scoped idempotency keys; duplicate commands do not duplicate domain effects. Worker recovery resumes persisted work after lease expiry. Cancellation fences future dispatch/publication but preserves saved evidence and history. Provider billing may remain uncertain after a lost acknowledgment. Reconnect uses a consistent authorized snapshot plus event cursor and never schedules work by reading status.

## 6. Five illustrative investigations

These paths demonstrate decisions, not prescribed sequences. They are based on a qualitative real-document experiment, not application verification.

| Case | Illustrative agent choice | Borrower-facing outcome |
|---|---|---|
| March/May statements → April | Inspect identity/period; search saved evidence if useful; compare the new month using earlier findings | “April completes these months for this account. Please confirm other accounts.” |
| PFS/retirement → trust checking | Distinguish asset purpose; inspect a scan or retrieve related trust/PFS evidence when relevant; ask for reconciliation | “Cash statements are received; identify how they support the PFS. Trust-fund availability needs lender review.” |
| Wrong LOI → correct financing LOI | Compare party/property/purpose; inspect relevant execution fields; reuse the duplicate application's findings | “The financing LOI matches; execution needs lender confirmation. The application copy adds no new evidence.” |
| Invoice → long appraisals and review | Identify invoice; selectively inspect reports and review references; investigate which version was reviewed | “Reports are received. The review names the earlier version; the lender must confirm the operative revision.” |
| Unsigned certificate → renamed duplicate | Reuse hash-grounded findings; inspect a field differently only if a material rendering uncertainty remains | “This is the same unsigned copy; please provide the executed version.” |

The experiment also exposed renderer disagreement over filled form fields, report-date versus effective-date differences, and ambiguous later needs lists. The agent can investigate these circumstances; it cannot assume blank fields, refreshed valuation dates or waived requirements. Detailed provenance and limitations are in Appendix E.

## 7. Next step and pilot acceptance

Next, turn this design into **one small implementation slice**: borrower preparation request or saved upload → agent-selected investigation → grounded guidance → borrower follow-up → updated application state. Keep manual file/review actions available. Do not build separate agents for each conceptual task.

Suggested engineering order (not the agent's runtime workflow):

1. Pin the shared DTOs and wrap existing readers, match/assessment tasks, authorization and jobs as tools.
2. Add durable action checkpoints and the tool-selection loop; preserve baseline behavior behind a flag.
3. Add selected-page/visual inspection and cross-requirement retrieval to cover the five representative cases, or explicitly mark unsupported outcomes.
4. Test application-level readiness across multiple requirements and current/historical evidence, including already-saved unlinked support, policy-defined exceptions, superseded files and a blocker outside the newest upload. A passing five-case subset does not establish this broader capability.
5. Exercise a complete borrower-help journey: explain a request, find historical support, give a specific next action, incorporate the response, and update readiness without repeated demands.
6. Compare initial/follow-up trajectories against the fixed-workflow baseline, then run shadow and a small named pilot cohort with one authoritative writer.

Judge whether the borrower can make useful progress: grounded correctness, clear and actionable guidance, recognition of already-supplied evidence, appropriate action ownership, unnecessary questions/rework, elapsed time and measured cost together. Test recovery, duplicate replay, revocation, cancellation, changed evidence and reconnect. Score acceptable alternative actions, not a required sequence of tools. Focused matching checks precede auto-link enablement. The large statistical targets in Appendix F are deferred, not MVP prerequisites.

Rollback disables adaptive admission, fences active runs and routes current work to the baseline without deleting files, findings or submissions. Design approval does not authorize implementation, live calls, migrations, server restarts or deployment. Future implementation verification follows [TESTING.md](TESTING.md), including quick checks, coordinated full checks and the affected browser checklist before UI claims.

Retention/deletion periods remain open; archive-only is the interim proposal. Final numeric attention/spend settings should follow measurements. No further product choice is required to finish this design pass.

## Appendix A. Inspected baseline (November 7 source snapshot)

Source inspection was performed in a heavily modified shared checkout, not a clean release or running environment. Preserve those unrelated edits. References below identify current source surfaces; older design follow-ups sometimes describe earlier versions. In particular, inspected `lib/analysis/types.ts` declares `document-review.v8`, while earlier docs describe v6/v7.

| Surface | Existing behavior observed in source | Implication for migration |
|---|---|---|
| `lib/upload.ts`, `lib/postgres.ts`, upload routes and batches | Blob persistence precedes document metadata; uncertain commits are reconciled; application-scoped duplicate detection, batch intake and draft removal/restore exist | Start delegation from durable domain events, not selected files or chat attachment placeholders |
| `lib/analysis/formats.ts`, `prepare-document.ts`, readers | CSV, PDF, DOCX, XLSX, EML, MSG, TXT, JPEG/PNG/WebP; bounded local extraction/OCR; disposable process for non-CSV; 32-entry process-local cache | Wrap existing readers first; durable extraction artifacts and selectable reader strategies are new work |
| `lib/backend/prepare-analysis.ts` | Reauthorize reads, pin SHA-256, prepare documents; max 10 documents / 50 requirements; propagate limitations; fail integrity/preparation failures | Keep integrity failure distinct from missing business evidence; do not silently truncate to fit a model |
| `lib/analysis/match.ts` | One prepared document is classified and compared with every supplied requirement, with relevance and criterion checks | Reuse as bounded matcher, eventually allow evidence segments with original-source provenance |
| `lib/analysis/verify.ts`, `fulfillment.ts` | Assess combined linked evidence per requirement; strict structured checks and exact citations; application derives aggregate status | Validity is currently embedded in rubric/checks, not an independent validity-agent service |
| `lib/jobs/core.ts`, `postgres.ts`, `reconcile.ts`, `batches.ts` | Pinned inputs, actor/scope fingerprints, coalescing, readiness barriers, mutation invalidation, authorization gates, durable jobs and events | Extend these primitives; avoid a second competing queue and freshness implementation |
| `lib/backend/job-runner.ts`, contracts/provider executor | Lease heartbeat, deadlines, fenced commit, reservation accounting, bounded retry, metadata phases and optional restricted captures | Retain fencing and accounting around every agent step and provider call |
| `lib/evals/*`, `scripts/evaluate-models.ts` | Synthetic semantic, format and package cases; task-level model calls; source/criterion scoring, manifests and cost cap | Useful component baseline; not an upload-to-final-application agent harness |
| Existing workflow/job/HTTP tests | Simulated integration covers plumbing, mutations, failures and authorization | Necessary regression coverage; authored outputs do not prove model reasoning correctness |

The conceptual parse → match → validity → completeness sequence is therefore not four existing services. Current application-controlled scheduling principally connects `match_document.v1` and `verify_requirement.v1`, with preparation before calls and validity within assessment. Preserve that distinction when estimating work.

Reader limitations are material: PDF page/visual coverage, unverified workbook formulas, embedded Word visuals, email attachments, low-confidence OCR and signatures/authenticity are not solved by an agent loop. Current preparation bounds include 30-second non-CSV extraction, 12 PDF pages and bounded extracted records. Exceeding them must become an explicit limitation until a separately validated chunk/coverage implementation exists. Current source also retains an empty-evidence discrepancy between assessment and fulfillment described in the [oracle audit](AI_EVAL_ORACLE_AUDIT.md); normalize that contract before using empty-input gold labels.

## Appendix B. Shared delegation, progress and result contract

Shared design contract for the November 7, 2026 borrower-preparation alignment. This section adopts its `process_application_evidence.v1`, `processing-request.v1`, public event vocabulary and existing `unknown` assessment value. These are proposed design agreements, not implemented API claims. Existing endpoint/schema adapters must be reconciled during implementation. Routes remain illustrative; one runtime-validated DTO/adapter boundary must implement both designs.

### Identity, authority and visibility

`commandId` identifies one deliberate command; `idempotencyKey` deduplicates its canonical payload within application/actor/command kind. They may carry the same opaque value initially but have different roles. `runId` identifies durable execution; `runRevision` is its monotonic projection revision, not its lease token or evidence revision. `resultId`/`resultRevision` identify a committed result projection; immutable assessment records retain their source dependencies. `artifactId` identifies a conversation-owned display anchor, not processing authority; citation extraction/visual provenance uses the distinct `evidenceArtifactId`. `eventId` deduplicates delivery; `cursor` resumes the authorized application event stream. No extra public `operationId`, `generation` or `evidenceSetRevision` is needed: internal generations fence execution; `snapshot.contentRevision` and exact dependency fingerprints describe evidence freshness.

Server session and active application membership supply actor/role. The envelope's authority is constructed by the trusted coordinator and revalidated by the processor; browser/model-supplied authority is never accepted. `policyRevision` identifies the effective revocable AI authorization policy, including actor-specific permission where applicable. Pin submission ID for lender scope; borrower conversation commands cannot request lender scope. Every nested file, requirement, receipt, origin and citation is checked against the application and its visibility policy.

Conversation history and artifacts are owner-private by default. Application evidence remains shared under existing domain permissions. Processing runs/results stay actor-scoped initially, matching current fingerprints. Coalescing never crosses actors or visibility scopes. Shared source changes can invalidate another member's displayed domain data, but cannot expose the originating private conversation, question, result or artifact. Cross-member result publication requires a separate approved policy, not cache reuse. A lender receives only permitted submitted evidence, never borrower chat or draft results.

### Durable delegation and acceptance

`process_application_evidence.v1` is the server-side command. A proposed `POST /api/applications/{app}/processing-runs` adapter accepts only command/idempotency identity, durable receipt/file selectors, optional requirement hints and authorized origin references. It builds the following envelope from authoritative state; callers do not manufacture fingerprints, hashes, policy tokens or actor fields:

```json
{
  "schemaVersion": "processing-request.v1",
  "commandId": "opaque-command",
  "idempotencyKey": "opaque-key",
  "applicationId": "app-id",
  "authority": {"actorUserId": "user-id", "scope": "borrower", "policyRevision": "opaque-policy-token"},
  "origin": {"kind": "chat_upload", "conversationId": "chat-id", "artifactId": "card-id", "domainEventId": "save-event"},
  "objective": "understand_and_assess",
  "assessmentScope": "affected_requirements",
  "preparationId": "preparation-id",
  "uploadBatchId": "batch-id",
  "documents": [{"documentId": "immutable-version-id", "seriesId": "series-id", "version": 2, "sha256": "server-verified-hash"}],
  "requirements": [{"requirementId": "request-id", "definitionRevision": "3", "evidenceRevision": "8"}],
  "snapshot": {"contentRevision": "24", "inputFingerprint": "canonical-server-fingerprint"},
  "retryOf": null
}
```

`documentId` is the immutable version ID already used by the application, not a mutable series head. `origin.kind` also permits `portal_upload` and `integration_upload`; conversation/artifact references and uploadBatchId are nullable for non-chat/non-upload reconsideration. Only configured authorized integrations may use integration origin. For upload-triggered commands the authenticated coordinator resolves the durable save receipt/domain event. Proposed additional origins are `borrower_request`, `question_answer` and `requirement_change`; they require an authorized persisted request/domain event, not a fabricated upload receipt. These origins extend the earlier upload-only proposal and are part of the shared borrower-preparation contract.

`objective` supports `understand_and_assess`, `resolve_gap` and `assess_submission_readiness`; a read-only explanation that existing current findings answer need not start another processing run. `assessmentScope` is `affected_requirements` or `application`. For application scope the server pins the full active request inventory, intended submission stage, review date, authoritative policy revision and authorized evidence-inventory revision. Supplied file/requirement IDs seed investigation, not the evidence universe. `preparationId` links runs to the durable borrower preparation record; it conveys no additional authority. `assess_submission_readiness` requires `assessmentScope: application`. An explicit readiness request can consider relevant historical files without enabling unsolicited historical backfill. No raw file bytes, file password or storage key enters this command.

File bytes are persisted first; committed document metadata and pending outbox delegation are written together. Uncertain saves use existing reconciliation. The outbox schedules processing even if no chat turn exists or the browser closes. Concurrent chat and outbox triggers resolve the same saved-evidence obligation, coalescing only within actor, visibility scope, objective and exact pinned input fingerprint. Command replay with the same key/body returns the original receipt; a different body conflicts. A stale accepted receipt is returned as historical with its current run status, never silently reinterpreted as a new run. A deliberate retry uses a new key and `retryOf` after refreshing authorized revisions.

Durable acceptance returns HTTP 202 (or the original receipt on replay): `runId`, `runRevision`, nullable `artifactId`, `acceptedAt`, public `state`, and `inputFingerprint`. Snapshot/event cursor may accompany the receipt, but is not proof of assessment success. No paid work runs inside the chat/HTTP request. No worker acknowledgment is required to acknowledge durable queueing.

Requirement targets are hints. The processor may discover additional permitted affected requirements, persist an expanded pinned dependency set and recheck it at commit. The accepted fingerprint identifies the initial input; each committed result has its actual dependency fingerprint. Every progress/result event carries the fingerprint corresponding to that projection. Broad `contentRevision` signals reconsideration but is neither sufficient protection nor a reason to discard proven-unaffected results. Fingerprints include actual file versions/hashes, definitions, mapping/rejection/removal/restore state, context, unresolved intake, authority and model/tool/policy versions using one canonical encoding shared with job adapters.

### Preparation and readiness schema completion

Use the following shared proposed names in runtime DTOs; references are application/actor-authorized immutable revision references, not URLs. These fields complete the semantics in sections 2/4 and the borrower design; they do not describe existing APIs.

| Location | Fields / rules |
|---|---|
| Command snapshot | `preparationRevision` (string), `submissionStage` (string or null), `reviewDate` (ISO date), `submissionPolicyRevision` (string or null), `requestInventoryRevision` and `evidenceInventoryRevision` (strings). Null stage/policy is explicit uncertainty; never infer readiness from it. These are included in inputFingerprint. |
| Result preparation linkage | `preparationId`, `preparationRevision`, `assessmentScope`; pin the preparation revision assessed. |
| Application result `readiness` | `submissionReadiness`, `submissionStage`, `reviewDate`, `submissionPolicyRevision`, `requestLedgerRef`, `evidenceCoverageRef`, `blockers`, `unknowns`, `permittedExceptions`, `dependencyFingerprint`. Ledger/coverage refs carry `{id, revision}`. Blockers/unknowns carry requirement/criterion references when applicable, safe reason code, citations/coverage reference and action owner. Exceptions require an authoritative policy/decision reference. |
| Preparation snapshot | Current `preparationRevision`, current result/readiness references, obligations with stable IDs/owners/status/resume triggers, question references, and cumulative budget status. Do not overwrite history when a new result becomes current. |
| Domain invalidation event | `application.preparation_invalidated` on the same application stream, distinct from processing lifecycle events: eventId/cursor/applicationId/occurredAt plus authorized `preparationId`, advanced `preparationRevision`, affected result refs, affected requirement IDs and `reasonCode`. Refresh the current snapshot; no private other-actor run IDs or content. Unknown dependency scope invalidates conservatively. |

A ready result requires complete ledger/coverage validation and non-null authoritative stage/policy. Application answers use the current preparation projection, not the last completed run. Scope-limited results omit `readiness`. The shorter section 4 names describe these semantics; the nested DTO above is the canonical proposed wire structure.

### Automatic processing and cancellation policy

Automatic processing authority and an explicitly requested investigation are separate grants. Disabling automatic checks advances its authority epoch, fences queued/in-flight automatic dispatch and future publication, and preserves saved files and previously committed findings subject to normal freshness. It cannot retract provider work already sent. A new explicit bounded preparation request may proceed only under its own current authorization; it neither reenables automatic mode nor backfills unrelated history. Membership revocation fences both grants. The effective grant/epoch is included in the authority fingerprint and rechecked before reads, dispatch and commit.

Canceling a run preserves its preparation obligations and marks that canceled execution as requiring an explicit retry or a distinct permitted new trigger; the reconciler must not immediately resurrect the identical canceled work. Evidence/definition changes may create a new eligible obligation under current policy. Budget-blocked work resumes only after valid admission becomes possible, without polling-triggered rescheduling or cap resets. No whole-preparation pause/cancel UI is part of this MVP; define that separately if introduced.

### Public lifecycle and internal mapping

Use the companion's public states, with `canceled` as the public spelling. Internal worker states and safe detail remain explicit:

| Internal condition | Public state | Detail / terminal meaning |
|---|---|---|
| queued / retry_wait | queued | `queued` or `retry_wait`, retry time when known; nonterminal |
| running | running | Safe activity/counts; nonterminal |
| waiting_for_input | waiting_input | `clarification_required`, resolvable question; nonterminal and no lease held |
| blocked | waiting_input | `budget_exhausted`, `configuration_required` or `policy_blocked`; `requiredActor` distinguishes operator from borrower; no misleading borrower question |
| completed, all processing obligations resolved | succeeded | Terminal execution, even if requirements are incomplete; never means lender acceptance |
| completed, unresolved review/coverage obligations | partial | Terminal bounded processing; remaining obligations and next actions required; may contain all-unknown assessments |
| failed / dead_letter / expired | failed | Safe distinct detail and retryability; terminal attempt |
| cancelled | canceled | Terminal, future commits fenced |
| superseded / stale | superseded | Terminal for that run; successor reference when available |

Public `state` describes execution; `assessment` describes evidence. Use `appears_complete | incomplete | unknown` for assessments, consistent with existing domain types and the companion. Not assessed/checking/outdated are display/freshness states, not new model judgments. An unknown assessment caused by unreadable evidence cannot become “missing.” Lender status comes separately from the authoritative publication/review service; processor result events never set or imply it.

### Event envelope and result payload

Use one authorized application stream, `GET /api/applications/{app}/events?after={cursor}`, with a shared durable event schema and consistent snapshot projections. Polling is sufficient for the borrower MVP; authenticated SSE/replay is an optional transport, not a release prerequisite. Run GET and explicit retry/cancel adapters remain under `/processing-runs/{id}`. Separate processing event storage may exist internally but must not create a competing browser cursor protocol.

Every public event includes `schemaVersion: processing-event.v1`, `eventId`, `applicationId`, `cursor`, `runId`, `runRevision`, nullable `artifactId`, `occurredAt`, `type`, `state`, `inputFingerprint`, and safe `data`. Nullable artifactId prevents a non-chat upload from depending on conversation creation. The conversation service adds an authorized artifact linkage; the processor does not write private transcript records.

Event types are `run.accepted`, `run.progress`, `run.needs_input`, `run.result_committed`, `run.failed`, `run.cancelled`, `run.superseded`. Preserve companion event spelling `run.cancelled` while public state is `canceled`. `run.progress` may represent retry wait; `run.needs_input` includes blocked detail and required actor. `run.result_committed` may publish a current intermediate result with state running or a terminal result with state succeeded/partial; `data.terminal` is mandatory. Clients do not infer terminal status from the event name alone. `run.failed/cancelled/superseded` are terminal. Question resolution appears in a revised run projection, not an additional incompatible event vocabulary.

```json
{
  "schemaVersion": "processing-event.v1",
  "eventId": "event-106",
  "applicationId": "app-id",
  "cursor": "opaque-resume-cursor",
  "runId": "run-id",
  "runRevision": "7",
  "artifactId": "card-id",
  "occurredAt": "2026-11-08T01:00:00Z",
  "type": "run.result_committed",
  "state": "succeeded",
  "inputFingerprint": "actual-result-dependency-fingerprint",
  "data": {
    "terminal": true,
    "resultId": "result-id",
    "resultRevision": "1",
    "freshness": "current",
    "documents": [{"documentId": "immutable-version-id", "sha256": "server-verified-hash"}],
    "requirements": [{
      "requirementId": "request-id", "definitionRevision": "3", "evidenceRevision": "8",
      "assessment": "incomplete",
      "checks": [{"criterionId": "march-statement", "state": "unmet", "citationIds": []}],
      "gaps": [{"criterionId": "march-statement", "kind": "missing_evidence", "subject": "account ending 1234", "period": "2026-03", "documentRole": "bank_statement"}]
    }],
    "coverageRef": "coverage-manifest-id",
    "limitations": [], "conflicts": [],
    "allowedNextActions": [{"actionId": "upload-action-id", "kind": "upload_evidence"}]
  }
}
```

The example's missing-evidence claim is backed by a complete inspected coverage manifest, not a fabricated citation to an absent file. Positive checks require server-issued citation IDs. Each citation resolves to immutable document/hash, `evidenceArtifactId` and artifact digest and exact supported locator/quote; existing record/column locators remain valid. Definition/submission citations resolve to pinned structured record revisions. The resolver reauthorizes; no arbitrary URL or invented PDF page. A fallback file-level preview can be useful but does not count as verified precise support.

Progress `data` contains per-file save/processing outcomes, affected requirement IDs, measured counts, safe activity labels, limitations and `nextPollAfterMs`. Save facts come from the intake service, never a model. No synthetic percent, fixed stage order, raw prompts, chain of thought or provider traces. Application-scope results include the section 4 readiness fields and full-ledger/coverage references; affected-requirement results cannot claim overall readiness. Result payloads additionally include actual input references, structured conflicts/limitations, current/historical/superseded freshness and revision-checked allowed actions. Required fields may be in an authorized durable result resource referenced by the event; event hydration must resolve exactly that result revision, not an accidental newer payload.

### Reconnect, invalidation and conversation rendering

A consistent snapshot returns authorized preparationId/current preparation revision, unresolved obligations and resume triggers, active runs/questions/results/artifacts and its high-water cursor. Changes to a run do not imply completion of the preparation record. Resume after that cursor; deduplicate eventId, reject decreasing run/result/artifact revisions and treat cursors as opaque. Visibility filtering can cause stream gaps. Cursor expiry explicitly requires a new snapshot. GET/reconnect never schedules processing. Persist terminal/error/action-required transitions; intermediate progress renders may coalesce. Reauthorize at stream opening and before private delivery; revocation closes access and clears client state.

Source mutations invalidate affected assessment projections atomically with a durable domain invalidation event on the same application stream. That event identifies affected assessments/revisions without leaking another actor's private run. Clients must mark stale cards immediately even if successor processing has not started. `run.superseded` alone is insufficient: a completed run can remain historically successful while its findings become outdated. A result cannot render current unless its dependency fingerprint still matches the current authorized projection. Historical prose stays dated; citations keep their original version; live cards update with their own monotonic artifact revision.

One artifact per upload batch stays anchored in the originating conversation; preparation/readiness requests without an upload use a stable request-anchored artifact linked to preparationId, not a fabricated batch. The application preparation view retains the scoped current ledger and unresolved actions across these artifacts. Each artifact may reference several runs and successors. Deduplicate event-to-artifact links and summary emission by artifact plus settled result/dependency revision. Progress events create no transcript messages. Emit at most one short summary for a meaningful new settled result requiring action or answering the borrower; do not emit a duplicate summary for retry/replay/cache reuse with unchanged findings. Other conversations retrieve the permitted current application projection rather than copying the owner's private activity. Owner portal uploads attach once to the single application conversation or remain in application activity until it exists, labeled with actual origin and no invented user message.

### Questions, commands and cancellation

`run.needs_input` contains stable question ID/revision, dependency fingerprint, affected requirements, typed answer schema/options, required actor, blocking status and allowed action IDs. A question is deduplicated by unresolved fact/dependency revision. The conversation renders it; it does not answer on the borrower's behalf. A reply routed through `POST .../artifacts/{id}/actions` invokes the same domain answer command as an optional `/processing-questions/{id}/answers` adapter. Both require command/idempotency keys, expected question revision and current dependencies. Stale answers return 409. Persist an attributed assertion or explicit mapping command, never documentary proof or a waiver. Ask for an unlocked re-export, never a password in chat.

Existing borrower-initiated map/unmap/replace controls require explicit action, affected-target display and expected revisions. Within chat, this MVP exposes only policy-approved clear matches, explicit ambiguous-link confirmation and attributed clarification answers; other corrections stay in existing file controls. Automatic clear-match linking is the narrowly approved exception described next; it does not authorize automatic replacement, removal or borrower assertions. The processing agent may propose mappings; clear matches may auto-link under the user-approved policy after mapping-quality evaluation passes. Automatic links must be visible and reversible, preserve human corrections/rejections, and ask about ambiguous matches; before that evaluation, show suggestions for confirmation. Submission remains in the existing review/send workflow and requires its explicit confirmation; this MVP adds no submission artifact controls; neither processing nor conversational inference submits evidence. Human-review outcomes create a durable unresolved review obligation, not an external message or a claim that a person has received it.

Stop response only cancels conversational generation. Cancel processing uses expected runRevision and idempotency, fences dispatch/publication, and leaves saved files/history intact. Canceling one run does not kill shared reusable work required by another authorized run. Explicit retry uses new command identity, retryOf and fresh authority/dependencies, with the same enforced limits. Browser disconnect or conversation archive cancels neither process.

Safe API errors follow the companion: 400 malformed, 401 unauthenticated, 403 forbidden visible operation, 404 inaccessible/missing, 409 revision/idempotency conflict, 413 size, 429 capacity, 503 transient failure; include safe code, retryability and correlation ID. Error text must not expose other actors' existence, SQL or provider content.

### Shared-contract acceptance examples

- Save succeeds, acceptance response is lost, browser closes: replay returns the same command receipt; outbox processing continues; reconnect shows one batch artifact and no duplicate paid dispatch attributable to command replay.
- January/February statements are inspected and March is absent: run succeeds with incomplete assessment and a structured March gap; chat says files are saved and March is still needed, without implying lender review.
- OCR cannot read a material amount: bounded alternate reader or question; unknown assessment, waiting_input or terminal partial with limitation; never a missing-amount claim based solely on unreadability.
- A file is replaced after completion: domain invalidation marks the old result historical immediately; successor reuses only compatible artifacts; the earlier citation still opens the old permitted version.
- Another borrower changes shared evidence: authorized domain projections invalidate; private originating chat, questions and actor-scoped results stay hidden.
- Budget exhausted: waiting_input with operator-required budget detail and safe manual alternatives; no borrower clarification question falsely promises it can unblock the budget.

These scenarios supplement the companion’s upload/recovery/clarification acceptance scenarios and the end-to-end trajectory matrix below. Implementation must test both state mapping and rendering assertions, not only matching enum strings.

## Appendix C. Evidence persistence and runtime limits

Proposed additive entities (names provisional):

| Entity | Required contents and invariants |
|---|---|
| `application_preparation` | Authorized application/actor scope, intended stage, current request-ledger and readiness references, unresolved obligations/action owners, question IDs and resume triggers; projection over domain evidence, not chat memory or a parallel lender decision record |
| `processing_runs` | Application, authorized initiating actor, borrower/lender scope, optional submission ID, trigger, immutable input snapshot, policy/model/tool versions, authority epoch, run generation, budget, lifecycle, terminal reason and successor ID |
| `processing_steps` | Run, deterministic action ID, parent/dependencies, action/input digest, lease token, claim/dispatch attempt, state, deadline, artifact/result references, safe error and cost reservation; unique action identity |
| `evidence_artifacts` | Application/document version/hash, reader/version/options, immutable extracted payload hash, original-source locators, page/part coverage, omissions and extraction confidence; private storage reference |
| `evidence_findings` | Criterion/subject/period, met/unmet/unknown, validity facet, cited artifacts, conflicts, structured gaps, limitations, producing step and exact dependency vector |
| `processing_questions` | Stable question ID, structured requested fact/action, affected requirements, dependency revisions, answer state, actor and answer provenance |
| `processing_events` + outbox | Ordered per-application sequence, event/run IDs, safe payload, visibility scope, schema version, snapshot revision; atomic with state changes |
| Dependency index | Requirement ↔ document/segment/artifact/fact/definition/link decisions; candidate and unresolved coverage dependencies as well as accepted mappings |

Reuse existing jobs/events/reservations when their semantics fit; decide during implementation whether run/step fields extend existing tables or use additive tables. Do not overload `succeeded` to mean “complete application.”

Each file version is immutable. A durable extraction key includes application and authorization visibility scope, document version/hash, reader/options/version, and policy-required coverage mode. Hash equality never grants cross-application access. Restored files may reuse compatible extraction after reauthorization, but require fresh mapping/assessment against current state. Extracted artifacts are derived data, never replacements for retained bytes.

A citation identifies `documentVersionId` (the immutable domain `documentId`), `sha256`, `evidenceArtifactId`, artifact digest, source locator (page/region, sheet/cell, paragraph/part or email body line), and exact quote. Existing record/column references remain valid within the pinned artifact. Server-derived locators are displayed through authenticated preview routes; do not generate persistent public file URLs. A bundle segment retains parent document and original page coordinates. Citation resolution must not silently redirect to the latest version.

Store coverage explicitly: total known parts, inspected parts, excluded parts/reasons, extraction method and material limitations. Retrieval may find supporting evidence; it cannot establish absence or full coverage without inspecting the required universe. A confidence score is diagnostic and calibrated on held-out examples; it is not a substitute for required evidence.

### Aggregate assessment and result extensions

The deterministic reducer returns `unknown` for material unresolved coverage, conflicts, unknown applicability/checks or absent criteria; otherwise any unmet criterion means `incomplete`, and all required supported checks mean `appears_complete`. With no saved evidence and no unresolved intake, required checks are unmet/incomplete. Promised but unsaved or unreadable files retain unknown coverage. This proposed normalization must reconcile the inspected empty-evidence discrepancy before implementation.

Add optional `coverageScope` (subject/account/period, inspected manifest and out-of-scope obligations), `changeSummary` (`new_evidence | duplicate_no_change | gap_resolved | still_unresolved | conflicting_evidence`, prior result and affected checks), and action `owner` (`borrower | lender | operator`), source-backed `stage` (`underwriting | closing | informational | unknown`) and delivery state to the result DTO. These do not change run lifecycle enums. Every action retains permissions and expected revisions; stage and delivery must never be invented by the conversational model.

### Proposed runtime limits

Proposed initial execution limits per run: at most 20 files opened for detailed inspection, 12 model dispatches including planner/specialists/retries, 30 tool actions, 2 alternate extraction strategies per file, 2 specialist invocations, 2 concurrently running steps per application, and 5 minutes active execution. These execution limits do not truncate the authorized application inventory or its request ledger. Paginate inventory independently; checkpoint outstanding obligations and resume within the approved cumulative preparation budget. Successor runs cannot reset spend limits to evade a cap. Start with existing individual reader/model limits; batching does not raise the current 10-document verify cap. Where a requirement cannot fit the validated aggregate contract, stop as unknown rather than merge optimistic partial summaries. Larger aggregates need an independently evaluated evidence/coverage reduction contract.

Reserve maximum cost before every dispatch under run, application, actor and global caps; effective cap is the minimum configured cap. User decision: enforce hard configurable caps; keep $0.10/run provisional until measured, not a firm approved spend amount. It applies only when application/global budgets explicitly permit it; existing development defaults may block sooner. Tokens, wall time, attempts and specialist work all debit the parent run. No automatic model escalation or increased budget. Report spent/known, reserved and unknown separately. Wait/queue time is measured separately; a proposed 15-minute queue deadline yields an explicit blocked/expired outcome, not a false completion.

Retries: one service owns transient retry with exponential backoff/jitter and provider retry-after, maximum three dispatch attempts per action within the run cap. Invalid output gets at most one repair attempt when a safe schema error can help. Semantic uncertainty gets a different evidence-seeking action or a question, not blind repeated sampling. A repeated action/input/version digest with no new observation is rejected. Stop on budget/deadline, stable unresolved obligations, access loss, cancellation or a newer generation.

Parallelize extraction of independent files or assessments whose pinned dependency sets do not overlap mutable writes. Serialize applying mappings and advancing revisions. No database transaction remains open during model/parser work. Fair scheduling should prevent one large application from exhausting global slots.

## Appendix D. Edge cases and observability

| Case | Required behavior |
|---|---|
| Bundled PDF / multi-document requirement | Inventory/segment with original page provenance; map many segments to many requirements; assess combined unique roles, including lease/amendment/assignment chains |
| Scan, mixed visual/text, low-confidence OCR | Try permitted alternate extraction only where it adds coverage; preserve competing readings; unknown/manual review if material values remain uncertain |
| Duplicate / renamed / near-duplicate | Exact-byte reuse within authorized scope; semantic similarity only proposes equivalence; never discard originals or substitute duplicates for omitted components |
| Corrupt / password-protected / unsupported | Technical failure per file, saved-file state retained where ingestion accepted; request re-export/replacement; no inference of invalid business evidence |
| Conflicting values | Ground both sides by subject, period, units and scope; distinguish legitimate multiple accounts/units from contradiction; ask for reconciliation or human review |
| Superseded / removed / restored | Retain immutable historical evidence; explicitly reconcile active links; current results invalidate; submitted lender snapshot remains unchanged |
| Unmatched / ambiguous evidence | Persist unassigned evidence and candidate mappings; investigate useful available evidence and ask a bounded question when needed; do not silently omit it from coverage or mark every requirement complete |
| Missing or late batch members | Saved files proceed on a bounded snapshot; unsaved promised files stay coverage limitations; exact-byte recovery or explicit attributed abandonment resolves intake |
| Changed requirements | Pin definitions; invalidate affected findings; re-evaluate candidate mappings and applicability; never retroactively rewrite old assessments |
| Low confidence / conditional policy | Unknown with a specific next action; no invented freshness cutoff or waiver; retain confirmed human decisions separately |
| Document prompt injection | Treat text, filenames, metadata, email links and QR content as untrusted data; tools accept only server-validated IDs/arguments; no arbitrary network or new tools from document content |
| Cross-application or role attack | Composite scoped references, private artifacts, reauthorization at all boundaries; no existence leakage from checksum caches or citation lookup |
| Lender review | Separate submitted snapshot, review status and evidence freshness; agent cannot override acceptance/waiver or expose unsubmitted drafts to lender |

Borrower clarification is also untrusted instruction content. It may identify the intended entity or request a link command, but cannot change system policy. Render source excerpts as inert escaped text; never execute email HTML/macros/formulas. Keep parser resource isolation, bounded decompression and no external fetch. Quarantine suspicious ingestion when policy requires it rather than letting a model decide to execute the file.

### Observability and reproducibility

Each run traces trigger receipt → pinned snapshot → selected action and purpose code → preparation/provider attempts → validation → applied/discarded commit → public event. Record queue/active/wait durations, cache hits, coverage counts, stale discards, retry reasons, question resolution, budget reservations/known usage, effective model ID/config and provider request ID when available. Correlate upload-to-first-current and upload-to-final-current findings separately from model latency. Count pending/censored runs; do not omit them from SLO reporting.

Reproducible manifests include source hashes, artifact hashes/reader options, exact authorized requirements, action schemas, prompts, policy/model versions, dependency vectors, observations, output validations and deterministic seeds where supported. Deterministic replay can reproduce scheduler/validator behavior using recorded tool results. Live model replay is a fresh experiment, not guaranteed bit-for-bit replay. Full private captures remain restricted and retention-controlled; ordinary telemetry stores metadata and safe codes. No raw private reasoning, credentials or borrower content in metric labels. Failure of optional metrics must not fail processing; required domain event persistence is transactional and cannot be silently dropped.

## Appendix E. Experiment evidence and capability details

Design update, November 7, 2026, following consultation with **Design loan document matching tests** (chat `01a1b8d7-831a-72d1-be55-cb795023cd62`). Local evidence: [reviewed report](</Users/chanrao/Documents/Codex/2026-11-07/cre-matching-experiment/outputs/reviewed-results.txt>), [review and limitations](</Users/chanrao/Documents/Codex/2026-11-07/cre-matching-experiment/outputs/review.json>) and [case manifest](</Users/chanrao/Documents/Codex/2026-11-07/cre-matching-experiment/outputs/cases.json>). These links identify restricted local research artifacts; do not copy private source files or account details into public fixtures.

The recorded exercise analyzed five origination categories over ten initial/follow-up stages, using 18 PDF paths representing 16 distinct contents. It used local text extraction and selective page-image inspection in a separate agent conversation, not the app uploader or production matcher. The coordinating review reports agreement on the five core decisions and checked 53 evidence entries for scope/page bounds; this is not proof of semantic accuracy or full-package completeness. The report corrected an original file-count error. Its hypothetical review date was July 31, 2026, with separate November 7 sensitivity—not the actual current loan status. The consulted chat also returned a read-only comparison with the current modified source, identifying existing duplicate/matching safeguards and reader/context gaps; no new application run was performed. This design review reads those reports; it does not newly verify private source pages or rerun the experiment.

### Evidence and capability refinements

Add optional typed observations to the evidence store: document purpose, subject/party role, account/asset type, requested period, report date, effective/as-of date, requirement source revision, inspected scope and relationship targets. Facts retain citations and uncertainty; a model cannot promote a proposed relationship to an authoritative replacement or lender acceptance. Prefer a small set of typed relations over a general graph service for the MVP.

For PDF visual work, record renderer/version/options, form-widget/appearance handling, page/region, image artifact hash, and whether the image was actually inspected. Rendering a page does not count as inspecting it. If text, widgets and rendered appearance disagree on a material field, the agent may try a compatible alternate renderer, inspect the original, or stop for review within budget. Never select whichever output most conveniently permits completeness. Visual signature presence, signer identity/authority, cryptographic validity and lender acceptance are distinct findings; supported visual inspection can establish only the first, with appropriate uncertainty. The experiment's visual capability does not establish support in the current app.

Long documents require targeted investigation with honest scope. The recorded appraisal inspection reached physical page 91 in reports far beyond the current reader's 12-page cap. A bounded random-page/section reader is a useful future capability, not permission to silently raise all limits or feed entire reports to the model. Track known total pages, selected/inspected pages, selection rationale code and material uninspected scope. Selected identity/certification pages can support classification or signature-presence findings, but not exhaustive appraisal review. Distinguish 1-based physical PDF page from printed page label; use DOCX section/paragraph anchors where page identity is not established.

The consulted chat's source comparison identifies another capability gap: current assessment snapshots contain evidence linked to that requirement. Add a bounded `find_supporting_evidence` capability over the authorized application scope so the agent can inspect a PFS, trust document or related report linked elsewhere when a specific unresolved check warrants it. Retrieval must record every added document/context dependency, preserve visibility boundaries and coverage limitations, and cannot mutate mappings merely by reading evidence. The agent chooses whether retrieval is useful; it is not a mandatory cross-requirement search for every upload.

Scope a processing limitation to specific artifacts, pages and criteria only when supported by an explicit dependency/coverage justification. A warning about an unrelated embedded image need not obscure an independently supported textual check. If its relevance is unknown, keep the broad blocker. Deterministic aggregation excludes a limitation only through validated scope metadata, never because the model omitted or dismissed the warning. This is a proposed refinement to current conservative aggregation, requiring regression cases for both irrelevant warnings and materially omitted evidence.

MVP scope remains explicit: existing readers alone cannot reproduce the experiment's visual-signature and long-appraisal observations. Design the bounded page-selection/visual tools as available capability extensions, but retain manual-review/unknown outcomes until they are implemented and evaluated. Do not advertise those findings as supported merely because an agent can request a tool. The experiment supplies no measured latency, cost or evidence that these capabilities fit $0.10/run, and no demonstration that specialist agents outperform bounded task calls.

Requirement provenance matters as much as document provenance. The recorded needs-list filename and internal date disagreed; a shorter later list did not prove omitted requirements were waived. Preserve both dates, source anchors, scope and unresolved authority. The agent may surface a candidate requirement update for authorized confirmation, but an uploaded list cannot silently alter the active catalog. Distinguish lender-issued requirements from study-only criteria and general domain context. Track requested evidence period separately from review date and freshness policy/reference date; do not invent expiration rules or silently rebase historical assessments to today.

## Appendix F. Evaluation specification and deferred targets

The evaluation unit is a borrower preparation trajectory, including the quality of assistance as well as evidence decisions: explain the lender request, find existing support, help resolve a gap, durably save files, observe mapping/assessment, add/correct/remove evidence, answer questions, interrupt/recover workers, reconnect, and evaluate the final current state and every unsafe intermediate claim. A good final answer does not excuse an earlier false-complete claim. Retain component evals to diagnose extraction, mapping, validity, citation and planning failures; they are not the release score.

Existing corpus: eight semantic cases, six simple format fixtures, and 34 package/matching cases (30 completion coverage and four matching) in `lib/evals`. The [oracle audit](AI_EVAL_ORACLE_AUDIT.md) explains corrected formula labels, prompt leakage, duplicate source alternatives, ambiguous relevance and provisional missing-reason screens. These cover narrow synthetic criteria, not full catalog legal completeness. Existing `eval:ai` validates tasks without live calls; the live runner has a $0.15 cap and model-order effects. Its task-level calls do not exercise the full durable trajectory. Preserve original reports; compare paired executed cases and separate invalid/failed/skipped observations.

### Dataset contract

Proposed private/synthetic manifest schema:

```text
caseId, datasetVersion, oracleVersion, split, scenarioFamily
leakageGroup: borrowerGroup, applicationGroup, sourceDocumentFamily,
              templateGeneratorFamily, nearDuplicateCluster
borrowerGoal: intended submission stage, current question, expected useful progress
policy: exact requirement definitions, applicability, subject/period,
        definition revisions, approved evidence rules and permitted uncertainty
initialState: memberships/visibility, authority policy, files/links/submissions
artifacts[]: opaque ID, format, content hash, byte fixture reference,
             independent expected extraction facts, coverage limits
trajectory[]: relative time, actor, command/event, idempotency key,
              expected revision, injected fault, permitted next actions
oracleAtCheckpoint[]: criterion/validity/mapping states, structured gaps,
                      support fact atoms, acceptable citation source groups,
                      conflicts, required limitations, forbidden claims,
                      expected current/stale/lender states, submission readiness,
                      appropriate next actions/owners, acceptable grounded guidance
acceptableActions: alternatives, prerequisites, maximum unnecessary questions,
                   mandatory safe stops, forbidden actions, action/cost limits
adjudication: independent reviewers, judgments, resolution, unresolved labels
```

Keep oracle IDs and outcome-bearing filenames outside model inputs. Requirements describe requested facts, not hidden answer values. Randomize opaque IDs, order and packaging. Score valid alternate plans equally: native text reuse and bounded OCR are both acceptable when evidence and resource obligations are met. Do not require a particular tool sequence. An unnecessary manual-review escape on every clean positive fails useful-completion/abstention gates even if it avoids false positives.

Split before generating variants: all borrower/application records, original/re-exported/merged/split/scanned copies, same factual scenario and near-duplicate template families belong to one partition. Use hash and semantic-near-duplicate audits; reserve template families/entities/time periods for holdout. Prevent replay captures, promoted feedback and prompt examples from entering a different split. Private production feedback needs authorization, redaction, reviewer approval and retention controls; pending feedback is not gold. Report synthetic and representative real reviewed holdouts separately.

### Required trajectory matrix

Include positive, negative and uncertainty variants across every launched format and requirement family, plus:

- Whole-application readiness with historical/unlinked support, a blocker outside the newest upload, conditional and closing-only items, and submission permitted with explicit exceptions; borrower clarification/draft/replacement journeys with no repeated requests for resolved evidence.
- Full packages, every unique omission, merged/split bundles, redundant duplicates, duplicate-for-missing substitutions; multi-account months and historical/current lease roles.
- Wrong entity, similar names, wrong periods, unsigned/unsupported authority, conditional applicability, blank/zero/malformed numeric cells, conflicting amounts, unit and currency differences, cached formulas and valid multi-unit amounts.
- Native/scanned/mixed PDFs, skew/rotation, missing pages, OCR decimal/sign errors, hidden sheets, image-only critical facts, DOCX changes/embedded visuals, EML/MSG attachments and protected/corrupt/oversized inputs.
- Unordered arrivals, late promised files, batch expiry/recovery, replacement/removal/restoration, human mapping rejection, requirement revision and lender submission during processing.
- Worker kill before/after dispatch/commit, duplicate delivery, lost acknowledgment, lease expiry, out-of-order events, cursor expiry, quota/rate-limit/provider failures and cancellation/revocation races.
- Injection in document body/metadata/filenames, forged document/citation IDs, cross-application duplicate probes, chat instructions to bypass policy, and lender attempts to inspect unsubmitted artifacts.

### MVP pilot acceptance and later release targets

User decision: this is an MVP pilot. Judge performance by a balance of useful accuracy, response time and cost; the larger statistical release gates below are deferred and are not prerequisites for the MVP. End-to-end evaluation remains the means of judging the pilot, rather than component scores alone.

For pilot acceptance, assess borrower progress as well as classification: can the borrower understand the request, identify the next useful action, avoid supplying existing evidence again, and resolve the targeted gap? Review explanation faithfulness, action ownership, unsupported demands and continuity after follow-up. Do not reward verbosity, excessive questions or premature handoff as helpfulness. Use a bounded representative set covering complete/missing/ambiguous evidence, supported formats, multi-upload changes and recovery. Report grounded outcome correctness, actionable gaps, clarification burden, elapsed time and known/reserved cost together; compare with the fixed-workflow baseline on paired cases. Review errors and fix material misleading findings rather than requiring a 300-negative holdout upfront. Clear-match auto-linking still needs a focused mapping-quality check on pilot-relevant examples, including ambiguous matches and human corrections, before enabling it; the later numeric precision/recall targets are provisional benchmarks, not mandatory pilot gates. Record sample size and observed errors without generalizing to certified accuracy.

Authorization, stale-result protection, enforced caps, durable recovery and separation from lender acceptance remain required behavior. The MVP decision does not waive these invariants. Agree the pilot candidate from observed end-to-end results rather than inventing a new numerical acceptance threshold here.

The table below retains **deferred broader-release targets**, not approved MVP requirements. Publish sample sizes, per-slice results and uncertainty when using them; no production-readiness claim follows from the current small synthetic corpus.

| Measure | Definition | Proposed gate |
|---|---|---|
| False complete | Gold non-complete checkpoints marked appears_complete / all gold non-complete checkpoints | Zero observed on critical adversarial corpus; held-out one-sided 95% upper bound <1% (roughly 300 independent negatives with zero errors; correlated checkpoints do not inflate N) |
| False missing | Gold satisfied required components incorrectly reported missing/invalid / gold satisfied components | ≤3% overall, ≤5% each launched family/format; score unknown separately |
| End-to-end useful correctness | Trajectories with correct grounded current state, safe intermediate claims, acceptable questions/actions and no authority violation / all attempted trajectories | ≥95% overall and ≥90% each launched slice; technical failures count as failures |
| Mapping | Gold relevant associations recovered and proposed associations justified, separately from criterion coverage | ≥97% recall and ≥98% precision; ambiguous gold scored by acceptable alternatives, not forced labels |
| Validity | Correct facet decisions for subject/period/content/conflict with source support | ≥95% macro score; critical wrong-entity/period false-valid cases zero observed |
| Grounding | Supported factual claims and correct relevant locators, independently adjudicated | 100% structurally resolvable citations; ≥99% semantic support; zero fabricated critical claims |
| Abstention | Indeterminate/manual-review on clean answerable cases | ≤10%; justified abstention on material unreadable/inaccessible evidence required |
| Recovery/isolation | Specified retry/replay/cancel/revoke/reconnect scenarios | 100% deterministic invariants; zero stale commit, cross-scope exposure or altered lender decision |
| Boundedness | Dispatches, tool calls, cost reservation, concurrency and deadlines | 100% within enforced caps; zero unbounded loops; unknown usage never scored zero |
| Latency/cost | Upload receipt to current outcome on a declared workload, excluding user wait but including queue | Proposed p95 ≤120s clean small package, ≤300s OCR package; report all-in/censored separately; no >20% paired median cost regression versus baseline without measured quality benefit |

Also report precision of missing explanations, conflict detection, unnecessary clarification rate, time to actionable request, cost per correct current assessment, and terminal technical failure rate. Measure false-complete both per requirement and application; label denominators explicitly. Component quality cannot compensate for any isolation/freshness failure.

Gold creation: two independent domain reviewers inspect source facts and policy, then adjudicate disagreements with a third reviewer. Extraction truth is checked against original pages/cells, not only prepared text. Review missing-reason semantics and citation entailment; lexical screens and model judges may triage, never silently certify gold. An unresolved label becomes an explicit acceptable alternative or unscored dimension, not whichever answer the candidate produced. Freeze the holdout before candidate tuning and version every correction with rationale; retain historical scores.

### Harness and comparisons

1. Deterministic regression harness uses synthetic fixtures, fake clock/provider, real isolated repository transactions and injected failures. Assert the complete event/state trace, idempotency, revisions, policy gates and budgets. Test the scorer with deliberately wrong-but-well-formed outputs.
2. Reader diagnostics compare independent extracted facts/source locations and material omissions. Matching/validity/assessment diagnostics replay pinned evidence for localization.
3. Live end-to-end harness drives actual intake, durable worker actions and final projections with explicit evaluation budgets. Use the same representative trajectories for the existing fixed scheduler and the candidate; compare paired cases/model settings. Run multiple fixed-seed scenario orderings and at least three live repetitions for stochastic variation; pin versions and report provider drift.
4. Compare current fixed workflow, adaptive controller using the same tools/model, and any specialist variant. This isolates the value of orchestration from model/extraction upgrades. Preallocate budget fairly per case/system so model ordering cannot starve one candidate.
5. Admit the MVP pilot based on the practical end-to-end acceptance described above; revisit the deferred statistical gates before broader release. A simulated green build or a favorable aggregate model score does not substitute. Live runs remain separately authorized work; this design performs none.

## Design-only verification record

Alignment review: made borrower preparation the objective throughout the main design, command scope, persistent obligations and evaluation; clarified application-wide history, adaptive tool choice and budgeted continuation. Read the existing design, companion contract and experiment reports; consolidated the agreed direction into the main design and retained implementation/evaluation details in appendices. For this synchronization pass, this conversation edited only the processing design; the Borrower chat platform design conversation edited its own design. Both were reviewed for shared goal, scope, lifecycle and contract alignment. No product code, data, shared index, migration, server or deployment changed. Tests, browser checks and live evaluations: **NOT RUN — design-only**. The November 7 source observations are historical inspection notes, not a fresh implementation audit or verification claim.
