# Local borrower-agent pilot

## Stable local pilot — current deployment

V20 is live and healthy: atomic manual upload commit creates the batch-scoped agent message before the HTTP response, including single/multiple files and first-ever uploads. Omitted client processing flags default true; no extra question is needed. Full8 isolated stages, focused6 suites, and native single/three-file12-gate cases passed. The worker reads the audited approved budget at startup. Latest user-authorized caps are $100 cumulative/same batch/Heritage application, preserving all prior spending; $1.20 per-call reservations remain. On November 8, the user authorized raising the investigation cap from $2 to $100 to unblock the YTD review; all existing charges and held reservations are preserved. No retrospective retries. Actual investigation/report quality limitations remain documented; do not equate workflow passes with model quality. See `artifacts/testing/isolated-deployment/UPLOAD_V20_VERIFICATION.txt`.

Use http://localhost:3102/ for the unified app and http://127.0.0.1:4111/ for Mastra Studio. Heritage is the default application. Ports 3001 and 3101 are legacy previews, preserved with their data.

The v10 deployment was verified by chat `01a1b986-f2db-7551-993b-905946b69c64`. Deployment ownership returned to chat `01a1b986-f2db-7551-993b-905946b69c64` after v11; bounded evaluation worker windows are coordinated explicitly. Current frozen release: `/Users/chanrao/Developer/proximity-releases/unified-pilot-20261108-v20`. The worker now runs separately from `/Users/chanrao/Developer/proximity-releases/worker-ytd-budget-20261108` with validation diagnostics and the $100 run cap; `stable-pilot.json` selects it through `studioRelease`. Runtime pointer and guarded launcher live at `/Users/chanrao/Developer/proximity-releases/stable-pilot.json` and `start-stable-pilot.cjs`. Coordinate changes with this owner; do not restart another preview or start a second Studio store writer. The launcher starts the selected built release only when both ports are free; it does not build, migrate, reset data, or dispatch evaluations.

Enter-to-send and the validated lender-status prompt are deployed; see `ENTER_V12_VERIFICATION.txt` and `PROMPT_V13_VERIFICATION.txt` under `artifacts/testing/isolated-deployment/`. Staged uploads, finalized-batch agent admission, trusted saved-upload evidence and batch-linked traces are deployed; see `artifacts/testing/isolated-deployment/UPLOAD_V14_VERIFICATION.txt`. Migrations 024–027 are applied to the existing `preview_v6` schema. Data, Heritage registry, observability and shared spend ledger are preserved. All full simulated checks and expanded native integration passed. Real ordinary replies stream through native Mastra text deltas; question display, progressive SSE updates, final persistence and working-only activity were verified. See `artifacts/testing/isolated-deployment/STREAMING_V10_VERIFICATION.txt`. Broader live quality evaluation remains separate and pending; the 13-case suite is held. Automatic activity appears only while waiting and hides on completion (no Activity toggle); see `artifacts/testing/isolated-deployment/AUTO_ACTIVITY_V8_VERIFICATION.txt`. Sticky starter questions are deployed and verified at desktop/mobile widths; see `artifacts/testing/isolated-deployment/STICKY_V7_VERIFICATION.txt`. Baseline verification and browser limitations: `artifacts/testing/isolated-deployment/UNIFIED_PILOT_VERIFICATION.txt`.


The pilot uses an isolated borrower portal, synthetic application data and native Mastra Studio. It does not replace the existing port-3001 deployment. The deployment report identifies the verified release directory and URLs.

## Studio and execution

Run `npm run mastra:pilot` from the verified release. `MASTRA_PILOT_PORT` defaults to 4111; `MASTRA_OBSERVABILITY_DIR` is an absolute persistent directory. The server binds to 127.0.0.1 and serves the bundled native Studio UI and native Mastra read APIs on the same origin.

Use **Agents** to inspect the two prompts and native tools, **Traces** to follow a borrower turn through delegation, model steps and tools, and **Metrics** to inspect recorded token usage and timings. Traces omit raw document/message content; the authorized application and evaluation reports retain the evidence needed to judge correctness. Estimated cost in Studio is distinct from billed cost in the shared ledger.

Generic playground generation, scorer execution and mutation endpoints are disabled: they cannot bypass the application controller or its budget. Native read-only analytics queries remain available. The server owns the only DuckDB writer for its directory. Do not start a second worker or evaluation process against that directory; inject its existing observer into hosted evaluations, or use a separate offline directory and reopen it after the evaluator closes.

## Bounded live worker

Live execution requires `BORROWER_AGENT_EXECUTION=live`, an isolated PostgreSQL database at 127.0.0.1:5434/preview, an authorized synthetic application/file registry, OpenRouter credentials, and explicit ledger/budget settings. Credentials stay in the worker environment, outside browser configuration and traces.

Approved first-batch settings:

- Stable batch ID: `first-pilot-20261108`.
- Batch cap: 5,000,000 microdollars ($5).
- Investigation cap: 2,000,000 microdollars ($2).
- Shared cumulative ledger: existing $20 ceiling; never reset or replace it to obtain a fresh allowance.
- Reservation: 1,200,000 microdollars per call; known actual charges settle it, unknown charges retain it.

The server processes one scoped tick at a time and polls again after completion. It stops scheduling after an unexpected worker error. Inspect durable state and accounting before restarting. Reads of portal status never invoke a model.

## Activation and verification

Apply migrations 022 and 023 only to the isolated release schema. Enable the existing processing-chat gate and `BORROWER_AGENT_CHAT=1`, and configure the synthetic application for adaptive processing. Amendment confirmation is an explicit criterion policy; required leases remain documentary requirements.

Live dataset cases need individual user approval in addition to budget authorization. An approved dataset artifact or passing offline test is not case approval. Do not treat OpenRouter reporting $0 available credit as a generation blocker. Verify availability through an actual bounded request and report its response. User authorized trying live evaluations on November 8, starting with approved B01; pending case approvals remain distinct from spend authorization.

Offline checks include `npm run test:agent`, `npm run test:borrower-agents`, native Studio API tests, real local format readers, and the dataset adapter checks. Final release verification uses a fresh isolated build and the browser checklist in `docs/TESTING.md`. Scripted-model success establishes integration, not real model quality.
