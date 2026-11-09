# Chat integration status

**READY FOR SNAPSHOT — chat changes frozen, November 7, 2026.** The earlier shared planner TypeScript blocker is resolved: processing reports its combined quick check passed 103 tests plus TypeScript, and chat independently refreshed the source-linked test view and reran `npm run typecheck` successfully. No implementation changes in this handoff update. Live evaluation remains externally blocked on provider credits.

## Post-snapshot fix: mapping refresh — READY FOR SNAPSHOT

Deployment reproduced a saved mapping that appeared in requirement/file views only after full page reload. Successful conversation mapping now refreshes its processing projection and awaits the portal's existing `load` callback, which fetches the authoritative application snapshot. No optimistic link state, navigation, component remount, or page reload is introduced; conversation drafts and current view/scroll are retained.

Exact implementation files changed for this fix:
- `app/components/borrower-portal.tsx`: passes existing `load` callback.
- `app/components/connected-processing-conversation.tsx`: forwards callback.
- `lib/borrower-chat/conversation-ui.ts`: optional `onUpdated` callback contract.
- `app/components/processing-conversation.tsx`: invokes callback only after successful mapping confirmation, while also refreshing chat.

`npm run test:agent` PASS: 103 tests plus TypeScript after this fix. Log: `artifacts/testing/chat-mapping-refresh-quick.txt`. Deployment must reverify the exact browser scenario on the refreshed candidate: type a draft, confirm a suggested link, switch to requirement/file views without reload, verify saved association and preserved draft/scroll. This new browser scenario is NOT RUN by this builder. No other feature edits. User clarification: no separate sign-in/auth page for chat; chat stays inside the existing application with its existing server access checks.


Candidate: HEAD `144f5a8c6ba43bc9dfbeca0fac2eaf690bf2037e` plus existing dirty working tree; final checks on 2026-11-07. No shared preview restart, shared migration, deployment, or paid calls by this chat.

## Implemented and bounded

- Grounded requested/uploaded/missing retrieval uses authorized application facts, persisted turns and immutable source references. Reads never dispatch processing. Changed evidence prevents stale answers/results being presented as current; pending checks remain distinct from missing evidence or a satisfied requirement.
- Stable upload cards and durable explicit investigation intents bind to the real processor admission receipt. Crash-before-admission and crash-after-admission replay preserve identity. `dispatchPendingChatDelegations(pool, limit)` is exported and invoked by the preparation runner hook and deployment evaluation runner.
- The bridge consumes the shared protocol, exact result revisions, events, invalidations and pending questions; restores active/terminal cards; validates private cached projections before current display. Completeness only; submission readiness remains disabled.
- Real `PreparationService.answer` records attributed borrower assertions. Explicit result mapping confirmation calls `confirmPreparationMapping` without the internal automatic gate. Manual corrections/rejections take precedence. Automatic linking stays disabled pending matching-quality evidence.
- Migration 020 owns chat persistence; processing owns 021. `bridge-schema.sql` is the equivalent standalone schema, not an additional required migration. The bridge temporarily reads immutable command/receipt details inside the processor authorization transaction; it does not write processor tables.
- `/api/applications/{id}/conversation/bridge` and the connected Upload-view conversation are default-off behind `BORROWER_PROCESSING_CHAT=1`. GET/reconnect are read-only. Existing upload controls are reused.
- Source previews show filename, page or record/column, and quote; technical hashes/raw IDs are not displayed. Source opening focuses its heading; Escape restores the source button. Pending and blocked steps use ordinary borrower-facing labels.
- The selected composer action controls execution. Optional text is saved in the conversation but is not currently supplied to the planner; the UI says so explicitly. Freeform intent routing is outside this candidate. Current worker clarification replies are text/choice assertions; link-question variants remain unsupported, while result-level mapping confirmations are connected.

## Final verification

- **PASS:** all 103 unit tests. The original following TypeScript failure is retained in `artifacts/testing/chat-bridge-quick.txt`; the subsequent independent `npm run typecheck` passed after the owner fix. Processing also reports a full combined quick pass; its candidate manifest is `artifacts/testing/preparation/candidate.json`.
- **PASS:** `npm run test:chat-integration`, disposable PostgreSQL schemas. Covers authorization, replay/concurrency, upload anchors/backfill, grounded answers/citations/stale fences, durable admission recovery, actual worker result consumption, clarification answer/replay, and explicit mapping confirmation/replay/stale rejection. Mapping uses a real synthetic PDF and actual PDF reader with a scripted planner. No model-quality claim. Log: `artifacts/testing/chat-bridge-integration.txt`.
- Commands ran against the isolated source-linked test view with existing release dependencies because workspace dependency reads stall. No dependency replacement or local-data reset.
- **PASS, simulated UI fixture only:** lost-ack retry saves one turn; clarification conflict preserves draft; answer acceptance removes the form; exact quote preview; source keyboard focus/close; 390px and 1280px layouts; no observed console warnings/errors. Final screenshots: `artifacts/testing/chat-ui-simulated-mobile.jpg` and `chat-ui-simulated-desktop.jpg`.
- **NOT RUN by chat:** full fresh build/HTTP suites and integrated deployed browser checklist (sign-in, actual upload, organization, lender/submission, real investigation). Shared-preview quiet-window constraints apply; deployment owns isolated combined verification. Fixture UI checks do not establish deployed acceptance.
- **External live-evaluation blocker, reported by deployment:** OpenRouter account has zero credits. Deployment owns the pending user top-up question and one cumulative $20 synthetic evaluation ledger. No alternate credentials or paid calls attempted here. Automatic mapping quality gate remains closed.

Remaining release work is a frozen fresh build with migrations/flag and deployment-owned end-to-end evidence. Upload coalescing/ownership and adaptive worker acceptance remain processing-owned; see `PROCESSING_INTEGRATION_STATUS.md`.


## User clarification: borrower app has no login screen

The user clarified that the entire borrower app, not just chat, must open without a login page for this MVP. Existing `lib/demo-mode.ts` and `lib/portal-session.ts` already supply the seeded borrower identity in localhost demo mode; `/login` redirects into the app. Chat enabled `LOCAL_DEMO_MODE=1` in the existing workspace `.env.local`. Deployment owner must carry that setting into the isolated preview and restart its own process, then verify a fresh browser opens `/` and the borrower application without credentials. No shared preview was restarted here. Existing membership/data checks remain; no new auth UI or demo implementation was added. This supersedes the earlier narrower “no separate chat login” note.


## No-login preview restarted and verified — November 7, 2026

At the user's explicit request, restarted the existing v4 preview at http://localhost:3101 with LOCAL_DEMO_MODE=1 in its release configuration. New process PID 71122; same built candidate, database, and files. Original port-3001 application unchanged. No rebuild, migrations, reset, or worker/provider calls. Cookie-free HTTP checks passed for /, /api/session (demoMode true, borrower), and the borrower application. /login redirects to /. Browser confirmed application list and the application's upload/conversation view open without sign-in; login URL returns to application list. No observed warning/error logs. Screenshot: artifacts/testing/borrower-no-login.png. This supersedes the earlier pending-restart note.


## Chat-first landing workspace — implemented and locally verified

User replaced the old header, application-list landing, and upload-page structure with a ChatGPT-like workspace. `/` selects one existing authorized borrower application; `/borrower/[applicationId]` uses the same new shell. Slim left icon rail with Loan application tooltip and local illustrated avatar, one persisted loan conversation in a collapsible sidebar, full-height chat, docked composer/attachment tray, and on-demand right document/source panel. Mobile uses a full-height preview overlay. Existing conversation, retrieval, uploads, mapping refresh callback and pending/stale contracts are retained. No new model routing or provider calls. The selected question still determines intent; optional notes remain saved context only and this is disclosed.

Current preview: http://localhost:3101, PID 74227, release `/Users/chanrao/Developer/proximity-releases/chat-workspace-preview-20261107-v5`. Existing preview database/files retained; no migration/reset. Old port 3001 unchanged. Local no-login setting retained. Exact changed-source hashes: `artifacts/testing/chat-workspace-candidate.json` (based on v4 plus the listed UI files). This replaces the v4 runtime and earlier frozen-chat handoff.

Native PDF viewer was blank in the in-app browser. The workspace now renders one PDF page at a time with installed PDF.js, a same-origin worker, bounded canvas size, page controls and authorized original bytes. Existing non-workspace native preview behavior is preserved. Worker asset is copied from installed pdfjs-dist 6.5.438 and must be kept in sync on dependency upgrades.

Verification: final 103 unit tests + TypeScript PASS; fresh Webpack production build PASS; isolated chat integration PASS; HTTP upload/download/access/isolation/persistence suite PASS. Logs are `artifacts/testing/chat-workspace-{quick,build,integration,http}.log`. Full wrapper not run because original port 3001 remains active; jobs/workflow/live model suites not rerun for this UI change.

Browser PASS: no-login root opens the chat; persisted conversation reloads; suggested uploaded question returns grounded facts; file and citation clicks open the correct right panel; a 36-page PDF renders and next-page works; an image-only PDF renders; unsent draft survives preview/attachment panel toggling; Escape/close restores source button focus; attachment tray exposes the existing uploader; 390px/1280px/1440px layouts keep composer visible with no horizontal overflow; no observed warning/error logs. New browser upload was not repeated (HTTP upload suite passed). Lender/submission flow not reverified for this borrower-only layout. Live processing remains deferred.

Screenshots: `artifacts/testing/chat-workspace-desktop.png`, `chat-workspace-mobile.png`, `chat-workspace-document.png`. No further edits after final candidate build/browser verification.
