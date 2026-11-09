# Borrower preparation agents — MVP configuration

Status: implementation candidate; offline verification only. Deployment and live evaluations await user review. Both decision makers are native Mastra Agents. Durable application services, not model prompts, enforce permissions, budgets, idempotency and freshness.

## Agents and tools

| Agent | Goal | Native Mastra tools |
|---|---|---|
| Borrower Preparation (`borrower-preparation`) | Help the borrower satisfy lender requests accurately, quickly and with minimal effort | `reply_to_borrower`, `investigate_documents`, `answer_investigation_question` |
| Document Investigation (`document-investigation`) | Establish what evidence supports, identify precise gaps/conflicts and investigate efficiently | `inspect_document`, `read_evidence`, `search_evidence`, `propose_document_mapping`, `request_clarification`, `publish_assessment` |

Exact prompts, tool schemas and definitions: `lib/agents/definitions.ts`. Native generation adapters: `lib/agents/runtime.ts`. Each generation executes one real registered tool against the durable controller. The outer loop persists observations, charges/reserves spend, and provides updated context for the next decision. This is not a fixed read/match/assess pipeline. Fresh agent instances are created per durable step, with application-owned context rather than an independent Mastra memory checklist.

The preparation agent owns the borrower conversation and priorities. It cannot establish new document findings itself. The investigation agent chooses how to inspect evidence and returns validated findings/questions through durable services. The preparation agent explains them to the borrower. Neither agent can delete evidence, waive requirements, submit an application or authorize its own operations.

## Context and delegation

The main agent receives the current application/requirement inventory, last 40 borrower messages, last 20 assistant responses marked current/historical, outstanding questions, active investigations, current result, trigger event and backend package status. Full messages remain durable even when bounded context omits older turns. This MVP does not claim unlimited conversational recall.

A delegation supplies a concrete `goal`, focus `requirementIds` and `documentIds`. The server supplies actor/application identity, grants, revisions, origin and idempotency key. The goal is stored on `preparation_runs`; the original request envelope remains compatible. Focus guides attention; all authorized active evidence remains available. Specialist publications contain only changed findings and optional `reaffirmCriterionIds`. The backend builds the full ledger: it retains prior findings only when inventory, observations, borrower context and agent configuration match the recorded baseline; otherwise an explicit reaffirmation is required after reviewing changed context. Reaffirmation cannot revive changed requirement definitions or removed/replaced cited sources, and passes the same evidence and absence validators as a new finding. Omitted unchecked criteria become operator-owned unknowns, not new borrower upload requests. A scoped goal cannot bypass full-package aggregation. Empty `findings` is allowed when no findings changed; full assessments are not mandatory after uploads or ordinary questions.

Questions retain their ID/revision and respondent attribution. The main agent forwards the exact current borrower message; it cannot manufacture an answer. Answers can guide applicability or investigation, but never substitute for required documentary proof. A question pauses its investigation; separate investigations can continue independently.

Investigations publish persisted progress, question and result events. The main agent is awakened by result/question/failure events; upload inventory changes can enqueue work when automatic-processing preference is enabled. Existing processing progress is visible during longer runs without another model call for each page.

## Evidence capabilities

Supported types: PDF, Word DOCX, Excel XLSX and CSV, UTF-8 TXT, RFC822 EML and Outlook MSG. PNG/JPEG/WebP images also support visual inspection/OCR. Legacy DOC/XLS and encrypted/protected formats are not silently converted; request a supported export. These exact format boundaries should be visible in rollout documentation.

- PDF: inspect page count, search native text over selected pages, read selected native pages or rendered images, OCR selected pages.
- DOCX: text paragraphs, tables represented by their paragraph content, headers/footers and source locations. Embedded visuals/objects and tracked changes have explicit limitations.
- XLSX/CSV: source cells/records, including sheet addresses. Formulas/cached values are not recalculated or independently validated; embedded visuals are flagged.
- TXT: line locations.
- EML/MSG: headers and message body with locations. Embedded attachments are flagged as unreviewed; upload them separately. No remote images/links are fetched.
- Non-PDF evidence is exposed in addressable 20-record chunks, not fake physical pages. Citations retain source locations.

File parsers and OCR run in disposable processes with a 45-second tool timeout, bounded input and no provider credentials. Non-PDF extractors remain conservative (500 records / approximately 60 KB extracted records, plus format-specific limits). Oversized files produce a limitation rather than truncated proof. PDF selection: up to 8 units per read; native search up to 40 units. OCR uses local English language data; low-confidence OCR cannot alone support positive findings or confident absence.

Search hits are candidate locators, not inspection or citation support. Reads return immutable observation IDs tied to document hashes. Prior observations are reused only for still-active versions with identical bytes. No fixed first-page sampling rule: the instruction is to seek the least costly evidence sufficient for the conclusion and expand investigation as necessary.

## Completeness authority

`lib/preparation/completeness.ts` derives `complete`, `incomplete` or `unknown` from current validated results and the authoritative request inventory.

- Complete: every active borrower request/criterion is represented at its current definition/evidence revision; every criterion is met with valid citation references; no material gaps, conflicts, limitations or relevant pending uploads.
- Incomplete: established unmet criteria remain.
- Unknown: current assessment/coverage is missing, a criterion is uncertain, evidence is stale, intake is pending, or material limitations/conflicts remain without a definite unmet criterion.

The model assesses evidence semantics; backend validation checks IDs, hashes, inspected evidence, quote fidelity for text/OCR, incremental update IDs, safe prior-finding reuse and conservative absence coverage. The backend, rather than the model, supplies full criterion enumeration. Aggregation cannot prove that a real quote semantically entails a conclusion. Independent eval review remains necessary. Visual conclusions remain model interpretations, not signature authentication or lender acceptance. Conditional requests are not automatically waived by the model. The explicit `criterion_confirmation_policy` may allow `no_amendments` for an optional amendment criterion. The investigator must quote an authorized borrower message via `assertionEvidence`; required executed leases still need document citations. Conflicting messages/evidence remain unresolved and are independently evaluated.

The existing absence rule still requires usable inspection across all active evidence. This is deliberately conservative and can make global absence expensive. Selective positive evidence is supported. Do not claim cheap comprehensive absence until criterion-scoped exclusion has been designed and evaluated.

## Execution and spending

- Provisional model: `openrouter/google/gemini-2.5-flash`, configured through Mastra.
- Temperature 0; up to 8,000 output tokens; no automatic SDK or processor retries.
- One native tool per generation; one main-agent generation per queued turn; up to 24 model steps per investigation in the isolated worker; 60-second generation timeout; five-minute loop bound.
- One application budget shared by main-agent and investigation reservations. Unknown cost retains its reservation. An additional shared cumulative evaluation ledger limits both agents together to the previously authorized ceiling; no separate agent allowance.
- Evaluation provider dispatch conservatively reserves $0.60 per call against maximum model context, with provider price ceilings. This is a bound, not expected cost. The provisional $0.10 per-run product target is not yet validated and cannot admit that conservative reservation. The opt-in worker therefore requires explicit application/run budgets rather than silently raising a cap. The user approved a $5 first pilot batch within the existing $20 cumulative ledger and $2 per investigation. Atomic batch reservations enforce this separately from application accounting; unknown costs remain held.
- Zero configured application budget means no dispatch. Budget exhaustion preserves observations/findings and exposes a blocked step. Later investigations reuse valid observations; limits do not reset on ordinary retries.

## Backend and database changes

Migration `022_borrower_agent.sql` is additive:
1. `borrower_agent_turns`: durable turn/event queue, source message, selected tool action/outcome, response, lease, attempt count, freshness references and cost accounting.
2. `preparation_runs.delegation_goal`: concrete main-agent investigation objective.
3. `preparation_steps.cost_settled`: settle native tool call costs exactly once even if the tool has already committed a terminal result.
4. Trace references on conversations, turns, investigation runs and steps correlate a durable conversation across process restarts with native Mastra spans.

Incremental publication stores dependency fingerprints and changed/retained criterion IDs in the existing `preparation_steps.output` JSON. No new migration is required; older results without that baseline require explicit reaffirmation. Prior limitations remain conservative when findings are retained.

Existing tables remain the source of truth for requests, documents, mappings, investigations, questions, observations, results and event streams. No reset, replacement checklist, shared migration or backfill is required. No automatic mapping gate is enabled. Migration `023_criterion_confirmation_policy.sql` adds opt-in criterion policy (empty by default), with no backfill or automatic waivers.

`BORROWER_AGENT_CHAT=1` opts the existing chat endpoint/composer into durable free-form main-agent turns. The existing `BORROWER_PROCESSING_CHAT=1` gate still applies. Reads never execute agents. The isolated `scripts/borrower-agents-worker.ts` tick requires an explicit live-execution flag, synthetic application/file registry, shared ledger and explicit budgets; it is not started by the app. The user authorized an isolated local deployment. Live dataset cases still require their individual approval; a spend cap alone does not approve cases.

## Observability

Both agent transports are decorated with local Mastra observability without bypassing spend accounting. Each freshly created agent is attached to the Mastra instance. Native agent/model/tool spans are linked beneath the durable turn or investigation step, and later turns share the conversation trace. Stored opaque trace references allow correlation across restarts. Prompt/configuration digests identify the implementation being measured.

Default exports retain metadata, timings, token usage, actual/unknown cost and sanitized errors; raw documents, prompts, outputs and credentials are omitted. Authorized application records retain the evidence and findings. Local LibSQL plus DuckDB storage supports native trace/score queries and future Studio inspection; no cloud exporter is configured. `npm run mastra:pilot` serves native Mastra Studio and its read APIs on loopback (default port 4111), in the same process as the optional bounded worker. Native read-only POST analytics queries are allowed; generic generation/mutation endpoints are disabled so they cannot bypass the controller. Evaluation integration is owned alongside the dataset work under `lib/evaluation-observability`.

## Verification boundary

Native Mastra execution is tested with a deterministic model protocol, including actual backend tool execution. Real local parsers/OCR and disposable PostgreSQL schemas are used. These tests prove wiring, persistence, budget/freshness behavior and file reading, not model quality. Live provider evaluation also requires an approved case and the explicit bounded runner configuration. Final verification results are recorded separately under `artifacts/testing/two-agents/`.
