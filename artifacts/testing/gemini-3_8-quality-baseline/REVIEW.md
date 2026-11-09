# Gemini 3.8 Flash: one-document quality baseline

**The revised run passes this specific investigator case, including semantic review. It is not a full-suite or end-to-end pass.** Review was performed by the evaluation chat separately from execution; the reviewer helped author the rubric, so external author-independence is not claimed.

| Attempt | Configuration | Actual outcome | Calls | Cost | Evaluation wall time |
|---|---|---|---:|---:|---:|
| First | Native output limit 7,680 | Truncated after 7,680 reasoning tokens, no final tool call or assessment | 5 | $0.052394 | 76.878s |
| Revised | 24,000 combined output tokens, explicit medium reasoning | Published all 14 findings; structural and content review pass | 4 | $0.064110 | 75.747s |

The final generation in the passing run used 11,722 output tokens: 9,304 reasoning and 2,418 visible output. This exceeds the original allowance and fits within the revised allowance. The increase was available capacity, not a requirement to spend all 24,000 tokens. Total cost of these two attempts was $0.116504. Shared ledger totals also include unrelated pilot activity and must not be presented as this test's cost.

## Actual result

- Correctly recognizes the 2025 actual operating statement: rental income $49,368, operating expenses $16,456, NOI $32,912, for Aster Quay.
- Correctly accepts the declared absence of lease amendments for applicability only. Executed leases remain required.
- Entity-document output: **“Operating agreement for Aster Quay Holdings LLC is required.”** It does not request nonexistent entity amendments.
- Correctly identifies the missing rent roll, executed leases, January–September 2026 actuals, July/August/September bank statements for account7317, formation certificate and operating agreement.
- Only two criteria are met; twelve are unmet. The document package is correctly incomplete. Both comparison findings explicitly explain that inputs are missing. The preregistered rubric allowed this use of unmet; no expectation was changed after seeing the result.
- Both document citations exactly match the inspected source text and document hash; the no-amendments assertion refers to the actual stored borrower declaration. No fabricated citations or unsupported completion/approval claims were found.

The native sequence was inspect → read page1 → propose mapping → publish assessment. There were no validation rejections. Text-reading limitations were retained, and the model made no visual signature/authenticity finding. The lease-comparison gap's period metadata uses the policy review date; its description does not demand leases dated on that date. This is a minor presentation cleanup for future UI review, not a changed document requirement.

## What changed and what did not

Only dedicated evaluation generation settings changed: the native output cap and matching guard cap, plus explicit medium reasoning. The model, controller, prompts, source PDF, declaration, criteria and rubric stayed fixed. Rubric SHA256: 9ef91509827717afc876dac13e0b11ff6c171a1b6ccc4ea82039f72e56773cba. The first failed run is preserved. Production pilot settings were not changed.

Verification: 134/134 unit tests, TypeScript, three guard tests (including the actual native Mastra/OpenRouter SDK request against a mock endpoint) and the offline task probe passed. Live cost reservations settled; no held cost remained. Deployment owner confirmed the portal and Studio were healthy and the pilot worker restored. No further paid runs or cheaper-model sweep were started.

## Evidence

Revised run directory: `/Users/chanrao/Developer/proximity-releases/investigator-model-comparison-20261108-v2/artifacts/testing/live-quality-3_8-flash-v2`. It contains configuration/source/rubric hashes, every private model input and native output, submitted actions/tool results, candidate-report.json, native trace, and SEMANTIC_REVIEW.json. Trace:30b2298687458b17beddd543fa5ad6fc.

First run directory: `/Users/chanrao/Developer/proximity-releases/investigator-model-comparison-20261108-v1/artifacts/testing/live-quality-3_8-flash`.

Remaining scope: a single successful synthetic investigator task does not establish stability, broader dataset quality, borrower-agent follow-through, or full-journey performance. It is a useful quality baseline before further reviewed cases and later price comparisons.

The seven reviewed content checks were also persisted to the existing native Mastra trace as `reviewed-one-pdf-*` scores, version `assistant-review-v1`, through the observability and Studio score stores. `REVIEWED_SCORE_RECEIPT.json` records their provenance as a separate assistant review, not an automatic or author-independent judge. The annotation writer closed successfully and made no model calls.
