# Offline native Mastra verification

Candidate: HEAD `144f5a8c6ba43bc9dfbeca0fac2eaf690bf2037e` plus shared dirty checkout; this report is not a clean-commit certification. Adapter/test/dependency hashes are in `candidate-sha256.txt`. Checked November 8, 2026, ending approximately 22:29 UTC. Unrelated work and generated `.next` files were preserved.

| Check | Result |
|---|---|
| `npx tsx --test tests/evaluation-observability.test.ts` | PASS, 3 tests |
| Native Agent/tool execution and `runEvals` | PASS, scripted provider only |
| Native Workflow and required-check scorer | PASS; omitted/duplicate/failed/incomplete/wrong-case checks rejected |
| Native trace parentage, local persistence, close/reopen continuation | PASS |
| Native score and token metric persistence | PASS |
| Document/error sentinel redaction and unknown billing | PASS |
| `npm run test:agent` unit phase | PASS, 112/112 |
| `npm run test:agent` TypeScript phase | FAIL, existing duplicate `.next/types/routes.d 2.ts` declarations |
| Source-only error review in full tsc output | No adapter/harness/test source errors reported |
| Full build/integration | NOT RUN by this chat; coordinated owner verifies separately |
| Browser checklist | All items NOT RUN; no UI verification claimed |
| Real-provider/model-quality evaluation | NOT RUN; paused |
| Deployment/shared application migration | NOT RUN |

Exact quick-check output is in `quick-check.log`. TypeScript reports TS2428/TS2717/TS2536 for PageProps/RouteContext and TS2300 for LayoutProps in the duplicate generated route file. This failure is current, not merely the historical dataset-review failure. Do not call the shared checkout fully verified. The coordinator reported an isolated generated-type check passes; that is separate evidence, not a change to this command's failed result.

The native runner's item-level tracingContext is necessary: targetOptions.tracingContext alone is overwritten by runEvals. Runtime generation forwards both tracingContext and tracingOptions. Tests assert real stored parentSpanId, not merely matching trace IDs.

Scope: executable native framework and offline integration support. Full expanded dataset fixtures, semantic scorers and corpus-wide runs remain pending. The coordinator is integrating the harness with its scripted durable-controller E2E fixture; no live model claims follow from that fixture. Existing dataset independent admissions remain unchanged and admit authored evidence, not model quality.
