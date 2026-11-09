# Native Gemini 3.8 Flash suite dispatch handoff

Snapshot: /Users/chanrao/Developer/proximity-releases/dataset-3_8-suite-20261108-v1
Runtime: agent/controller/reader source copied from unified-pilot-20261108-v9; isolated adapter additions. No pilot/app/store changes by evaluation chat.
Frozen manifest: artifacts/testing/suite-manifest.json
SHA-256: cb4e9b459e06f5aca270abd15b3609b761d5d38766a75577a37552a9cc257577
Review rules: artifacts/testing/SUITE_REVIEW_PLAN.md

Final quick: 152/152 unit tests and TypeScript PASS (suite-final-quick-reverified.log). Earlier mock-fetch TypeScript error corrected and reverified; source-sync UI fixture mismatch resolved by copying matching v9 component source. Real native SDK mocked-request check passes model, 24k, medium, image part, full-context reservation and usage settlement. Offline journey sweeps retained separately; these are plumbing checks, not model-quality passes. No UI/browser verification claimed for this CLI adapter.

Dispatch only after your pilot promotion/stream verification and exclusive ledger window. Preserve existing environment/ledger and application data. Both agents use 3.8 Flash with 24k combined output, medium reasoning. Keep existing $2 application/run, $5 shared batch and $20 cumulative limits. No cap or batch changes. Use existing shared ledger and real credential without printing them.

With DATASET_EXECUTION=live-exploratory, PREPARATION_EVALUATION_LEDGER pointing to the existing ledger, PREPARATION_EVALUATION_BATCH_ID=first-pilot-20261108 and PREPARATION_EVALUATION_BATCH_LIMIT_MICROS=5000000:

    node scripts/run-dataset-live-suite.mjs

This verifies all frozen files, sequentially runs 13 admitted cases (D01,D03,D02,D04,D05,D06,D07,D08,DEV-HISTORY,H01,H02,H03,H04), creates fresh disposable schemas and preserves raw artifacts under artifacts/testing/suite-live. It stops dispatching if unknown costs, a bound violation or shared budget headroom disallow another reservation. No retries or automatic judge calls. Each case report may say passed:false because semantic review is intentionally pending; CLI exit 0 means execution completed, not model quality. Do not edit model/prompt/gold between cases, including holdouts. Unknown-cost or cap stops must remain explicit blocked rows.

Report actual before/after ledger and exclusive-window restoration. Send progress/results to eval chat for content adjudication. Restore pilot worker afterwards. The three unimplemented lifecycle overlays and uninstantiated turn/task seeds are excluded, not passed.
