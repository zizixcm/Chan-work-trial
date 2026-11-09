# Native borrower agents: implementation verification

November 8, 2026. Repository HEAD plus uncommitted collaborative changes; final release identity and build/browser results belong to the isolated deployment report. Source hashes captured in runtime-sha256.json are a checkpoint, not a claim that later prompt changes are covered.

- Native controller integration: PASS with simulated model responses and real PostgreSQL/reader execution. Covers delegation, exact attributed answers, cited findings, package completeness, shared cost settlement, replay/access/freshness, optional amendment confirmation, rejection of confirmation for required evidence, preservation of reader-owned limitations, and retirement of stale queued work.
- Native Studio API / batch-budget / evidence-limit tests: PASS (5 focused tests).
- Root quick unit phase: PASS (117 tests at recorded checkpoint). TypeScript failed on duplicate generated `.next/types/routes.d 2.ts`; in-progress dataset and budget typing issues were subsequently fixed. Latest source-only review reports no errors outside those generated declarations. This is not a clean root quick-check pass.
- Browser Studio: PASS for both agent configurations/tools, trace chart, causal agent/model/tool span tree, and persisted native score panel. Screenshot: studio-native-score.png. Verified offline QA server used port4112 and was stopped for store handoff.
- Borrower portal new candidate browser checks: deployment owner verifies separately; not claimed by this report.
- Provider connectivity: actual bounded OpenRouter request succeeded despite reported zero credits. Credit balance is not a dispatch gate.
- Live B01 first run: structural FAIL, unnecessary investigation instead of upload guidance. Cost1122 microdollars. Preserved under ../live-b01-20261108-first/.
- Live B01 revised prompt: structural PASS, direct five-group guidance. Cost1438 microdollars,2414ms; semantic review separate. Preserved under ../live-b01-20261108-revised/ with exact synthetic dispatched input and configuration hashes.
- Cumulative smoke plus both B01 calls:2564 microdollars ($0.002564), no held reservations at that checkpoint. Same development case was tuned and rerun; no independent generalization claim.

Full dataset coverage, compatibility audit, and semantic scoring are tracked by the dataset implementation report. Scripted execution is not model-quality evidence. Real corpus and edge-case performance must not be inferred from B01.
