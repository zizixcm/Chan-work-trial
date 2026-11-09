# Two-agent compatibility audit — November 8, 2026

Status: source audit complete for the 32 proposed turn seeds, 16 task families, 12 canonical journeys and four overlays. Executable coverage is still being verified. Per-case disposition is in `two-agent-compatibility.json`. Independent dataset admission is not SDK integration verification or user approval. B01 specification approved; B02 held at user's request, not approved.

## Actual ownership boundary

| Owner | Receives | Can do | Cannot do |
|---|---|---|---|
| Borrower agent | Authorized inventory/requirements, recent borrower messages/replies, current processing result or null, pending questions, active runs, current trigger | reply_to_borrower, investigate_documents, answer_investigation_question | Read files directly, publish evidence findings, waive requirements, treat historical text as a current result |
| Investigation agent | Full authorized inventory, delegation goal/scope, source-bound observations, historical priorAssessment, same-actor borrowerMessages/assertions, mapping proposals | inspect_document, read_evidence, search_evidence, propose_document_mapping, request_clarification, publish_assessment | Speak directly to borrower, mutate lender policy, authorize its own mappings, infer currentness from stale prior results |
| Durable controllers | Authorized actor, revisions, grants, ledger, validated tool effects | Dispatch/resume work, reject stale/unauthorized actions, persist questions/results, aggregate completeness | Establish semantic entailment from a matching quote alone |
| Evaluator | Private schedule/gold, actual controller audit, authenticated independent review | Release external events, inject controlled faults, score actual results through native Mastra | Provide gold to either agent or forge controller outputs to match fixture revisions |

Every generation is one native-tool decision. A fresh Agent instance is created per durable step. A delegation/answer tool's message is the borrower-facing response for that step; tests must not require a second reply tool in the same generation. Investigation requests clarification through the controller and borrower agent, not direct simulator access. Exact question/message IDs come from actual persisted records.

## Required corrections

**B02:** a new upload invalidates the whole-package current result. The borrower sees active saved files and historical replies, but currently does not receive a structured priorAssessment. The original approval card assumed current trusted findings were available alongside an unassessed new roll. Revise it to acknowledge saved evidence, avoid needless re-upload, and delegate revalidation. The investigator owns reuse of historical source-bound observations and findings. Do not supply invented current findings in a frozen borrower context.

**B12:** an incomplete answer is still the current borrower answer. Forward it exactly using answer_investigation_question; the specialist decides whether the gap remains. Do not grade the main agent as correct for withholding/paraphrasing it or answering the specialist itself.

**B08 / B14 / I12:** rejection must be observable in authorized context or enforced as a backend test; blocked processing does not create validated findings; investigator input does not expose arbitrary version metadata. Fixtures must contain only fields available through production context.

**I13 / C1:** R2.chain may explicitly opt into no_amendments confirmation. Use the actual criterion ID policy map and same-actor message citation. No such policy is seeded for executed leases or entity authority. Semantic confirmation and contradictory evidence still require review.

**T09 / T12 / C2:** source-bound observations and historical priorAssessment now reach the specialist. Assessment still includes all current criteria. Test reuse and revalidation rather than requiring a partial-schema merge the controller does not implement.

**T13 / DEV-BUDGET:** blocking at the reading limit currently produces waiting_input; it does not itself publish the partial assessment required by the overlay. This is an explicit controller/adapter gap, not a model reasoning failure. Observation reuse after an authorized retry is supported separately.

**DEV-UPLOAD-RACE:** serial upload/assessment alone cannot verify rejection of a late worker. A real interleaving and actual stale-effect rejection must be injected and captured. **DEV-DIALOGUE:** each response boundary must be captured without synthetic extra borrower messages or a mandated question script.

## Tests and format coverage

Loader tests verify all 16 admitted sources and 54 boundaries without executing model evaluations. Native scorer tests verify missing/stale/incomplete semantic review and fabricated/false evidence fail closed. These do not verify all production-controller journeys yet. No live calls are made.

24 format fixtures and three mixed-format journeys remain proposed. Each must use actual supported MIME types, native reader results, exact locations and disclosed limitations. These additional cases need their own concrete fixtures, compatibility checks and explicit user approval; they are not admitted by this audit.

Approval sequence stays paused at B02 until the architecture corrections are presented. B01's approved policy-only response remains compatible with borrower ownership; its frozen runtime snapshot still needs construction.
