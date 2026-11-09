# Borrower application preparation MVP

Design proposal · Updated November 7, 2026. Owner: borrower platform design conversation. Companion: [Agentic document processing design](AGENTIC_DOCUMENT_PROCESSING_DESIGN.md). This document describes the borrower preparation MVP and aligns with the companion’s current Appendix B. The updated preparation and wire contracts are proposals, not a claim that existing foundation code implements them.

## Product scope

**Help the borrower prepare their application with less confusion and unnecessary work.** Give one borrower one ongoing conversation for an existing application: explain requests, recognize what they have already supplied, investigate resolvable gaps, and follow through on the next useful action. Upload feedback, grounded retrieval, matching and readiness assessment support this goal; a technically correct list of deficiencies is not enough.

**Core experience:** understand what is needed, use evidence already available, resolve the most useful next gap, and see what changed. The borrower may start with a question, upload, clarification or readiness request. These are entry points, not mandatory workflow stages.

User decisions:

- One borrower and one persistent conversation per application.
- Assume the application, LOI and document requests already exist.
- Process files automatically after durable save, with disclosure and a disable control; no separate Analyze step. Disabling affects future automatic work through revocable authorization policy. No unsolicited historical backfill; an explicit preparation request may authorize relevant historical investigation within its scope.
- Automatically link clear matches after focused mapping-quality checks, with visible, reversible associations. Manual corrections/rejections take precedence. Before the quality gate passes, show suggestions for confirmation; ask about ambiguity.
- Show useful findings as ready; the processing agent chooses whether to assess now or wait for related evidence within enforced limits. Keep pending evidence, inspected scope and uncertainty visible; do not impose a fixed pipeline or wait for every request before helping.
- Ask targeted clarifications when the borrower can help. Answers remain attributed assertions unless they explicitly authorize an allowed mapping command; they are not documentary proof.
- Focus the interface on uploads, grounded questions and actionable preparation help. Lender visibility starts after explicit borrower sending through the existing workflow; reporting readiness adds no submission control or lender decision authority.
- Keep chats and processing results actor-private initially. One borrower remains the MVP assumption; multi-borrower sharing is not a priority.
- Judge the pilot by useful accuracy, responsiveness and measured cost. Enforce hard configured caps, with $0.10/run provisional—not approval for live calls—and retain authorization/freshness invariants. Large statistical release gates are deferred.

Outside this MVP: chat management, multiple borrowers, human support, LOI provisioning, lender workflows, chat-driven replacement/removal/organization, new file formats and new submission flows. Existing file controls remain the correction path for automatic associations. Grounded organization suggestions or factual explanation drafts can appear as text for borrower review; they do not mutate the package or send anything. Selective page/visual reading is a processor capability to validate, not a new borrower workflow; unavailable capabilities remain explicit unknowns. This is a scope boundary, not a roadmap.

## Borrower experience

### A single, familiar conversation

The application opens directly to its conversation. A compact header shows Back to applications, property/application name and application details. A readable message column and bottom composer fill the page. There is no empty history rail, chat picker or separate workflow dashboard.

```text
  ← Applications                   Cedar Court · Document collection

  What would you like to know about your application?
  [What do I need?]  [Show the LOI]  [What have I uploaded?]

  You
  What do I need to upload?

  Assistant
  Your lender requests a current rent roll and the 2025 operating
  statement. The rent roll shows tenants, rents and vacancies;
  the statement shows the property's income and expenses. [Requests]

  ┌ Current rent roll                                      Needed ┐
  │ Required period: as specified in the lender's request         │
  │ [View request] [Upload files]                                 │
  └──────────────────────────────────────────────────────────────┘

  ┌ Ask about Cedar Court…                                       ┐
  │ [+ Upload files]                                      [Send] │
  └──────────────────────────────────────────────────────────────┘
  Automatic document checks: On · [Turn off]
```

The example property, periods and content are synthetic illustrations, not lender policy. Actual wording comes from current definitions and evidence. Show an application lifecycle label only if the authoritative application record provides one; otherwise the header simply identifies the application.

Empty state offers three starter prompts and Upload files. Returning borrowers see persisted scrollback and current progress cards. Historical answers stay dated; live cards show an updated time when their source changes. If application data cannot load, show Retry instead of inventing requests or a welcome summary.

### Upload without leaving the conversation

Upload button and drag/drop feed the same attachment tray. Show filenames, sizes, server-supported types/limits, and the application destination. “Upload 3 files” starts a text-free upload; “Send and upload” includes the typed message. The file picker is equally usable without dragging. Ordinary uploads add documents; they do not infer replacement from filenames.

One persistent card represents the batch:

```text
  You
  Here are my documents.

  ┌ Your uploads                              2 saved · 1 not saved ┐
  │ rent-roll.csv          Saved · Evidence checked       [Preview]│
  │ operating-2025.pdf     Saved · Checking evidence                │
  │ notes.xyz              Not saved · Unsupported format           │
  │                        [Choose another file]                    │
  └────────────────────────────────────────────────────────────────┘
```

The card updates in place. A request without uploads gets a request-anchored preparation card, never a fabricated upload batch. Measured transfer progress can show a percentage; processing shows factual activity and counts, never an invented percentage or obligatory stage sequence. The borrower can keep chatting or leave the page. Saved evidence continues processing independently while authorized. Turning automatic checking off saves future uploads without starting automatic checks, retains historical findings, and fences disallowed dispatch/publication under the new policy revision. An in-flight provider call may already have incurred cost. An explicit “Check this” action can authorize only that bounded investigation while automatic mode remains off; showing or polling status never grants that authority.

As a useful result becomes available, the assistant can add one concise summary: “The rent roll was linked to Current rent roll. I still need to establish vacancy information. The operating statement is still being checked.” Do not emit a message for every tool step or polling refresh. If the user is reading older content, preserve scroll and show a new-update indicator.

### Ask about status and understand the gap

> **Borrower:** What is still missing?
>
> **Assistant:** The rent-roll check cannot yet determine vacancy information. The uploaded file lists units and rents, but its occupancy cells are blank. [rent-roll.csv, relevant cells] The operating statement is still being checked, so I cannot assess that request yet.
>
> **Current rent roll — AI: Cannot determine yet**  
> Needed to finish the check: vacancy information.  
> [View source] [Upload files]

Before asking for another document, check relevant authorized saved evidence and prior findings, including unlinked support. For the example above, the gap is stated only after the inspected scope fails to establish vacancy; uninspected evidence is a coverage limitation, not proven absence. The card separates an observed source fact from the assessment. A blank field does not prove a vacant unit or a failed business condition. A missing-document claim cites the request and inspected evidence coverage, rather than inventing a quote from a nonexistent file.

For “What is my application status?”, retrieve recorded application facts and the preparation projection: “Two files are saved. The rent roll needs more information; the operating statement is still being checked.” Add a lifecycle label only when recorded. State which request/stage was examined and whether overall readiness has actually been assessed. Do not derive a new lifecycle from file counts or say the loan is approved because AI checks appear complete.

### Help with an existing gap, not another document request by default

> **Borrower:** Do I still need to upload April's statement?
>
> **Assistant:** I found the April statement in an earlier upload, although it was not linked to this request. It supplies the missing month for the account ending 1234. [April statement, supported source location] You do not need to upload the same statement again. The account-list question is still unresolved, so I cannot yet confirm coverage for all accounts.

The agent can compare periods/subjects and seek related evidence across requirements. It may inspect selected pages, reuse validated observations, or try another supported reader when that can resolve a material uncertainty. It does not equate rendering with inspection, a snippet with full coverage, or a historical file with current accepted support. Removed/replaced versions can contribute historical context only when authorized; reading them never restores links or overrides current evidence policy.

Offer a short prioritized set of next actions, each with a reason and owner. Distinguish “You can provide the executed certificate” from “Your lender must confirm which appraisal revision applies.” No external notification is implied. A factual explanation draft may help the borrower describe an unresolved item, but must label uncertain assertions and never manufacture facts, signatures or lender permission.

### Answer “Am I ready?” at the right scope

> **Borrower:** Am I ready to send the application for underwriting?
>
> **Assistant:** I checked the full request list for the underwriting stage. The statements now cover the requested months. One established prerequisite is still unmet: the executed certificate. A separate appraisal-version question needs lender confirmation. [Request ledger and sources] The application is **not ready for that stage** under the recorded policy. Obtaining the executed certificate is your next useful action.
>
> **Preparation for underwriting — Not ready**  
> Established blocker: executed certificate.  
> Unknown: applicable appraisal revision.  
> [View all requests and evidence] [View certificate request]

This is a synthetic illustration; the stage, prerequisite and action owner require authoritative sources. A “Can I submit with exceptions?” answer requires recorded policy permitting those exceptions. Never infer that all requests are satisfied from permission to submit an incomplete package. No Send action is added here.

A readiness answer accounts for the **whole active request inventory**, with applicability, stage and exclusion/exception reasons. The concise summary can prioritize a few actions, but the complete ledger remains inspectable/paginated. A request-specific or upload-specific assessment is useful but cannot be relabeled as application readiness. If policy, coverage or applicability is unclear, say what remains undetermined; do not invent a stage gate.

### Clarify in the same conversation

> **Assistant:** This statement could relate to either the property or its holding company. Which does it cover?
>
> [Cedar Court property] [Holding company] [I'm not sure]
>
> **Borrower:** Cedar Court property.
>
> **Assistant:** I've recorded your clarification. I'll check it against the document. If the entity cannot be established from the evidence, that limitation will remain visible.

First investigate available evidence when reasonably useful; ask a specific question when the borrower can resolve the remaining uncertainty. Continue useful independent work while that answer is pending. Use a specific question only when the answer can help. Do not ask users to retype facts already available in the evidence. An ambiguous association can offer “Link to Current rent roll”; that is an explicit, revision-checked command. A factual answer is not equivalent to confirming documentary completeness. “I'm not sure” keeps the gap visible and suggests useful evidence without repeatedly asking the same question on unchanged inputs.

### Inspect the source

“Show the LOI,” file-list Preview and citation links open the same document preview. Desktop uses a simple overlay; mobile uses a full-screen sheet with Back to conversation. Show filename, immutable version and the supported page/cell/text location. Close restores the originating control's focus and conversation scroll.

A file-list response contains all authorized current files with pagination/counts, not just semantic-search matches. Each row has filename, saved time, processing state, linked requests and Preview/Download. A file may support more than one request without duplicate bytes. If an earlier citation points to a replaced version, show “Earlier version”; never redirect it silently.

### Return later

After reconnect or reopening, retrieve the same conversation, authoritative application snapshot, preparation record and current batch/run projections. Restore resolved gaps, unanswered questions, action owners and resume conditions; a completed run or exhausted budget does not erase unfinished preparation work. Say what was actually saved and what remains unresolved. Pending browser bytes do not survive reload: “Two files were saved. Select the third again to finish uploading.” Reopening does not schedule another analysis or duplicate an assistant message.

## Grounded retrieval and reusable cards

| Question | Authoritative source | Response |
| --- | --- | --- |
| What is requested and why? | Current request definition, purpose, period, owner and applicability | Short explanation and requirement cards with definition references. Conditional/lender-owned items are labeled, not demanded unconditionally. |
| Show the LOI | Existing authorized LOI document/version association | File preview. If that association is unavailable, state the limitation; a text reference cannot support fabricated LOI terms. |
| What have I uploaded? | Complete current-file query with versions and mappings | File-list card, accurate totals and pagination. |
| What is my application status? | Existing application/domain state plus current processing and review projections | Factual status summary with independent saved, AI-assessed and lender states. |
| What remains incomplete, and why? | Current findings plus relevant authorized current/historical evidence and coverage | Investigate potentially resolvable gaps; distinguish absent evidence from unreadable/uninspected or uncertain evidence. |
| How can I move forward? | Preparation obligations, existing evidence and borrower-visible feedback | Prioritized useful next action and owner; avoid redundant uploads, unsupported demands or invented deadlines. |
| Am I ready for the intended submission? | Full request ledger, authorized evidence universe, stage/review date and authoritative policy | Scoped readiness plus blockers, unknowns, permitted exceptions and the complete inspectable ledger. No automatic submission. |

Only three primary card types are needed:

1. **Upload/progress:** stable batch identity; per-file transfer/save and processing status; assessment progress; targeted recovery.
2. **File list/preview:** names, immutable versions, saved status, request associations and authorized source access. The LOI reuses this type.
3. **Requirement/preparation status:** request explanation or scoped application summary, what changed, current findings, gaps/limitations, sources and action owner. Expand to the full request ledger when application scope is assessed. Questions appear inline. Reuse this card type for a request-anchored preparation assessment; do not add a separate workflow dashboard.

Application `submissionReadiness` is separate from requirement completeness:

| Wire value | Borrower label and meaning |
| --- | --- |
| `appears_ready` | Appears ready for the named stage: every applicable prerequisite is supported or has an authoritative permitted exception, with no material unresolved blocker/coverage. |
| `not_ready` | Not ready for the named stage: at least one established prerequisite is unmet. Still display other unknowns. |
| `undetermined` | Cannot determine readiness yet: no established unmet prerequisite settles the answer, but material coverage/policy/applicability uncertainty remains. |

Readiness is deterministically derived from the pinned policy and full ledger. Post-submission lender review is not automatically a pre-submission blocker; closing-only items do not block underwriting unless policy says so. Requirement assessment remains `appears_complete | incomplete | unknown`; its reducer may return unknown even when a known unmet check coexists. The application reducer can still return not_ready when that unmet check is an established stage prerequisite.

Current AI labels are “Checking,” “Appears complete,” “Incomplete,” “Cannot determine yet” and “Outdated.” “Saved” says only that bytes and metadata persisted. An assessment never means lender acceptance, waiver or loan approval. Existing submission/lender status may be read and displayed without adding controls for that workflow.

## Failure and recovery behavior

| Condition | Borrower experience and invariant |
| --- | --- |
| Partial upload success | Show exactly which files saved; continue their processing. Retry only failed members; never discard successful files. |
| Unsupported/oversize rejection | Mark not saved and show actual supported formats/limit. Current model limit is 25 MiB; copy must match the server. |
| Saved but unsupported/unreadable | Keep saved state; say automatic checking could not finish, with a useful alternative file suggestion. Never call technical failure a business rejection. |
| Password protected | Ask for an authorized unlocked copy. Never ask for a password in chat. |
| Duplicate bytes | Recognize only within the authorized application, show existing file and reuse its outcome. Do not create duplicate versions, silently remap or restart paid work. |
| Same name, different bytes | Treat as an additional file. If correction requires replacing a version, point to existing file controls. |
| Transient processing failure | Keep saved files, offer Retry analysis when permitted, link the new attempt and refresh its inputs. No automatic endless retry. |
| Cancel transfer | Stop unsent bytes and reconcile uncertain commits. Saved files remain saved; cancel is not deletion. |
| Stop response | Stop conversational generation only; say saved-file processing continues. |
| Lost acknowledgment | Read receipt/message status before retry; replay the original command identity. Never claim failed or saved without reconciling ambiguity. |
| Offline/session expiry | Show disconnected/sign-in state and last verified update; preserve scoped unsent text in memory. No claim of cross-device recovery for unsaved text or files. |
| Stale assessment | Immediately label affected results outdated after an evidence/definition change. Do not allow a late old result to restore current status. |
| Automatic checks disabled | Save files and allow factual retrieval; do not schedule background checks or historical backfill. Explicit investigation requires its own bounded authorized command. |
| Budget/reading limit reached | Preserve useful findings and unresolved obligations with the next trigger/owner. Do not ask the borrower a question that only an operator budget change can resolve. |
| Model/worker unavailable | Preserve files and history; provide factual Files/Requests views using domain queries and a bounded error. No false success or indefinite spinner. |

## Mobile and accessibility

Use the same single-column conversation on mobile. Cards stack, filenames wrap, and the composer respects keyboard/safe-area insets. No main-flow horizontal scrolling or permanent side panels. The preview returns to the same message position.

All actions work by keyboard, including file selection, clarification choices, preview close and retry. Enter sends, Shift+Enter adds a line, and IME composition does not submit. Provide visible focus, persistent composer labels, meaningful source labels, text statuses independent of color and practical 44px touch targets. Announce upload milestones and completed answers politely rather than every token/byte. Respect reduced motion and preserve focus during async updates. Validate at 320px, 390px, desktop and 200% zoom before claiming accessibility or UI verification.

## Architecture and current integration seams

Source observations refer to the inspected November 7 working tree, including unrelated uncommitted changes; they are not deployment claims. [Platform plan](PLATFORM_PLAN.md), [domain contract](DATA_DESIGN.md) and [testing workflow](TESTING.md) remain applicable.

| Existing surface | MVP use |
| --- | --- |
| `app/components/borrower-portal.tsx` | Existing application entry/data access; add the conversation entry without redesigning lender or submission flows. |
| `lib/upload.ts`, `lib/jobs/batches.ts`, upload routes | Reuse validation, durable private file storage, checksum duplicate handling and batch/member identities. |
| `lib/jobs/batch-status.ts`, processing panel | Adapt authoritative progress into one conversation card; polling is sufficient for MVP. |
| `lib/backend/contracts.ts`, `lib/jobs/core.ts` | Reuse fenced match/verify jobs and pinned fingerprints behind the companion's processing adapter. |
| `lib/analysis/types.ts` | Preserve existing check/citation validation; retain wire assessment `unknown`; “Cannot determine yet” is display copy. Earlier foundation projections using `indeterminate` require an explicit adapter, not a silent task-schema rename. |
| `document-preview.tsx`, `file-preview-pane.tsx`, `use-file-links.ts` | Reuse supported preview/download behavior and authorized fetches. |
| `lib/authorization.ts`, domain/publication services | Authenticate every read/write/download and preserve application/role boundaries. |
| `loi_reference` in the current application model | Resolve the already-provided LOI to its actual authorized document/version. Do not assume the reference string is file content. |

The existing conversation/read-model foundation does not implement the preparation record, whole-application readiness, adaptive investigation or these revised wire contracts. They remain proposed integration work. Existing bounded match/verify execution can supply scoped facts through an adapter, but that alone cannot demonstrate the broader preparation mission. One tool-using processing agent selects useful investigation/timing; no specialist fleet is required. The companion owns internal selection, reading capabilities and runtime enforcement. Unavailable reading tools yield explicit limitations rather than claimed support.

The conversational agent explains and coordinates; the processing service understands saved evidence and publishes validated findings. Application records, not message prose or model memory, remain the source of truth. File save and processing continue independently of the response stream/browser.

## Tools, persistence and isolation

The server supplies application and actor scope from the authenticated session. Read tools retrieve application facts, complete request/evidence inventories, the LOI, current findings and relevant authorized historical evidence. Existing current findings can answer simple questions without another paid run. An explicit gap/preparation/readiness request can delegate an investigation with bounded tools and revisioned scope. Allowed mutations remain delegation, policy-approved clear matches, explicit ambiguous-link confirmation, attributed clarification answers and the disclosed automatic-processing setting. No general-purpose SQL, shell, arbitrary URL fetch or unrestricted domain-command tool is exposed.

Recheck membership/role on tools, private reads and publication. Treat filenames, document content, messages and clarification answers as untrusted content; they cannot override instructions or expand application scope. Escape excerpts and never execute document scripts/macros or follow embedded links automatically. Borrower reads exclude private lender notes and unauthorized records.

| Persisted record | Minimum invariant |
| --- | --- |
| Conversation | Stable application/borrower identity; unique active conversation per application/borrower; no reassignment across applications. |
| Message/turn | Server sequence, actor, typed parts, client message ID and canonical payload digest; persisted before generation. Idempotent retry; explicit pending/complete/failed state. |
| UI artifact | Stable `uiArtifactId`, kind, message anchor, monotonic projection revision and domain references. Updates do not generate new transcript messages. |
| Preparation record | `preparationId`, application/actor scope, intended stage, revisioned ledger/readiness references, resolved and unresolved obligations, owners, question IDs, resume triggers and cumulative budget accounting. Survives runs; a projection over domain evidence, not another lender decision store. |
| Processing linkage | Upload receipt/batch/member or persisted non-upload request, command/run and originating event IDs; unique linkage prevents duplicate cards and summaries. Non-upload preparation cards anchor to the request and preparationId. |
| Question/answer | Stable question ID/revision, dependency fingerprint, typed answer, attributed actor and status. Replies cannot silently resolve a newer question. |
| Citation | Authorized immutable document/version/hash and evidence artifact/locator, or a typed structured-record revision. |

Keep one active generated response per conversation initially; subsequent messages queue durably. Stopping generation does not undo a committed tool command. Historical text stays dated; current cards and current-state answers re-read domain freshness. A final response rechecks the source revision set before publishing consequential status claims. On a changed source, regenerate or explicitly mark historical scope.

Poll conversation/application/run snapshots while active, honoring server retry interval/backoff. Snapshot projections carry stable IDs/revisions so reconnect and multiple tabs converge. GET/polling never schedules work. A partial streamed response can be lost; the persisted final message is recovery truth. Clear cached private state on logout/access loss. Do not persist sensitive unsent drafts in browser storage by default.

## Shared preparation and processing contract

This revision adopts the **current companion Appendix B**: server command `process_application_evidence.v1`, `processing-request.v1` and `processing-event.v1`, with the public lifecycle below. It replaces this document's earlier dot-separated request/event proposals and operation/generation-oriented public envelope. Those were design drafts, not a deployed interface. Existing foundation code and the implementation plan are not changed by this design edit; reconcile their DTOs explicitly before implementation. Internal worker generations/fencing remain required.

### Trusted delegation

A proposed `POST /api/applications/{app}/processing-runs` adapter accepts command/idempotency identity, allowed objective/scope, durable selectors and origin references. The authenticated coordinator—not the browser/model—builds this internal envelope from authorized authoritative state:

```json
{
  "schemaVersion": "processing-request.v1",
  "commandId": "command-id",
  "idempotencyKey": "command-key",
  "applicationId": "app-id",
  "authority": {"actorUserId": "user-id", "scope": "borrower", "policyRevision": "policy-token"},
  "origin": {"kind": "borrower_request", "conversationId": "chat-id", "artifactId": "card-id", "domainEventId": "persisted-request-event"},
  "objective": "assess_submission_readiness",
  "assessmentScope": "application",
  "preparationId": "preparation-id",
  "uploadBatchId": null,
  "documents": [],
  "requirements": [],
  "snapshot": {"contentRevision": "24", "inputFingerprint": "server-pinned-fingerprint"},
  "retryOf": null
}
```

Allowed objectives: `understand_and_assess`, `resolve_gap`, `assess_submission_readiness`. Scope: `affected_requirements` or `application`; the last objective requires application scope. Origins: `chat_upload`, `portal_upload`, authorized `integration_upload`, `borrower_request`, `question_answer`, `requirement_change`. Every origin resolves to a durable authorized save/request/domain event. Non-upload requests must not invent upload receipts. An answerable read-only question starts no new run.

File entries, when supplied, use immutable `documentId`, `seriesId`, `version`, `sha256`; requirement entries pin `requirementId`, `definitionRevision`, `evidenceRevision`. Supplied lists seed investigation, not the evidence universe. The example's empty lists do not mean there are no requests/files: for application scope the server pins full active inventory, intended submission stage, review date, authoritative submission-policy revision and authorized evidence-inventory revision in the durable snapshot covered by its fingerprint. Missing stage/policy must be explicit uncertainty, not a guessed default. Further field names for this snapshot require a shared runtime schema; inline examples must not omit its semantics.

`preparationId` links bounded runs and obligations, not permission. An explicit readiness request can inspect relevant authorized historical evidence; upload-triggered work may retrieve history relevant to affected requests. Neither enables unsolicited background reprocessing of every historical file. Automatic-off suppresses future automatic triggers; explicit-request authority is distinct and limited to that request. Pin/recheck the effective policy revision before reads, dispatch and publication.

`commandId` identifies intent; `idempotencyKey` plus application/actor/command kind and canonical body digest deduplicates it. Same key/body returns the authorized original receipt; a changed body conflicts. A historical receipt is returned with current run status, never reinterpreted as fresh work. Deliberate retries use a new key and `retryOf`, refresh dependencies and debit the same cumulative preparation limits. Coalescing is limited to actor/visibility, objective, scope/stage and exact input fingerprint. Origin/card identity conveys no access.

Bytes persist before the metadata/outbox transaction; uncertain saves use existing reconciliation. Upload and non-upload outbox triggers survive browser close. Durable acceptance returns `runId`, `runRevision`, nullable `artifactId`, `acceptedAt`, public `state`, `inputFingerprint`, optionally snapshot/cursor. `runRevision` is a projection revision, not a worker lease token. No new public operationId is required. Save facts come from intake, never the model; provider dispatch after ambiguous acknowledgment can still be at-least-once.

### Public lifecycle and progressive help

| Internal condition | Public state | Borrower interpretation |
| --- | --- | --- |
| queued / retry_wait | `queued` | Waiting to investigate/retry; show safe reason/time if known. |
| running | `running` | Working on the scoped need; useful findings can appear now. |
| waiting_for_input | `waiting_input` | Specific question/action with required actor; no idle worker lease. |
| blocked | `waiting_input` | Budget/configuration/policy detail; operator dependency is not a borrower clarification. |
| completed obligations | `succeeded` | Bounded execution finished, not application ready or lender accepted. |
| completed with unresolved review/coverage | `partial` | Preserve remaining obligations, owners and resume triggers, even if all assessments are unknown. |
| failed / dead_letter / expired | `failed` | Terminal attempt with safe reason and permitted recovery. |
| cancelled | `canceled` | Future commits fenced; retain saved evidence/history. |
| superseded / stale run | `superseded` | Keep historical result and successor reference when permitted. |

Requirement assessment wire values are `appears_complete | incomplete | unknown`. Not-assessed/checking/outdated are presentation/freshness states. The older foundation `indeterminate` label may map to unknown through an explicit adapter; never publish two incompatible wire vocabularies as the same contract.

A preparation record outlives succeeded/partial/failed runs. Preserve unresolved obligations and whether new evidence, a borrower answer, lender action or operator budget is required. Continue independent useful work when admissible; do not repeatedly requeue unchanged blocked work. Run limits bound execution, not the inventory: paginate every applicable request and authorized file, retain uninspected coverage, and checkpoint work exceeding the run's attention limit. Successors may not reset cumulative preparation/application/actor/global caps. $0.10/run remains provisional and subordinate to configured hard caps; no automatic model/budget escalation.

### Progress, results and readiness

Use one authorized application stream `GET /api/applications/{app}/events?after={cursor}` with polling initially sufficient and SSE optional. Run snapshots remain under `/processing-runs/{id}`. Do not require a separate conversation versus processor cursor protocol in the browser.

Every public processing event carries `schemaVersion: processing-event.v1`, `eventId`, `applicationId`, opaque `cursor`, `runId`, `runRevision`, nullable display `artifactId`, `occurredAt`, `type`, public `state`, actual projection `inputFingerprint` and safe `data`. Types: `run.accepted`, `run.progress`, `run.needs_input`, `run.result_committed`, `run.failed`, `run.cancelled`, `run.superseded`. State spelling is `canceled`; event spelling remains `run.cancelled`. `run.result_committed` requires `data.terminal`, because it can carry intermediate or terminal results. Question resolution updates the projection instead of introducing another event vocabulary.

Progress data contains per-file save/processing outcomes, measured counts, affected request IDs, actual safe activity, limitations and nextPollAfterMs. It can say “Checking an earlier statement” or “Waiting for the related file” when true; no fixed stage order or private reasoning. Agent-selected timing is bounded and observable, not an unlimited wait or mandatory short debounce.

Result data includes `resultId`, `resultRevision`, freshness, exact inputs, requirement findings/checks/gaps, citation IDs, coverageRef, conflicts/limitations and allowedNextActions. Actions have permission/revision context and borrower/lender/operator ownership; delivery state must not imply a message was sent. Add preparation linkage, what changed and unresolved obligation references to the authorized result resource. Required detail may live behind a result reference, but hydrate the exact result revision, never whatever happens to be newest.

Application-scope results additionally require:

| Field/meaning | Invariant |
| --- | --- |
| `submissionReadiness` | `appears_ready`, `not_ready` or `undetermined`, from the deterministic stage/policy reducer above. |
| Intended stage, review date and authoritative policy revision | Pin sources; unknown policy is explicit and cannot yield appears_ready. |
| Full request-ledger reference | Every active request accounted for: applicable prerequisites, later-stage/lender-owned items and sourced exclusion/exception rationale. No top-k subset presented as complete. |
| Evidence-universe coverage reference | Current/history/linked/unlinked scope, actual inspected coverage, omissions and unresolved intake. Detail-read caps do not shrink the inventory. |
| Known blockers, unknowns, permitted exceptions | All remain visible even when one known blocker settles not_ready. Distinguish policy permission to submit with exceptions from evidence sufficiency. |
| Dependency fingerprint and preparation linkage | Includes stage, policy, inventory and actual investigated sources; stale readiness is invalidated independently of run terminal state. |

These semantics adopt companion sections 2/4 and Appendix B’s “Preparation and readiness schema completion.” The command snapshot pins `preparationRevision`, nullable `submissionStage`, `reviewDate` (ISO date), nullable `submissionPolicyRevision`, `requestInventoryRevision` and `evidenceInventoryRevision` in `inputFingerprint`. Results pin `preparationId`, `preparationRevision` and `assessmentScope`. The canonical application result nests these fields in `readiness`: `submissionReadiness`, `submissionStage`, `reviewDate`, `submissionPolicyRevision`, `requestLedgerRef`, `evidenceCoverageRef`, `blockers`, `unknowns`, `permittedExceptions` and `dependencyFingerprint`. Ledger/coverage references are `{id, revision}`; blockers/unknowns carry applicable requirement/criterion references, safe reason codes, citations/coverage and action owners; exceptions require authoritative policy/decision references. Scope-limited results omit `readiness`. Current preparation snapshots preserve revisioned result/readiness references, stable obligations with owners/status/resume triggers, questions and cumulative budget status. Answers use this current projection, not the last completed run. Domain invalidation uses `application.preparation_invalidated` on the same stream, carrying eventId/cursor/applicationId/occurredAt, preparationId, advanced preparationRevision, affected result references, affected requirement IDs and reasonCode; refresh the snapshot and conservatively invalidate unknown dependency scope without exposing other actors’ private runs. An affected-requirements result cannot emit an overall readiness claim. A pending whole-application investigation can provide local findings while readiness stays unresolved.

### Clarification, citations and recovery

`run.needs_input` carries question ID/revision, dependencies, affected requests, typed choices/schema, required actor, blocking status and allowed action IDs. Answer through the domain command exposed by `/artifacts/{id}/actions` or `/processing-questions/{id}/answers`; both enforce the same idempotency and expected-question/dependency revisions. Stale answers return 409 without discarding the typed answer. A factual reply remains an attributed assertion; explicit mapping confirmation is a separate allowed command. Reading available evidence should precede avoidable questions; uncertainty that requires lender judgment is an unresolved obligation, not human-support delivery.

Positive claims reference server-issued citation IDs resolving to immutable `documentVersionId`, `sha256`, explicit `evidenceArtifactId`, evidence-artifact digest and actual supported locator/quote. Adopt the processing owner’s proposed clarification: public event `artifactId` denotes only the conversation display anchor; citation descriptors use `evidenceArtifactId`. Internally the display anchor may be named `uiArtifactId`. Do not reuse an ambiguous artifactId property for extraction provenance in the new citation descriptor. Legacy record/column evidence can be adapted explicitly without inventing an extraction artifact ID. Structured definition/policy/submission sources pin their record revisions. Reauthorize every source; no invented pages, public URLs or silent replacement redirection. Missing-evidence claims rely on sufficient inspected coverage; uninspected pages cannot establish absence. Rendering alone is not evidence inspection.

A consistent authorized snapshot returns preparation ledger/obligations, current results/questions/cards, active runs and high-water cursor. On reconnect resume after it, deduplicate event IDs and reject decreasing run/result/display revisions. Cursor expiry requires resync; GET/reconnect never schedules processing. Disable/revocation stops disallowed access/publication and clears private client state. Preserve original cited versions and dated prose.

Domain changes atomically invalidate affected findings **and readiness/preparation projections** on the same stream, including after a run completed successfully. Run supersession alone is insufficient. Exact dependency checks cover current/historical versions, hashes, mappings/rejections, removal/restore, requirement definitions/evidence, subject/context, full inventory where relevant, unresolved intake, stage/review date, policy and authority/tool/model versions. Only proven-unaffected results survive a change.

One batch card remains anchored to its upload; non-upload preparation requests have a stable request card linked to preparationId. A card can reference successors, and preparation retains continuity across cards without copying private transcript data. Deduplicate summaries by artifact plus settled result/dependency revision. Retry/cache reuse with no substantive change produces no new “work completed” message. Stop response does not cancel processing. Explicit run cancellation uses expected runRevision/idempotency and fences future commits without deleting sources; per-preparation pause/cancel semantics need an explicit domain contract before exposing a broader control.

## Implementation and acceptance

The [existing implementation plan](BORROWER_CHAT_MVP_IMPLEMENTATION_PLAN.md) covers the earlier upload/read-model foundation. It has not been edited in this design-only alignment pass; its public DTO assumptions, lifecycle labels and preparation scope must be reconciled with this revision before further implementation. This document does not claim that the broader preparation loop is already implemented.

1. **Grounded preparation context:** use the existing conversation/read-model foundation, add full request/evidence inventory and preparation obligations, pin stage/policy and expose scoped cards/source preview. Verify ordinary retrieval plus request-specific and whole-application questions without inventing unsupported readiness.
2. **Preparation bridge:** connect saved uploads and explicit preparation/gap/readiness requests to the same durable coordinator, with preparationId and correct card anchors. Expose the agent’s bounded tool-selected investigation and timing, reusing current capabilities; unsupported tools remain limitations. Verify replay, partial results and return-to-preparation recovery.
3. **Follow-through:** incorporate answers/new evidence/authorized requirement changes, credit resolved gaps, continue independent work, and preserve questions/owners/resume triggers across run limits. Enforce cumulative caps and manual corrections; check clear-match quality before enabling automatic links.
4. **Candidate verification:** run the existing repository checks and borrower walkthrough on the final candidate before rollout. Keep existing application data and workflows intact; use a feature flag for the conversation entry.

Read relevant bundled Next.js guides under `node_modules/next/dist/docs/` before implementation, per AGENTS.md. Follow [TESTING.md](TESTING.md): quick `npm run test:agent`, coordinated quiet-window full checks, then the affected browser checklist. The companion owns processing-policy/model-quality evaluation; simulated UI integration is not evidence of model correctness.

| Acceptance scenario | Required evidence |
| --- | --- |
| Open and ask the preparation/retrieval questions | Answers use current authorized records; no invented LOI terms, requests, completeness or approval. |
| Upload valid and invalid files together | One card; independent save/check states; good files survive; only failed work retried. |
| See a result while another file is pending | Useful scoped result appears when defensible; agent may assess or wait within bounds. No false whole-application readiness. |
| Existing historical/unlinked evidence resolves a gap | Inspect/reuse it when authorized; explain what changed; avoid a redundant upload or repeated question. Do not silently restore removed links. |
| Ask for readiness with a blocker outside the newest upload | Full request ledger and stage/policy coverage include that blocker; incomplete inspection stays explicit. |
| Reach a run limit, then continue | Preparation obligations survive; detail-reading caps never truncate inventory, and successors cannot reset cumulative budgets. |
| Disable automatic checks | New uploads still save; automatic dispatch/publication follows revocable policy; explicit investigations are separately authorized and no historical backfill starts. |
| Open file/LOI/citation | Correct immutable bytes and supported locator; old versions visibly historical. |
| Answer an ambiguous-link/subject question | Attributed answer, explicit mapping command where allowed, no automatic documentary proof; stale reply conflicts. |
| Reconnect after lost acknowledgment or close | Same conversation/resources, reconciled saves and no duplicate card, command or summary. Unsaved bytes require reselection. |
| Change evidence through existing file controls | Current finding invalidated; late result fenced; source history retained. |
| Tamper with scope or inject instructions | No other application's data or private lender content; document text cannot expand tool authority. |
| Model/worker unavailable | Accurate saved state and bounded error; deterministic retrieval and existing file controls still usable. |
| Keyboard/mobile/zoom | Usable upload, cards, clarification and preview; correct focus return, no clipped controls or main-flow overflow. |

Pilot acceptance balances grounded usefulness, unnecessary borrower work/questions, responsiveness and measured known/reserved cost on representative end-to-end journeys. Use focused clear-match evaluation before auto-linking; large statistical gates remain deferred. Authorization, integrity, freshness and hard caps are required. Release evidence should identify candidate/dirty changes, actual command outcomes, browser results and unresolved defects. Collect safe identifiers, recovery failures, duplicate/stale-result rejections and citation-resolution failures; avoid raw private content in ordinary telemetry. Retention/access and exact schema validation are implementation prerequisites, not extra product features.

## Alignment notes for the processing-design owner

This document adopts the current Appendix B envelope, lifecycle and the two completed contract subsections, “Preparation and readiness schema completion” and “Automatic processing and cancellation policy.” No policy disagreement remains in these subsections.

1. **Schema and references aligned:** adopt the named snapshot fields, nested readiness DTO, preparation snapshot and `application.preparation_invalidated` payload above. Event `artifactId` remains the display anchor; citation `evidenceArtifactId` identifies evidence provenance. The companion’s corrected provenance and named acceptance scenarios replace the obsolete contract-history and BC-reference refinement requests.
2. **Automatic processing authority confirmed:** disabling automatic checks advances its authority epoch and fences queued/in-flight automatic dispatch and future publication. Already-sent provider work cannot be retracted; saved files and committed findings remain subject to freshness. A separately authorized explicit bounded request neither reenables automatic checks nor backfills unrelated history. Membership revocation fences both grants; include the effective grant/epoch in the authority fingerprint and recheck before reads, dispatch and commit.
3. **Cancellation and resumption confirmed:** canceling an execution preserves preparation obligations; identical canceled work requires explicit retry or a distinct permitted trigger. Evidence/definition changes may create eligible obligations under current policy. Budget-blocked work resumes only under valid admission, without polling-triggered rescheduling or cap resets. No whole-preparation pause/cancel control is promised.
4. **MVP boundaries preserved:** one borrower and one conversation, existing submission/file controls, polling first, no new send/replacement/human-support workflow. Broader adapters remain platform capabilities; selected-page/visual capabilities remain proposed until validated.
5. **Implementation reconciliation remains:** the existing implementation plan and foundation DTOs need a later explicit reconciliation before further implementation, including the foundation’s `indeterminate` display DTO adapter to wire `unknown`. These adopted proposed contracts do not claim that preparation/readiness APIs or the broader processing loop already exist.

## Design-only status

This alignment pass edited only `docs/BORROWER_CHAT_PLATFORM_DESIGN.md`. The processing design, implementation plan, existing foundation code, tests, data and runtime were not changed. No tests, live calls, migration, server restart, commit or deployment were performed. Earlier foundation verification is separate and does not verify the preparation architecture or revised public contracts described here.
