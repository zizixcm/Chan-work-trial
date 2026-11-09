# Borrower agent implementation and evaluation

## Stable local pilot — current deployment

V20 is live and healthy: atomic manual upload commit creates the batch-scoped agent message before the HTTP response, including single/multiple files and first-ever uploads. Omitted client processing flags default true; no extra question is needed. Full8 isolated stages, focused6 suites, and native single/three-file12-gate cases passed. The worker reads the audited approved budget at startup. Latest user-authorized caps are $100 cumulative/same batch/Heritage application, preserving all prior spending; $1.20 per-call reservation and $2 investigation cap remain. No retrospective retries. Actual investigation/report quality limitations remain documented; do not equate workflow passes with model quality. See `artifacts/testing/isolated-deployment/UPLOAD_V20_VERIFICATION.txt`.

Use http://localhost:3102/ for the unified app and http://127.0.0.1:4111/ for Mastra Studio. Heritage is the default application. Ports 3001 and 3101 are legacy previews, preserved with their data.

The v10 deployment was verified by chat `01a1b986-f2db-7551-993b-905946b69c64`. Deployment ownership returned to chat `01a1b986-f2db-7551-993b-905946b69c64` after v11; bounded evaluation worker windows are coordinated explicitly. Current frozen release: `/Users/chanrao/Developer/proximity-releases/unified-pilot-20261108-v20`. Runtime pointer and guarded launcher live at `/Users/chanrao/Developer/proximity-releases/stable-pilot.json` and `start-stable-pilot.cjs`. Coordinate changes with this owner; do not restart another preview or start a second Studio store writer. The launcher starts the selected built release only when both ports are free; it does not build, migrate, reset data, or dispatch evaluations.

Enter-to-send and the validated lender-status prompt are deployed; see `ENTER_V12_VERIFICATION.txt` and `PROMPT_V13_VERIFICATION.txt` under `artifacts/testing/isolated-deployment/`. Staged uploads, finalized-batch agent admission, trusted saved-upload evidence and batch-linked traces are deployed; see `artifacts/testing/isolated-deployment/UPLOAD_V14_VERIFICATION.txt`. Migrations 024–027 are applied to the existing `preview_v6` schema. Data, Heritage registry, observability and shared spend ledger are preserved. All full simulated checks and expanded native integration passed. Real ordinary replies stream through native Mastra text deltas; question display, progressive SSE updates, final persistence and working-only activity were verified. See `artifacts/testing/isolated-deployment/STREAMING_V10_VERIFICATION.txt`. Broader live quality evaluation remains separate and pending; the 13-case suite is held. Automatic activity appears only while waiting and hides on completion (no Activity toggle); see `artifacts/testing/isolated-deployment/AUTO_ACTIVITY_V8_VERIFICATION.txt`. Sticky starter questions are deployed and verified at desktop/mobile widths; see `artifacts/testing/isolated-deployment/STICKY_V7_VERIFICATION.txt`. Baseline verification and browser limitations: `artifacts/testing/isolated-deployment/UNIFIED_PILOT_VERIFICATION.txt`.


We are building an agentic borrower experience that helps borrowers satisfy lender document requests accurately, quickly and with minimal effort. The two-agent pilot is deployed locally with sign-in bypass and Mastra Studio. Offline integration checks passed; one revised live initial-guidance case passed structural and semantic review. Full live borrower-journey quality remains unverified.

## 1 Two Mastra agents

The **Borrower Preparation Agent** owns the conversation, priorities and next steps. The **Document Investigation Agent** examines evidence, proposes requirement matches and identifies precise gaps. Both use native Mastra tools, configurable models and shared spending limits. Readers support PDF, DOCX, XLSX/CSV, TXT, EML and MSG; the investigator chooses selective reading, search, images or OCR as needed.

## 2 Backend and database

Durable borrower-agent turns, persisted investigation goals and reliable cost settlement reuse existing document, requirement, question, result and progress records. Migrations 022–023 are applied in the isolated pilot schema. Backend services enforce permissions, recovery and freshness, and derive package completeness from current validated criterion findings.

## 3 Evals compatible with Mastra

The dataset contains **12 borrower journeys and four development overlays**, covering incremental uploads, corrections, ambiguity, duplicates, historical evidence, scans, interruption and stale results. All 16 scenarios / 54 boundaries ran offline through native Mastra evaluation targets and actual controllers. Scripted unknown findings and absent semantic reviews deliberately fail quality scoring; these are infrastructure results, not measured model accuracy. Forced stale-worker interleaving, budget partial-publication behavior and broader semantic verification remain incomplete. Scoring covers correctness, false completion, evidence support, borrower effort, latency and cost.

## 4 Mastra observability

Local Mastra trace storage correlates borrower turns, delegation, model calls, tools and results. Studio at http://127.0.0.1:4111 supports trace and score inspection; the revised live B01 trace was browser-verified. The full scripted corpus has a separate offline store. Traces explain execution; they do not replace evidence-quality evaluation.

## Current pilot data transition

The original manual pilot uses fictional Aster Quay fixtures. A separate Heritage application is deployed to match the user's real loan package, using a June 2026 historical snapshot and five scoped request groups. Local setup and file hashes are under `.data/heritage-pilot/`; real documents are not added to the synthetic dataset or pre-marked complete. The user authorized selected real pages/excerpts through OpenRouter to the configured Gemini model for requested investigations within the existing $5 batch / $2 investigation / $20 cumulative caps. See `artifacts/testing/isolated-deployment/HERITAGE_HANDOFF.md` for the active pilot and verification limits; the original synthetic deployment history is in `MASTRA_PILOT_HANDOFF.md`.

## Attachment preview refresh (2026-11-08)

Explicit user-requested restart: portal at http://localhost:3102 now serves `/Users/chanrao/Developer/proximity-releases/unified-pilot-20261108-preview-files` (v20 plus attachment-preview changes). Stable pointer and portal PID updated. Existing Studio/worker remains on v20, unchanged. No schema/data reset, budget change or live probe. Build, focused regression, HTTP/chat integration, desktop/mobile PDF rendering, pagination and keyboard close/reopen passed. See `artifacts/testing/chat-attachment-preview-verification.txt`. Synthetic `Preview verification.pdf` remains saved with processing explicitly disabled.

## Validation status wording quick fix — 2026-11-08

User approved and requested deployment to 3102. The active Studio/worker is now `/Users/chanrao/Developer/proximity-releases/worker-verification-wording-20261108`, copied from `worker-ytd-budget-20261108` with only three borrower prompt instruction replacements: validation/operator status is "Your document requires additional verification." Internal processing details and saved-file reassurance are omitted; duplicate-upload prevention remains. Stable pointer/process metadata updated; previous worker retained. Portal release and PID unchanged. Quick checks PASS (188 tests and TypeScript), staged prompt import PASS, portal3102/Studio4111 HTTP200 and idle worker ticks PASS. Full build/integration and browser checklist NOT RUN for this prompt-only quick fix; no live model failure reproduction or historical-message rewrite. Ledger unchanged at restart ($4.575154 accounted, zero held, 316 calls).
