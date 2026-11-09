# Chat and document-processing integration review

Reviewed November 7, 2026 by the coordinating chat. This is the reconciliation of [borrower design](BORROWER_CHAT_PLATFORM_DESIGN.md), [processing design](AGENTIC_DOCUMENT_PROCESSING_DESIGN.md), and the [implementation plan](BORROWER_CHAT_MVP_IMPLEMENTATION_PLAN.md). It supplies integration decisions and acceptance criteria; it does not claim the proposed interface is implemented or deployed. Preserve the component designs and ongoing builds.

## Review conclusion

**Coordinated deployment outcome (November 7):** both builds implement the shared protocol and are deployed together at `http://localhost:3101`, with dedicated PostgreSQL on port 5434; the original 3001/5433 deployment remains running. Final candidate is `chat-processing-preview-20261107-v4`. Fresh quick/type/build and isolated HTTP/jobs/workflow/chat/AI-simulation/preparation/combined suites pass. The actual browser exercised durable request → scripted worker clarification → borrower answer → cited partial result → explicit mapping confirmation. A requirement/file refresh bug was fixed and reverified without reload while preserving the unsent note. See [final deployment handoff](../artifacts/testing/isolated-deployment/FINAL_HANDOFF.md) for exact candidate, evidence and browser checks not rerun. Results are explicitly simulated; real model quality remains deferred by the user, $0 spent, automatic linking off, and no ongoing paid/simulated worker. The current composer uses selected actions; optional notes do not guide the planner. This is an integrated local pilot with those limits, not a verified production or freeform-agent release.

**Live-evaluation decision after credit check:** deployment reports the configured OpenRouter account has no available credits. The user answered its top-up question with **“Leave live evaluation pending.”** The shared evaluation ledger records $0 known/reserved/uncertain cost and no provider generation calls. Finish independent simulated integration/browser checks; real model quality and the automatic-link accuracy gate remain pending, not passed. The user's $20 authorization remains a ceiling for a future funded trial, not ongoing borrower traffic. Do not switch credentials/providers, keep requesting a top-up, or claim simulated success satisfies the deferred real trial.

**Subsequent user matching decision:** auto-link clear matches only after a focused matching evaluation passes. Preserve visible/reversible links and manual corrections/rejections; ask on ambiguity. Until that gate passes, show suggestions/confirmation. All four product questions are now resolved for this pilot.

**Completeness-only schema adjustment:** application-wide completeness investigation remains allowed without submission readiness. Application-scoped results may omit the reserved readiness object; the current release rejects publishing readiness. Preserve structured grounded gap/reason details so chat can explain missing subject/period/fields without inventing them. This overrides the earlier unconditional readiness requirement for application-scoped results.

**Subsequent user trial/budget decisions:** the first integrated trial must demonstrate real adaptive document investigation, including selective reading of long PDFs and scans. Simulated integration is a prerequisite, not final agent-quality acceptance. The user authorizes **up to $20 total** for this first live evaluation on synthetic documents, across all chats, calls, retries and runs. Deployment is the sole live-evaluation execution/spend-ledger owner; builders prepare code and simulated checks without independently spending. Reserve/account before dispatch and stop before the cumulative cap; record known, reserved and uncertain usage. This does not authorize ongoing borrower traffic or real borrower data in the evaluation.

**Subsequent user scope decision (November 7): assess document/requirement completeness only; defer application submission readiness.** This overrides readiness as a current-release requirement throughout this review and the earlier designs. Keep grounded gaps, uncertainty, evidence history, questions and preparation continuity. Do not expose readiness claims/controls or require real submission-stage policy for this narrower release. Readiness protocol fields/objectives may remain reserved and disabled; synthetic readiness checks are future diagnostics, not the current integration gate. The current joint gate is upload/request → authorized processing → grounded completeness/gaps → conversation, with the recovery and isolation invariants below. Open question 1 is resolved by deferral.

The designs agree on product scope, ownership, command/event vocabulary, preparation continuity, authority, and readiness semantics. There is no architectural reason to rebuild either side. The critical work is a shared validated protocol and an explicit bridge from today's upload/read projections to the new preparation runtime. Running both code paths in the same server does not establish integration.

At inspection, chat has durable conversation/upload anchors and three deterministic grounded questions. Ordinary free text remains stored-only. `lib/borrower-chat/contracts.ts` still exposes legacy `indeterminate`; `uploads.ts` explicitly exposes `conversation-uploads.v1`, not processing events. `lib/postgres.ts` still invokes baseline `enqueueForDocument`/`enqueueForRequirement`. The processing chat is building Package A: isolated synthetic fixtures/contracts/persistence, not the live adaptive controller or borrower bridge. These observations are a moving working-tree snapshot, not final candidate verification.

## Decisions to carry into both builds

| Boundary | Reconciled decision |
| --- | --- |
| Product ownership | The chat agent owns explanation and interaction. One processing agent with bounded tools owns evidence investigation. Specialist agents are optional after measurement. |
| State ownership | Domain storage owns files, links, findings and lender review. A durable preparation record owns the current ledger, obligations and references across runs. Chat prose is never authoritative state. |
| Trigger | Durable save plus transactional metadata/outbox creates the eligible upload obligation. Explicit gap/readiness requests and question answers use persisted domain commands. No run depends on an open browser or response stream. |
| Authority | The server constructs actor/application scope, effective grant/epoch and pinned dependencies. Recheck at read, dispatch and commit. Automatic and explicit grants are distinct. |
| Processing strategy | The model selects admissible actions; runtime validates permissions, evidence, budgets and freshness. Do not disguise the old fixed sequence as an adaptive agent. |
| Results | Execution state, file-save status, requirement assessment, application readiness and lender acceptance are separate dimensions. A successful run may find incomplete evidence. |
| Readiness | Only application scope with a complete request ledger and pinned authoritative stage/policy can yield `appears_ready`. Unknown stage/policy prevents readiness approval. Partial scope omits readiness. |
| UI | One stable card per upload batch; non-upload requests use request-anchored cards. Update cards in place and summarize meaningful settled changes once. Polling is sufficient. |
| History | Historical authorized evidence can inform investigation; removed/superseded evidence does not silently count as active support or restore links. |
| Submission | Existing explicit borrower review/send remains the only submission path. Neither agent waives requirements, accepts evidence for the lender, or approves credit. |

## Canonical contract and remaining schema repairs

Use processing-design Appendix B as the canonical new protocol, with the following clarifications. Implement it once as runtime-validated shared schemas imported by the processor and chat adapter; do not maintain separate handwritten wire types. Existing public v1 foundation DTOs remain stable behind named adapters.

1. **Complete command snapshot.** `process_application_evidence.v1` carries `processing-request.v1`. The short JSON examples in both designs omit fields required by their later schema-completion sections. The actual snapshot must contain `contentRevision`, `inputFingerprint`, `preparationRevision`, nullable `submissionStage`, ISO `reviewDate`, nullable `submissionPolicyRevision`, `requestInventoryRevision`, and `evidenceInventoryRevision`. Validate these fields even when seed document/requirement arrays are empty. Empty seeds do not mean an empty inventory. The browser provides selectors and intent, never trusted hashes, actor fields or policy tokens.
2. **Separate two event variants.** The statement that every public event carries `runId` is too broad: `application.preparation_invalidated` deliberately has no private run linkage. Define the application stream as a discriminated union of `processing-event.v1` run events and a versioned domain-invalidation variant (use `preparation-invalidation.v1`). Both carry `eventId`, `applicationId`, opaque `cursor`, and `occurredAt`. Only run events require `runId`, `runRevision`, state and input fingerprint. Invalidation carries the authorized preparation/revision and affected references specified in Appendix B. Never fabricate a run ID to satisfy validation.
3. **Revisioned result references.** `run.result_committed.data` must identify the exact `resultId` and `resultRevision`, plus `terminal`. Hydrate that revision, never latest-by-ID. The example's string `coverageRef` is underspecified: the new shared schema should use `{id, revision}` for coverage references, consistently with `readiness.evidenceCoverageRef` and `requestLedgerRef`. If adapting a legacy unversioned locator, resolve and pin an immutable manifest first; do not invent a revision.
4. **Preparation linkage is required.** Scoped and application result resources both pin `preparationId`, `preparationRevision`, `assessmentScope`, actual inputs and dependency fingerprint. Application results additionally contain the canonical nested `readiness` object. Short example events may reference the resource, but may not make these invariants optional.
5. **Revision types have different meanings.** New `runRevision`, result projection revision and display revision are monotonic decimal strings compared numerically, not lexicographically. Existing context/upload digests remain opaque equality tokens. Application event cursors remain opaque resume tokens. Content fingerprints are not stream cursors or lease tokens. Request/policy revision tokens need equality, not assumed numeric ordering.
6. **Two artifact identities.** Event `artifactId` is the UI anchor; citation `evidenceArtifactId` is extraction/inspection provenance. Legacy record/column/quote citations remain a separately validated variant until actual artifact provenance exists. Never populate an evidence artifact field with an upload card ID.
7. **Public state mapping.** Keep `queued | running | waiting_input | succeeded | partial | failed | canceled | superseded`. Preserve event spelling `run.cancelled`; public state spelling is `canceled`. `blocked` maps to `waiting_input` with reason and required actor. The legacy assessment `indeterminate` maps to `unknown`; presentation states such as not assessed, checking and outdated do not become assessment judgments.
8. **Status cannot authorize work.** GET, event polling, reconnect, rendering, receipt replay and citation resolution schedule no processing. Explicit actions require idempotency and expected revisions. A question answer is an attributed assertion; ambiguous-link confirmation is a distinct allowed command.

These are implementation-level resolutions, not reasons to restart the design effort. Treat a changed deployed schema as a versioned migration; these clarifications apply to the still-proposed new protocol.

## Connecting the existing foundation

| Existing behavior | Integration rule |
| --- | --- |
| `borrower-context.v1` current active evidence | Keep its meaning. Add an authorized preparation inventory for current/history/removal roles and stage/policy; do not silently broaden existing retrieval. |
| `conversation-uploads.v1` receipt pagination and digest | Retain history endpoint and stable upload anchors. New current preparation cards subscribe through the shared application snapshot/event adapter. Receipt IDs and digests cannot resume the event stream. |
| `grounded-answer.v1` deterministic requested/uploaded/missing intents | Continue to serve these without a run. Add an explicit preparation/delegation intent path separately. Do not route every question to processing. |
| Ordinary message `responseState: not_requested` | Do not expose a general agent composer as functional until durable response/delegation turns exist. Existing question buttons can remain a clearly scoped preview. |
| Baseline enqueue and match→verify continuation | Select exactly one authoritative scheduler/writer for an application's processing mode. The adaptive path must not race baseline continuation writes. |
| Existing citations reject stale answer sources | Safe current foundation limitation. The new historical citation resolver needs immutable-source authorization independent of whether its old assessment is current. Do not loosen stale-answer safety to implement history. |
| Feature flags for uploads and grounded retrieval | These enable presentation slices only. Add explicit processor-mode/bridge configuration; do not assume enabling chat enables adaptive processing. |

Processor ownership is a deployment gate. A mode transition must advance an execution epoch, fence old workers at commit, and route new obligations to the selected scheduler. Reuse baseline reader/match/verify capabilities as tools without also allowing their old scheduler to advance the same application. Shadow processing writes isolated pilot results only. Rollback is another fenced mode transition, not merely hiding the new UI.

Coalescing must account for actor/visibility, objective, scope/stage and exact pinned dependencies. Command-key replay returns the original receipt even if evidence has since changed; deliberate retries get a new key, `retryOf`, fresh inputs and the same cumulative preparation budget. There is no exactly-once provider billing guarantee after an ambiguous acknowledgment.

Both sides consume the current preparation projection, not the last successful run. Evidence changes atomically invalidate affected findings/readiness even after a run completed. Unknown dependency scope invalidates conservatively. Source reads, answers and late commits must not turn a historical result current again.

## Ownership and build sequence

| Owner | Integration deliverable |
| --- | --- |
| Processing build | Shared validated request/event/result/question schemas; legacy assessment adapter; durable preparation runtime, authority/epoch and dependency fences; independently checked PREP-01 fixtures. |
| Chat build | Server delegation adapter, request/card linkage, preparation snapshot/event consumer, current/historical rendering, question actions and grounded summaries; preserve existing read-only retrieval. |
| Deployment chat | Isolated combined candidate and configuration, scheduler routing checks, migrations in isolated storage, test/browser evidence and clear feature/capability labeling. |
| Coordinating review | This boundary specification and review of integration evidence; no concurrent changes to either implementation owner's feature files. |

Sequence: finish Package A contracts/replay tests; exercise chat against those exact simulated contracts; wire durable upload and explicit-request delegation; implement Package B's adaptive selection/reading capabilities; expose Package C's preparation interaction; verify the combined candidate. A simulated bridge can be tested before live model evaluation, but cannot establish agent decision quality.

## Joint acceptance gate

Use synthetic evidence and one identified combined candidate. Each case must cover backend state **and** borrower-visible behavior.

| Case | Required outcome |
| --- | --- |
| Save, lose acknowledgment, close/reopen | Saved files survive; one obligation/card; replay returns the same receipt; no processing from reconnect. |
| Chat and outbox both observe save | Same eligible obligation, no competing baseline/adaptive writer or duplicate summaries. |
| Batch partly fails; results arrive progressively | Correct saved/not-saved facts; useful scoped findings; unresolved intake prevents unsupported readiness. |
| Read-only requested/uploaded/missing question | Grounded persisted answer; processing job/dispatch counts unchanged. |
| Explicit readiness request without an upload | Durable request/preparation anchor, complete ledger, no fake batch, unknown policy cannot yield ready. |
| Duplicate/reordered events; expired cursor | Monotonic current projections, deduplicated summaries; expiry causes consistent snapshot resync without jobs. |
| Replace/remove/restore evidence after success | Immediate outdated state, stale late commit rejected, historical citation never redirects to replacement; compatible work reused only with current authority. |
| Clarification and concurrent evidence change | Stale answer gets conflict with input preserved; factual assertion is not documentary proof; independent work can continue. |
| Disable automatic mode or revoke access mid-run | Appropriate dispatch/publication fenced; explicit grant remains separate; no private access after revocation. |
| Budget exhausted or cancel then poll | Correct operator-owned dependency or canceled status; no unchanged-work resurrection or successor budget reset. |
| PREP-01 checkpoints C0–C5 | Full request ledger, historical evidence found, duplicates do not fake progress, correct scope/readiness, no repeated request for resolved evidence. Simulated results labeled as such. |
| Switch processor mode / rollback | Old execution epoch cannot publish; exactly one authoritative writer; existing deployments/data unaffected. |

Run repository quick/full checks and browser checklist per [TESTING.md](TESTING.md) against the final candidate. Full build/browser evidence and actual model-evaluation evidence are separate. Long-PDF/visual inspection, authentic source grounding and useful action selection cannot be established by a fake provider. Preserve explicit NOT RUN/BLOCKED status for unavailable checks.

## Deployment isolation

The user authorized a new local deployment on ports different from current deployments. The deployment chat must inventory listeners and choose free ports, leaving existing processes running. Different HTTP ports alone do not isolate build output, cookies, data, files or workers.

Use separate build output/release snapshot, auth origin/cookie namespace, database/schema, private file root, queue scope and worker configuration. Cookies are not isolated by port. Review hardcoded origin/port assumptions in auth, scripts and test harness. Never bypass the existing quiet-window guard against the shared build; use an isolated candidate and document equivalent checks or blockers. The worker need not acquire an HTTP port unless it actually exposes a service.

Report actual URLs, source snapshot/dirty-file manifest, migrations/flags, process ownership, isolation, simulated/live mode and verified capabilities. A preview with chat retrieval plus an unconnected preparation skeleton is a partial preview, not deployment of the two working agents together.

## Resolved product questions

The user answered these individually in the coordinating chat:

1. **Scope:** assess document/requirement completeness only; defer submission readiness and real stage-policy configuration.
2. **Pilot completion bar:** real adaptive document investigation, including selective reading of long PDFs and scans. Simulated tests precede live evaluation but are not final proof of agent behavior.
3. **Live evaluation budget:** up to $20 total for the first synthetic-document evaluation, shared across all agents/calls/retries. Deployment owns execution and the ledger; no ongoing borrower traffic authorization. Measure latency and cost rather than inventing a response-time SLA. $0.10/run is not a mandated quality-compromising cap; configured safety/accounting limits still apply within the total allowance.
4. **Matching:** auto-link clear matches only after focused evaluation passes, visibly and reversibly; preserve manual corrections and ask on ambiguity. Builders/deployment must document and review the actual matching gate before enabling it.

There is no need to ask the user to decide enum spellings, event unions, cursor handling or scheduler fencing. Those are engineering obligations resolved above.

## Verification record

This review read the two designs, implementation-plan contracts/pilot and selected current chat/enqueue source. It added only this review document. No application code, migration, running server, data or model configuration was changed. Automated tests, browser verification and live model evaluation: NOT RUN for this documentation-only review. Prior chat test counts are historical reports, not fresh integrated verification. Deployment work is owned by the separate Integrated borrower platform deployment chat.
