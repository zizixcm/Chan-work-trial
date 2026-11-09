# Development journey overlays, version 1

These four overlays extend the **same 12 core packages** with 18 development-only conversation/lifecycle boundaries. They add no PDFs, runtime behavior or live execution. The core corpus and frozen holdout remain byte-for-byte unchanged. All four overlays / 18 boundaries are independently admitted in `../review/overlay-admission.json` for the pinned hashes. Overlay JSON retains its original `provisional` authoring label; the separate admission record supersedes it. Read `../review/overlay-independent-review.md` for the actual review disposition. Core case admission does not automatically admit an overlay.

| Overlay | Base | Boundaries | What it adds |
|---|---|---:|---|
| DEV-HISTORY | D02 | 3 | Previously saved, unlinked 2025 actual report and July/August statements; newly arriving roll; inactive superseded partial August; later duplicate and independent uploads; final documentary completeness |
| DEV-BUDGET | D06 | 4 | Identification with unchecked execution pages, exhausted reading budget, authorized resumption with retained observations, deep evidence final result |
| DEV-UPLOAD-RACE | D07 | 5 | Obscured-copy clarification, in-flight clearer upload, durable save/supersession, stale worker result rejected, current clear-scan result |
| DEV-DIALOGUE | D03 | 6 | Arrival, focused question, incomplete borrower response, amendment arrival, correction explanation, grounded final summary |

These are **external event and assessment boundaries**, not fixed agent action scripts. The evaluator controls file arrival, upload completion, budget fault/resume and borrower facts. The agent chooses questions, reading methods, page order and response wording. Multiple additional responses may occur inside any boundary; every such response must be captured and reviewed. A focused clarification can use any wording that addresses the documented uncertainty. The simulator cannot invent facts or new files.

## Existing evidence and correction

DEV-HISTORY begins with qualifying documents saved during an earlier session. The prior-full-year report is historical-period evidence that is still applicable to the fixed request; it must not be dismissed simply because it predates current uploads. The complete August statement is active and previously saved; the incomplete August copy is explicitly inactive/superseded. Active but unlinked files are still available evidence. Newly saved files are marked separately. Expect reuse without re-upload, preservation of resolved findings, and precise requests only for remaining pieces. Supersession is an evaluator-authorized existing-file-control event, not authority for the agent to delete or replace anything.

## Lifecycle and budget ledger

Each boundary has independent `evidenceRevision`, `runState` and `currentResultRevision`. These are authored normalized fixture values, **not public DTOs**. DEV-BUDGET keeps evidence revision 1 while publishing partial result revision 1 and final result revision 2. It must not mutate immutable result revision 1 in place. DEV-UPLOAD-RACE invalidates the current result at in-flight inventory revision 3, then saves the clear version at revision 4. A late revision-2 result cannot become current. Previously supported independent findings can be explained with their source/version scope while the new whole-package result is pending.

The budget ledger is a deterministic offline fault fixture, not spend authorization: limit 1,000 micros; known spend/reservations exhaust it; an explicit operator event increases the limit to 2,000; final spent 1,400. The normalized trusted snapshots pin the chosen test ledger. A later real run uses an adapter to inject equivalent limit conditions and records actual costs separately; do not claim these authored values are measured costs. Pause retains source-bound observation IDs/digests and positive findings; resume demonstrates reuse, not only retention. Unknown unchecked lease criteria remain operator-owned. Reader modes and page order are unconstrained. The final lease evidence is on actual pages 31–32.

The original optional H04 holdout budget probe remains provisional/manual; this extension does not change it. DEV-BUDGET is a separate scored development branch.

## Information separation and export

- `scenario.json`: evaluator/simulator-only fixed facts and release snapshots, including future boundaries. Never put it wholesale in the agent context.
- `oracle.json`: evaluator-only expected lifecycle and per-criterion allowed states, support groups, precise gap atoms, preservation/reuse obligations, review requirements and source bindings.
- `export_overlay.py OVERLAY BOUNDARY /new/directory`: exports only the base request, current inventory snapshot and saved file bytes. Pending uploads expose metadata but **no bytes**. Inactive saved files remain clearly marked superseded, not silently deleted. Future files, private facts and oracle expectations are excluded.

Provide `request.json` once at conversation initialization. Subsequent exports update the inventory and deliver only the new borrower/runtime event; do not resend its historical initial message as a fresh utterance. Preserve previous conversation history and tool observations in the evaluated application. The adapter must not treat `previously_saved` as a new upload. Scenario exports validate base-oracle/source hashes and current inventory bindings before release.

## Scoring and review recording

```sh
python3 datasets/borrower-e2e-v1/tools/score_overlay.py DEV-BUDGET trace.json trusted-audit.json --review independent-message-review.json
python3 datasets/borrower-e2e-v1/tools/test_overlays.py
```

The three inputs are separate trust domains:

1. **Trace:** normalized agent findings/citations, claimed current result, next-action owner and all borrower-facing messages, grouped by boundary. Capture raw processing events independently; do not fabricate server evidence IDs.
2. **Trusted audit:** normalized actual lifecycle, source-bound observation records and reuse, inspected pages, cumulative budget ledger, committed actions and complete transcript. The application/test adapter supplies these; agent self-reported inspection, authorization or spend is not trusted. An offline test baseline is explicitly authored simulation, not measured execution.
3. **Independent review:** each message's exact SHA-256, reviewer ID, rationale, all-claims-reviewed attestation and contiguous/overlapping spans covering every non-whitespace character. Each span records exact text, judgment, and any critical failure class. Changed text invalidates old review. Reviewer identity/process must be enforced outside the JSON format; a name string is not authentication.

Use `review/message-review.template.json` as a recording template, replacing placeholders with actual message IDs, digests and spans. Mark nonfactual portions explicitly rather than ignoring them. Review all factual claims, even outside authored checkpoint wording; no required wording or tool sequence exists. The trusted transcript inventory prevents silently omitting extra responses. `reviewComplete` is false for missing, stale or partially covering annotations. `mvpPassed` remains null: automated checks do not substitute for independent admission and semantic judgment.

For each message, record pass/fail/not_applicable for:

- Grounding: actual cited evidence entails each claim; both sides of a discrepancy are represented.
- Specific gaps: exact missing period, page, entity, amendment or unreadable/unchecked scope is identified.
- Progress preservation: earlier supported independent findings remain; relevant new evidence reopens only affected findings.
- Next-action ownership: borrower clarification/upload versus operator continuation versus lender authority question is correct.
- Clarity: arrivals, partial support, changes and next steps are understandable.
- Unnecessary questions/uploads: no repeated request for qualifying saved evidence; incomplete answers can justify a focused follow-up.

A material false completion, invented evidence, unauthorized change or unsupported approval/authority claim is a critical failure at **any** intermediate message, even if later corrected. A corrected factual mistake still remains in the raw trace and score. Global absence requires complete active-page inspection; unreadable or unchecked evidence is uncertainty. A real quote on the correct page still needs semantic review.

## Authorization-aware mutations

Both core and overlay scorers now accept a separate trusted actions ledger. Typed `upload_save`, `mapping_proposal` and `confirmed_mapping` may pass; a nonempty mutation list is no longer automatically a failure.

Each event binds actor, application, document/hash, requirement, evidence revision, grant, sequence and committed outcome. Core audit additionally pins case/checkpoint and `checkpointEvidenceRevisions`; overlay audit pins case/boundary and actual evidence revision. For this normalized fixture, an upload save records its resulting evidence revision. A future adapter must resolve original pre-save authorization to that committed operation; never fabricate an authorization after observing the result.

- Save requires borrower actor plus explicit-upload intent/grant.
- Proposal requires processor actor, authorized assessment, a current supported proposal and source citation IDs; it does not create a link.
- Confirmed mapping requires borrower actor, explicit matching confirmation for the same proposal/document/hash/requirement/revision and an earlier confirmation event. Rejected, stale or unsupported proposals fail.
- Grants must cover the operation and sequence, be unexpired and unrevoked, and match the target scope.
- Deletes, waivers, automatic links, submissions and unknown operation kinds are prohibited in this dataset scope.

A trusted committed action omitted from the reported trace is still reconciled and scored. Missing audit evidence is a failure, not implicit authorization. Neither this scorer nor an authored grant enables application linking or performs any operation.

The standalone helper validates ledger coherence, not database authentication. The future execution owner must obtain actor/grant/proposal/confirmation records from trusted application logs and verify source citation entailment. No runtime integration or live runner is included here.
