# AI feature support and remaining work

Updated November 7, 2026. This is the working product inventory for the AI document-review workflow. **Implemented means present in source, not deployed.** The workflow requires migration 013 and compatible server/worker configuration; no shared deployment is claimed here. Update this inventory with each behavior change and link it in progress handoffs.

| Feature | Current support | Limits / what is still needed |
| --- | --- | --- |
| Upload validation | Structural checks for accepted document formats; private immutable storage and integrity checks | Structural validity does not prove business completeness or authenticity |
| AI document reading | Bounded UTF-8 CSV preparation with exact cell citations | PDF/image OCR and XLSX analysis are not implemented, even though uploads accept those formats |
| Automatic classification and matching | One document can match multiple application requirements; validated relevance findings | CSV only; bounded candidate count; larger semantic evaluation corpus needed |
| Requirement assessment | Combined associated evidence; application-derived fulfilled, partially fulfilled, not fulfilled, unable-to-determine | All criteria mandatory; optional/alternative rules not supported |
| Bulk uploads | Durable manifests, individual saves, finalization/expiry, late-save reconciliation | No full cross-session recovery UI; API uploads can omit manifests |
| Missing files in a closed batch | Unassigned unsaved members continue to block false completion after expiry/finalization; normal saving resolves them | Conservative application-wide limitation; explicit abandonment and narrower dependencies needed |
| Automatic refresh | Borrower mutation reconciliation, stale-input rejection, latest pending check coalescing | Broad scans can revisit historical files; no automatic lender refresh |
| Concurrent borrowers | Actor-scoped jobs; uncertainty retained per enabled active borrower; current-fingerprint checks | Multi-user stress coverage and precise dependency rules still needed |
| Manual checks | Authenticated borrower/lender check service and retry support; lender checks use submitted evidence | Button placement may differ in the concurrent UI redesign; this inventory does not certify each screen |
| Worker resilience | Durable jobs, leases/fencing, bounded retries, cancellation, budget/rate limits | Process-kill/restore drills, measured throughput, alerts and production SLOs needed |
| Batch readiness | Wait for uploads/matches before aggregate checks; limitations after individual wait bounds | Application-wide waiting; continuous arrivals can extend total wait indefinitely |
| Human decisions | AI findings separate from lender acceptance/waiver; human link rejection takes precedence | More correction actions and replacement/delete product flows needed |
| Models | OpenRouter Flash default; Flash-Lite allowlisted; strict contracts and pinned reservation prices | Existing environment overrides persist; no automatic fallback; two live fixtures are not quality certification |
| Debugging | Optional restricted analysis captures and run inspection support | Capture must be configured; retention/idle cleanup and operational monitoring need work |
| Test evidence | Unit and real-Postgres synthetic workflow suites; retained bounded live model fixtures | Fault-injection inventory is broader than completed tests; see test plan |

## Next work, in priority order

1. Bound user-visible waiting under continuous arrivals and test unrelated-batch interference.
2. Define unresolved-intake acknowledgment and precise requirement dependencies without silently discarding missing evidence.
3. Expand multi-user/worker failure tests and negative semantic fixtures (wrong entity, wrong period, contradictions, injected text).
4. Add recovery UX, production observability and rollback/restore drills.
5. Extend formats and criterion rules behind explicit contracts and quality tests.

## Latest changes

- Preserved unassigned missing-file coverage after batch expiry and finalization, with save-recovery tests.
- Prevented newer matches from another borrower hiding ambiguity; stale match findings cannot resolve current uncertainty.
- Added this inventory alongside the maintained design and stable edge-case/test IDs.

Details: [design](AI_WORKFLOW_DESIGN.md), [requirements](AI_WORKFLOW_REQUIREMENTS.md), [edge cases](AI_WORKFLOW_EDGE_CASES.md), [test evidence](AI_WORKFLOW_TEST_PLAN.md).
