# Loan package matching and completion evaluation specification

Prepared 2026-11-07. Scope: specification only; no private source documents, runnable fixtures, provider calls or code changes. The coordinating chat owns fixture generation, tests, scorers and dashboard implementation.

## 1. Authority and interpretation

The current demo is nine requirement occurrences across six folders. The executable definition is `lib/requirement-catalog.ts` (`cre-refinance-demo-v4`) plus the corresponding criteria in `lib/requirement-catalog.json`. Those criteria govern this application's evaluation; they are not universal lending policy. Criterion references below use `FAMILY.C1`, etc., matching the one-based order in that JSON at this specification date. The appendix reproduces the exact current wording. Runtime criterion IDs must be obtained from the actual requirement input, not guessed from these reference labels.

Evidence for the catalog came from a local commercial-refinance needs-list template, its dated follow-up requests, and a limited sample/inventory of the six source folders. The local template explicitly asks for complete returns with schedules, signed financial schedules, account statements, and executed governing/lease documents. A follow-up requested cash evidence after retirement statements had been supplied. This supports category-specific asset verification. It does not establish universal freshness, credit thresholds or acceptable exceptions.

Important distinctions:

- Matching establishes relevance to a requirement, not fulfillment or lender acceptance.
- A folder is merely a collection location. Documents may be missing, stale, duplicated, misfiled, unreadable, for another subject, or superseded.
- The copied nine-folder real-file demo was selected for relevance, not audited for completeness. Its 56 files are not a gold-positive corpus.
- Cross-document criteria require the referenced evidence to be supplied to the evaluator. A file elsewhere on disk, an unlinked sibling requirement, or text in a requirement description is not evidence of a fact.
- A folder may contain sufficient documentary categories but still yield `unknown` because execution, freshness policy or lender/legal conclusions cannot be established by extraction.
- Actual loan approval, creditworthiness, legal enforceability, authenticity and signature validation are outside this evaluation.

## 2. Requirement identities

Base prefix: `33000000-0000-4000-8000-`. Append the 12-digit suffix below, then the occurrence suffix where indicated. Retired base occurrences must not be resurrected by matching.

| Family | Active suffix | Folder | Requirement |
|---|---|---|---|
| APP | `000000000010:demo-v4` | Applications & LOI | Commercial loan application |
| YTD | `000000000015` | Borrower | Current YTD financial statements |
| BANK | `000000000019` | Borrower | Borrower bank & brokerage statements |
| PFS | `000000000008` | Guarantor | Personal financial statement |
| TAX | `000000000009` | Guarantor | Guarantor personal tax returns |
| LEGAL | `000000000007:demo-v4` | Legal | Entity governing documents & signing authority |
| RENT | `000000000001` | Leases | Current rent roll |
| LEASE | `000000000003:demo-v4` | Leases | Lease agreements & amendments |
| VALUE | `000000000037` | Appraisal & Site Visits | Final appraisal report |

VALUE is lender/provider-collected. Relevance must not grant borrower upload permission. Earlier loan-application, legal and lease occurrences remain history; current matching candidates use the suffixed IDs.

## 3. Synthetic scenario and test oracle

Generate all content from scratch, including numbers, layouts and identities. Do not transform a private statement into a public fixture or retain private account numbers, names, addresses, signatures, tax identifiers, filenames, excerpts or scans.

Suggested fictional scenario:

- Borrower: Cedar Lantern Property LLC. Guarantor: Jordan Vale. Lender: Example Community Lender.
- Property: Fixture Court, Unit A; use an explicitly fictional location and parcel `DEMO-PARCEL-A`, not the real subject address.
- Tenant: Sample Clinic LLC. One leased unit, no undisclosed vacant area. One bank account and one brokerage account, expressly enumerated in the synthetic account inventory.
- Fixed assessment date: 2026-06-15. Application policy parameters explicitly accept May 2026 statements, YTD through 2026-05-31, and PFS dated 2026-06-01. These are fixture assumptions, not inferred lender rules.
- BANK requests March, April and May 2026 for each enumerated account. TAX requests 2023, 2024 and 2025. VALUE report dated 2026-06-12 with effective date 2026-06-10 and review referencing that exact version.
- Original lease, assignment and one amendment jointly establish current rent and term. Choose one consistent set of synthetic amounts and reuse it across RENT, LEASE, YTD and VALUE. Include explicit timing reconciliation where collected cash differs from accrued rent.
- TAX has one disclosed pass-through interest per year with corresponding K-1 and Schedule E. Employment income is absent in the baseline. Add a separate wages variant with W-2 support.

Before model use, the coordinator should author a machine-readable evidence oracle containing: requirement ID and definition version; fixed clock and policy assumptions; document IDs and versions; expected subjects/periods; required facts and their evidence locations; alternative evidence groups; applicability declarations; expected matching state; criterion states; precise missing-evidence reason; and expected aggregate under the existing reducer.

File counts are fixture design choices. A combined PDF containing a return and its K-1 can replace two PDFs if all required facts remain available. Removal tests must remove unique evidence, not just a filename.

## 4. Full-set and each-required-file-missing families

For every family, run the full set, then remove EACH named primary component in turn. Also remove EACH cross-document dependency in turn. Record criterion-level deltas even if aggregate remains `unknown`. Do not silently add omitted evidence back from a global corpus.

### APP: signed commercial loan application

Baseline: `APP-form` (all pages, names/type/owners, amount/purpose/property, disclosures and execution area), `LEGAL-agreement`, `LEGAL-amendment`, and `LEGAL-formation`.

- Remove APP-form: APP.C1–C3 have no application evidence; no fulfillment. Empty sources have an unresolved assessment-versus-fulfillment contract; do not assign a single executable gold label (see Section 6).
- Remove governing evidence: APP.C4 cannot establish signer/ownership reconciliation; report missing governing/authority evidence.
- Remove amendment that changes the manager: old manager information cannot establish current signing authority; identify the missing amendment/current-manager evidence.
- Remove only the execution page from an otherwise complete application: APP.C3 unmet if the complete supplied content demonstrates the required page is missing; unknown if the page exists but signature cannot be interpreted.
- LOI is supplementary here, not an alternative application. An accepted LOI alone does not supply application disclosures.

Full-set limitation: native text/OCR cannot validate a signature or authority as a legal conclusion. Do not make APP a forced all-met golden case.

### YTD: income statement and balance sheet

Baseline: `YTD-income`, `YTD-balance`, `RENT-roll`, `LEASE-current-chain`, `BANK-May-cash`, `BANK-May-brokerage`, and `YTD-reconciliation` for disclosed timing differences/unusual transactions.

- Remove income statement: YTD.C1 lacks income evidence; C4 cannot reconcile rental operations.
- Remove balance sheet: YTD.C1/C3 lack the requested position statement and accounting equation.
- Remove roll or lease terms: YTD.C4 lacks the corresponding independent rental-income comparison.
- Remove either account statement: YTD.C5 cannot substantiate that reported account balance.
- Remove reconciliation where the baseline deliberately contains a difference: unresolved discrepancy; cite both conflicting values and request an explanation. Do not silently normalize away differences.
- Different cutoffs or accounting bases: C1/C2 fail or need clarification as appropriate. Do not invent an allowed age if policy parameters are absent.

Possible all-met semantic fixture: all relevant figures, dates, sums and reconciliations are explicitly supplied and deterministic checks confirm arithmetic. Assess current tool arithmetic limitations separately from the content oracle.

### BANK: borrower account evidence

Baseline: `BANK-account-inventory`, six statements (cash and brokerage, each March/April/May), `YTD-balance`, and `BANK-reconciliation` explaining a known balance timing difference and any large transfer. Each statement has an explicit page count and ownership/period header.

- Remove EACH of the six statements: BANK.C2 names the exact missing account and month. Another account's statement or a duplicate adjacent month cannot fill the gap.
- Remove account inventory: do not assert that all entity accounts are covered. Report that account-universe completeness is unestablished.
- Remove YTD-balance or reconciliation: BANK.C3 cannot substantiate the corresponding reported balance/difference.
- Remove a continuation page: page completeness is unmet if explicit page numbering reveals the missing page; unknown if the extraction was truncated rather than the document itself.
- Personal/trust statements cannot substantiate entity-owned cash without explicit ownership/access evidence. A retirement statement cannot be treated as unrestricted bank cash.

Conditional branch: BANK.C5 applies when there are no accounts. Baseline explicitly has accounts, so a universal demand for a no-accounts declaration is wrong as business semantics. However, the runtime currently treats every criterion as mandatory and has no `not_applicable` state. Record this as a definition/contract gap; do not silently assert that this branch is implemented or mark a missing no-accounts declaration as met. Use a separately labeled policy-normalized experiment only if the coordinator explicitly defines branch handling. A no-accounts declaration is an exception path requiring lender review, not automatic fulfillment of C1–C4.

### PFS: guarantor assets, liabilities and income

Baseline: `PFS-form`, every referenced attachment (`PFS-assets`, `PFS-debts`, `PFS-real-estate`), and TAX returns/K-1s needed to support the reported income and entity interests. Include explicit absence of contingent obligations if none, rather than blank fields.

- Remove EACH referenced attachment: PFS.C1/C2 name the missing schedule and unsupported categories; a reference saying “see attached” is not evidence.
- Remove PFS-form: attachments alone do not supply its declarations and execution.
- Remove relevant tax support: PFS.C5 cannot reconcile that income or entity interest.
- Supply joint or entity assets at 100% personal ownership despite contrary ownership evidence: conflict, not available personal net worth.
- Swap unrestricted cash for IRA evidence: relevant asset evidence but fails cash classification/support.
- Self-prepared attachment 31 days before the fixed assessment date: violates the template's 30-day attachment rule. This is not a universal 30-day rule for every document.

Full-set limitation: execution/authenticity and any unsupported valuation remain unknown. A high net-worth number does not establish accuracy or loan approval.

### TAX: three years of returns and applicable schedules

Baseline primary components for EACH year 2023, 2024 and 2025: `TAX-return-Y`, `TAX-ScheduleE-Y`, `TAX-K1-Y-entity1`. Include PFS evidence for TAX.C4 and explicit explanations for any deliberately nonrecurring gain.

- Remove EACH year's return: TAX.C1 specifies the missing year.
- Remove EACH Schedule E or K-1: TAX.C2 specifies the year and disclosed interest lacking support, but only if equivalent pages are not already included in the full return.
- Remove PFS: TAX.C4 comparison is unestablished; tax content itself may still match.
- Wrong taxpayer or business return in place of personal return: wrong subject/form, not a substitute for the missing personal return.
- Latest amendment missing where an amendment is disclosed: flag unresolved current return version.
- Extension alone: explains unavailable return but does not satisfy the current full-return requirement without a documented exception.
- In the wages variant, remove W-2 support and test missing applicable wage evidence. In the no-wages baseline, absence of W-2s is not a defect.

Alternative packaging tests: merge return + schedules; omit the standalone duplicate and expect no semantic regression. Then remove the only remaining copy of a required K-1 and expect the precise missing-support finding.

### LEGAL: identity, governing documents and authority

Baseline: `LEGAL-formation`, `LEGAL-agreement`, `LEGAL-amendment` (changes manager), `LEGAL-ownership` (may be embedded in agreement/amendment), `APP-form`, plus an authority resolution ONLY in the variant where the agreement requires it. Add a lender/legal review record for deliberately introduced conflicting information.

- Remove formation evidence: LEGAL.C1 identity comparison lacks a source.
- Remove agreement: LEGAL.C2/C4 cannot establish the governing provisions.
- Remove known amendment: LEGAL.C2/C3/C4 lack current manager/ownership information.
- Remove ownership evidence: LEGAL.C3 cannot identify percentages or reconcile their total.
- Remove application: LEGAL.C1/C4 cannot verify application identity/signer against authority.
- Remove required resolution in the resolution variant: LEGAL.C4 unmet/unknown as supported by the text; resolution is not universally required when the agreement grants adequate authority.
- An EIN letter, business search or beneficial-owner certification alone is not a substitute for an executed governing agreement.

Trust certification is conditional on trust ownership/authority being relied on. Do not require a trust document for every LLC. A filed amendment and a current status search are not automatically amendments to the operating agreement; evaluate actual contents.

Full-set limitation: signature/authenticity and legal conclusions remain human-review issues. The local inventory did not prove a complete executed authority chain.

### RENT: current rent roll

Baseline: `RENT-roll` with subject/as-of date, each unit/tenant or vacancy, area, start/end dates, base rent, reimbursements and concessions; `LEASE-current-chain`; `YTD-income`; reconciliation for any timing differences.

- Remove roll: RENT.C1/C2 lack the requested schedule.
- Remove lease evidence or income statement: RENT.C3 cannot establish the relevant comparison.
- Remove a row for a unit known from the lease/property evidence: coverage/occupancy conflict, not a complete roll.
- Strip lease dates, rent, reimbursements or concessions columns: RENT.C2 fails the specific missing part. Explicit zero is evidence; a blank cell is not automatically zero.
- A property name, tenant name and matching heading cannot substitute for missing rent amounts.

Possible all-met content fixture with complete extracted table and supported comparison data. CSV and XLSX representations should yield the same semantic conclusion; formulas without calculated values may introduce extraction limitations.

### LEASE: original agreement and current document chain

Baseline: `LEASE-original`, `LEASE-assignment` changing the landlord to the borrower, `LEASE-amendment` changing rent/expiration, `RENT-roll`, and `YTD-income`.

- Remove original: amendment alone may omit essential base obligations; identify the specific missing base terms.
- Remove assignment: LEASE.C1 cannot establish the current landlord chain.
- Remove amendment: LEASE.C2/C3 use obsolete terms or conflict with RENT; identify missing current amendment, not “wrong rent roll” without qualification.
- Remove roll or income statement: LEASE.C4 lacks the corresponding comparison.
- A fully restated executed agreement can replace predecessor agreements ONLY if it explicitly incorporates/supersedes relevant terms and the necessary party/assignment history is established. Do not require old files just because the baseline uses them.
- Estoppel and SNDA are supplementary evidence, not automatic substitutes for missing leases. No SNDA or estoppel requirement is active in this nine-item demo.

Full-set limitation: an execution-page image with extracted names is not proof of signatures or enforceability.

### VALUE: final appraisal and version-specific support

Baseline: `VALUE-final` (complete latest report with all required sections), `VALUE-review` explicitly referencing its version/date, `RENT-roll`, `LEASE-current-chain`; include repair-resolution evidence ONLY if the report imposes an unresolved repair condition.

- Remove appraisal: review/order/site visit alone cannot supply the report's complete analysis.
- Remove version-specific review: VALUE.C2 cannot establish that lender review covers the report used.
- Substitute review of an earlier appraisal: identify the review-version mismatch even when property and value are unchanged.
- Remove value-analysis/assumptions pages: VALUE.C3 is unsupported; cover/transmittal pages alone are insufficient.
- Remove roll or lease evidence: VALUE.C4 reconciliation is unestablished.
- Remove required repair-resolution evidence: VALUE.C5 identifies the unresolved condition.
- Replacement-cost estimate is not market value. Parent tract parcel/area is not necessarily the unit collateral. “Go-dark” value and leased-fee value must retain their respective premises.

Full-set limitation: complete source PDF can exceed the extraction page cap; completeness must be unknown when relevant pages were not prepared. The real-file selection contains a revised appraisal but not a demonstrated matching review; it is intentionally NOT a full-positive oracle for VALUE.C2.

## 5. Matching positive, negative and ambiguous matrix

Run each primary document against all nine active requirements, not only its intended family. Permit multiple relevant requirements where the document supplies genuine comparison evidence.

| Synthetic document | Positive/supporting matches | Negative or ambiguous cases |
|---|---|---|
| Application | APP; supporting LEGAL | LOI-only must not be treated as completed APP |
| YTD balance/income | YTD; supporting BANK/RENT/LEASE as applicable | Wrong entity/year or a budget mistaken for actual YTD |
| Entity account statement | BANK; supporting YTD | Same statement from guarantor, other entity, wrong account/month |
| PFS and schedules | PFS; supporting TAX | Sponsor biography, credit report or net-worth summary missing declarations |
| Personal return/K-1 | TAX; supporting PFS | Business return, another taxpayer, tax-order email, extension-only |
| Operating agreement/amendment | LEGAL; supporting APP | Unrelated LLC, unsigned template, EIN letter alone |
| Rent roll | RENT; supporting YTD/LEASE/VALUE | Statement of rent collected without unit/lease fields; unrelated property |
| Lease/amendment/assignment | LEASE; supporting RENT/YTD/VALUE | Wrong premises; expired predecessor represented as current; SNDA-only |
| Appraisal | VALUE | Invoice, order email, site photos or replacement-cost sheet represented as final appraisal |

Treat obsolete-but-same-subject material as relevant historical evidence with explicit period/version limitations; do not conflate relevance with currency. For a definitely different subject with no documented relationship, use not_relevant for the subject-specific request. For an unclear entity relationship, masked identity, missing dates or unreadable pages, use ambiguous rather than inventing identity. Document relationship can support multiple roles; raw name mismatch alone is not always decisive (e.g. documented assignment or trust ownership).

Content must dominate filenames/folders. Include misleading names (`final-appraisal.pdf` containing an invoice), shuffled filenames, correct content named `scan.pdf`, duplicates, reversed order and mixed-subject folders. Model must not treat filenames saying “signed”, “approved” or “complete” as evidence of those facts.

Email substantive-evidence negatives, generated synthetically: (1) entity tax-order submitted/pending; (2) guarantor tax-order submitted/pending; (3) appraisal order sent for bids with property identifier and due date. These can be relevant ordering/status context, but they do not satisfy TAX or VALUE substantive criteria. Do not use strict `not_relevant` as an executable gold label without an explicitly declared substantive-evidence-only matching policy; otherwise leave broad relevance unresolved and score the actual-return/report criterion as unmet. The six-folder inventory contains three `.msg` emails and no `.eml`; the broader package has `.eml` elsewhere. Any future email with actual reports attached must evaluate extracted attachments separately and acknowledge unsupported attachment extraction.

## 6. Outcome and evidence rules

Use the actual `lib/analysis/types.ts`, `verify.ts`, `validation.ts`, and `fulfillment.ts` contracts. They distinguish `met/unmet/unknown`, `appears_complete/incomplete/unknown`, and UI fulfillment states.

- `met`: each required part of that criterion is supported by actual supplied evidence. Include exact document/record/column/quote references; cite both sides for reconciliation.
- `unmet`: the supplied evidence demonstrably fails or lacks a required fact, with a specific missingEvidence explanation. Name the subject, account/year/period or missing clause rather than “upload more documents.”
- `unknown`: evidence cannot be assessed because of extraction, identity ambiguity, policy absence, execution validation, unresolved conflicts or inaccessible comparison sources. Absence from an explicitly complete readable file can justify unmet; absence from a truncated extraction cannot prove source absence.
- Verification assessment normalization prioritizes unknown when any criterion is unknown, any preparation limitation exists, or conflicts exist. A case can therefore have both a specific unmet finding and overall unknown.
- Current fulfillment reducer returns unable_to_determine in those unknown/conflict/limitation cases, partially_fulfilled for a clean mix of met/unmet, not_fulfilled when all evaluated criteria are unmet, and fulfilled only when all are met without missing evidence.
- **Unresolved empty-source contract:** `buildVerifyTask(...).validate` normalizes `assessment` to `unknown` when the source-document list is empty. However, `deriveFulfillment` does not consult `assessment` or the source list: with nonempty all-unmet checks and no conflicts, limitations or unknown checks, it returns `not_fulfilled`. Empty checks return `unable_to_determine`. These are distinct observed behaviors, not a single executable gold expectation. Record normalized assessment and derived fulfillment separately; defer an end-to-end empty-source gold label until the coordinator resolves the contract. Do not invent a limitation merely to force the desired aggregate. See `docs/AI_EVAL_ORACLE_AUDIT.md`.
- **Omission convention:** deliberately omitting unique required evidence from a readable, bounded supplied set supports an `unmet` coverage finding. An inaccessible, unreadable or truncated source supports `unknown`. Each runnable fixture must declare which situation applies; phrases such as “unestablished comparison” in the family proposals do not prescribe unknown for every deliberate omission.
- Every criterion appears exactly once; no extra/duplicate IDs; every citation resolves to the prepared evidence. References to an omitted file are invalid.
- Do not generate an “all files present => fulfilled” expected label. Separate content-complete oracle, preparation sufficiency, and runtime aggregate expectation.
- All-met cases for signatures/authority require capabilities or trusted review contracts that do not currently exist. Do not insert a synthetic prose claim “signature verified” and pretend OCR authenticated the underlying signature. Evaluate extraction-only text facts and unknown execution honestly.

## 7. Required suite construction and reporting

For each family build: full-set baseline; every unique primary-file omission; every supporting-file omission; each required field removed; wrong subject; wrong period; stale predecessor; correct equivalent merged packaging; redundant duplicate removed; duplicate substituted for unique missing evidence; contradictory pair; unreadable required page; truncated extraction; shuffled order; and prompt-injection text that requests automatic acceptance.

Store a per-case manifest of the *actual supplied evidence*. Prevent reference leakage from expected labels, hidden fixture names or ground-truth source text into model prompts. Use a fixed clock. Split train/tuning/holdout by fictional loan/party/property, not by near-duplicate file.

Report matching precision/recall separately for primary and supporting relevance, criterion confusion matrix, false fulfillment on negative/unknown cases, exact missing-component detection, unsupported citation rate, conflict detection, justified unknown rate, and preparation-versus-reasoning failures. Show paired full-set/omit-one outcomes and criterion changes. Do not count an unchanged aggregate unknown as proof that missing-file detection failed; inspect its missingEvidence and criterion delta.

No provider execution is requested by this spec. All future model-facing fixtures must be synthetic. Keep private paths and real package contents outside public fixtures and provider payloads.

## 8. Open decisions for the coordinator

1. Explicit applicability/alternative-evidence contract, particularly BANK.C5. Current mandatory-criteria reducer cannot faithfully encode N/A branches.
2. How verification receives cross-requirement evidence: explicit shared links, a deliberate bounded evidence bundle, or a future relationship mechanism. Never assume global visibility.
3. Freshness parameters and authorized exceptions. Apart from the template's self-prepared PFS attachment rule, numerical cutoffs are not established by this investigation.
4. Complete accounts, ownership, tax schedules and amendments: inventories/disclosures establish expected sets; file enumeration alone does not.
5. Human execution, legal-review and version-specific appraisal acceptance evidence: schema/capability boundaries need to be explicit before all-met expectations are defensible.
6. Format/page caps: a 160-page appraisal and multi-year returns are likely to require targeted preparation or honest unknown results. No cap override or model change is implied here.

## 9. Implementation disposition after oracle audit

Coordinator reports 34 implemented narrow coverage/matching fixtures. They must remain labeled coverage slices, not validation of whole active catalog requirements. Full-catalog conditional/signature cases remain deferred. The broader family proposals above are a design backlog; they are not a claim that all scenarios have runnable fixtures or approved gold labels. The independent audit is `docs/AI_EVAL_ORACLE_AUDIT.md`; no audit findings, scorer code or runnable fixtures were changed in this correction.

## Appendix: exact catalog criteria at specification time

### APP: Commercial loan application

Period: Current signed application

- **APP.C1:** Legal borrower name, entity type and ownership/management information are complete.
- **APP.C2:** Requested amount, loan purpose and property address/unit are identified.
- **APP.C3:** Disclosure questions are answered and authorized signatures and dates are present.
- **APP.C4:** Signer and ownership information reconcile with governing documents; material discrepancies are resolved.

### YTD: Current YTD financial statements

Period: Latest available YTD income statement and matching balance sheet

- **YTD.C1:** YTD income statement and balance sheet identify the same borrower and accounting basis.
- **YTD.C2:** Income statement start/end dates and balance-sheet as-of date align and meet lender freshness requirements.
- **YTD.C3:** Balance sheet totals balance; material liabilities and related-party balances are identified.
- **YTD.C4:** Rental income and expenses reconcile with the rent roll and leases, with timing differences explained.
- **YTD.C5:** Bank balances and unusual deposits, expenses or distributions are reconciled with supporting evidence.

### BANK: Borrower bank & brokerage statements

Period: Latest three consecutive statement periods for all entity accounts; lender confirms dates

- **BANK.C1:** Account ownership matches the borrower.
- **BANK.C2:** All pages and requested consecutive periods are supplied.
- **BANK.C3:** Balances reconcile with financials, allowing explained timing differences.
- **BANK.C4:** Restrictions, pledged assets and material unexplained transfers are reviewed.
- **BANK.C5:** If no accounts exist, provide an explicit declaration for lender review.

### PFS: Personal financial statement

Period: Current signed statement; self-prepared attachment within 30 days for this template

- **PFS.C1:** Statement is signed and dated; required declarations and supporting schedules are complete.
- **PFS.C2:** Assets, liabilities, annual income and contingent obligations are disclosed; totals reconcile.
- **PFS.C3:** Personal, joint, trust and entity interests are distinguished and ownership percentages are clear.
- **PFS.C4:** Cash, securities, retirement assets and real estate are classified separately; restrictions and associated debt are disclosed.
- **PFS.C5:** Reported income and entity interests reconcile with tax returns; unsupported values are flagged for follow-up.

### TAX: Guarantor personal tax returns

Period: Complete 2023–2025 returns; lender confirms required years

- **TAX.C1:** Correct taxpayer and all three requested tax years are covered.
- **TAX.C2:** Complete returns include applicable Schedule E, K-1s and other supporting schedules; amendments are identified.
- **TAX.C3:** Recurring income and losses are distinguished from unusual gains, with material differences explained.
- **TAX.C4:** Income, entity interests and real estate holdings reconcile with the personal financial statement.

### LEGAL: Entity governing documents & signing authority

Period: Current executed operating agreement, relevant amendments and ownership/signing-authority evidence

- **LEGAL.C1:** Borrowing entity legal name matches the loan application and formation evidence.
- **LEGAL.C2:** Executed governing agreement and all relevant amendments are supplied.
- **LEGAL.C3:** Current members, ownership percentages and managers are identifiable; ownership totals reconcile.
- **LEGAL.C4:** The application signer has authority under the agreement or an appropriate resolution.
- **LEGAL.C5:** Conflicting ownership or authority information is resolved by lender/legal review.

### RENT: Current rent roll

Period: Current as-of date acceptable to lender

- **RENT.C1:** Property, tenants, units and vacant areas are identified.
- **RENT.C2:** Lease dates, rent, reimbursements and concessions are shown.
- **RENT.C3:** Totals and occupancy reconcile with leases and operating statements.

### LEASE: Lease agreements & amendments

Period: All current executed leases and amendments

- **LEASE.C1:** Complete executed lease, assignments and amendments identify the tenant, landlord and correct premises.
- **LEASE.C2:** Current term, expiration, renewal/termination rights and any changes from amendments are identifiable.
- **LEASE.C3:** Base rent, escalations, concessions and expense responsibilities can be determined.
- **LEASE.C4:** Tenant, occupied area, rent and term reconcile with the rent roll and property income; discrepancies are explained.

### VALUE: Final appraisal report

Period: Latest complete report; effective date acceptable to lender

- **VALUE.C1:** Latest complete appraisal identifies the correct property/unit, parcel, property rights and intended lender/user.
- **VALUE.C2:** Report and valuation effective dates are clear; material revisions are identified and lender review covers the version used.
- **VALUE.C3:** Value conclusion and supporting valuation analysis are present; assumptions and hypothetical conditions are disclosed.
- **VALUE.C4:** Tenancy, occupancy, rent and lease terms reconcile with the rent roll and lease documents.
- **VALUE.C5:** Property condition and material deficiencies are addressed; market value is distinguished from insurance replacement cost.

