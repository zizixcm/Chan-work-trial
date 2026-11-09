# Borrower journey evaluation dataset 1.0.0

This is an offline, fictional evaluation dataset for the borrower conversational/upload agent: **12 multi-turn journeys, 8 development and 4 synthetic holdout, 121 PDFs, 250 pages, 36 upload/reply checkpoints, 14 criteria per checkpoint**. It is not training data or a live-agent result. All 12 canonical journeys are independently admitted in `review/admission.json` for their pinned hashes. Original manifest/oracle authoring labels remain provisional; the separate admission overlay controls usability. Optional budget-interruption diagnostics remain provisional. No existing application, processing runtime, database, provider, deployment or linking setting is changed.

## Fixed authored policy

Review date: **October 15, 2026**. Scenario: income-producing commercial real estate refinance. All companies, people, properties, tenants, accounts, signature marks and amounts are fictional, authored from scratch. The private reference PDF supplied domain families only; no source excerpts or private borrower artifacts were used to generate files. The five previously discussed cases and existing PREP-01 fixtures are development references, not holdout evidence.

The same five lender requests apply throughout:

1. Rent roll for September 30, 2026, correct property, every declared unit, tenant, monthly rent and lease dates.
2. Executed-copy leases for every declared tenant, all applicable amendments, and explanations of material lease/roll differences.
3. Actual property operating statements for January–December 2025 and January–September 2026; compare base-rent income on the declared accrual basis.
4. Complete July, August and September 2026 statements for the single declared borrower account, with correct holder and page sets.
5. Formation certificate, operating agreement and declared applicable amendments, consistent ownership, manager and signing provisions. Unclear legal authority is a lender question.

`corpus/policy.json` is the exact versioned policy; each case's agent request includes it and the declared property/account/unit population. All units are occupied. No extra tax, appraisal, insurance, closing, guarantor or lender-readiness requirements apply. Bank deposits are transfers, not a proxy for rental income. A no-amendment declaration resolves applicability, not documentary execution. Signature marks show executed-copy evidence only and establish neither authenticity nor legal enforceability.

Completion means qualifying documentary evidence for these requests. It never means lender acceptance, approval or submission readiness. Each criterion is `met`, `unmet` or `unknown`. Mixed criteria describe partial fulfillment without adding a public enum. A material disagreement prompts investigation; neither source is automatically wrong.

## Coverage and partition

| Case | Split | Package/path | Main evidence challenge |
|---|---|---|---|
| D01 | Development | Aster Quay; three gradual batches | Ordinary completion; preserve rent roll and prior-year findings |
| D02 | Development | Brindle Arcade; partial then renamed duplicate then complete statement | August page 2 missing; July duplicate cannot replace it |
| D03 | Development | Copper Finch; income, incomplete reply, amendment | Rent uplift reconciled by effective date; vague answer alone insufficient |
| D04 | Development | Dapple Works; wrong holder, explicit rejection, correct file | Saved rejected file remains saved; correct account still needed |
| D05 | Development | Ember Landing; old annual and budget replaced by actual periods | Wrong period and budget are not qualifying actual results |
| D06 | Development | Fable Yard; 32-page lease collection | Useful contents; execution/economics on pages 31–32 |
| D07 | Development | Garnet Walk; obscured copy then readable scan | Unreadable is not missing; independent requirements progress |
| D08 | Development | Hollowmere; company amendment arrives last | New manager, former proposed signer; unresolved lender question |
| H01 | Holdout | Juniper Loom; ledger layout; entity first, statements, combined income binder | Three units; multi-role 7-page binder; bank month arrives last |
| H02 | Holdout | Kestrel Basin; folio layout; quarterly archive then entity/roll then leases | Four units; native/image archive and image execution page |
| H03 | Holdout | Lumen Forge; card layout; amendment 2 before complete chain | Three units; two effective-date changes; distinct income arithmetic |
| H04 | Holdout | Mossglass Court; memorandum layout; entity/bank first, long leases, amendment last | Four units; 34-page lease collection; reopen authority after new evidence |

The holdout contains distinct entities, unit counts, layout families, evidence packaging/combinations and conversation paths. Boilerplate and policy are shared by design; it is not a claim of independence from all generator style. All derivatives of a fictional package stay in one split. No private real-world holdout exists. Twelve journeys cannot estimate a precise population accuracy rate.

`corpus/holdout.freeze.json` pins every holdout file, including manifests, simulator facts and answer keys. Freeze is after authoring review corrections and before agent evaluation. Future changes require a new dataset version/freeze. If holdout outcomes inform tuning, retire those cases to regression and replenish holdout.

## Files and information boundaries

- `corpus/{split}/{case}/files/`: opaque, immutable PDF versions, including unused complete variants available only to the evaluator.
- `agent/request.json`: agent-visible request and application facts, with no gold states or future upload catalog.
- `private/simulator.json`: borrower facts, turn release schedule, allowed question topics and disclosure rules. This is not agent context.
- `private/oracle.json`: criterion findings at each checkpoint, exact page locators and visible-line support, conversation assertion locators, alternative source groups, specific gaps, absence scope, forbidden claims, correction transitions and next-action owners. Evaluator only.
- `manifest.json`: provenance, document hashes, page counts, version/series references, split and layout family. Evaluator only because mode/relations may disclose outcomes.
- `review/`: actual extracted native text, rendered pages/contact sheets, validation results, independent review and admission. Evaluator only.
- `tools/`: reproducible authoring, validation, allowlist export and offline scoring. **Generator code contains holdout facts and must never enter agent retrieval or tuning inputs.**

Use a separate process/mount for an evaluated agent: expose only the checkpoint export and conversation/authorized reader observations. A directory convention alone is not a security boundary. Do not grant a future evaluated agent access to this repository's dataset tree. The simulator receives only its own private facts and files, never oracle states. The scorer and reviewers may access gold. Logs containing holdout answers stay evaluator-private.

## Offline reproduction and validation

Requires Python with reportlab, pypdf, Pillow and pypdfium2. This machine's bundled Python is `/Users/chanrao/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3`. Scan rendering uses the macOS Courier New font; package/font versions are recorded in `review/provenance.json`. Exact byte reproducibility is verified within that pinned environment, not promised across font/library versions.

```sh
python3 datasets/borrower-e2e-v1/tools/generate.py --output /tmp/cre-e2e-new-directory
python3 datasets/borrower-e2e-v1/tools/validate.py --render
python3 datasets/borrower-e2e-v1/tools/test_score.py
python3 datasets/borrower-e2e-v1/tools/test_export.py
```

Generator refuses existing output. Validator checks all byte hashes, PDF page counts, actual native extraction against visible authored lines, image-only pages, active source locators, criterion inventories, exact cross-split duplicates and frozen contents. It renders every PDF and produces contact sheets. These checks are not independent semantic approval; read the review record.

No UI changed. Repository quick checks run separately; full build/database integrations and every browser checklist item are NOT RUN because this work is isolated dataset authoring and does not own the shared candidate/quiet window. No agent or provider execution occurred.

## Future authorized evaluation

See [EVALUATOR.md](EVALUATOR.md) for the normalized trace contract, independent adjudication, metrics and release gate. A future execution owner must explicitly authorize model execution and budget, pin the application/model/prompt/reader versions, and adapt checkpoint inputs to real conversation/upload contracts in isolated test storage. This deliverable includes dataset scripts and scorer checks, not a live runner.

`export_checkpoint.py D01 1 /new/destination` exports only the request, released messages and released PDF bytes; it never exports future files, simulator rules, generation sources, manifests or oracles. For a real conversation, append only the new turn from successive exports, preserving earlier messages/results. Questions can take any wording/order that resolves the fixed facts. No simulator answer can create new evidence, a waiver or legal authority. Review every interim response as well as the final checkpoint; a correct final answer does not erase an earlier critical failure.

## Development journey extension

The [development overlays](overlays/README.md) add 18 scored lifecycle/conversation boundaries across D02, D03, D06 and D07: historical saved-evidence reuse, budget interruption/resumption, in-flight upload/stale-result fencing and every intermediate borrower-facing response. They do not change the 12 core packages or frozen holdout. See the separate [overlay review](review/overlay-independent-review.md) for admission; core admission alone does not admit extensions. Mutation scoring now recognizes scoped, trusted authorized saves/proposals/confirmed mappings while rejecting prohibited or unaudited actions.
