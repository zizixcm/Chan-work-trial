# AI prompts, evaluations and workflow visibility

Updated November 7, 2026. This document separates implemented behavior from proposed product work. See [feature status](AI_FEATURE_STATUS.md) and [workflow design](AI_WORKFLOW_DESIGN.md).

## Prompt design: compact, versioned rubrics

Use three layers, composed by application code:

1. **Shared evidence rules:** source content is data, exact citations, subject/period checks, no invented facts, uncertainty and human authority. Implemented in `lib/analysis/validation.ts`.
2. **Task rubric:** matching asks relevance; assessment checks every required condition across all linked evidence. `lib/analysis/rubrics.ts` adds explicit field/value/period and visual-evidence rules. All are pinned by `ANALYSIS_VERSION` (`document-review.v6`).
3. **Requirement-specific policy:** current requirement criteria, entity and period are supplied as data. Future approved policy packs should specify acceptable evidence, mandatory fields, time windows and exceptions, referenced by stable ID/version in the requirement definition. Do not select a pack merely by fuzzy title or let uploaded text choose it.

A short versioned document per *requirement family* is useful as a reviewable policy source. It should compile into a small trusted rubric and tests. It should not be an autonomous tool-using skill or a large collection loaded into every prompt. For example, a rent-roll policy can require property identity, as-of period, tenancy and rent fields; a bank-statement policy has account holder, statement period, currency and balance rules. These domain policy packs are a proposal, not new hidden requirements in today's app.

Document format and business meaning are separate: a rent roll can be a spreadsheet, PDF or email attachment. Format adapters supply source locations and extraction limitations; they should not decide business completeness. One model call matches one document to candidates; one assesses one requirement with its combined evidence.

Keep calls fast by extracting locally, reusing a bounded process-local extraction cache, retaining the existing coalescing/barrier behavior, and sending only applicable requirements/rules. The current cache holds up to 32 prepared documents by document ID/hash/type/analysis version; reads still reauthorize and verify source bytes before reuse. It is not a durable cross-worker cache. Oversized inputs fail explicitly rather than silently truncate. Page/chunk retrieval and durable extraction caching need their own coverage contract before implementation.

## Implemented document-reading boundary

| Family | Formats | Extraction and citations | Important limitations |
| --- | --- | --- | --- |
| PDF | .pdf | Native text items by page; local OCR for textless pages | 12-page cap; mixed images/text and form widgets are flagged; no signature/authenticity validation |
| Word | .docx | Paragraphs in document, headers, footers, notes/comments; source part and paragraph | Embedded visuals/objects and tracked changes flagged; no legacy .doc |
| Excel | .xlsx, .csv | Sheet/cell addresses including hidden sheets; CSV record/cell addresses | Formulas not executed, cached values unverified; images flagged; no legacy .xls |
| Email | .eml | Decoded headers and plain/HTML-derived body lines | Attachments remain unreviewed and must be uploaded separately; no Outlook .msg; sender headers are not identity proof |
| Text | .txt | UTF-8 lines | Other encodings require export as UTF-8 |
| Images | .jpg/.jpeg, .png, .webp | Local English OCR lines | Low-confidence/empty OCR becomes a limitation; handwriting and visual semantics are not certified |

There is no universal arbitrary-file reader. The shared allowlist schedules supported formats; unsupported types receive explicit errors. Readers are bounded, use a disposable child process, and do not follow remote links. Email HTML is converted to text, not rendered in a browser. No source is sent to a separate OCR service. Local OCR language assets are installed with dependencies.

Each non-CSV extraction is capped at 30 seconds, 500 nonempty records, 2,000 characters per value, and 60 KB of extracted record JSON. Images/rendered pages are capped at 16 million pixels. XLSX has ten-sheet/500-row/50-column limits. Existing aggregate task and prompt limits still apply. A JavaScript heap limit is not an OS-wide native-memory guarantee; production resource isolation remains necessary.

Citations retain the existing record/column/quote contract and add application-derived `sourceLocation` for non-CSV evidence. These quotes establish agreement with extracted text, not proof OCR was correct. PDF extraction can miss visual meaning; unknown is preferable when that meaning is required.

## Evaluations and human disagreement

Implemented: `npm run eval:ai` validates the synthetic corpus without calls; append `-- --live` for the bounded model comparison. `-- --formats --live` exercises extraction plus assessment. Only synthetic fixtures are sent by this runner. It compares the two allowlisted models, caps the run's estimated maximum cost at $0.15, uses no hidden retries, and saves results in `artifacts/ai-evaluations/`. Unknown usage stays unknown; the reserved ceiling is not an invoice.

The eight semantic cases cover complete, missing/blank rent, wrong property, wrong period, unverified formula, injected instructions and conflicting amounts. Six format fixtures cover native/scanned PDF, XLSX, PNG, JPEG and WebP. DOCX/EML/TXT have reader tests but have not yet had live model fixtures. The expected outcomes were retained when models failed.

November 7 results: 28 live calls, 22 passing exact expected outcomes. Each model passed 11/14. No validated response falsely reported fulfilled on the negative cases, but two formula outcomes differed from expected uncertainty and four calls/validations failed. Flash median call latency was approximately 1.54 seconds; Lite 1.71 seconds. One Lite call timed out at 60 seconds. These are small sequential observations, not p95/SLO estimates or a reliable model ranking. Combined reservation ceilings were $0.1372. Flash remains the default.

Implemented candidate capture: authenticated `POST /api/applications/:id/analysis-feedback` accepts `requestId`, `jobId`, `expected` and `reason`. It only accepts the caller's successful result in the authorized application/role. It automatically captures the pinned input references, model/prompt version, original output and human correction under private `PORTAL_DATA_DIR/evaluation-candidates`; the response contains only candidate ID/status. Request IDs are idempotent; conflicting reuse fails. Feedback cannot mutate the AI result or human lending decision.

Candidates are **pending_review**, not ground truth. The UI disagreement button, review/adjudication interface, retention policy, redaction/export and promotion to a scored corpus remain to build. Candidate capture is not silently attached to every lender rejection: a business decision may disagree with the borrower without identifying a model error. Original referenced document versions must remain retained for replay. No private candidate is automatically sent to a model or placed in the public synthetic corpus.

Recommended evaluation process: review the correction; preserve both judgments and reason; add expected criterion findings and relevant citations; partition by application/document family to avoid duplicates leaking into the held-out set; compare model/prompt versions on a fixed holdout. Track false fulfillment first, then missed matches, missing-evidence accuracy, unknown rate, citation validity, latency and cost. Evaluate extraction errors separately from reasoning errors.

## Metrics: what to show and how to get there

The first useful product is a developer **Workflow runs** screen with a summary and drill-down, not a single average response-time number.

| View | Metrics | Why it matters |
| --- | --- | --- |
| User-visible completion | Upload accepted → first current assessment; upload/batch finalized → final current assessment; pending count and oldest age | Includes waiting, retries and multiple jobs, unlike model latency |
| Run timeline | Queue wait → extraction → model → validation/commit; attempt count and stale discard | Explains whether slowness is the model, readiness barrier, extraction or infrastructure |
| Reliability | Success, unable-to-determine, validation failure, timeout, retry, stale, cancelled; denominator per job and per attempt | A failed retry must not be counted as a separate failed document |
| Throughput | Current assessments/hour, uploaded files/hour, queue age by application | Measures useful completed work, not just calls sent |
| Cost | Known token usage/cost, unknown usage, reserved ceilings, cost per current assessment | Avoids treating unknown billing as zero |
| Quality | Adjudicated false fulfillment, relevance precision/recall, human disagreement rate, eval pass rate by slice | Disagreement rate and reviewed error rate are different metrics |

Use p50/p95/p99 plus sample counts and time windows. Separate extraction cache hits from misses and group by format, model, prompt version and task. Treat incomplete workflows as censored/pending rather than dropping them from latency charts. Keep application IDs access-controlled and private content out of metric labels.

Existing job/event/reservation tables and optional run captures provide lifecycle/cost evidence, but complete stage durations, batch-to-final correlation and a metrics dashboard are **not implemented**. Next: add durable attempt phase timestamps and a batch correlation ID; expose an authenticated aggregate endpoint; render summary charts and a per-run timeline. Start with PostgreSQL aggregation for this app; export metrics to an observability backend when volume/retention justifies it. Metrics failure must never block document processing.

## Accepted behavior and recovery gaps

Continuous arrivals may extend the application-wide wait indefinitely. The user accepted documenting this behavior rather than prioritizing a fix. Lender refresh remains manual by the same decision.

Browser close: saved files/manifests survive, but browser-held unsent bytes do not. A recovery UI must list missing members and let the user reselect exact files. Missing-file abandonment needs an explicit action with provenance; timeout alone must not silently withdraw missing evidence.

Concurrent backend work adds draft soft-removal and explicit same-byte reupload/restoration; these are separate from full immutable version replacement. Version replacement still needs a UI/API contract for successor identity, link confirmation and historical lender submissions. Do not equate unlinking a file, removing it from a draft and deleting retained bytes.
