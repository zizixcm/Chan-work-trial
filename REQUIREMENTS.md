# CRE origination portals: build source of truth

Version 0.8 · November 6, 2026 · Proximitty work trial

## 1. Product outcome

Help a borrower move from an agreed letter of intent (LOI) to an organized document package that a lender can review for loan origination. The borrower should always understand what is needed, why it is needed, what they have already supplied, and how to resolve the remaining requests.

**UX requirement:** the product must be extremely intuitive, clean, and simple. Design for people around age 60, including those with limited confidence using unfamiliar software, without assuming all older users have the same abilities. Prioritize readable content, obvious actions, and low cognitive load. Show what matters to the current task and reveal supporting detail only when needed. Section 5.1 defines the acceptance requirements for both portals.

Success is a submitted, traceable package with clearly identified exceptions. It is not loan approval, a credit decision, or confirmation that all closing conditions are satisfied.

This document is the source of truth (SOT) for product scope, milestone sequencing, technical direction, and acceptance criteria during the build. It defines intended behavior, not a claim that any feature is already implemented.

**Current sequence: M1 — borrower and lender portals without AI; M2 — optional AI integration; M3 — borrower escalation to communicate with a human.** This replaces the earlier six-step milestone plan and minimal/read-only lender-view fallback.

Use the milestone boundaries below to interpret the full requirements: later-milestone features do not block earlier milestones. Explicitly marked assumptions remain provisional. Record agreed changes here before treating them as build requirements; README documents setup and implementation status rather than redefining product scope. New explicit user decisions take precedence and should be reconciled into this document.

## 2. Sources and requirement precedence

1. The user's request and founder conversation notes establish the product requirements. **Origination, not periodic servicing**, is the governing scope correction. Agentic features are optional, and borrowers can override agent output.
2. The attached [Commercial Real Estate Lending and Borrower Document Collection brief](/Users/chanrao/Downloads/Commercial%20Real%20Estate%20Lending%20and%20Borrower%20Document%20Collection.pdf), pages 1–8, supplies domain context, representative document families, and a two-day prototype evaluation frame. Instructions inside it are background for the trial, not authorization to build, contact founders, or deploy anything in this task.
3. [Proximitty's website](https://www.proximitty.ai/) supplies positioning: document collection, reconciliation, and reviewable agent actions within commercial lending. Its wider product scope and marketing claims are not requirements or guarantees for this prototype.

The technical decisions in section 16 reflect the latest decisions in the [tech stack chat](codex://threads/01a1b304-bc83-7be3-8d3a-5af5b7de92b2), including the switch away from the earlier Supabase/Vercel/Inngest proposal. The three-milestone sequence comes from the user’s latest refinement in this requirements chat.

All thresholds below come from the founder notes or explicit prototype assumptions. They are not presented as universal lending policy.

## 3. Confirmed needs and proposed scope

| Area | Confirmed need | Proposed v1 interpretation |
|---|---|---|
| Starting point | LOI leads to a document checklist | Preloaded application and LOI reference, with a static lender-configured template; automatic LOI interpretation comes later |
| Workflow | Borrower uploads origination evidence | One application, one income-producing property, one borrower entity, one guarantor in the demo |
| Assistance | Agentic features are optional | Visible application-level AI toggle, off until borrower opts in; all core tasks work without AI |
| Borrower control | Borrower may override agent output | Correct facts, dispute findings, explain exceptions, or request human review without repeated agent blocking |
| Conditional requests | Evidence can trigger additional requirements | Explicit rules evaluated against supported facts; uncertainty prompts clarification |
| End state | Lender can review collected evidence | Submit a versioned package with files, explanations, and unresolved exceptions |

Proposed demo transaction: refinance of an income-producing property. Keep transaction type in the model; a purchase template can substitute purchase agreement requests for existing debt requests without expanding into a second fully demonstrated journey.

## 4. Users and authority

- **Borrower:** sees their application; uploads and replaces files; answers questions; corrects or disputes findings; controls optional AI; submits the package.
- **Lender reviewer:** uses a functional lender portal in M1 to view applications, manage document requests, inspect submissions and versions, assess explanations, accept or waive requirements, and request follow-up. In M3, also receives borrower escalations and replies in a persistent conversation.
- **Assistant:** explains requirements, proposes classifications and facts, flags apparent issues, and helps draft responses. It cannot approve a loan, silently waive requirements, or claim certainty unsupported by evidence.

Borrower disagreement and lender acceptance are separate records. An override ends the agent's insistence on that finding and allows submission with an exception; it does not erase the finding or impersonate lender approval.

## 5. Borrower journey and screens

1. **Open the application.** See borrower, property, transaction type, lender contact, and LOI reference. Confirm incorrect application details through a correction request.
2. **Understand the checklist.** Group requests by property, transaction, borrower/entity, and guarantor. Each request states its purpose, responsible party, required period/date, accepted formats, and next action.
3. **Upload first, then match.** Use the prominent global “Upload documents” action without first choosing a requirement. Save files to the application, then link them manually (M1) or let the model create validated links (M2, opt-in), with ambiguous matches offered for review. One file may support multiple requirements; multiple files may support one requirement. Request-specific uploads remain an optional shortcut, not the required entry point.
4. **Resolve issues.** Open a request to review evidence-linked findings. Upload a replacement, answer a targeted question, correct a fact, explain an exception, or ask for human review.
5. **Address conditional requests.** Newly required items show the triggering fact, source, and reason. Completed work remains visible when the checklist grows.
6. **Review and submit.** See documents, remaining gaps, and explanations. Submit for lender review, including explicitly acknowledged exceptions. Receive a timestamped receipt.
7. **Respond to follow-up.** Lender feedback reopens the relevant request. New files or answers create a new package revision when resubmitted.

M1 surfaces: borrower application overview/checklist; request detail with file history and structured explanations; submission summary/receipt; lender application list; lender application detail with document review, requirement management, and follow-up actions. M2 adds the optional contextual assistant and analysis controls. M3 adds borrower escalation and human conversation views plus a lender escalation inbox.

The lender can add a request with a purpose and required period, accept evidence, waive a requirement with a reason, or request a correction with a reason. Borrowers see these changes after refresh. These structured review actions belong to M1; an open-ended borrower-initiated human conversation belongs to M3. Real-time push and external notifications are not required for the initial implementation.

The checklist is the persistent source of orientation. Conversation supplements it and must not be the only way to upload, respond, or submit. With AI disabled, contextual help and structured explanation fields remain available.

### 5.1. UI/UX requirements — simplicity is a release requirement

**Design reference:** the user identifies the Codex app as a reference for intuitive simplicity. Take this as a direction toward a calm, focused interface with restrained controls and contextual detail, not a requirement to copy its layout, developer terminology, or chat-first interaction. The portal must remain usable without learning commands or knowing what to ask an assistant.

These requirements apply to M1, M2, and M3, to borrower and lender surfaces alike. When two designs satisfy the same task, prefer the one with fewer visible decisions and clearer language. Simplicity must not conceal important status, errors, consent, or consequences.

| ID | Requirement | Design and acceptance criteria |
|---|---|---|
| UX1 | Make the next action obvious | Each task view has one visually dominant primary action with a specific label, such as “Upload documents,” “Send to lender,” or “Send reply.” Secondary actions remain available but visually quieter. Avoid several equally prominent calls to action. |
| UX2 | Reveal detail when needed | Default views show the task, short explanation, current status, and next step. Put file history, full application information, calculation details, and evidence references behind clearly labeled sections such as “View details” or “Previous files.” Preserve access without placing every artifact on screen. |
| UX3 | Keep the interface focused | Use a small, stable navigation structure, generous spacing, and a clear heading hierarchy. Avoid dashboard tiles, charts, counters, tabs, side panels, and repeated summaries unless they directly help the current task. Hide unavailable future features rather than showing disabled placeholders. |
| UX4 | Use familiar words and visible labels | Use plain-language verbs and short sentences. Explain unavoidable lending terms where they occur. No unexplained icons for essential actions, hover-only instructions, or technical terms such as “manifest,” “object key,” “inference,” and “schema” in product UI. For example, use “Documents sent” instead of “Submission manifest.” |
| UX5 | Make content easy to read and operate | Product targets: body text at least 16 CSS px, comfortable line spacing, and primary interactive targets at least 44 × 44 CSS px. Use strong contrast, persistent form labels, visible keyboard focus, and text alongside status colors. Support keyboard use and 200% zoom without loss of core functionality; avoid horizontal scrolling in the main workflow. These are design targets, not an accessibility certification claim. |
| UX6 | Make uploading straightforward | Always offer a labeled file-picker button; drag-and-drop is optional. Show accepted formats and size limit before selection. Keep a prominent global “Upload documents” button visible on the borrower overview; do not require a request selection before saving. A request-specific shortcut may preselect a link, but that link is not proof of completeness. Show filename, progress, success/failure, and an obvious retry or replacement action. Do not require users to rename files or understand storage organization. |
| UX7 | Make state and recovery understandable | Distinguish “Uploaded,” “Waiting for lender review,” and “Accepted by lender.” Confirm successful saves/submission plainly. Explain errors next to the affected item with an actionable recovery step; preserve entered text and successful uploads. Never imply an action completed merely because its button was clicked. |
| UX8 | Ask only for necessary information | Reuse application details and previously provided information. Request additional fields only when relevant; do not ask borrowers to manually transcribe entire documents just to upload or submit. Optional manual facts can support checks; unavailable inputs can remain for lender review. Keep advanced metadata out of the normal upload path. |
| UX9 | Make help easy to find | Provide brief contextual explanations beside unfamiliar requests. In M3, use a recognizable “Ask a person” action to open the human escalation flow without requiring the borrower to know the word “escalation.” Keep it available with AI off. Do not promise live availability or response times unless supported. |
| UX10 | Keep AI subordinate to the task | In M2, AI assistance is optional, clearly identified, and easy to turn off. Show concise suggestions and their practical consequence, with evidence available on demand. Do not automatically open a chat panel or show agent traces, tool calls, model names, token counts, or processing internals in borrower/lender workflows. |

**Borrower default view:** show the property/application identity, a prominent global “Upload documents” action, and a visible requirements coverage summary/list showing which items have evidence and which still need attention. Show unmatched uploads with a clear next step; do not bury them in completed items. A request shows its name, one-sentence purpose, relevant date/period, status, and next action. Group matched and accepted items into an easy-to-find section with visible counts and status labels; retain a visible summary of covered versus outstanding requirements. A stored file is not a completed requirement. Keep lender feedback and submission blockers visible. Show the full checklist and remaining items on demand; do not hide work that still needs attention.

**Lender default view:** show applications requiring attention in a simple list, then a focused document/request review view. Keep relevant evidence and borrower explanations accessible alongside the decision. Prioritize “Accept” and “Request a change” for the selected item; put infrequent actions such as waiver behind a clearly labeled secondary control. Advanced portfolio analytics, raw audit events, and technical metadata do not belong on the default screen.

**Visible versus on demand:** errors, required actions, material discrepancies, consent, pending exceptions, and consequences of submission must be visible at the point of decision. Prior versions, full source excerpts, rule calculations, and detailed history can be opened when needed. Checksums, database IDs, filesystem paths, provider configuration, and debug logs belong in developer tooling. Preserve traceability in the data model even when its presentation is collapsed.

**Interaction safeguards:** use confirmation for consequential actions such as final submission or a waiver, with plain-language consequences; do not add confirmation dialogs to routine navigation and uploads. Keep navigation and button placement consistent. A compact screen should not force users to memorize information across steps or hunt through unlabeled menus.

### 5.1a. Upload-first intake and requirement coverage

This is the explicit product direction: the borrower uploads what they have, then the product helps determine which requirements those files support. Classification by document type alone is insufficient; M2 must propose links to the actual application requirements, taking relevant party, property, reporting period, and missing evidence into account when supported by the input.

**M1:** save an application-owned file without a requirement link. Show “Uploaded — choose requirements” and let the borrower link it to one or several existing requirements, change/remove links, or leave it unmatched for later review. Let borrowers add an existing file to another requirement without uploading duplicate bytes. Preserve manual matching regardless of AI availability.

**M2 priority slice:** after durable upload, offer explicit opt-in analysis for a narrow supported input. The borrower may link documents manually or let the model determine zero, one, or several associations. Validated, unambiguous model matches may create active links directly, visibly labeled “Linked by AI”; human confirmation is not mandatory for every link. Ambiguous matches remain suggestions for review. Provide short reasons/source references and easy correction or removal for all model links. Unknown or unsupported content stays unmatched with a manual path. An active link indicates relevance, not completeness or lender acceptance. General OCR and analysis of every accepted file type are not implied.

| State shown to the user | Meaning and effect on progress |
|---|---|
| Uploaded / unmatched | File bytes and metadata are saved; no active requirement link. Upload count increases, evidence-linked requirement count does not. |
| Suggested match | An ambiguous AI match awaits review and is not an active association. It does not count as evidence linked or coverage. |
| Evidence linked | An active association was created by a human or by the model after server validation. Attribute it as “Linked by you,” “Linked by lender,” or “Linked by AI”; never label model-only links human-confirmed. Relevance alone does not establish completeness. |
| Coverage assessed | A separate assessment records whether the required evidence appears complete, incomplete, or not yet assessed, with its basis and actor/origin. Human confirmation, if performed, is recorded explicitly; it is not required to activate a model link. Any AI completeness assessment is provisional and does not constitute lender acceptance. |
| Needs more evidence | Linked files exist but a known gap remains, such as the wrong period or missing amendment. Keep the requirement outstanding and explain the next action. |
| Accepted by lender | Authorized lender explicitly accepts the evidence for the requirement. Only this review action creates lender acceptance; a model cannot do so. |

Present a simple overview such as “Documents linked to 4 of 9 requests,” alongside visible outstanding/needs-review and lender-accepted statuses. Do not call all linked requirements “met.” Count each requirement once within each clearly labeled category; multiple files must not inflate progress, and suggested-only matches must not be counted as linked. A requirement can have linked evidence and still need review or more evidence. Unknown completeness stays “Needs review”; known incomplete requirements stay “Needs more evidence.” Preserve the existing exception/waiver states and identify waived items separately from evidence supplied.

Matching and completeness are distinct. A model may create a relevant link while also flagging a gap. Creating or confirming that link does not resolve the gap, waive a policy, approve a loan, or alter lender acceptance. Allow the borrower to explain/dispute an apparent gap through the existing override flow. Record human/model origin, human actor or analysis_run_id, reason/evidence, source file version, and creation/retraction/correction history for every match; corrections must not mutate past submitted packages. Replacement files require reevaluation of affected coverage and cannot inherit acceptance silently.

**Applying model links safely:** keep `requirement_documents` as the active many-to-many relation. Store proposed ambiguous matches separately from active links; retain provenance and append-only creation/retraction history, including explicit human confirmations only when they occur. Before applying results, server-side validation must check authorization, application ownership, exact document version, requirement revision, mapping revision, current AI preference/consent revision, and supported evidence references. Reject stale or cross-application results. Deduplicate each active document-version/requirement pair. Persist mapping mutations, revision updates, and audit events transactionally. Removing one association must not delete the stored file or its other links.

Preserve human rejection/unlink decisions across repeated runs on the same evidence and requirement revision: the model must not recreate dismissed links or overwrite subsequent human corrections. Retain a suppression/history record even when the active link is removed. Changed evidence may prompt a new reviewable proposal with an explanation; it must not silently undo the prior override. On validation/provider failure, retain uploaded files and offer manual linking.

### 5.2. Usability acceptance walkthrough

At every milestone, evaluate the relevant journey without coaching. Prefer a representative user around age 60 or someone unfamiliar with the product; if unavailable, record the walkthrough as an internal review rather than claiming user validation.

- **M1 borrower:** can find the global upload button without opening a request, save a file before selecting requirements, manually link it to multiple relevant requirements, distinguish saved/unmatched from evidence provided, find lender feedback, replace a file, and submit without understanding technical concepts.
- **M1 lender:** can find an application needing review, inspect the relevant file and explanation, and accept it or request a change without searching through unrelated information.
- **M2:** can choose model linking, recognize “Linked by AI,” correct/remove active AI links, and review ambiguous suggestions, recognize remaining evidence gaps, inspect the basis if desired, and switch AI off without losing the manual workflow.
- **M3:** can find “Ask a person,” send a question, recognize a human reply, and continue the conversation.
- **Across all milestones:** keyboard navigation and enlarged text remain usable; essential actions have visible labels; the current state and next action are understandable without relying on color alone.

If a participant needs verbal explanation to find a core action or repeatedly misunderstands whether a document was uploaded, submitted, or accepted, treat that as a UX defect to address before milestone completion. Record observed confusion and fixes; do not equate a visually minimal screen with proven usability.

## 6. Initial checklist

This is a proposed demo template, not a complete bank underwriting checklist. Periods and applicability must be explicit configuration, never guessed silently.

| Request | Purpose and proposed scope | Applicability |
|---|---|---|
| LOI reference | Display the agreed transaction context; lender-preloaded in v1 | All applications; not a repeated borrower upload |
| Current rent roll | Establish tenants, rent, occupancy, and reporting date | Income-producing property |
| Property operating statements | Provide income/expenses for two comparable annual periods to support the demo's year-over-year comparison | Demo assumption; lender sets actual periods |
| Debt service evidence | Support principal and interest obligations for each comparison period; distinguish historical from proposed debt service | Required for DSCR comparison; missing history leads to clarification |
| Lease agreements and amendments | Provide leases requested by lender; create tenant-specific child requests when the concentration rule applies | Lease category always visible; exact baseline lease coverage to confirm |
| Existing mortgage statement/payoff information | Identify debt to be refinanced | Refinance template |
| Executed purchase agreement and amendments | Identify purchase terms | Purchase template; outside primary demo |
| Borrower financial statements and tax returns | Support borrower capacity; identify requested entity, years, and applicable schedules | Demo fixture specifies one requested tax year; actual policy to confirm |
| Guarantor personal financial statement | Capture assets, liabilities, cash, and net worth | Per guarantor; one guarantor in demo |
| Guarantor income evidence/tax return | Support the stated income source | Per guarantor; requested form and period configured |
| Entity formation, ownership, and authority documents | Identify the borrower and who can act for it | Lender-configured entity checklist |
| Liquidity evidence | Support cash balances when triggered | Conditional; account statement scope/date to confirm |

Real-estate-owned and other debt schedules can be added by the lender when relevant. Appraisal, environmental work, title, survey, insurance, and other closing evidence are later-phase or lender/specialist-owned items unless explicitly assigned to the borrower. They should not inflate the immediate borrower upload count.

## 7. Conditional requirements and validation

M1 uses manual/confirmed facts and ordinary deterministic checks; it does not analyze document contents with AI. Lenders can manually identify issues and add requests. M2 adds assisted fact extraction and apparent missing-schedule detection. In M1/M2, “human review” means a recorded exception for the lender’s normal review; direct borrower escalation and human conversation arrive in M3.

Rules must be deterministic and versioned. AI can propose facts; the rule evaluator uses borrower-confirmed, reviewer-entered, or otherwise validated facts. Every result retains its source and input values. Missing or ambiguous inputs produce “needs clarification,” never an invented value or a passing result.

| ID | Trigger | Borrower experience | Assumptions and boundaries |
|---|---|---|---|
| R1: rent-roll freshness | Reporting date is older than the permitted window | Request a newer roll or an explanation | Interpret “2 months updated” as no older than two calendar months on submission date, inclusive at boundary. Confirm whether founder instead means 60 days or two consecutive monthly rolls. Missing/future dates require clarification. |
| R2: vacancy | At least one unit is explicitly vacant | Flag vacant units for review; allow an optional explanation | Vacancy alone does not automatically require a new document. Missing tenant names do not prove vacancy. |
| R3: tenant concentration | Tenant contribution is at least 35% | Add a tenant-specific executed lease/amendment request, or link existing qualifying files | Proposed basis: tenant contractual rent divided by total property contractual rent for the same period. Confirm revenue versus area, grouping related tenants, and `>=35%` versus `>35%`. Zero/unknown total requires clarification. |
| R4: guarantor liquidity | Cash exceeds 50% of net worth | Request evidence supporting the reported cash balance | Net worth = assets − liabilities; evaluate each guarantor separately using the same as-of date. Exactly 50% does not trigger. Net worth <= 0 or inconsistent dates require human clarification. Confirm cash definition and acceptable evidence. |
| R5: incomplete tax return | A requested or evidenced applicable schedule appears absent | Offer upload, “not applicable,” “intentionally omitted,” correction, or human review | Do not assume every schedule is required for every return. State which schedule appears missing and why. A reasoned borrower override is retained for lender review. |
| R6: DSCR deterioration | Relative year-over-year DSCR decline is at least 30% | Ask why the decline occurred; permit text explanation, optional supporting files, or human review | DSCR = NOI / debt service. Decline = (prior DSCR − current DSCR) / prior DSCR. Use comparable annual periods, positive debt service, and positive prior DSCR; otherwise clarify. Confirm `>=30%` versus `>30%` and debt-service basis. |

Example R6: prior DSCR 1.50 and current DSCR 1.05 is a 30% relative decline. The initial response is a clarification request, not an automatic demand for a specific document or an adverse credit decision.

An additional request must show “Why this was added,” its originating rule, and the supporting fact/file. Prevent duplicate requests when a rule reruns. Corrections and replacement documents recalculate dependent findings; obsolete requests become superseded with history retained. A repeated run on unchanged evidence must not reopen a borrower-overridden finding. Materially new evidence may create a new linked finding with an explanation.

## 8. Optional AI and override behavior

These requirements begin in M2. M1 must work without an AI key or model calls and need not show an inactive AI toggle. “Ask the lender” as a dedicated escalation action is introduced in M3; M2 already supports corrections and reasoned exceptions in the normal review flow.

### AI controls

- Show “AI assistance” on the application overview and within the assistant. Explain the processing scope before opt-in; remember the choice for this application.
- When off, do not send new document content to an AI service or run AI classification, extraction, analysis, chat, or automated follow-up. Existing results remain visible as historical records.
- Turning AI off prevents new analysis jobs/provider calls, prevents queued work from starting model processing, and prevents late results from mutating links, completeness assessments, or checklist state. Workers recheck consent and revisions before execution and before applying results. Explain that already-started processing may not be retractable; do not imply that switching off deletes prior processing.
- Manual upload, mapping, metadata entry, explanations, human-review requests, and submission remain fully usable. Deterministic date/threshold checks can run on manually confirmed facts and must be described separately from AI assistance.
- Turning AI back on does not silently reprocess existing files; offer an explicit analysis action.
- AI or extraction failures preserve the upload and provide manual recovery. No borrower should be trapped waiting for the assistant.

### Generalized override

For any agent finding, offer: **provide missing information**, **correct the interpretation**, **explain an exception**, or **ask the lender**. This applies to dates, entities, classification, numerical facts, missing pages, and conditional requirements, not just tax schedules.

Record the original finding, source/version, borrower action, reason, time, corrected value if any, and resulting review status. Label disputed facts as borrower assertions until verified. Use them for a visibly provisional recalculation if needed, while preserving the original evidence for the reviewer.

Borrower overrides cannot bypass file safety checks or authorization controls. They can prevent an agent suggestion from blocking submission, with the unresolved matter clearly included in the review package.

## 9. Functional requirements and acceptance criteria

| ID | Requirement | Acceptance criterion |
|---|---|---|
| F1 | Application-specific checklist | Reload preserves application state; each item has purpose, owner, applicability, and period/date requirements |
| F2 | Reliable uploads | PDF, CSV, XLSX, JPG/JPEG, PNG, and WebP accepted for storage; 25 MiB (26,214,400 bytes; currently labeled 25 MB) per-file limit is visible; unsupported, oversized, corrupt, animated, or password-protected files get actionable messages. Images above the configured 40-megapixel cap are rejected; HEIC requires conversion to JPG. File acceptance does not imply OCR or analysis. |
| F3 | Scope of parsing | Parsing capabilities are stated by format; unsupported analysis routes to manual entry without falsely claiming to have reviewed the file |
| F4 | Upload-first file organization | Global upload saves without a requirement selection; borrower can manually link/unlink one file to many requirements and many files to one requirement, reuse existing files, preview/download, and replace. Duplicates are detected within the application; earlier versions and mapping history remain traceable |
| F5 | Recoverable processing | Upload and analysis have separate states; failed analysis never discards a saved file; retries do not duplicate requests |
| F6 | Evidence-linked findings | Each finding identifies file/version and page, row, or field when available; uncertainty is explicit; no fabricated citations |
| F7 | Conditional follow-up | R1–R6 work against confirmed demo inputs and show the reason for every generated request |
| F8 | Manual parity | Entire journey can be completed with AI off and no AI service calls; borrower need not enter chat |
| F9 | Borrower override | In M2, an explained disagreement persists, stops repeated nagging on unchanged evidence, and reaches the reviewer through normal review |
| F10 | Honest coverage and progress | Show requirement coverage and remaining gaps visibly; distinguish unmatched uploads, ambiguous suggestions, active human/model links, completeness unknown/assessed, needs more evidence, and lender acceptance. Count requirements without treating relevance as completeness; show attribution and remaining gaps |
| F11 | Review submission | Review screen lists gaps/exceptions and requires acknowledgment; submission freezes a versioned manifest and returns a receipt |
| F12 | Reviewer handoff | Reviewer can inspect files, source-linked findings, borrower explanations, overrides, and open questions, then record acceptance or request follow-up |

Milestone ownership: M1 delivers F1, F2, F4, F8, F10–F12 and manual explanations. F7 in M1 covers rules on confirmed/manual inputs and lender-entered missing-schedule findings; automated document interpretation is M2. M2 completes F3, F5–F7 and F9 for the supported analysis scope. F12 gains AI evidence/overrides in M2. M3 adds F13 below.

| ID | Requirement | Acceptance criterion |
|---|---|---|
| F13 | Human escalation and communication | Borrower opens an escalation with context and a message; a lender sees it, replies, and resolves it; borrower sees the reply and can respond; conversation and status survive refresh/restart |

The UI/UX requirements and usability walkthrough in sections 5.1–5.2 are acceptance requirements for each milestone, alongside preserved drafts after refresh. A functional backend alone does not satisfy milestone completion.

## 10. State and evidence model

Keep these records distinct:

- **Application:** transaction, property, borrower/guarantor parties, LOI reference, checklist version, AI preference.
- **Requirement:** subject/party, purpose, period, owner, source (template/lender/rule), applicability, linked evidence, and status.
- **Document/version:** application-owned stored file, checksum, uploader, timestamps, declared metadata, and processing status; zero requirement links is valid.
- **Requirement-document match:** active `requirement_documents` relation to an exact file version, with human/model origin, actor or analysis_run_id, evidence/reason, revision, and creation/retraction history. Ambiguous suggestions and rejected-link suppression are separate from the active relation. Human-confirmed status is recorded only for actual human confirmation. A link is independent of coverage/completeness findings and lender review decisions.
- **Fact:** value, unit, period, source location/version, origin (extracted/manual), confirmation state, and correction history.
- **Finding/request:** rule or agent origin, input facts, reason, severity, evidence, and resolution state.
- **Response/override:** borrower explanation or correction, referenced finding, time, and review outcome.
- **Submission:** immutable manifest of file versions, requirements, responses, and exceptions at handoff time.
- **Escalation (M3):** application, optional requirement/finding, initiating borrower, assigned reviewer if any, reason, status, and timestamps.
- **Human message (M3):** escalation, sender identity/role, body, and timestamp; separate from AI conversation.
- **Audit event:** actor, action, target, timestamp, and relevant rule/model version.

Requirement review statuses: **Needed → Provided → In review → Accepted**, with **Action needed**, **Exception pending**, **Waived by lender**, and **Superseded** as explicit alternatives. Only the reviewer accepts or waives a requirement. “Provided” indicates active evidence links (human-created or validated model-created), not completeness, human confirmation, or acceptance. Unmatched uploads and ambiguous suggestions alone do not establish Provided; known gaps remain Action needed, and unknown completeness remains visible as needing review. The matching/coverage states in section 5.1a are separate from this review lifecycle. Processing status is independent: **Not requested / Queued / Processing / Succeeded / Failed / Skipped / Cancelled**. Queue and worker implementation is pending; these are target states, not implemented-status claims.

Application statuses: **Collecting → Submitted → In review → Follow-up requested → Resubmitted**, with **Collection complete** when the lender resolves the package. Collection complete never implies the loan is approved.

Allow submission with disclosed gaps and explained exceptions; do not call it complete. Unsafe/unavailable files cannot count as provided evidence, but the borrower can explain their absence and submit the rest for review. Later edits do not mutate an earlier submission.

## 11. Implementation boundaries

### Required across the milestones

M1 delivers a cohesive manual borrower-to-lender journey with actual file storage, persisted checklist state, deterministic checks on manual facts, structured exceptions, functional lender review, and versioned handoff. M2 adds optional AI and agent-output overrides. M3 adds borrower-initiated escalation and human messaging. Use synthetic documents and clearly labeled demo identities. A lightweight backend, database, storage layer, deterministic rule module, and optional AI adapter are sufficient; no multi-agent orchestration is required.

In M2, demonstrate real AI classification/extraction for a narrow supported input, such as a text-based rent roll. Broader extraction may use explicitly labeled fixture facts or manual entry. The interface and walkthrough must distinguish real processing from simulation. Store model outputs separately from accepted facts and validate structured output before use.

### Deferred

- Automatic LOI-to-checklist generation; later outputs should be lender-reviewable proposals with LOI citations.
- General OCR and reliable parsing of arbitrary scans, spreadsheets, leases, and tax returns.
- Multi-property applications, complex ownership structures, and broad transaction templates.
- Advanced lender portfolio analytics and operational administration beyond the M1 portal; underwriting/credit decisions, closing orchestration, and servicing.
- Email/SMS chasing, banking/LOS integration, e-signatures, and automatic third-party report ordering.

### Before real borrower use

Implement and validate authentication, application/party-level authorization, private file storage, encryption, time-limited downloads, malware scanning/quarantine, retention/deletion policies, sensitive-log redaction, backup/recovery, and scoped guarantor access. Document AI provider processing/retention terms and enforce the AI preference server-side. Treat document content as untrusted input, never as instructions to tools or agents. Evaluate extraction quality and rule behavior on representative lender-approved samples. These are production gates; the demo must disclose unimplemented controls and make no bank-readiness claim.

## 12. Milestones

The three milestones below are the agreed delivery sequence. The previous M0–M5 plan and its 16-hour allocation are superseded. The brief’s two-day trial remains context; dates/timeboxes for this refined scope need confirmation. Do not drop the lender portal or pull AI forward to satisfy the old schedule.

### Milestone 1 — Working product without AI

**Outcome:** both borrower and lender can complete the document collection/review cycle without model calls, AI credentials, or agent processing.

- Borrower portal: application/LOI context, static checklist, global upload-first intake, an unmatched-file inbox, manual many-to-many requirement matching and metadata, file history/downloads, explanations, progress, submission receipt, and follow-up/resubmission.
- Lender portal: application list/detail, requirements and document versions, add document requests, review explanations, accept evidence, waive with a reason, and request corrections. Reviewer actions are persisted and reflected in the borrower portal.
- Persist applications, memberships/roles, requests, files/versions, manual facts, review actions, explanations, submissions, and audit events in PostgreSQL; store file bytes privately on disk.
- Better Auth sign-in with borrower and lender demo accounts; authorize every application/file operation on the backend. A temporary demo role switch must be labeled and does not satisfy the final authentication requirement.
- Evaluate deterministic rules against manually confirmed inputs. Missing tax schedules can be flagged manually by the lender; no automatic document understanding is required.
- Provide setup, migrations, synthetic seed data, and documented manual acceptance walkthroughs. Broad automated test infrastructure is deferred by user preference.

**Exit:** borrower signs in, uploads without selecting a requirement, confirms manual matches and sees coverage/outstanding items, then submits; lender signs in, reviews and requests a correction; borrower responds and resubmits; lender accepts the evidence. State and files survive restart, old submission versions remain unchanged, unauthorized access is denied, and the entire workflow makes zero AI calls.

### Milestone 2 — Integrate optional AI

**Outcome:** Mastra with OpenRouter assists the established workflow while the complete manual product remains usable.

- Add an explicit AI preference, upload-triggered background analysis after opt-in, and an active “Verify completeness” action. Show queued/processing, failure, and retry states without blocking uploads or manual work. These actions have different purposes and must not silently substitute for one another.
- Prioritize real model-assisted requirement matching for one narrow supported input once upload/matching, consent, and data/API prerequisites work. Save files first, then analyze; select the input type and model before implementation. This is M2 work and does not replace M1 manual acceptance.
- Create zero/one/multiple active requirement links from validated unambiguous model matches, with AI attribution, reasons, source references, and easy correction/removal. Retain ambiguous matches as suggestions for human review; manual linking stays optional and available. Apply revision/consent checks, override suppression, deduplication, and transactional history as specified in section 5.1a.
- Propose classification/extracted facts with evidence references and uncertainty. Validate facts and obtain confirmation where needed for the existing deterministic-rule workflow; this does not impose confirmation on every document link. Do not let the model make credit decisions or waive requirements.
- Add contextual assistance and generalized borrower correction/override with reasons, preserving original findings and review history.
- Introduce a queue service and workers under the backend owner’s agreed contracts. Persist job/analysis status, bounded retries and recoverable failures; recover interrupted work without duplicate effects. Prioritize active Verify completeness work over passive upload analysis without starving older work. Exact queue technology, concurrency, and scheduling policy are pending backend/platform agreement. Reject stale results after document, requirement, mapping, or AI-preference changes.

**Exit:** after opt-in, a global upload of supported content produces at least one real model-created active link without mandatory human confirmation, attributed to AI. Ambiguous matches remain suggestions. The borrower can remove/correct a link and repeated same-evidence analysis respects that override; linked-document counts update while completeness and acceptance remain distinct. Demonstrate one-to-many/many-to-one manual mapping and at least one real model match, then a supported conditional follow-up; borrower can correct or override them; lender sees the evidence and explanation. Disabling AI stops new model calls and late-result mutations. Failed analysis leaves the saved file and manual flow intact. Broad OCR remains deferred.

### Milestone 3 — Escalation to a human

**Outcome:** borrower can explicitly escalate an issue and communicate with a human lender representative inside the product, with or without AI enabled.

- Add “Escalate to a human” at application/request level and on AI findings. Collect a reason and first message; attach relevant request, file-version, and finding context without exposing unrelated borrower/guarantor information.
- Persist an escalation and its message thread. Show it in a lender inbox with application context; use the application’s reviewer as the initial recipient when available, otherwise an authorized lender queue.
- Lender and borrower can exchange messages, see sender identity/timestamps, and see status. Proposed states: Open, In progress, Resolved; a borrower reply to a resolved issue reopens it.
- Lender can resolve the escalation with an explanation. Resolution does not automatically accept a document or waive a requirement; those remain explicit review actions.
- Begin with asynchronous in-app communication and refresh/polling. No email/SMS, live chat presence, response-time promise, or external helpdesk integration is required.

**Exit:** borrower opens an escalation, lender sees and replies to it, borrower responds, and lender resolves it; both parties see the same persisted conversation and status after refresh/restart. Other applications cannot access it. AI-off users can use the feature.

**Scope discipline:** meet the simplicity and usability criteria in sections 5.1–5.2 at each milestone; keep both M1 portals functional. Defer broad parsing, extra transaction templates, and advanced dashboard polish before reducing the core review cycle. Complete each milestone’s manual acceptance walkthrough and record limitations before declaring it done.

## 13. Demo and verification plan

Use synthetic refinance documents and separate borrower/lender identities. Verification is a manual acceptance walkthrough plus relevant existing build/type/lint checks; adding a dedicated automated test suite is out of current scope. This is not a claim that the app is production-validated.

| Milestone | Walkthrough | Important checks |
|---|---|---|
| M1 | Borrower uploads, maps, explains an exception and submits; lender adds a request/reviews; borrower replaces and resubmits; lender accepts | Persistence across refresh/restart; download authorization; invalid uploads; duplicate/version handling; immutable submissions; role separation; no AI calls |
| M2 | Upload supported content globally, inspect/correct AI-created active links and ambiguous suggestions, distinguish linking from completeness and lender acceptance, confirm facts, generate tenant lease request, override a finding, switch AI off and continue manually | Real provider response distinguished from fixtures; source references; rule boundaries; missing/zero inputs; failure recovery; stale-result suppression; no repeated nagging on unchanged evidence |
| M3 | Escalate a request, exchange borrower/lender messages, resolve and reopen | Correct recipient/access; persisted messages and status; AI-off availability; no automatic requirement waiver |

Retain boundary examples for date cutoff, 35% concentration, cash above 50% of net worth, and a 30% relative DSCR decline (1.50 to 1.05). Check corrections and supersession as relevant features are delivered. Record actual results and remaining gaps in the implementation README; do not equate planned acceptance criteria with completed verification.

## 14. Questions to resolve with the founder

These are product decisions to carry into the next discussion, not blockers to drafting this spec.

1. Does “rent roll 2 months updated” mean a maximum age, 60 days, or two monthly documents?
2. Does the 35% tenant threshold measure rent, revenue, or floor area? Is the threshold inclusive, and should related tenants be grouped? Which leases are required below it?
3. What counts as cash for the guarantor rule, and which statements/date ranges establish proof?
4. Is the DSCR trigger a relative decline of at least 30%, using historical debt service or a constant proposed-loan basis? Which periods are compared?
5. Which document families and reporting periods belong in the initial lender checklist? Confirm refinance as the primary demo.
6. Can borrowers submit with explained missing items as proposed, and who reviews or waives those exceptions?
7. Is AI off by default appropriate, and should opting in apply to the application or individual documents? Are there approved providers or data-handling constraints?
8. What delivery dates/timeboxes apply to the three revised milestones? Both functional portals are now confirmed M1 scope; a read-only lender summary is insufficient.
9. Which actual requirement matches should the first narrow M2 slice demonstrate, and which representative files support them? With PDF/XLSX/CSV and JPG/JPEG/PNG/WebP uploads now supported, which document types and formats should M2 actually analyze? Please provide anonymized examples and spreadsheet layouts. Are legacy XLS or HEIC files common enough to prioritize later?

## 15. Document format research and proposed support

Research checked November 6, 2026. The sources show a mix of document and spreadsheet workflows, not a single universal CRE borrower-upload format. Agency multifamily submission requirements and general mortgage software are useful examples, but do not establish Proximitty's lender-specific policy.

| Evidence | Product implication |
|---|---|
| [Fannie Mae's delivery resources](https://multifamily.fanniemae.com/learning-center/learning-library/delivery) include a rent-roll template; its [template guidance](https://multifamily.fanniemae.com/sites/g/files/koqyhd161/files/2019-06/mf-job-aid-rent-roll-template-lender-guidance.pdf) describes an Excel worksheet with prescribed columns. The guidance is dated 2019, so use it as evidence of spreadsheet workflows, not a current universal mandate. | Rent rolls should not be assumed to arrive only as PDF. |
| [Freddie Mac's origination Loan Submission Template](https://mf.freddiemac.com/lenders/uw/loan-submission-template) supports quote and underwriting packages; its [October 2025 update](https://mf.freddiemac.com/docs/whats_new_with_LST.pdf) shows Excel rent-roll and income/expense worksheets. | Spreadsheet support is relevant to origination, independently of periodic servicing. |
| [Buildium's rental owner statement documentation](https://help.buildium.com/hc/s/article/Rental-owner-statement-1557494407490) offers PDF, XLSX, and CSV exports. [TurboTenant's help](https://support.turbotenant.com/en/articles/8167119-how-to-export-data-from-buildium-or-rentredi-to-turbotenant) describes exporting its rent-roll report as CSV. | CSV is a realistic property-system export format, alongside Excel and PDF. These are source-system capabilities, not proof every lender accepts every format. |
| [SBA Form 413](https://legacy.sba.gov/document/sba-form-413-personal-financial-statement) is distributed as PDF. | Guarantor financial information may arrive in a form document rather than a spreadsheet; this does not require using SBA forms for this loan. |
| [LendingPad's upload documentation](https://kb.lendingpad.com/troubleshooting-unable-to-upload-documents-in-lendingpad) lists PDF, JPG, Word, Excel, and PNG, and excludes ZIP/password-protected uploads. | Broader lending portals accommodate multiple formats; this is a general mortgage product example, not a CRE-wide standard. |

**Current upload scope:** PDF, XLSX, CSV, JPG/JPEG, PNG, and WebP. Image support has been added to the prototype; it is no longer a proposed future addition. Prefer native XLSX/CSV for tabular rent rolls and operating statements when available, while accepting PDF. Prefer PDF for executed leases, tax returns, bank statements, and entity documents as a product choice, not a universal rule. Legacy XLS, Word, HEIC, and other unsupported formats remain outside the current baseline. Image uploads retain original bytes, including embedded metadata; they do not perform OCR or financial analysis.

Distinguish file acceptance from automated analysis. Digital PDFs, scanned PDFs, and photos require different processing; accepting a scanned PDF must not imply OCR is implemented. For the demo, define the exact supported extraction path and provide manual recovery for other accepted files. Spreadsheet analysis should preserve sheet/row/cell provenance, handle column mapping explicitly, and never execute uploaded macros or formulas. Preserve the original file instead of requiring conversion to PDF.

The implemented 25 MiB limit in F2 (currently labeled 25 MB in the UI) is a trial design choice, not a market standard. Confirm expected file sizes, combined multi-document PDFs, password protection, legacy formats, and spreadsheet layouts with actual sample files before expanding support.


## 16. Technical stack and architecture requirements

This section consolidates the latest tech stack chat decisions. It replaces the earlier proposed Supabase, Vercel, direct OpenAI API, and Inngest stack. It specifies the target; it does not assert that every integration is currently installed or verified.

| Layer | Current choice | Scope and status of decision |
|---|---|---|
| Frontend | React + Next.js + TypeScript | Chosen direction; both borrower and lender portals in one application |
| Backend | Next.js server-side routes/functions | Keep permissions, persistence, business rules, file access, and secrets server-side; no separate backend service required initially |
| Database | PostgreSQL 17 | Approved local database version; use versioned migrations and repeatable synthetic seed data without resetting existing demo data |
| Local services | Docker Compose for PostgreSQL only | Persistent postgres_data volume; database bound to loopback host port 5433. Next.js runs on the host with canonical browser/auth origin http://127.0.0.1:3001 |
| Authentication | Better Auth | Selected in the tech stack chat after the user requested a choice; users/sessions backed by PostgreSQL; borrower/lender application authorization enforced separately |
| File storage | Private local filesystem | Current recommendation from tech stack chat; outside the public web directory, with access-controlled downloads and metadata in PostgreSQL |
| Agent SDK | Mastra | User-selected; server-side connection probe exists. Borrower document assistance and scoped analysis tools remain M2 work |
| Model access | OpenRouter | Explicit user choice; server-only OPENROUTER_API_KEY. Connection probe defaults to google/gemini-2.5-flash-lite, configurable through OPENROUTER_MODEL. This is not a finalized M2 document-analysis model choice |
| Database query/migration library | node-postgres (`pg`) + checked-in SQL | Selected for the local stack cutover; Better Auth uses its native PostgreSQL adapter, with generated auth SQL in the same migration ledger |
| Hosting | Deferred | Local operation for now; no Vercel or other hosting setup required |
| Background jobs | Queue service + workers; implementation pending | Explicit user direction supersedes the earlier deferral. Backend owner specifies serving/job orchestration and execution contracts; queue technology and runtime integration are not yet selected in this SOT |
| Automated test suite | Deferred by user preference | No new Vitest/Playwright setup required; preserve existing checks and manually verify milestone acceptance |
| Broad document processing/OCR | Deferred | File acceptance includes PDF/XLSX/CSV/JPG/JPEG/PNG/WebP; M2 defines a narrow supported analysis path explicitly |

### Approved local runtime and ownership

The coordinated local demo uses **Docker Compose for PostgreSQL 17 only**, with the persistent `postgres_data` volume and loopback host port **5433**. **Next.js runs on the host**, and the canonical browser/auth origin is **http://127.0.0.1:3001**. Private uploads remain in the configured persistent local data directory outside public assets. This is neither a fully containerized application nor a public deployment. This is the current runtime baseline; adding queue/worker runtime is now in scope but pending the backend/platform contract. No queue service is claimed to be running by this specification change.

The platform owner alone controls Compose, runtime/environment/startup documentation, and preview restarts. The dedicated backend owner controls serving/job orchestration and Mastra/OpenRouter execution plumbing; the AI owner controls prompts, extraction, matching, evidence, and evaluations. The database owner controls schema/migrations/repositories; the frontend owner controls presentation. The backend owner is producing `docs/BACKEND_PLAN.md` to resolve contracts before shared implementation. Do not introduce competing queues or a new synchronous-only architecture independently. Do not independently change ports, auth origins, Docker services, dependencies, or deployment architecture. Report conflicts to the coordinator instead. Preserve volumes and seeded data. AI credentials remain optional for M1 and must not appear in client code or logs.

The user's question about whether a strong demo could omit authentication is exploratory. **It does not remove Better Auth or backend application authorization from M1 acceptance.** A change to that requirement needs an explicit scope decision recorded here.

### Data flow and separation

1. Borrower/lender React UI calls authenticated Next.js backend endpoints.
2. Backend checks role and application membership, validates input, writes file bytes through a storage adapter, and records metadata/business state in PostgreSQL.
3. Downloads resolve stored object keys through the backend after access checks; never expose raw filesystem paths as public URLs.
4. In M2 only: after successful upload and opt-in, the backend schedules background document analysis; an explicit Verify completeness request schedules a separately identified, higher-priority assessment. Workers execute Mastra/OpenRouter calls through backend-owned plumbing, using AI-owner prompts/contracts, then validate consent and current revisions before persisting results. Active validated model links, ambiguous suggestions, completeness assessments, and confirmed facts remain distinct. Deterministic rules remain ordinary TypeScript.
5. In M3: escalation and message records use the same authenticated backend/PostgreSQL foundation. Human replies do not require an AI provider.

### Background analysis and active verification — M2 target

The user explicitly requested a dedicated backend owner, queue service/workers, and prioritization between passive upload analysis and active verification. This supersedes all earlier no-background-worker decisions. Implementation is pending; do not infer that earlier provider connection checks constitute a worker system.

- **Upload-triggered background analysis:** save original bytes and metadata first. When AI is opted in and the input is supported, enqueue analysis for that exact version to extract/classify and create validated requirement links or ambiguous suggestions. A queue/provider failure must not reverse a successful upload. Show “Uploaded” separately from “Analysis queued/failed.” With AI off, keep the file available for manual linking without enqueueing AI work.
- **Verify completeness:** a user explicitly asks for an assessment of current requirement coverage and gaps. Record the requirement/document/mapping snapshot used; assess beyond simple relevance. Prefer reusable current analysis where valid. Missing or unfinished prerequisite analysis must produce a waiting/incomplete state or dependency, not a false complete verdict. This remains AI-gated when model processing is involved; manual review remains available.
- **Priority:** interactive verification should receive priority over passive upload work, with bounded concurrency and a fairness policy so uploads are not indefinitely starved. Backend owner proposes exact priority/dependency semantics and cancellation behavior in its plan; no particular queue vendor or numeric priority is selected here.
- **Durability and correctness:** persist job identity, type, relevant revisions, consent revision, attempts, status, and result references. Prevent duplicate enqueue/application for the same logical work, bound retries, and recover after worker interruption. Recheck authorization/scope, current AI preference, document/requirement/mapping revisions, and human overrides before execution and result application. A stale result cannot restore a rejected link or overwrite newer work. Apply mapping/revision/audit mutations transactionally using database-owner contracts.
- **UX and acceptance:** navigating away or refreshing must not lose saved uploads or durable job status. Demonstrate pending work, successful background matching, explicit verification with gaps, queue/provider failure recovery, worker restart recovery, duplicate suppression, and AI-off/stale-result suppression. Lender acceptance remains explicit and separate from model verification. M1 remains usable without AI credentials or analysis workers.

### Portability and persistence

- Keep database access, file storage, AI calls, and business rules in separate modules with small interfaces. UI components must not know physical file paths, SQL details, or model-provider secrets.
- Store stable IDs, file keys, original names, type/size, checksum, version, application ownership, and timestamps. Keep bytes separate from relational records. Preserve original files.
- A temporary SQLite/local adapter is acceptable as a migration step for existing prototype work, but PostgreSQL is the M1 completion target. Document any remaining gap explicitly.
- Future S3-compatible storage should replace the storage adapter and migrate object keys/bytes without rewriting portal screens. Cloud storage is not part of current scope.
- Preserve the `postgres_data` Docker volume and configured persistent local upload directory across restarts. Do not remove volumes or reset seeded demo data. Repeatable seed commands must preserve existing data; destructive reset is not part of this delivery workflow.
- Handle partial upload failures: do not show a document as successfully provided until both stored bytes and database metadata are available; clean up failed writes or make retries recoverable.

### Configuration and implementation status

Server-only Mastra/OpenRouter connection code now exists in `lib/ai.ts`, with an explicit local check at `/settings/ai` backed by `/api/ai/connection`. Opening settings reads configuration status; pressing the check button sends a fixed synthetic message and may incur provider usage. The check has no document access, checklist writes, or application analysis. Keep this diagnostic separate from the M1 borrower/lender workflow: M1 remains usable without credentials or model calls. This documentation reconciliation inspected source and README; it did not read secrets, make a provider request, or independently verify live provider success. Do not expose credentials in documentation, logs, browser code, or NEXT_PUBLIC variables.

Document environment variable names/placeholders, local startup commands, database migration/seed steps, storage location configuration, and account setup in README. M1 must start and operate without an AI credential. In M2, missing credentials or provider errors must produce clear recovery paths without losing uploads.

The M2 analysis model (distinct from the connection-probe default), initial AI-supported document type, and detailed escalation ownership policy remain open implementation decisions. The query/migration choice is now recorded in the stack table rather than remaining open. Record selections here when made; do not silently revive superseded providers or add hosting. Queue/workers are now authorized in scope; their service choice and runtime changes require the coordinated backend/platform contract.

### Current implementation snapshot — November 6, 2026

This snapshot records the earlier v0.4 source inspection and README-reported behavior, not a fresh runtime acceptance run. It is historical evidence, not a live progress tracker: the approved runtime above governs the ongoing PostgreSQL/auth cutover, whose completion must be verified by the platform and acceptance owners. Targets above remain authoritative. No milestone is declared complete by the presence of a screen, dependency, or provider connection alone.

| Area | Evidence inspected | Current status versus target |
|---|---|---|
| Borrower uploads | `app/page.tsx`, `lib/validation.ts`, application/document API routes, README | Local upload/checklist increment exists; PDF/XLSX/CSV and still JPG/JPEG/PNG/WebP are accepted with structural validation. Original-byte storage, duplicate detection, download, and persistence are documented. No document understanding is claimed. |
| Lender portal | `app/lender/`, lender API route, `002_lender_review.sql`, README | Application/review screens, acceptance/change requests, append-only review history, and separate internal notes exist. This is a local demo, not authenticated lender access. |
| Persistence and identity | `lib/local.ts` architecture described in README, package dependencies, migration inventory | SQLite and private local files remain the implementation. PostgreSQL, Docker runtime integration, Better Auth, and backend membership enforcement remain M1 targets. Local-origin guards do not authenticate a user or isolate application roles. |
| M1 workflow completeness | README limits and lender increment notes | Formal immutable submissions, explicit replacement/version chains, full mapping/manual-fact workflows, R1–R6, lender-added requests/waivers, and complete correction/resubmission remain to be delivered or verified against acceptance criteria. M1 is incomplete. |
| AI connectivity | `lib/ai.ts`, `app/api/ai/connection/route.ts`, `/settings/ai`, package dependencies | Mastra/OpenRouter connection probe is implemented as preparation. Document extraction, application consent, suggestions/confirmation, requirement matching, and agent overrides were not implemented at this snapshot. M2 is incomplete and implementation remains sequenced after M1 acceptance. |
| Human escalation | Current API route inventory and README | Lender-authored review feedback is not a borrower escalation/message thread. The M3 escalation inbox, messages, and resolution lifecycle remain future work. |
| Verification | README and package scripts | Existing unit/integration/build/typecheck commands are present; prior verification is reported in README. Preserve them. Deferral of new test frameworks does not mean deleting existing checks or claiming this reconciliation reran them. |

README still contains older Supabase/Vercel/OpenAI/Inngest migration guidance and broad “no AI” statements from the first increment. Those historical passages do not supersede section 16 or the connection-probe status above. Updating README belongs to its implementation owner; this reconciliation changes only REQUIREMENTS.md.

### Decision tracking and supporting plans

The concise founder questions in section 14 remain unresolved unless an explicit answer is recorded. In particular, do not silently finalize the rent-roll age definition, concentration basis/boundary, cash definition/evidence, DSCR basis, initial document periods, submission-with-exceptions policy, AI default/consent scope, or refined delivery dates. Image upload support and the presence of both portals are settled and should not be reopened as unanswered scope questions.

Specialist UX, database, acceptance, AI, platform, and portal-backlog documents provide implementation proposals and evidence. They do not change milestone scope or lending policy by themselves. Reconcile accepted decisions here; retain unresolved recommendations as proposals. Keep the agreed order: complete manual portals, integrate optional AI, then add human escalation.

## 17. Change record

- **v0.1:** Initial origination requirements, provisional two-day plan, conditional rules, and document-format research.
- **v0.2:** Established this file as the build SOT. Replaced M0–M5 with M1 manual borrower + lender portals, M2 optional AI, and M3 human escalation. Added lender actions, escalation acceptance criteria, and latest local stack decisions. Removed obsolete hosted-stack assumptions and mandatory automated-suite/background-worker scope. Outstanding policy thresholds remain explicitly provisional.

- **v0.3:** Added simplicity as a cross-milestone product requirement, using Codex as the user’s design reference. Defined progressive disclosure, readable controls, plain language, focused borrower/lender views, restrained AI presentation, and observable usability acceptance criteria.

- **v0.4:** Reconciled implemented image uploads and the Mastra/OpenRouter connection probe; clarified that document analysis is absent. Added an evidence-qualified implementation snapshot, retained M1/M2/M3 boundaries, identified stale README guidance, and separated unresolved founder decisions from implementation proposals.

- **v0.5:** Aligned approved local runtime to PostgreSQL 17 in Docker Compose (persistent postgres_data, loopback port 5433) and host-run Next.js at http://127.0.0.1:3001. Recorded ownership and data-preservation constraints, retained M1 authentication despite exploratory demo discussion, and marked the earlier implementation snapshot as historical.

- **v0.6:** Made global upload-first intake the explicit direction. M1 saves unmatched application files and supports manual many-to-many matching; M2 prioritizes narrow real model matching with review/correction. Defined coverage versus suggestions, known gaps, and lender acceptance; preserved opt-in AI, manual fallback, milestone boundaries, and deferred broad OCR.

- **v0.7:** Clarified optional human linking versus opt-in model-created active links; removed mandatory human confirmation for every model association. Separated relevance, coverage assessment, and lender acceptance, and specified AI attribution, ambiguous suggestions, correction persistence, revision/consent validation, deduplication, and transactional mapping/audit history.

- **v0.8:** Incorporated explicit queue service/worker scope and dedicated backend ownership, superseding the earlier worker deferral. Distinguished upload-triggered analysis from prioritized active Verify completeness, retained opt-in/manual parity, and marked queue selection/runtime/implementation pending coordinated contracts.
