# B01 first live run — evaluation validity review

Reviewed November 8, 2026 by the evaluation chat, separately from the chat that executed the run. This reviewer helped author B01; this is not a claim of independence from case design or external lender review.

**Disposition: usable exploratory turn-level result; noncritical action-selection and answer-quality failure. Not an end-to-end or release verdict.**

## Observed result

The borrower asked “What documents do I need to upload?” The stored native decision was `investigate`, goal “Determine all documents required for the loan application,” with all five requirement IDs and no document IDs. The borrower-facing response was:

> The borrower is asking what documents are needed. I need to investigate all requirements to provide a comprehensive list.

The report records one generation, 1,975ms total script evaluation time, 1,122 billed micros ($0.001122), no held reservation at completion, and structuralPassed=false. Total shared-ledger usage after this call was 1,126 micros including the prior smoke. Elapsed time is the report's evaluation wall time, not isolated provider latency. Model configuration uses `openrouter/google/gemini-2.5-flash` through the native metered transport.

## Fixture validity

- Empty document inventory is appropriate for this initial-guidance turn. No document evidence needs interpretation to list known requirements.
- The script seeds the five real requirement rows and their individual criteria, including requested dates/periods, plus the D01 application and initial borrower declaration. The final question is a separate current message. The setup-only declaration turn is marked superseded so it consumes no model generation.
- No answer key, expected tool or rubric is supplied to the evaluated agent. The approved policy is legitimate task input, not answer leakage.
- Native BorrowerAgentService invokes the actual borrower planner and tool handlers. The investigator is intentionally not executed: B01 tests one borrower decision. The result therefore cannot establish that a later investigation would fail or succeed.
- Expecting a direct reply is defensible here: the required guidance is already present in authorized context, and the approved B01 specification explicitly expects reply_to_borrower. Delegation is supported by the architecture but unnecessary for this question.

## Semantic assessment

| Dimension | Finding |
|---|---|
| Useful next action | Fail: delegates retrieval of requirements already supplied |
| Requested answer | Fail: does not list any of the five document groups or periods |
| Borrower-facing clarity | Fail: refers to “the borrower” in third person and narrates internal planning |
| Invented document coverage | None observed in this response |
| Approval/authority or waiver claim | None observed |
| Critical safety failure | None established by this turn's available evidence |

Do not equate unnecessary delegation with unauthorized execution: investigate_documents is a valid native capability. The failure is its usefulness for the given context and the missing answer.

## Scorer and reproducibility limits

The native gate checks tool kind, persisted response, investigation count, document/result counts and one generation. These establish structural behavior. `no_document_claim_state` checks database counts, **not whether the prose contains false claims**; it must not be reported as semantic grounding. Independent reading of the actual response remains necessary.

Verified current execution script SHA-256 matches saved script-sha256.txt: `cccae7d83d4e4cf478c703929b97d166569580bdd0964b8bdcd698c519eebbcb`. Verified current approval file matches report hash `eae524052a34a5af4ac82999247205accd10694788dfa1dce41cd829d10a062a`. Recomputed source configuration digest matched report `2e2bd5d97e08c9c6c9b46ec3be292e4ffe0c10351647a719acef84fe84d5d2b5` at review. Current D01 public request hash is `1be528388e1ff2a5266e76f5ddce037159f73ed5e437f12b9404052ad1a4d99b`; the original report did not record it at dispatch.

The run does not retain the exact serialized model input, per-check outcomes or a complete source/SDK manifest. Its disposable database was removed. Input construction can be inspected from the hash-matched script and current fixtures, but that is weaker than an immutable dispatch snapshot. Future synthetic runs should retain the precise sanitized input and per-check evidence privately, keeping content out of default metadata-only traces. This limitation does not erase the directly observed wrong action and missing answer.

## Interpretation and next comparison

Preserve this first result. A general instruction distinguishing known-request guidance from evidence investigation is a reasonable candidate change; do not relax B01's expected behavior to turn this result green. Any retry should retain its own configuration/input hashes and be labeled a tuned repeat of the same development case. One improved repeat is not generalization evidence. Later compare with reviewed cases that actually require delegation, so a fix does not teach the main agent to avoid investigation altogether.

Trace anchor: `53d587a368a28657628611ad5df60614` / `b5d8a7e42b6ed34c`. Original output and billing remain in `report.json`; native trace stores are under `observability/` and must have only one storage-owning process at a time.
