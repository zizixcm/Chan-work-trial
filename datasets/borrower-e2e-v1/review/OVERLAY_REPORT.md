# Development journey extension report — November 8, 2026

Added **four development-only overlays with 18 lifecycle/conversation boundaries**, reusing D02, D03, D06 and D07. The 12 core packages, 121 PDF files, core oracles and frozen holdout were not modified. No application/runtime implementation, live runner, provider call, database operation or deployment change was made.

The extension addresses the coordinator's review:

1. **Saved history:** DEV-HISTORY distinguishes previously saved qualifying annual/bank evidence, a new rent roll, active unlinked sources, and an inactive superseded partial August statement. Scoring requires saved-source reuse and retained criterion progress, with no unnecessary re-upload.
2. **Interruption and races:** DEV-BUDGET scores cumulative budget, operator ownership, retained immutable observations, demonstrated reuse and final deep-page support. Partial/final result revisions differ even when evidence stays unchanged. DEV-UPLOAD-RACE scores upload metadata without premature byte access, durable save, supersession, stale-result rejection and current completion.
3. **Conversation:** DEV-DIALOGUE adds arrival/progress, focused clarification, incomplete borrower reply, saved amendment, explanation of correction and final summary. Every spontaneous message is reconciled against trusted transcript inventory. Independent reviews bind exact text digests and full-message span coverage; later edits invalidate review. No exact wording, question sequence, tool order or page-reading order is required.
4. **Authorization:** Saves, supported proposals and explicitly confirmed mappings can pass with matching trusted actors, target/hash, application, case, checkpoint/boundary, evidence revision, grant and sequence. Missing, expired, revoked, rejected or stale authorizations fail. Committed actions hidden from the trace are still scored. Deletes, waivers, automatic links and submissions remain prohibited.

## Exact changed artifact inventory

New:

- `overlays/index.json`
- `overlays/DEV-HISTORY/scenario.json` and `oracle.json`
- `overlays/DEV-BUDGET/scenario.json` and `oracle.json`
- `overlays/DEV-UPLOAD-RACE/scenario.json` and `oracle.json`
- `overlays/DEV-DIALOGUE/scenario.json` and `oracle.json`
- `overlays/README.md`
- `overlays/review/message-review.template.json`
- `tools/authorization.py`
- `tools/build_overlays.py`
- `tools/score_overlay.py`
- `tools/export_overlay.py`
- `tools/test_overlays.py`
- `review/overlay-independent-review.md` and `review/overlay-admission.json`
- `review/overlay-repository-quick-check.log`
- `review/overlay-validation.json`
- `review/overlay-provenance.json`
- This report (`review/OVERLAY_REPORT.md`)

Modified:

- `tools/score.py`: separate trusted-actions input, scoped authorization and committed-event reconciliation.
- `README.md` and `EVALUATOR.md`: linked extension and authorization contract.
- `review/validation.json`: refreshed read-only core hash/extraction validation; no new rendering was necessary because PDF bytes did not change.

All paths are relative to `datasets/borrower-e2e-v1/`. Existing core generation provenance remains the original historical record; extension provenance separately pins changed tools and overlays.

## Offline verification

- **PASS:** 32 overlay/authorization tests, 15 core scorer tests, 3 core export tests (50 total).
- **PASS:** 121 core PDF hashes/page counts and native extraction checks; 250 pages / 4 image-only pages; zero cross-split exact duplicates; frozen holdout hashes unchanged.
- **PASS:** base oracle/document bindings checked by overlay loader, export and tests. Core admission hashes rechecked separately.
- **PASS:** mutation tests cover false completion, stale current results, loss/change of observations, budget reset, unnecessary saved-source re-upload, inactive evidence citation, absent inspection coverage, stale or incomplete message review, hidden unauthorized actions, grant expiry/revocation, wrong actors/scopes/revisions and unsupported confirmation.
- **Repository quick check: FAIL at TypeScript**, after unit tests passed. The log identifies duplicate generated declarations in `.next/types/routes.d 2.ts` (TS2428/TS2717/TS2300/TS2536). No generated build files were edited or deleted; the shared candidate is outside this dataset change. The earlier core report's passing quick check is historical and is not a claim that this later checkout passed.
- Full build/database integration and every browser checklist item: **NOT RUN**. No UI verification claimed.
- Live agent/provider execution: **NOT RUN**. Authored trace/audit baselines prove scorer behavior only.

## Review and remaining limits

All four overlays / 18 boundaries are now independently admitted for offline development evaluation. `overlay-admission.json` pins the reviewed tool, oracle, scenario and source hashes. Generated JSON retains its provisional authoring label; the separate admission record supersedes that label only for the exact reviewed hashes. The independent reviewer separately reran all 50 tests successfully. The unchanged optional H04 holdout budget probe remains provisional/manual.

These normalized ledgers and reviews are not public processing DTOs and do not authenticate a runtime. A future adapter must supply trusted lifecycle, source-bound observations, actor/grant/confirmation records and full transcripts, then validate actual public contracts. Independent reviewers must check entailment, all prose claims, precise gaps, useful questions and action ownership. A matching quote or complete span annotation does not prove the reviewer judged it correctly. `mvpPassed` remains unset; zero critical failures is still required in every actual intermediate and final response.
