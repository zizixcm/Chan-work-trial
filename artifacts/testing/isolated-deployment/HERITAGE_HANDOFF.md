# Heritage manual pilot handoff

Updated 2026-11-08T23:17:48.711104+00:00.

## Ready

Default no-sign-in portal: http://[::1]:3102/
Direct Heritage URL: http://[::1]:3102/borrower/00000000-527c-47d0-8b9c-a9f5618a8476
Studio: http://127.0.0.1:4111/

Upload folder: `/Users/chanrao/Developer/proximity-releases/mastra-agents-preview-20261108-v1/.data/heritage-pilot/Upload files`. Contains25 locally copied, hash-verified candidate files grouped R1–R5 with original readable filenames. None were preuploaded. Sources remain unchanged. Configuration: `/Users/chanrao/Developer/proximity-releases/mastra-agents-preview-20261108-v1/.data/heritage-pilot/configuration.json`; allowlist: `/Users/chanrao/Developer/proximity-releases/mastra-agents-preview-20261108-v1/.data/heritage-pilot/registry.json`; manifest: `/Users/chanrao/Developer/proximity-releases/mastra-agents-preview-20261108-v1/.data/heritage-pilot/upload-manifest.json`.

Selected borrower/property: Heritage Partners III, LLC / 290 Miron Drive #4, Southlake, TX76092. Five authored request groups are a subset of the lender needs list, explicitly a June2026 historical replay rather than current-date underwriting. Purpose/period/criteria carry that context to both agents. No Aster facts, borrower assertions, acceptance or completeness were seeded. Requested amount was absent from config; required integer storage uses0 with an explicit unspecified placeholder note, not an asserted loan amount.

## Isolation and preserved data

Existing release `/Users/chanrao/Developer/proximity-releases/mastra-agents-preview-20261108-v2`, PostgreSQL5434/preview schema preview_v6, LOCAL_DEMO_MODE=1. Portal PID5239 unchanged; new single Studio/worker PID11228, exec session97289. Original3001/3101 deployments unchanged. Heritage uses the same demo borrower identity as worker admission. Aster application b0dcd236-7da1-44e2-a26a-42a2e837afe1 remains active and accessible by direct URL with all files/history/evals retained. Root selects the lexicographically first active application; Heritage's00000000-prefixed UUID makes it default without deleting or deactivating Aster.

Worker registry switched to the separate Heritage registry, leaving Aster registry intact. Worker is scoped to Heritage and25 approved hashes; automatic processing false, automatic linking off. Real selected excerpts/pages through OpenRouter/configured Gemini were explicitly approved for requested investigations. Same first-pilot-20261108 batch$5, investigation$2, app$5 and cumulative$20 ceilings; same authoritative shared ledger, no resets. Studio remains single-writer/read-only for generic generation endpoints. No broader evaluation suite launched.

## Verification

- All25 source files matched approved SHA256 and size before setup/copy.
- Seeded5 groups; all confirmation policies empty; all purposes contain June2026 historical framing.
- Initially0 documents,0 results,0 messages,0 agent turns. Empty conversation record initialized because the existing native view otherwise throws Agent unavailable before the first message. It contains no fabricated borrower message.
- No-cookie session identity equals worker registry user. GET bridge returned200, agentEnabled=true, agentPending=false,5 requirements,0 documents.
- Hydrated no-sign-in browser selects Heritage and shows the freeform composer hint, not legacy note-only controls. Screenshot `heritage-pilot-ready.png`.
- Native POST routing is confirmed by the enabled adaptive branch and an externally submitted What's requested? message during verification. Deployment did not submit that message; the bounded worker consumed it and returned a Heritage-specific checklist. Last check:1 borrower message,2 displayed turns,0 queued turns,0 documents,0 results. This validates deployed conversation routing, not real-document assessment quality.
- Studio /pilot/health200 after restart; idle ticks continue.
- Reader update quick check passed all120 unit tests and TypeScript in isolated physical dependencies. No root install/build or source mutation performed for this Heritage task.
- Actual approved operating agreement (23,207,300 bytes) inspected as39 pages; selective page1 native text read776 characters in2604ms through credential-free isolated child reader, zero provider calls. Report `/Users/chanrao/Developer/proximity-releases/mastra-agents-preview-20261108-v1/.data/heritage-pilot/release-reader-verification.json`. This is reader capability only, not document acceptance or signature authentication.

The reader's shared25MiB bound now matches existing top-level admission; original384MB memory,45s timeout, page/image/OCR bounds remain. No need to split the agreement solely for the previous20MiB mismatch.

## Exact source changes

Frontend production bundle unchanged; existing native runtime reads TypeScript directly. Release-only worker label patch replaces synthetic-only wording/displayName with allowlisted pilot/Pilot borrower; no hash, authorization or budget logic changed. Root integration patch: `artifacts/testing/isolated-deployment/heritage-worker-label.patch`.

Synced owner-tested root files: `lib/preparation/evidence-limits.ts` (new shared bound), `lib/preparation/pdf-tools.ts`, `lib/preparation/evidence-tools.ts`, `tests/preparation-reader.test.ts`. Composite provenance records base snapshot plus runtime override hashes at `/Users/chanrao/Developer/proximity-releases/mastra-agents-preview-20261108-v2/candidate-heritage-runtime.json`; SHA256 23b4a7a36b17f17a2f20eb99d651148117ff2c309255e7deab7ae05345587ca4. Portal route tree does not import these reader implementations; worker restarted after quick checks. No new migrations or app rebuild.

Operational setup scripts are release `.data/seed-heritage.ts`, `.data/initialize-heritage-conversation.ts`, `.data/verify-heritage-reader.ts`. Environment points PREPARATION_EVALUATION_REGISTRY to Heritage and PREPARATION_EVALUATION_SCENARIO=manual-heritage-pilot-20261108. Local launcher remains `.data/start-studio.cjs`; provider key stays out of portal config and is supplied to worker process only.

## Spend and remaining gaps

Setup itself requested no model generations. An externally submitted manual message was processed after worker restart: cumulative ledger now16 calls, $0.028844 accounted, $0 held (previous$0.027016; new reply$0.001828). These totals may advance with subsequent user messages. Remaining nominal batch allowance at that check$4.971156; reservations may constrain a run sooner. All earlier evaluation history preserved.

No real document has been uploaded, investigated or marked complete. First user-uploaded investigation remains to be evaluated. Full borrower/lender submission browser checklist was not rerun; this task verified configuration, empty admission, native chat response, reader capability and Studio health. The live checklist reply should receive semantic review separately; a response alone is not proof every historical wording is correct. No application switcher is implemented; use direct Aster/Heritage links. No OS boot-service persistence or public deployment.
