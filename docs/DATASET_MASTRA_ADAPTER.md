# Dataset driver and semantic review contract

The driver is evaluator-only code. Import `runDatasetJourney` from `lib/evaluation-observability/dataset-driver.ts`. Supply an existing local Mastra observer, a migrated disposable PostgreSQL Pool whose current schema begins `dataset_eval_`, injected borrower/investigator planner factories, explicit limits and optionally an authenticated semantic-review adapter. The driver opens no second observability connection, creates no database schema and performs no deployment. Its only enabled mode is `offline-scripted`; live execution remains paused for dataset/configuration approval.

## Data and native execution

`loadDatasetCase` accepts D01–D08, H01–H04 and the four DEV overlays. It verifies independent admission oracle/manifest/document hashes, overlay bindings and frozen holdout source hashes. All 54 authored checkpoints/boundaries are enumerated. It never rewrites source files, labels or freeze records. All loaded private structures remain evaluator-side.

Each journey receives an isolated application/actor and actual criterion ID mapping. The exact public policy enters the borrower conversation. Only mapped R2.chain opts into the no_amendments confirmation policy. Requirements that need executed documents remain documentary. Actual source hashes and controller-generated message/artifact/result IDs are retained; authored revision numbers are never substituted into actual state.

The driver uses native Mastra Workflow/runEvals/createScorer around BorrowerAgentService and PreparationWorker with DocumentEvidenceTools. Planner factories must wrap the real native planners and metered transport, or a scripted native model in offline verification. Fresh Agents are required each generation. Each case/run has a distinct Workflow registration ID so a reused observer cannot execute an earlier case's closed-over driver.

External fixture ingestion inserts saved documents into the disposable schema and marks superseded/rejected versions via application tables. Pending uploads remain batch metadata without bytes in readBlob. This is controller/database integration, **not upload HTTP or browser verification**. The controller supplies actual observations, findings, messages, ledger and freshness. Every newly emitted borrower response is captured, including extra intermediate responses. Driver exceptions are rethrown rather than disguised as empty successful results.

## Scoring and independent meaning review

`scoreDatasetBoundary` executes native scorers for evidence, critical safety and semantic review. Deterministic checks include exact criterion inventory, permitted states, source identity/hash/activity, quote authenticity, inspected support groups, absence coverage, gap atoms, assertion provenance, inventory/pending state, billing invariants and observation reuse. Authored ledger amounts are fault-fixture values, not measured billing; actual ledger values are reported separately.

A valid quote is not semantic entailment. `SemanticReviewer` is an injected, trusted evaluator capability with no default model/provider. It receives actual observations plus evaluator-private source/gold context. Its response must name an independent reviewer, bind the entire observation digest and every finding/message digest, provide rationale and all rubric dimensions, and cover every non-whitespace character with exact claim spans. Missing, stale, duplicate, incomplete, unsupported or failed reviews cannot pass. Host integration must authenticate the reviewer; a reviewerId string is not authentication. Evaluated agents cannot supply these reviews.

Tests use explicitly labeled authored review controls solely to test scorer acceptance/rejection. The controller probe deliberately returns unknown findings with **no review**, so qualityPassed must be false even when the execution test passes. These tests are not independent semantic adjudication or model-accuracy results.

Scores are persisted through Mastra observability and the native legacy score domain used by Studio's span Scores panel. The latter receives only opaque trace/span/scorer identifiers and numeric outputs. Raw evaluation snapshots/text belong in an access-controlled evaluator artifact store via onBoundary, not model-visible traces. No public results endpoint is created.

## Compatibility and approvals

See `datasets/borrower-e2e-v1/review/TWO_AGENT_COMPATIBILITY.md` and its per-case JSON. A loader-compatible case is not necessarily a passing production behavior. Known lifecycle limitations are surfaced explicitly:

- DEV-BUDGET requires identification-time pause and partial findings before reading exhaustion. Hard block alone only retains observations; it cannot invent findings. Runtime now supplies remaining-budget context so the specialist can publish before exhaustion. The driver does not claim that required interleaving is verified.
- DEV-UPLOAD-RACE needs an actual late worker/current-revision race. Serial arrival capture alone is insufficient, so that boundary carries an explicit diagnostic until the interleaving adapter is complete.
- DEV-DIALOGUE requires meaningful response-specific capture without fabricating extra borrower messages or prescribing the specialist's question. Generic draining is not proof of all dialogue obligations.
- Historical findings are not current package results after an upload. The specialist receives historical priorAssessment and reusable observations; the main agent only receives current result or null plus historical replies.

User approvals are separate from admission and test outcomes. B01 specification was approved. B02 is held for architecture correction. No other case is user-approved. Do not label an offline execution probe as approval or enable live evaluation from these reports.

## Verification commands

```sh
npx tsx --test tests/dataset-driver.test.ts tests/evaluation-observability.test.ts
npx tsx tests/dataset-driver.integration.ts
DATASET_DRIVER_ALL=1 npx tsx tests/dataset-driver.integration.ts
```

Integration requires a local PostgreSQL test connection; it creates/drops only its own random disposable schema and temporary observer directory. It uses scripted models and actual document readers. Each case reports execution boundaries, native tracing, quality verdict and controller diagnostics. `npm run test:agent` includes the foundation `.test.ts` files; the standalone controller `.integration.ts` must be invoked explicitly. No additional dependencies or shared application migrations are needed from this adapter.
