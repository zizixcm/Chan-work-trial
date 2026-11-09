# Final isolated local deployment handoff

Updated 2026-11-08T07:00:25.879032+00:00. Originally recorded 2026-11-08T06:55:13.154484+00:00. This supersedes the chronological status notes.

## Running deployment

- Frontend and backend: http://localhost:3101
- Synthetic borrower application: http://localhost:3101/borrower/63e5afc7-da26-4b8f-9d80-1ccf5c602b45
- Candidate: `/Users/chanrao/Developer/proximity-releases/chat-processing-preview-20261107-v4`; PID 70201; production Webpack build.
- Base commit: `144f5a8c6ba43bc9dfbeca0fac2eaf690bf2037e` with 288 frozen source files. Exact dirty candidate is identified by `candidate.json`, SHA256 `8f1cd98d296884fa1cc11c1a28210626f1b87b9df57712c14f953bc875b9808b`. Processing owner's final manifest matches all files.
- Database: dedicated Docker PostgreSQL on 127.0.0.1:5434, database preview, schema preview_v3 retained across the UI-only v4 update (no public search-path fallback), unchanged final migrations 001–021.
- Persistent local files/accounts: `/Users/chanrao/Developer/proximity-releases/chat-processing-preview-20261107-v3/.data/` (intentionally retained for v4); credentials in `.data/local-accounts.json` (not printed). Separate authentication secret/cookie hostname from original deployment.
- Original app PID 81462 on 127.0.0.1:3001 and database port 5433 preserved. Prior isolated schemas/files retained.
- Conversation, uploads, retrieval and processing bridge enabled. Automatic processing preference false; automatic linking gate off. No provider key in preview configuration. No ongoing paid or simulated worker.

## Automated verification

PASS: `npm run test:agent`, fresh `npm run build -- --webpack`, HTTP, jobs, workflow, chat, complete-evidence and missing-evidence simulated AI suites. Exact steps/results/logs: candidate `verification/`.

PASS on final candidate: `npx tsx tests/preparation-pilot.integration.ts`, `npx tsx tests/preparation-runtime.integration.ts`, `npx tsx tests/deployment-combined.integration.ts`. These cover real migrations, authorization, revisions, budgets, replay, cancellation, processing publication into chat, duplicate suppression and stale-result invalidation with simulated planners.

The normal full wrapper was replaced by equivalent isolated sequential commands because it refuses any port-3001 listener; the existing app was deliberately preserved. Default Turbopack build has an existing worker-file path failure; Webpack production build passed. No model-quality claims follow from these checks.

## Browser checklist and candidate scope

Final v4 fresh automated verification passed again. The UI-only mapping refresh change touched borrower-portal, connected-processing-conversation, processing-conversation and conversation-ui. v3 browser evidence below is retained with its scope; v4 independently repeated upload, clarification/answer, partial-result publication, manual mapping confirmation, freshness invalidation, both file/requirement views, draft preservation and 390/1280px checks. No provider calls. No migration changes.

| Area | Outcome |
| --- | --- |
| Sign-in/access | PASS borrower sign-in and anonymous redirect; lender sign-in/out and wrong-role checks NOT RERUN on v3 (passed earlier candidate). |
| Navigation | PASS application list, application, Upload and By requirement; full remaining navigation NOT RUN on v3. |
| Upload/persistence | PASS real synthetic 36-page PDF and image-only PDF uploaded; saved files and conversation survive refresh. Download byte check NOT RERUN on v3. |
| Validation/recovery | PASS simulated processor limit state displayed honestly; unsupported-file recovery NOT RERUN on v3. |
| Organization | PASS result confirmation persists a real link after refresh and invalidates old findings. RESOLVED and independently PASS on v4: confirmed link appears in both requirement and file views without reload; unsent message survives confirmation and tab switching. Unlink/removal/restore NOT RUN on v3. |
| Submission/lender review | NOT RERUN on v3; earlier candidate synthetic cycle passed. Completeness is separate from readiness/acceptance. |
| Processing UI | PASS actual service/runner with scripted planner: queued → clarification → browser answer → queued → partial result, source filename/page 32/quote, source keyboard focus and Escape return, confirmation-only mapping, freshness invalidation. |
| UI quality | PASS 390px and 1280px no horizontal overflow; no captured warning/error logs during initial final-candidate journey. Source focus/Escape PASS; comprehensive keyboard/failed-request audit NOT RUN. |
| Live adaptive quality | DEFERRED at explicit user request. Scanned interpretation, adaptive investigation quality and auto-link correctness pilot NOT RUN. |

Simulation used the real PDF reader for long-document page 32 text and scan page 1 rendering. Every generated finding/question was marked SIMULATION ONLY; all final criterion outcomes were unknown. The operational harness initially tried a positive finding alongside a material limitation; the processor correctly blocked it. Harness changed to unknown outcomes and its one synthetic run was explicitly requeued; app source was not changed. The resulting partial result and confirmation action were exercised in the browser. No simulated result is evidence of model quality.

Resolved v3 UI issue reproduction: confirm suggested link in conversation, switch to By requirement → No files; reload → package-01.pdf is linked to April rent roll - Cedar Court. Chat owner fixed successful confirmation to refresh parent portal data alongside chat. Frozen v4 passed fresh checks and the exact browser regression: confirm → By requirement shows 1 file → By file shows 1 linked requirement and checked Cedar Court, with no browser reload between steps. The unsent note remains intact. No source changes after v4 build.

## Live evaluation and spend

User explicitly chose **Leave live evaluation pending**. No further credit prompts or paid attempts. Authoritative cumulative ledger: `/Users/chanrao/Developer/proximity-releases/chat-processing-preview-20261107/.data/live-evaluation-ledger.json`; zero calls, $0 spent, no uncertain reservations, $20 ceiling retained. Automatic linking is not enabled. Any later live run requires deliberate resumption; it must use the same cumulative ledger and focused matching gate.

The bounded live adapter/runner is prepared, including image payloads, actual application/request context, configuration digest and pre-dispatch cost reservations, but has not made live model calls. Pilot PDF tools remain for synthetic evaluation, not general untrusted production uploads. Optional conversation notes do not guide processing in this version.

## Evidence and limitations

Final regression screenshots: `v4-link-without-reload.png`, `v4-file-without-reload.png`, `v4-mobile.png`. Earlier scoped screenshots: `v3-mobile.png`, `v3-desktop.png`, `v3-simulated-source.png`, `v3-confirmed-link.png`. Frozen source manifest remains in candidate; operational simulation script is candidate `.data/simulate-browser.ts`, outside application source/build.

Source working-tree edits and local data preserved. One earlier accidental `npm ci` refreshed shared source node_modules with its existing lock; disclosed in chronological status and `shared-dependency-install.log`. Original running deployment uses its separate release tree. No commit, push or public deployment performed.

Result: local frontend/backend deployed and automated/simulated integration verified within the listed scope; immediate post-confirmation view refresh fixed and reverified, broader browser checklist remains scoped/partial, live evaluation deferred.
