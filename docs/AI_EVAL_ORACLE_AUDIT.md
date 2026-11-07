# Independent AI evaluation oracle audit

Audited 2026-11-07, including a second review of the coordinator's corrections. Scope: local synthetic evaluation fixtures, scoring, preparation/validation contracts, the two recorded model-comparison reports, the active catalog, and `AI_PACKAGE_EVAL_SPEC.md`. No private loan documents were read, no provider calls were made, and no implementation or test files were edited by this reviewer. Findings below preserve the original diagnosis; the final disposition records the revised state.

The original 22/28 exact-label pass count is a faithful description of the saved reports, but it is not a trustworthy estimate of current package-review correctness. Two recorded formula disagreements have a defensible model answer and an incorrect strict oracle under the current contract. The original cases test a deliberately small requirement, not the active catalog rent-roll requirement. **After corrections, no P1 oracle/scorer blocker remains for a bounded exploratory run of the explicitly narrow synthetic coverage and matching fixtures.** This is not approval of full-catalog completeness labels or a claim of measured model accuracy. Missing-reason prose remains subject to human adjudication.

## Findings and corrections

Severity meanings: **P1** can invalidate a correctness or safety conclusion; **P2** materially limits diagnosis, reproducibility, or coverage. Locations below identify the originally audited version unless a later disposition is explicitly recorded.

### P1 — The CSV formula oracle contradicts the evidence rules

**Locations:** `lib/evals/cases.ts:11`; `lib/analysis/validation.ts:72`; `lib/analysis/prepare-csv.ts:24`; `lib/analysis/fulfillment.ts:6`; both formula results in `artifacts/ai-evaluations/comparison-1794084619592.json`.

The complete, readable CSV contains a literal `=SUM(A1:A9)`, rather than a numeric rent amount. CSV preparation neither evaluates it nor declares an extraction limitation. The requirement asks for a supplied numeric amount. Therefore identity is met and rent is unmet: `partially_fulfilled`. Both recorded model explanations identify exactly this defect. A formula's unknown mathematical result does not make it unknown whether the supplied CSV contains a numeric amount.

**Correction:** use `partially_fulfilled` with exact criterion states for this CSV case. Add a separate workbook-formula case with the actual preparation limitation if the intended behavior is conservative uncertainty about cached/recalculated values. Preserve the original reports and record an adjudicated rescore separately. Relabeling does not prove the current prompt performs correctly; the saved runs use `document-review.v6`, while the inspected runtime uses v7.

### P1 — Aggregate-only scoring can pass wrong findings and unsupported reasoning

**Locations:** `scripts/evaluate-models.ts:25`; `lib/analysis/validation.ts:26` and `:42`; `lib/analysis/verify.ts:29`; original `lib/evals/packages.ts:63`.

Exact citation validation proves that text exists at a supplied source address, not that it supports the criterion. A local, provider-free probe marked both identity and numeric rent as met in the missing-rent case while citing only the exact `Demo Plaza` cell. Validation accepted it and fulfillment became `fulfilled`. This is a semantic boundary of the validator, not evidence that actual models made that mistake. Conversely, a partial result can get the aggregate right while reversing which criterion is missing. Arbitrary limitations or invented conflicts can also produce the expected unknown status.

**Correction:** the evaluation oracle needs every expected criterion state, required supported facts/source groups for each met check, prohibited unsupported claims, exact missing-component identification, and the intended conflict/limitation rationale. Test the scorer against deliberately wrong outputs, including swapped states, identity-only citations for rent, all-but-one criteria incorrectly unmet, irrelevant two-cell conflicts, and arbitrary unknowns. Keep structural citation validity distinct from semantic evidence support.

### P1 — Outcome-bearing IDs and verbatim answer text leak into prompts

**Locations:** original `lib/evals/cases.ts:14`; `lib/analysis/validation.ts:64`; original `lib/evals/packages.ts:35`–`:36`.

Original document IDs such as `complete`, `missing-rent`, and `wrong-property` reach the model in the numbered evidence payload. New package criteria initially copied the entire source text into `Required content`, including amounts, lease changes, and claims belonging to omitted documents. The prompt says requirement text is not evidence, but exposing answers creates an avoidable confound. Package criterion `component-1` and source `doc-1` also form a predictable lookup shortcut.

**Correction:** use opaque stable document IDs that do not encode labels, the omitted position, or expected states. Keep case IDs, expected labels, required-component manifests, and oracle source maps outside the provider payload. Author requirements independently of source prose: request the necessary subject, period, document role and fields without embedding the values to be discovered. Subjects and requested dates are legitimate query parameters; actual undisclosed amounts, predecessor changes and expected conclusions are not. Add a prompt-content audit and renamed/reordered-document invariance cases.

### P1 — The shared package scenario has inconsistent YTD rent and tenant identity

**Locations:** original `lib/evals/packages.ts:21`, `:28`–`:31`, `:50`.

The income statement reports 25,000 for January–May 2026. The original lease starts January 1 at 4,000 per month, and its amendment increases rent to 5,000 effective May 1. The disclosed base-rent schedule totals **4 × 4,000 + 5,000 = 21,000**, absent other income or an explicit reconciliation. The assignment changes the tenant to Sample Clinic Operations LLC on March 1, but the June 15 requirement subject and May rent roll initially name Sample Clinic LLC without identifying it as the predecessor.

**Correction:** use 21,000 or author a specific, independently supported 4,000 difference; do not silently multiply current rent by five months. State original and current tenant roles explicitly and make the current rent roll consistent. The initial coverage slices do not assess rent reconciliation, so their all-met aggregate alone would not expose either defect. Verify arithmetic and role transitions before reusing these facts in larger package cases.

### P1 — Tax-order correspondence is not established as a strict irrelevant case

**Locations:** original `lib/evals/packages.ts:47`, `:52`; `lib/analysis/match.ts:9`; `docs/AI_PACKAGE_EVAL_SPEC.md:13`, `:195`, `:199`.

The tax-order email names the correct taxpayer and requested years, and reports that returns are pending. It does not supply actual returns. That conclusively supports an unmet substantive-return check, but it does not by itself establish `not_relevant`: matching is explicitly separate from completeness, and status correspondence can be relevant context. A criterion that explicitly excludes status correspondence can define a narrower candidate policy, but then the experiment measures that declared policy, not a general relevance truth.

**Correction:** either define and label a substantive-evidence-only matching policy before using strict `not_relevant`, or retain the correspondence case as an ambiguity/coverage test and score the actual-return criterion as unmet. Do not count the broad relevance judgment as a gold negative without resolving this contract. The same distinction applies to an appraisal order versus a final report.

### P1 — Conditional catalog criteria cannot be treated as unconditional evidence demands

**Locations:** `lib/requirement-catalog.json:204`; `lib/analysis/fulfillment.ts:3`; `lib/analysis/types.ts:12`; `docs/AI_PACKAGE_EVAL_SPEC.md:95`.

BANK.C5 explicitly applies if no accounts exist. The runtime's three criterion states have no applicability field, and the reducer treats all checks as mandatory. An existing-account scenario must not be failed for lacking a no-accounts declaration, nor made complete by inventing such a declaration. The specification correctly records this unresolved contract. Other conditions such as a required authority resolution, applicable tax schedules, or an unresolved repair condition likewise need explicit fixture applicability and source support.

**Correction:** keep the current BANK experiment labeled as a C1–C2 existing-account coverage slice. Do not use it as proof of full BANK fulfillment. Resolve applicability/alternative-evidence semantics before authoring a complete-catalog positive oracle. Keep exemptions and lender-review facts explicit; do not infer lender policy.

### P2 — The original conflict fixture does not fully identify a contradictory fact

**Location:** original `lib/evals/cases.ts:13`.

Two rows give different monthly rents for the same property/month, without identifying units, total versus component rent, version or supersession. In a rent-roll context multiple rents can coexist. Unknown is conservative, but a strict conflict-detection label should establish that both cells claim the same fact. The fact that one recorded model emitted a conflict does not resolve the source ambiguity.

**Correction:** explicitly label both amounts as the same property's total rent for the same month, same scope, with neither superseding the other. Require both contradictory amount citations and the correct fact-level reason. Add a separate legitimate multiple-unit case to ensure multiple values are not automatically treated as conflicts.

### P1 — Omission must not silently remove identity needed by surviving checks

**Locations:** first revised `lib/evals/packages.ts:30`–`:33`, `:37`, `:41`.

The first revision correctly named current and predecessor tenants in the requirement subject, but only the original lease named the landlord. The assignment and amendment identified the premises; the amendment did not name either tenant. In `lease-missing-1`, the surviving documents therefore did not establish the landlord in the shared subject, while the oracle still required both remaining “with the stated subject” checks to be met. Requirement wording cannot supply missing party facts.

**Correction:** make each chain document independently identifiable by lease ID, premises, relevant party roles, document role and operative date, or explicitly narrow the individual criterion's subject scope. Keep the original, assignment and amendment as unique content roles so a reference to an omitted document cannot replace it. Use per-component requested periods and historical/current roles rather than asking a single historical document to establish all current facts.

### P1 — Matching pass criteria must not ignore false coverage claims

**Locations:** first revised `lib/evals/packages.ts:52`–`:55`, `:62`–`:63`.

Matching initially scored only relevance except for the tax-order case. That would pass a 2025-only return incorrectly marked as meeting the requested 2023–2025 return criterion, or a rent roll incorrectly marked as establishing YTD reconciliation without the income statement or leases. Relevance and coverage are separate outputs; validating one cannot endorse the other.

**Correction:** score every matching criterion. In the current clean, readable synthetic inputs, the rent-roll case has rent evidence met and YTD reconciliation/tax returns unmet; the other three cases have all substantive criteria unmet. Score relevant-state source support separately, including the actual subject/document role. Preserve the tax-order relevance alternatives as unscored semantic ambiguity while requiring substantive returns unmet.

### P2 — Identical duplicate evidence must remain an acceptable source

**Location:** first revised `lib/evals/packages.ts:44`.

The duplicate-cannot-replace-missing case initially added an identical copy of the second component but permitted citations only to the original second-component document ID. A correct assessment citing the identical duplicate would fail the source-group check.

**Correction:** include every supplied equivalent copy in that component's acceptable source alternatives, while leaving the uniquely omitted first component unmet. Add a scorer test where the surviving criterion is supported only by the duplicate's citation. Use opaque identifiers for duplicate documents too.

### P2 — Missing-reason keyword checks accept nonsense and reject valid paraphrases

**Locations:** original `lib/evals/packages.ts:39`, `:64`–`:69`; `lib/analysis/verify.ts:31`.

The original package scorer requires every word of a component label to occur somewhere in one missingEvidence string. It can reject “2023 personal return for Jordan Vale” for lacking the token “tax”, or an “account list” for lacking “inventory”. It can accept “The CASH-1 March statement is not missing” because all tokens are present. It does not prove the exact missing subject, year, account and document role are correctly related. Runtime validation requires only one nonempty gap when any check is unmet, so it does not enforce a distinct explanation per unmet criterion.

**Correction:** define independently reviewed semantic atoms and acceptable synonyms per gap, require the corresponding criterion to be unmet, and explicitly identify this automated score as a proxy unless there is structured gap output or human adjudication. Add both positive paraphrase and negative/negated/generic-reason scorer tests. Do not claim exact missing-component accuracy from simple token inclusion.

### P2 — Empty-source assessment and fulfillment have different behavior

**Locations:** `lib/analysis/verify.ts:30`–`:35`; `lib/analysis/fulfillment.ts:6`–`:9`; `docs/AI_PACKAGE_EVAL_SPEC.md:64`; `tests/analysis.test.ts:61`.

A provider-free probe with zero documents, nonempty criteria all unmet, a missingEvidence explanation, and no limitations/conflicts produces `assessment: unknown` but `fulfillment: not_fulfilled`. The verification normalizer checks document count; the fulfillment reducer does not receive it and ignores assessment. The existing no-evidence test also removes all criteria, so it does not cover this combination. The spec's unconditional “Empty input is aggregate unknown” statement is therefore not true of the whole current contract.

**Correction:** specify expected criterion findings and preparation limitations for empty evidence, then decide whether the intended UI aggregate follows uncertainty or demonstrable missing evidence. Until resolved, do not use the specification sentence as an executable gold label. Do not change the reducer blindly to trust model-supplied summary text; that would undermine the established application-derived aggregation boundary.

### P2 — Existing format positives and source tests prove narrower behavior than their names suggest

**Locations:** `lib/evals/formats.ts:9`–`:16`; `tests/analysis.test.ts:52`, `:69`, `:77`, `:86`; `tests/document-readers.test.ts:13`, `:31`; `tests/ai.integration.ts:38`–`:41`.

The six format cases contain the same three plainly printed facts and test extraction plus a two-criterion synthetic assessment. They do not test negative extraction outcomes, omitted pages, column association, signs/decimals, formulas, complex tables, reconciliation, signatures, multi-file completeness, or active-catalog fulfillment. Source-location tests prove copied text maps to an extracted location; they do not prove OCR correctness or evidence entailment. The “complementary files” tests validate authored outputs, and the “execution status” case intentionally asks only whether text states a status; it does not validate execution. Simulated integration outputs cite the property cell for every met check. These tests are useful plumbing tests but cannot establish semantic model accuracy.

**Correction:** describe these as structural/reader/integration checks. Pair positive and missing/wrong-value format variants, verify independently authored expected extracted facts, and test source context as well as exact quote existence. Use physically distinct multi-file fixtures for omission claims. Add equivalent merged packaging and redundant-copy removal; merely adding a duplicate is a weaker check. Preserve the signature/authenticity boundary in the specification.

### P2 — Recorded failures and manifests are insufficient for a clean model-quality comparison

**Locations:** `scripts/evaluate-models.ts:26`–`:29`; both `comparison-*.json` files; `docs/AI_PROMPTS_EVALS_AND_METRICS.md:40`–`:42`.

The saved reports contain 28 attempts, 24 validated outputs, 22 exact original-label matches, two formula disagreements, and four failures. Failures are collapsed into `call_or_validation_failed`, so the artifacts do not establish whether each failure was transport, timeout, JSON/schema/citation validation, or another issue. A 60-second elapsed time is suggestive of timeout, not a saved classified diagnosis. The semantic report lacks source hashes; neither report embeds the requirement, prepared input, prompt/schema digest, or criterion oracle. Both reports identify v6; the current runtime is v7. They contain no matching calls and no package-omission calls.

**Correction:** preserve safe failure codes/stages, source and prepared-input hashes, exact requirement/oracle version, prompt/schema digests, and model configuration. Save a synthetic manifest sufficient to reproduce a run without relying on changed source code. Report attempted, valid-output, semantic-correct and failure denominators separately. Keep the original 22/28 and any adjudicated historical rescore distinct; neither is a current holdout score. Zero validated false-fulfilled negatives in this tiny corpus does not prove zero false-completion risk.

## Accepted and unresolved oracle labels

These judgments apply to the original two-criterion synthetic rent requirement, not the three compound criteria of active catalog RENT (`lib/requirement-catalog.json:715`). Expected states are in identity/rent order.

| Case | Audited judgment | Expected states / aggregate | Conditions |
|---|---|---|---|
| complete | Accepted | met / met; fulfilled | Both facts belong to the requested subject/period. |
| missing-rent | Accepted | met / unmet; partially_fulfilled | Explain missing numeric rent. |
| blank-rent | Accepted | met / unmet; partially_fulfilled | Blank is not zero. |
| wrong-property | Accepted | unmet / unmet; not_fulfilled | Clearly unrelated property, no documented relationship. |
| wrong-period | Accepted | met / unmet; partially_fulfilled | Identity is period-independent here; November rent is absent. |
| formula-not-amount | Original label rejected | met / unmet; partially_fulfilled | Readable literal CSV, no preparation limitation. |
| injected-instructions | Accepted | met / unmet; partially_fulfilled | Injection text supplies no numeric rent and has no authority. |
| conflicting-rents | Needs source disambiguation | unknown aggregate defensible; strict conflict oracle unresolved until same fact is explicit | Require both sides and distinguish separate units/versions. |
| Six simple format positives | Accepted for the small fixture | met / met; fulfilled | Correct extraction, no preparation limitations; not whole-catalog completeness. |

For the first version of `packages.ts`, no blanket all-met oracle is approved. Full/omit-one aggregate labels are plausible **coverage-slice** labels after independent criterion definitions, exact per-criterion states, source support, scenario consistency and missing reasons are corrected. Tax-order relevance remains unresolved without a narrower declared matching contract. Existing-account BANK.C1–C2 is a valid narrow scope; it is not a full BANK oracle. Full catalog APP/PFS/LEGAL/LEASE positives remain inappropriate when execution or authority cannot be established by the supported extraction contract.

## Specification assessment

The specification correctly separates matching from completion, actual evidence from filenames/folders, content coverage from preparation, unique evidence from file count, and synthetic fixtures from private source material. It correctly warns against treating all files present as fulfillment, universalizing the PFS attachment freshness rule, or inventing execution/legal-review capability. Its criterion appendix matched the inspected active catalog, including suffixed demo occurrence IDs from `requirement-catalog.ts`.

Two implementation-facing details require explicit resolution: the empty-source aggregate discrepancy above, and a consistent omission-state convention. Missing required evidence in a readable bounded supplied set supports an unmet finding; inaccessible/unreadable/truncated evidence supports unknown. The spec sometimes says a missing comparison is unknown and sometimes says it is unmet/unknown. Each runnable fixture must state which situation it represents. A hypothetical inaccessible source is not the same as a deliberately omitted readable file.

For future package arithmetic, preserve monthly versus YTD periods, cash versus accrual timing, account and owner scope, ownership percentages, and tax income versus cash distributions. Derive expected totals independently and record any assumptions. The catalog does not authorize arbitrary freshness cutoffs, universal resolution documents, or undocumented waiver rules.

## Verification performed

- Read the listed source files, active catalog definitions, evaluation specification, synthetic comparison artifacts, and relevant reader/validator/integration tests.
- Counted recorded outcomes and inspected both formula explanations and the saved conflict response.
- Ran two provider-free validator/reducer probes: unrelated exact source citation accepted as support; zero-document unknown assessment reduced to not_fulfilled under all-unmet checks.
- Independently recomputed the shared synthetic lease-to-YTD base-rent total as 21,000.
- Did not execute provider calls, inspect private loans, or infer external lender policy.

## Final disposition after corrections

Reviewed revised `lib/evals/cases.ts`, `lib/evals/packages.ts`, new `lib/evals/score.ts`, new `lib/evals/reasons.ts`, `scripts/evaluate-models.ts`, and `tests/eval-oracles.test.ts`. Original comparison reports are unchanged in the workspace status. The independently rerun targeted tests passed **21/21**, including eight oracle tests, eleven analysis contract tests and two fulfillment tests. After the final test-citation correction, the eight oracle tests were independently rerun and again passed **8/8**. Those are deterministic validation/scoring checks, not live model observations.

| Finding | Revised disposition |
|---|---|
| CSV formula expected unknown | Corrected to partial. Accepted for the stated literal-CSV scenario. |
| Outcome IDs and copied answers | Original evidence ID is neutral; package source IDs are opaque; criteria no longer copy source text. Expected manifests stay outside provider payloads. |
| Shared YTD arithmetic and tenant roles | Corrected to 21,000 and current/predecessor tenant roles. Each chain document now names lease LC-001, premises and relevant parties. Criteria distinguish component role/period. |
| Aggregate-only completion scoring | Every package criterion is checked, and met criteria require the actual content cell from an accepted source alternative. Semantic cases check identity/rent states and amount support. |
| Matching false coverage | All matching criterion states are now scored; the rent-roll positive requires property, tenant, rent and term citations. Subject anchors are required for definite relevant matches. |
| Duplicate citation false negative | Both the original and equivalent duplicate are accepted for their own component; neither replaces the uniquely missing component. |
| Ambiguous conflicting values | Source now explicitly claims two simultaneous totals for the same property/month without supersession. Identity must be met; rent may be met or unknown; aggregate must be unknown and conflict must cite 5,000 and 9,000. Unmet is rejected because numeric amounts are present. |
| Tax-order relevance ambiguity | All three relevance states are accepted for TAX, and the entry is explicitly returned as `unscoredRelevance`. Actual returns must still be unmet. It cannot contribute a definitive TAX relevance-accuracy point. |
| Missing-reason regex overclaim | `structuralPassed`, provisional `reasonScreens`, `reasonAssessment`, and `reviewRequired` are separated. All omission-reason cases require review, even when the lexical screen matches. Mixed and negated prose is routed to review instead of declared a confirmed semantic contradiction. |
| Failure diagnosis and reproducibility | Safe codes/stages, bounded raw synthetic failures, explicit budget-skipped results, full fixture manifests/hashes, and prompt/instruction/schema task manifests are now saved. |
| Empty-source specification claim | The specification now states the actual assessment/fulfillment discrepancy and defers a single gold label. Runtime behavior remains unresolved and is excluded from these new cases. |
| Invalid scorer-test baseline citations | Corrected. Conflict cases use actual cell addresses and met-rent amount evidence; matching classification uses the actual type cell. Matching baseline/false-met mutant and conflict baseline/met/unmet variants now pass through runtime validation before scoring. Independently verified and rerun. |

The accepted package oracle covers **four narrow families and 34 cases**: 4 full sets, 18 unique component omissions, 4 redundant-copy additions, 4 duplicate-for-missing substitutions, and 4 matching cases. Full sets and redundant-copy additions are all met/fulfilled **for their synthetic coverage criteria only**. Each clean omission has exactly its omitted component unmet, the surviving components met with source support, and partial fulfillment. A duplicate substitution retains that same missing component. These labels are not interchangeable with the full YTD, BANK, TAX or LEASE catalog criteria.

The matching coverage labels are accepted for the supplied readable bounded evidence: the rent-roll case has rent evidence met and YTD reconciliation/tax returns unmet; the remaining three matching cases have all substantive checks unmet. A 2025-only return can be relevant to the three-year request while still failing its full coverage check. The tax-order TAX relevance state remains intentionally unadjudicated.

### Remaining limits and follow-up

1. **Do not report provisional `passed` as adjudicated semantic accuracy.** For omissions, `passed` combines structural correctness and a lexical reason screen, while `reviewRequired` remains true. Use `structuralPassed` for the deterministic criterion/source result; review actual missingEvidence text before reporting exact missing-component explanation accuracy. Lexical positive matches can still be wrong. The small semantic suite's missing-reason keyword screen is also only a proxy.
2. **The production validator still cannot establish semantic entailment.** Exact quotes and source addresses can be valid while a claim is wrong. The revised evaluation adds independent expected-state/source checks for these known fixtures; it does not turn the general validator into a semantic verifier.
3. **Conditional applicability, empty-source aggregation, execution and lender/legal review remain unresolved outside this slice.** Keep them out of forced full-positive labels. The specification's broader nine-family and multi-format omission matrix has not been implemented by these 34 cases.
4. **Compare only paired executed model/case observations.** The shared cap is consumed in model order, so a default full-suite run can execute unequal case sets. Skipped attempts, transport failures, invalid outputs, structural misses and pending reason adjudications need distinct denominators.

The audit is complete for this scope. The revised suite is suitable for collecting bounded exploratory model observations with the limitations above explicitly preserved. No new provider result is implied by this disposition.
