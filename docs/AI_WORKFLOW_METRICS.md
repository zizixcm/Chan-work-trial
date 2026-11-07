# AI workflow metrics and exports

Implemented November 7, 2026. Dashboard: `/internal/ai-workflows`, linked from `/internal/analysis-runs`. API: `/api/internal/ai-workflows`.

## Access

Requires a signed-in user explicitly listed in `ANALYSIS_DEBUG_USER_IDS` and active application membership. Borrowers see metadata for their applications; lenders see lender jobs for the current submitted package. A developer allowlist entry alone does not grant access to every application. Raw diagnostic capture may be disabled: this dashboard reads durable jobs/events/reservations, not captured document contents.

## What is measured

- Job counts/outcomes, pending count/oldest age, provider retries and daily creation cohorts.
- Initial queue wait: creation to first running event.
- Terminal latency: creation to terminal update, including retries and stale/cancelled outcomes. This is not upload-to-final-requirement latency.
- Preparation: paired preparing/prepared events within the same lease token.
- Model + output validation: dispatch/responded events within the same lease token. Timeouts/failed validations do not have a completed response sample; consult terminal/failure counts too.
- p50/p95/p99 with sample counts. Missing historical events are not zero. Pending work is excluded from terminal latency rather than treated as complete.
- Known token cost and known token counts; unknown-charge reservation ceilings and incomplete-usage attempt counts shown separately. These are provider accounting estimates, not invoices.

New workers write metadata-only preparation/response events. Failure to record a phase does not fail the job; missing phase pairs remain visibly unmeasured. No migration is needed. Existing workers must restart on the new code to record these phases. Historical success does not mean an assessment is still current or a requirement is fulfilled.

## Read/export the data

Dashboard filters: last 1/7/30 days, matching/assessment, optional application ID. Refresh manually or opt into 30-second refresh.

- JSON: `/api/internal/ai-workflows?days=7&download=1` includes filter metadata, summary, jobs and event timelines.
- CSV: `/api/internal/ai-workflows?days=7&format=csv` has one row per job, usage/cost and timing/sample columns.
- Add `applicationId=...` or `task=match_document.v1` / `task=verify_requirement.v1` to either URL. Use a signed-in browser session; do not put auth tokens in URLs.
- Local files: `npm run metrics:export -- --days=7`. Optional `--user=ALLOWLISTED_USER_ID` and `--application=APPLICATION_ID`. Default user is the first configured allowlisted ID. The CLI enforces application visibility and writes private JSON/CSV files under `PORTAL_DATA_DIR/exports`, printing their exact paths.

Exports contain IDs, model/prompt versions, safe outcome codes, timestamps, counters and cost metadata. They exclude document names/text, requirement text, prompts, responses and user corrections. Local export files are private and are not committed to Git. CSV cells defend against spreadsheet formula injection.

The current implementation caps selections/exports at the newest 2,000 jobs and shows the latest 100 on screen. JSON includes total/exported counts and `truncated`; CSV responses expose `X-Metrics-Total-Jobs`, `X-Metrics-Exported-Jobs`, `X-Metrics-Truncated`. All summary statistics use the exported sample. Narrow filters when truncated; full pagination/warehouse export remains future work. The API is read-only and does not enqueue model calls.

## Verification and remaining work

Tests cover phase pairing across attempts, missing phases, pending/terminal separation, cost uncertainty, CSV escaping, denied access before DB reads, download headers, real PostgreSQL membership/filter isolation, phase recording, and telemetry failure preserving job success.

Not yet measured: upload/batch-to-final-current-assessment latency, extraction cache hit rate, semantic accuracy, model quality by document family, and external alerting. The dashboard does not infer these from job success. A broader warehouse export or scheduled export is not enabled implicitly.

Validation: all 54 unit tests pass, real PostgreSQL workflow integration passes with phase/visibility assertions, and the isolated staged production build passes compilation, TypeScript and route generation. A real CLI export completed successfully; the configured developer's authorized selection was empty (not fabricated sample data). Deployment and browser verification are separate from these source checks.
