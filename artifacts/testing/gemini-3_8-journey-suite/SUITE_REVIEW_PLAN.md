# Frozen review policy for Gemini 3.8 Flash journey suite

Authorized by user's explicit request to run remaining reasonable cases. Both agents use Gemini 3.8 Flash, 24,000 combined output/reasoning tokens and medium reasoning. This is controller/database end-to-end coverage with real readers, native Mastra tools, Workflow/runEvals/createScorer and tracing, not browser/HTTP upload coverage.

Run D01, D03, D02, D04, D05, D06, D07, D08, DEV-HISTORY, H01, H02, H03, H04 in order. All corpus/admission/freeze checks remain mandatory. No model/prompt/rubric fixes during this batch, including between development and holdout cases. Holdouts exposed for evaluation are no longer eligible as unseen validation after using their failures to tune behavior.

Exclude DEV-BUDGET (forced partial-publication/pause unavailable), DEV-UPLOAD-RACE (no forced concurrent stale worker), DEV-DIALOGUE (exact response boundaries unavailable). The 32 turn seeds, 16 task families and proposed format extensions are not instantiated stand-alone test suites; do not count journey turns as those cases passing.

Use unchanged source-admitted expected criterion outcomes, evidence groups, gap atoms and transcript specification. Evaluate every boundary and intermediate response. Exact structured-atom mismatches and missing semantic review make automated quality scores fail closed; inspect equivalent supported wording separately without silently rewriting the oracle. Clearly justified unknown findings are conservative limitations, not correct settled oracle findings; distinguish them from confidently false completion. Publication success is not package completeness or loan approval.

Review classification:
- Agent: received sufficient valid context/source access but incorrect finding, unsupported claim/citation, needless request, missed relevant evidence or invalid native tool action. Preserve recovery attempts and initial errors.
- Dataset: policy/source/oracle contradiction, unreachable promised state, or demanded information never supplied. Cite the concrete discrepancy; no speculative dataset blame.
- Harness/runtime: lost/misbound evidence or messages, stale state propagation, scorer false negative, adapter failure, timeout/configuration or unsupported lifecycle simulation. A runtime budget block is not a semantic agent failure.
- Infrastructure/budget: provider/reader outage, unknown accounting or exhausted authorized limits. Record observed failures but mark later unexercised checks blocked.
- Pass only after all required boundary outcomes, material claims/citations and useful borrower replies reviewed. If semantic review remains incomplete, status remains review-required, never pass.

Shared ledger: existing first-pilot-20261108 batch $5, cumulative $20; per application and run $2. Multimodal full-context reservation $1.20 before every call. Never reset ledger, retry uncertain charges, silently raise budgets or change batch to bypass caps. Exclusive owner-controlled dispatch; restore pilot afterwards. Record exact actual incremental spend and held cost.

Review by this evaluation chat is separate from runtime execution but is not an independent second author or external lender review. Preserve raw native/tool/controller records and Mastra traces; rubric/model source hashes freeze before live. No real borrower data.
