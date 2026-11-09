# Native Mastra evaluations and observability

Status: local/offline implementation, November 8, 2026. Live evaluations and deployment remain paused pending dataset and final configuration review. Scripted models verify integration, not model quality. No corpus-wide agent evaluation has been run.

## Implementation

`lib/evaluation-observability/index.ts` uses native Mastra `Observability`, `MastraStorageExporter`, LibSQL and DuckDB. LibSQL stores workflow/evaluation state; DuckDB supplies the observability domain for traces, metrics, scores and feedback. LibSQL alone has span-only observability support. Exact added versions: observability 1.23.1, libsql 1.29.0, duckdb 1.18.0; tested against core 1.82.0.

`createLocalMastraObservability({directory})` requires an absolute local directory and configures no cloud exporter. Use one owning writer process per directory: embedded DuckDB is not a shared multi-process deployment backend. Distributed deployment needs a separately reviewed storage/export topology. Retention and production rollout are not configured by this factory.

The coordinating document processing chat owns runtime, controller, worker and migration integration. Its `withAgentObservability` decorates the existing metered `AgentTransport`; generation stays inside reservation/settlement accounting. Each durable step registers a fresh agent. Its integration persists trace references in conversation/turn/run/step state. This module does not replace application lifecycle or budget controls.

## Trace contract

`runOperation(operation, correlation, callback, parent?)` returns `{value,trace}`. Operations: borrower-turn, investigation-step, evidence-read, assessment, task, e2e. Callback context contains:

- `trace`: serializable `{traceId,spanId}` for durable storage.
- `tracingContext`: live native parent span, used inside this callback only.
- `tracingOptions`: trace IDs, correlation metadata and hidden input/output flags.
- `recordUsage(actualMicros)`: actual billed micro-units, or null for unknown. Unknown is never zero.

Pass both tracingContext and tracingOptions to native generation. In the tested versions, tracingOptions IDs alone correlate traces but do not yield the expected stored parentSpanId. Reopening the store and passing the saved TraceRef as parent restores causal lineage without serializing live spans. An asynchronous worker may continue after a parent ends; this is durable causality, not synchronous wall-time nesting.

For `runEvals`, put tracingContext on the **data item**: the runner resolves item context and overwrites targetOptions.tracingContext. A persistence test covers this behavior.

Correlation permits opaque application/user/turn/run/step IDs, configurationDigest, evalRunId, caseId, datasetVersion, tier, evidenceRevision and resultId. Callers must replace identifying values with opaque IDs; syntax validation alone cannot prove anonymity. Configuration hashes belong here, not prompts or secrets.

Span export is metadata only: no input/output, requestContext, raw error details, document text or arbitrary attributes. Tool names, model/provider, numeric usage and cost remain inspectable. Native token metrics are separately persisted and tested. Errors retain status and a generic label; callers still receive their original exception. Native timestamps supply duration. Application reservations remain authoritative; token-based estimated cost is not billed cost.

`recordScore(ref,{scorerId,scorerVersion,score})` attaches a 0–1 score using Mastra observability. `readTrace(ref)` flushes first. `flush()` and `close()` complete export/storage lifecycle. Query `mastra.getStorage().getStore('observability')` with `listMetrics({filters:{traceId}})` or `listScores({filters:{traceId}})`. Any future UI must authorize application/run scope; no trace endpoint is exposed here.

**Privacy boundary:** span filtering does not redact native workflow snapshots or legacy eval score inputs/outputs. Direct Agent runEvals is currently used only with synthetic offline fixtures. The reusable workflow harness passes opaque case IDs and assertion receipts, keeping document/gold payloads out of persisted workflow evaluation state. Do not use direct Agent evals on private borrower inputs without reviewing every storage domain. Private oracle/simulator facts never enter the evaluated agent or its tools.

## Evaluation harness

`lib/evaluation-observability/evals.ts` implements `runNativeEvaluationCase` with native `createWorkflow`, `createStep`, `runEvals` and `createScorer`. It accepts turn/task/e2e tier, correlation, required check IDs, and an evaluator-owned driver callback. That callback exercises actual durable controllers through metered transport and independently checks their stored effects. It returns `{caseId,completed,checks:[{id,passed}]}`. An agent cannot grade itself by supplying this receipt.

Gold and private schedules stay in the callback; only `{caseId}` enters the workflow. Each run evaluates one case with concurrency 1. Missing, duplicate, failed, incomplete or wrong-case receipts fail closed. Missing/not-scorable mandatory gates cannot produce a pass. The generic gate verifies assertion completeness, not the semantic correctness of the evaluator's assertions.

Turn evals require a fresh Agent for one durable step. Task/E2E evals use a native Workflow around the production controller driver. Do not reuse one production Agent across native multi-turn `turns` or multi-item batches: its one-tool guard persists for that instance. The external simulator controls uploads/replies/interruptions, never the agent's selected action.

Implemented: framework, native offline integration proof, persistence and fail-closed gate tests. Next stages: complete production controller drivers, expanded fixtures, rubric-specific scorers, independent semantic judgments, trajectory diagnostics and results review interface. No live-eval CLI or automatic release gate is enabled.

## Dataset review and activation gates

Start with `datasets/borrower-e2e-v1/REPORT.md`, then `README.md`, `EVALUATION_PLAN.md` and `EVALUATOR.md`. Canonical independent review is in `review/independent-review.md`; overlay review is in `review/overlay-independent-review.md`. Contact sheets `review/*-contact-*.png` offer a quick visual review, `review/renders` contains individual pages and `corpus/.../files` contains PDFs. Private oracle/simulator JSON is reviewer-only.

Before live evaluation: resolve compatibility gates C1–C6, review fixtures/checkpoints/semantic labels, pin dataset/runtime/prompt/model/scorer versions, review call/spend/time limits and model/judge configuration, and admit the final dataset. Keep frozen holdout bytes unchanged. Existing Python tools validate provenance and exports; actual agent evaluation execution/scoring uses native Mastra.

Offline command: `npx tsx --test tests/evaluation-observability.test.ts`. It tests actual native tools with a scripted model, runEvals, persisted parentage, score/token metric storage, redaction, unknown billing, restart lineage and mandatory workflow gates. No provider is contacted. Repository quick check: `npm run test:agent`; full build/browser checks belong to the coordinating quiet window.

Official references: [runEvals](https://mastra.ai/reference/evals/run-evals), [createScorer](https://mastra.ai/reference/evals/create-scorer), [observability](https://mastra.ai/docs/observability/overview). Installed declarations and executable tests pin the behavior described here.
