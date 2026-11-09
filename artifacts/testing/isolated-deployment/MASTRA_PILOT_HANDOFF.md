# Integrated local Mastra pilot handoff

Updated 2026-11-08T23:09:00.862962+00:00. Supersedes earlier preview handoffs for the new two-agent pilot.

## Open the pilot

- Portal, no sign-in: http://[::1]:3102/
- Direct synthetic application: http://[::1]:3102/borrower/b0dcd236-7da1-44e2-a26a-42a2e837afe1
- Native Studio: http://127.0.0.1:4111/
- Revised live B01 trace: http://127.0.0.1:4111/traces?traceId=3455824a70406d81547e0387963a0c0f
- Upload fixtures: `/Users/chanrao/Developer/proximity-releases/mastra-agents-preview-20261108-v1/.data/manual-pilot-files` (nine D01 synthetic PDFs; one already uploaded for persistence QA).

Portal PID 5239 (exec session43962); Studio/worker PID4012 (supervised by `.data/start-studio.cjs`, exec session75588). Both are loopback listeners. Portal source/build is `/Users/chanrao/Developer/proximity-releases/mastra-agents-preview-20261108-v2`. Original PID81462 port3001 and PID74227 port3101 remain untouched.

## Exact candidate and isolation

Base commit `144f5a8c6ba43bc9dfbeca0fac2eaf690bf2037e` plus 829 frozen files. Manifest `/Users/chanrao/Developer/proximity-releases/mastra-agents-preview-20261108-v2/candidate.json`, SHA256 `3beb4ebf11911e33a2ea001758318300212b5c4ef8a96d76dc82ccdafc68404c`. Includes revised main-agent prompt and late scheduler stale-run fix. Frozen source is distinct from the shared dirty workspace; dependencies are physical and installed from its lockfile.

PostgreSQL 127.0.0.1:5434, database preview, schema preview_v6 only; migrations001–023 applied. Dedicated file/auth root `/Users/chanrao/Developer/proximity-releases/mastra-agents-preview-20261108-v1/.data`. Migration023 defaults to empty criterion policy; only the D01 synthetic R2.chain criterion opted into no-amendments confirmation. No existing schema/backfill changed. Earlier preparatory Cedar application retained but its borrower membership deactivated so the default demo opens Aster Quay.

LOCAL_DEMO_MODE=1 is enabled only in this release. No-cookie GET / and direct borrower page return200; GET /login returns307 to /; GET /api/session returns demoMode true, borrower role and the exact worker registry user. Loopback Host enforcement remains. No separate login is needed. IPv6 origin also avoids cookie-host collision with the preserved localhost/127.0.0.1 previews. No source change or rebuild was needed for the existing demo-mode switch.

## Runtime and budget

Native borrower and investigation agents are registered in one Studio/worker process, the sole writer for this pilot's Mastra store. The worker is armed for this synthetic application only, checks the document SHA256 allowlist and runs serial ticks. Automatic upload processing preference is false; automatic linking gate remains off. D01's initial context is an attributed synthetic borrower message whose turn was marked superseded fixture_context_only, so seeding made no generation call. Model input excludes private corpus oracle/reviewer files.

Live worker credential is supplied in process memory by the operational launcher; portal/release `.env.local` has an empty provider key. Generic Studio generation/mutation endpoints are blocked; read-only trace/chart/score query APIs work. No automatic dataset suite runs are scheduled.

Shared ledger remains `/Users/chanrao/Developer/proximity-releases/chat-processing-preview-20261107/.data/live-evaluation-ledger.json`. Batch `first-pilot-20261108`: $5 cap; investigation $2 cap; app budget $5; cumulative ceiling $20. Pre-dispatch global/batch reservations remain conservative. At handoff: three calls, $0.002564 accounted, $0 held. Startup, initial context, no-cookie/browser reads and upload QA added zero calls. User messages in the manual pilot can incur bounded model calls. New dataset cases still require case-specific approval.

OpenRouter GET credits reported zero, but actual generation succeeded. Do not use credits0 as a generation gate.

## Verification

PASS on this final frozen release: quick unit tests + TypeScript; fresh Webpack production build; HTTP, jobs, workflow, chat integration; complete and missing-evidence simulated AI suites. Exact commands/logs/results under `/Users/chanrao/Developer/proximity-releases/mastra-agents-preview-20261108-v2/verification`. Equivalent isolated full runner used because the repository wrapper refuses an existing port3001 listener; preserved that service. Default Turbopack worker-path issue remains outside this change; Webpack build passes.

PASS `tests/borrower-agents.integration.ts`: actual native Workflow/runEvals/scorer, real durable controllers, both agents with scripted transport, evidence reader, clarification/answer, completeness/citations, replay/access/freshness/accounting, stale-run scheduler regression and trace persistence. Log `verification/borrower-agents.log`. Its clearly named offline-native-journey trace is in the same Studio store. No model-quality claim.

Browser checklist for final release:

| Item | Outcome |
| --- | --- |
| Access | PASS no-sign-in root/application/session API and login redirect; backend actor equals registry; initial normal borrower login also passed before demo mode. Lender/wrong-role full browser flow NOT RERUN. |
| Navigation | PASS default borrower workspace/direct application and attachments. Broader application/lender navigation NOT RUN. |
| Upload/persistence | PASS one allowlisted D01 PDF uploaded and still Saved after refresh; no investigation automatically started. Download byte comparison NOT RERUN. |
| Validation/recovery | Automated HTTP coverage PASS; browser unsupported-file and retry paths NOT RERUN. |
| Organization | Previous candidate manual mapping regression passed; current native-agent mapping UI NOT RERUN. |
| Submission/lender review | NOT RUN on this candidate; pilot does not establish approval/readiness. |
| Agent behavior | B01 direct native live harness tested; deployed browser live message-to-response NOT RUN to avoid another unrequested case. Worker idle ticks verified with unchanged ledger. Broader document-agent live quality NOT RUN. |
| Studio | PASS both agent definitions, actual B01 Workflow→agent→model→native tool span tree, token/cost display, trace chart, Scores(1)=1.00. This is structural scoring, not semantic quality certification. |
| UI quality | Desktop workspace verified, no observed browser warning/error logs. Mobile override did not take effect (reported1280px), so final390px verification NOT RUN; earlier screenshots do not count. Full keyboard audit NOT RUN. |

B01 first live run failed by delegating an unnecessary investigation. One explicitly approved prompt revision/retry passed all five structural checks and replied with five document groups. Original/revised artifacts retained: `artifacts/testing/live-b01-20261108-first` and `artifacts/testing/live-b01-20261108-revised`. Revised cost$0.001438, first$0.001122, connectivity smoke rounded$0.000004. Independent semantic review remains separate. This tuned success is not broad agent accuracy proof.

Dataset owner owns the full16 persisted offline probe in a separate store. Its results are not merged into this Studio store or claimed as live quality evidence. See their final report when available.

## Operations and caveats

Portal restart command from release: `./node_modules/.bin/next start --hostname ::1 --port 3102`. Studio/worker: `node .data/start-studio.cjs`. Check process ownership before stopping anything. Stop Studio/worker gracefully before opening/copying its DuckDB store; never start a second writer. Startup failures and ticks are logged in `/Users/chanrao/Developer/proximity-releases/mastra-agents-preview-20261108-v2/.data/studio.log`. Restart does not reset spend or budgets.

Both services run in this session, not an OS boot service. The manual pilot accepts only the supplied synthetic fixture hashes; unrelated uploads fail worker admission and require deliberate review. No public deploy, commit or push.

Operational incident: deployment accidentally ran `npm ci --ignore-scripts` in the shared source while the corpus probe was active, then completed correct `npm ci` in the isolated release. The transient missing p-map failure likely came from this overlap. Root p-map exists again. Source/application data were not edited by installation, but shared dependencies were refreshed; do not claim otherwise. Details: `dependency-incident-20261108.txt`. No further root dependency mutations.

Screenshots: `mastra-no-signin-pilot.png`, `mastra-live-b01-studio.png`. Overall: integrated exploratory local pilot running, verified within the explicit scope above; broader semantic evaluation and full final browser checklist remain incomplete.
