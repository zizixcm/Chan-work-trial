# Investigation recovery — November 8, 2026

Candidate: commit `144f5a8c6ba43bc9dfbeca0fac2eaf690bf2037e` plus frozen release and scoped recovery patches. Exact paths/hashes: `candidate.json`. Shared source contains later parallel UI/activity work; it is not the frozen candidate tested here.

Preview: http://localhost:3102/ (Heritage default preserved). Recovered Aster: http://localhost:3102/borrower/b0dcd236-7da1-44e2-a26a-42a2e837afe1 . Studio http://127.0.0.1:4111/.

Release: `/Users/chanrao/Developer/proximity-releases/mastra-agents-recovery-20261108-v4`.
Portal PID 20128 / exec session 42362. Studio/Heritage worker PID 21891 / launcher exec session 52003. Verify actual ownership before stopping. Start portal from release with `./node_modules/.bin/next start --hostname ::1 --port 3102`; worker with `node .data/start-studio.cjs`. Launcher keeps provider key in memory. Existing preview_v6 data/storage, Heritage registry and shared evaluation ledger unchanged. Only one process may own the Mastra store.

## Changes and outcome

- Repeated inspection/read actions reuse unchanged evidence and provide next-action guidance; ordinary call/time/money bounds remain.
- Typed local execution errors carry confirmed generation cost. Both controllers settle known charges even when a tool fails. Genuine unknown cost remains conservatively reserved.
- Fixed validation errors receive sanitized, allowlisted feedback with two correction opportunities. Invalid findings are still rejected; no safety/coverage/citation policy loosened.
- Monetary and call-count limits have distinct reason codes; UI asks for a budget review only for budget exhaustion.
- Assessment stamps current locked preparation revision after inventory/authority checks; recovery bookkeeping does not make findings stale.
- Trace-backed repair reconciled 7 retained reservations ($4.20), preserving historical charges. Operational scripts default to dry-run, scope exact runs, and are idempotent.

Final Aster state: run `9693e6a8-6810-4b5f-a568-0947f39fa324` published a current **partial** result covering all 5 requirements / all criteria, with two citations. The supplied 2025 operating statement is supported; other evidence remains missing/uncertain. No claim of complete loan evidence or lender acceptance.

Runs `1481616c-346b-47b8-9ba1-148a8be20ef6` and `40899326-38e2-4e2e-81e5-fe63eb412ecd` reached bounded validation rejection, then were **superseded**, not marked successful. Their exact authority, document versions, requirement scope and fingerprint match the current successor; finalization explicitly linked them to it and preserved histories. No waiting_input cards or blocked-agent banner remain. No more model retries were made after the second repair cycle.

Final Aster accounting: **$0.089542 known, $0 held, unknownCost=false, $5 cap unchanged**. Shared ledger at handoff: $0.093934 / 33 calls / $0 held; existing $5 batch cap and $20 cumulative ceiling unchanged. Heritage worker restored and idle. Repair did not modify Heritage evidence or data; the deployment owner separately handled its wording update.

## Verification

PASS: isolated full equivalent via `scripts/check-isolated-preview.mjs` (quick unit + TypeScript, fresh Webpack production build, HTTP/access/uploads, jobs, workflow, chat, complete/missing-evidence simulated AI). Expanded native borrower-agent integration PASS on final release, including repeated action, cost settlement, correction/rejection bounds and preparation revision regressions. Final operational helper tests 5/5 PASS, final TypeScript PASS. Shared-root full command was not used because other previews remain active; isolated candidate has its own dependencies/build output.

Browser PASS: no-login Aster and Heritage navigation; corrected failure wording before recovery; final findings persist after refresh; no waiting cards; source quote opens correct PDF/page, rendered canvas; Escape restores source-button focus; 390px and 1280px with no horizontal overflow; no observed warning/error logs. Original file download checksum unchanged. Screenshots: `before.jpg`, `final-mobile.jpg`, `final-desktop.jpg`, `source-mobile.jpg`. Final HTTP assertions: `final-verification.json`.

Browser NOT RUN: full borrower/lender sign-in/out and wrong-role matrix, new upload/unsupported-file recovery, link/unlink, submission/lender review. Automated suites cover relevant isolated simulated behavior; this repair is not broad model-quality certification. Live attempts exposed omitted criteria, unauthorized assertion support, and an inexact quote; those were rejected and remain in history.

## Final deployment ownership

Integrated borrower platform deployment (chat `01a1b986-f2db-7551-993b-905946b69c64`) owns subsequent unified build/promotion on stable port3102. Runtime handoff is complete after this repair's browser checks. Preserve these runtime fixes and rerun native regression suite when adding activity hooks. No further source edits or provider calls planned by recovery chat.
