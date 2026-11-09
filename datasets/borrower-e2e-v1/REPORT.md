# Generation and validation report — November 8, 2026

**Delivered:** dataset 1.0.0 with 12 fictional multi-turn borrower journeys (8 development, 4 frozen synthetic holdout), 121 deterministic PDF files, 250 pages including four image-only pages, 36 canonical checkpoints and 504 criterion judgments. Every case uses the same five lender requests. All work is under `datasets/borrower-e2e-v1/`; the processing/deployment candidate and existing data were preserved.

**Independent admission:** all 12 canonical journeys admitted by a separate reviewing agent after reviewing actual native extraction, all 18 contact sheets and enlarged material pages, including every image-only page. See [independent review](review/independent-review.md) and [hash-pinned per-case admission](review/admission.json). This is independent agent review, not external lender approval. Corpus manifests/oracles retain their original `provisional` authoring label; the separately signed-by-reviewer admission overlay is authoritative for the exact pinned hashes. Do not interpret an unchanged authoring label as independent rejection, or admission as a live model pass.

Review corrected unintended bank-balance discontinuities, imprecise gap periods, supplied-but-unreadable lease descriptions, uncertainty while a declared entity amendment was absent, premature duplicate wording, missing conversation locators, and a defensible current-rent reconciliation alternative. The final holdout freeze was made after these authoring corrections and before any evaluated-agent exposure.

## Verified offline

| Check | Result |
|---|---|
| PDF SHA-256, page counts, all native visible lines, image-only detection | PASS: 121 files / 250 pages / 4 image-only pages |
| All source locators, checkpoint criterion inventory, active evidence scope | PASS |
| Exact cross-split duplicate audit | PASS: none; within-case renamed duplicate preserved |
| Holdout frozen-file verification | PASS |
| Independent arithmetic, parties, dates, page completeness and intentional conflicts | PASS within authored policy; per-case review record retained |
| Visual render review | PASS: all case sheets; material pages enlarged; intentional obscured copy remains unreadable |
| Reproduction in new output directory | PASS: all 172 corpus files byte-identical in pinned environment |
| Offline scorer checks | PASS: 15 tests, including false completion, fabricated quotes/pages/hashes, unrelated sources, forgotten evidence, blanket uncertainty, unauthorized mutation, duplicates and acceptable alternative |
| Allowlist exports | PASS: 3 tests including all 36 checkpoints, future-turn rejection and existing-destination rejection |
| Repository `npm run test:agent` | PASS: unit suites and TypeScript; log retained |
| Live model/provider evaluation | NOT RUN; not authorized |
| Full build/database integration | NOT RUN; no shared quiet window or candidate mutation required for isolated dataset work |
| Browser checklist | All items NOT RUN: sign-in/access, navigation, upload/persistence, recovery, organization, submission/lender review, AI behavior, UI quality, changed behavior; no UI change or UI verification claimed |

Repository baseline SHA at verification: `144f5a8c6ba43bc9dfbeca0fac2eaf690bf2037e`. The repository already contained extensive unrelated tracked/untracked changes; the SHA does not identify a clean deployed candidate. This report verifies the dataset scope only. Quick-check log: `review/repository-quick-check.log`; dependency/font/generator provenance and byte reproduction: `review/provenance.json`.

## Remaining limits

The sources are deliberately simplified synthetic facsimiles. The holdout differs in package facts, units, layouts, evidence combinations and conversation paths, but shares authored policy and generator conventions. It tests synthetic generalization, not unseen real-world performance.

The scorer is a practical structural validator plus an adjudication specification. It cannot establish semantic entailment merely because a real quote occurs on an accepted page. It always leaves `mvpPassed` unset pending transcript review. Clarity, unnecessary questions/uploads, exact prose gaps, semantic citation support, selective-inspection justification and forbidden claims require independent trace adjudication. No agent performance, latency, cost or population accuracy is reported.

D06/H04 optional reading-budget interruptions are specified for manual adjudication and remain **provisional diagnostics outside canonical admission**. No automated budget-interruption runner or branch-specific oracle was claimed. The desired behavior remains preservation of supported findings, specific unchecked scope, operator-owned reading continuation and observation reuse. The conservative runtime absence rule was not changed or hidden.

## Running later

Read [the evaluator specification](EVALUATOR.md), verify admission/freeze hashes, and obtain separate authorization for execution and spend. Use an isolated test application with the exact five requests. Mount only allowlisted checkpoint exports into the evaluated agent environment; do not expose this repository, generator, simulator-private facts, review transcripts or gold answers. Adapt real conversation/upload/processing results to the normalized scorer while retaining raw contract-valid events, citations and trusted telemetry. Review all intermediate claims. Report zero-critical-failure gate and every other dimension separately. Retire any holdout used to tune subsequent behavior.
