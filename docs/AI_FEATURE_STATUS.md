# AI feature support and remaining work

Updated November 7, 2026. This is the working product inventory for the AI document-review workflow. **Implemented means present in source, not deployed.** The workflow requires migration 013 and compatible server/worker configuration; no shared deployment is claimed here. Update this inventory with each behavior change and link it in progress handoffs.

| Feature | Current support | Limits / what is still needed |
| --- | --- | --- |
| Upload validation | Structural checks for accepted document formats; private immutable storage and integrity checks | Structural validity does not prove business completeness or authenticity |
| AI document reading | PDF (native/scanned), DOCX, XLSX, EML/MSG, UTF-8 TXT/CSV and JPG/PNG/WebP; source locations and exact extracted-text citations | Bounded local extraction; English OCR; email attachments, mixed PDF visuals/forms and formulas have explicit limitations; no legacy DOC/XLS; MSG plain/HTML bodies supported, RTF-only/protected bodies limited |
| Automatic classification and matching | One document can match multiple application requirements; validated relevance findings | Supported readers; bounded candidate count; larger semantic evaluation corpus needed |
| Requirement assessment | Combined associated evidence; application-derived fulfilled, partially fulfilled, not fulfilled, unable-to-determine | All criteria mandatory; optional/alternative rules not supported |
| Bulk uploads | Durable manifests, individual saves, finalization/expiry, late-save reconciliation | No full cross-session recovery UI; API uploads can omit manifests |
| Missing files in a closed batch | Unassigned unsaved members continue to block false completion after expiry/finalization; normal saving resolves them | Conservative application-wide limitation; explicit abandonment and narrower dependencies needed |
| Automatic refresh | Borrower mutation reconciliation, stale-input rejection, latest pending check coalescing | Broad scans can revisit historical files; no automatic lender refresh |
| Concurrent borrowers | Actor-scoped jobs; uncertainty retained per enabled active borrower; current-fingerprint checks | Multi-user stress coverage and precise dependency rules still needed |
| Manual checks | Authenticated borrower/lender check service and retry support; lender checks use submitted evidence | Button placement may differ in the concurrent UI redesign; this inventory does not certify each screen |
| Worker resilience | Durable jobs, leases/fencing, bounded retries, cancellation, budget/rate limits | Process-kill/restore drills, measured throughput, alerts and production SLOs needed |
| Batch readiness | Wait for uploads/matches before aggregate checks; limitations after individual wait bounds | Application-wide waiting; continuous arrivals can extend total wait indefinitely |
| Human decisions | AI findings separate from lender acceptance/waiver; human link rejection takes precedence | More correction actions and replacement/delete product flows needed |
| Models | OpenRouter Flash default; Flash-Lite allowlisted; strict contracts and pinned reservation prices | Existing environment overrides persist; no automatic fallback; 28 live comparison calls recorded (22 exact passes); not quality certification |
| Human disagreement capture | Authenticated feedback API saves private, idempotent pending-review eval candidates with pinned inputs/output/correction | UI button, adjudication, retention/export and promotion to scored ground truth remain unfinished |
| Debugging | Optional restricted analysis captures and run inspection support | Capture must be configured; retention/idle cleanup and operational monitoring need work |
| Test evidence | Unit and real-Postgres synthetic workflow suites; retained bounded live model fixtures | Fault-injection inventory is broader than completed tests; see test plan |

## Next work, in priority order

1. Expand model/extraction evaluations, investigate retained failures, and connect the disagreement UI to candidate capture/adjudication.
2. Add stage-duration metrics and the workflow-runs dashboard.
3. Improve recovery UX and requirement policy packs, with explicit coverage tests.
4. Broaden supported document complexity and OCR languages based on fixtures, not a universal-file claim.

Accepted behavior for now: continuous uploads can extend application-wide waiting indefinitely; lender checks remain manual. Neither is the next implementation priority at the user's request.

## Latest changes

- Preserved unassigned missing-file coverage after batch expiry and finalization, with save-recovery tests.
- Prevented newer matches from another borrower hiding ambiguity; stale match findings cannot resolve current uncertainty.
- Added this inventory alongside the maintained design and stable edge-case/test IDs.

Details: [design](AI_WORKFLOW_DESIGN.md), [requirements](AI_WORKFLOW_REQUIREMENTS.md), [edge cases](AI_WORKFLOW_EDGE_CASES.md), [test evidence](AI_WORKFLOW_TEST_PLAN.md).

November 7 reader increment: modern PDF/Word/Excel/Email/Text families are wired into upload validation and analysis. See [prompts, evaluations and metrics](AI_PROMPTS_EVALS_AND_METRICS.md) for exact bounds, API details and measured outcomes. Source support does not certify deployment.

Outlook MSG follow-up: `.msg` upload validation, header/body extraction and scheduling are implemented. Synthetic fixtures cover Unicode/plain text, HTML, attachments, RTF-only limitations and corrupt/non-email rejection. This is source support, not a deployment claim.
