# AI document matching and requirement assessment

The application must connect uploaded documents to relevant requirements and assess whether the combined evidence fulfills each requirement. Single and multiple uploads use the same durable workflow. The application owns authorization, scheduling, persistence, retries and status; models return validated findings with source evidence.

This specification records the design agreed on November 7, 2026. It supersedes conflicting workflow proposals in AI_PLAN.md; it does not imply every requirement below is implemented.

## Delivery and rollback

The pre-integration code is preserved in commit `66db429`, tagged `checkpoint/pre-ai-workflow`, on `main`. Implementation proceeds on `codex/ai-workflow-integration`. The checkpoint contains source, migrations, tests and existing project artifacts. It excludes local credentials, private uploaded files and database contents. It is a code rollback point, not a database backup.

To inspect or run the baseline without discarding integration work, create a separate checkout with `git worktree add ../proximity-checkpoint checkpoint/pre-ai-workflow`. Install dependencies and provide appropriate local configuration separately. Do not run an old application against a subsequently incompatible database: back up data before any future migration and define its rollback procedure. The first integration increment has no migration and makes no deployment change.

## Functional requirements

1. Each saved supported document automatically queues matching when borrower AI consent is enabled. A match examines one immutable document version against multiple eligible requirements from the same application.
2. Matching returns relevant, not relevant or uncertain for every requested candidate, with a reason and verifiable source citations. Missing candidate results are not implicit negative matches. Unknown categories and unsupported content are explicit outcomes.
3. Valid relevant matches may create model-origin relationships. Human-created relationships and explicit human rejections take precedence. One document can support several requirements and one requirement can use several documents.
4. Each affected requirement is assessed using its entire current associated evidence set within the actor's visibility scope, including documents from earlier uploads.
5. Borrowers and lenders can request checks manually. Equivalent current work is reused; manual requests promote pending automatic work. Explicit reanalysis bypasses successful-result reuse. Lender checks use submitted evidence, never borrower-only drafts.
6. Assessment evaluates every criterion and returns met, not met, unknown or conflicting, with evidence, missing items and limitations. The application derives fulfilled, partially fulfilled, not fulfilled or unable to determine from explicit mandatory/optional/alternative criterion rules. No mandatory criteria means unknown until the definition is made assessable. AI assessment never constitutes lender acceptance.
7. Execution state, evidence freshness, AI assessment and human review decision remain separate. A transport failure cannot become a negative assessment. An outdated prior result remains historical and visibly outdated.
8. Additions, removals, replacements and relationship edits invalidate affected evidence sets. Definition changes invalidate relevant matching and assessment. Replacement considers both former and new relationships. New requirements reconsider existing documents. Automatic refresh remains subject to consent and authorization.

## Workflow and interfaces

Upload -> persist immutable file -> structural validation and reusable extraction -> per-document matching -> collect affected requirements -> requirement assessment -> validate citations and coverage -> atomic freshness-checked commit -> UI refresh.

Application job requests carry authorized resource references, scope and input fingerprints; workers resolve private content only after authorization. Model requests contain bounded evidence and definitions, without database credentials or write tools. Model responses are versioned JSON validated at runtime. Source citations identify immutable document versions and exact page, table or cell locations.

Document preparation distinguishes file corruption, extraction limitations and requirement-specific missing information. Cache extraction by content hash, extractor version and security scope. Cache matching by document content, candidate definitions and analysis version. Cache assessment by requirement definition, associated evidence, visibility scope and analysis version. Cache hits never bypass authorization.

Use input fingerprints for requirement definition freshness initially. Do not introduce a separately managed catalog-version subsystem unless catalog editing warrants it. Requirement fulfillment changes do not themselves alter definition identity.

## Interface alternatives

| Option | Strength | Cost or risk | Decision |
| --- | --- | --- | --- |
| One document and several requirements | Small failure boundary, parallelism and reusable matching | Cannot assess combined evidence | Matching interface |
| One requirement and associated evidence | Detects combined coverage and contradictions | Shared evidence may be read for multiple requirements | Assessment interface |
| All documents and all requirements | Joint context and fewer calls | Large contexts, broad retries and invalidation, difficult auditing | Not default |
| Autonomous tool-using agent | Flexible search | Unbounded work and more complex permissions and replay | Deferred |

For a small catalog, include all eligible requirements. At larger sizes, shortlist by subject, period and category with retrieval assistance, record candidate coverage and expand uncertain searches. Never silently truncate the catalog or evidence and report exhaustive analysis. Large evidence sets need bounded source retrieval or structured extraction that preserves coverage; incomplete coverage is a limitation, not fulfillment.

## Upload batching and coalescing

Create a durable upload batch with a manifest and explicit finalize operation; a single upload is a batch of one. Track each member's upload, preparation and matching outcomes. Closing the browser must not abandon server-side work; unfinished uploads expire explicitly.

Match documents independently as they become available. Normally wait for the finalized batch's matching jobs to reach terminal states, then assess the union of affected requirements once each. Include existing evidence in each assessment. Use a bounded wait for stalled files and make any interim result explicitly provisional; unresolved processing must prevent a misleading batch-complete indication. Final processing reassesses only changed evidence sets.

Immediate assessment after every match gives early feedback but wastes work. A strict batch barrier minimizes calls but allows one slow document to delay everything. A bounded barrier is the chosen target; the wait duration must be tuned using measured queue and model latency.

Across overlapping batches, retain at most one pending successor per application, initiating user, visibility scope and requirement. Supersede older pending snapshots while preserving their history. Do not rewrite a running attempt's input. Serialize assessment execution for that same scope and target. If versions 12, 13 and 14 arrive while version 11 runs, its successor checks version 14. Preserve interactive priority when automatic work replaces an obsolete manual request.

Before publishing, compare the exact snapshot with current state atomically. Retain outdated responses for diagnostics without presenting them as current. A future durable reconciliation mechanism must also recover invalidations that arrive without an explicit enqueue, including definition changes. Coalescing alone does not implement this reconciliation or the upload batch barrier.

## Nonfunctional requirements

| Dimension | Required behavior and measurement |
| --- | --- |
| Latency | Measure queue wait, extraction, inference, validation, commit and UI visibility separately; track end-to-end p50/p95/p99 for automatic and manual work. Set SLOs after baseline measurement. |
| Throughput | Measure current validated assessments delivered, not just calls. Bound global and per-application concurrency and input sizes; exercise burst uploads. |
| Reliability | Durable jobs, leases, heartbeats, fencing, bounded attempts, recovery and idempotent writes. Independent document failures preserve successful work. |
| Retries | One retry owner; bounded exponential backoff and jitter for transient errors; honor provider cooldown. Configuration/budget errors block; invalid outputs fail closed. |
| Cost | Reserve spend before dispatch, account known usage, conservatively retain uncertain charges, deduplicate and coalesce. Duplicate provider execution cannot always be prevented after ambiguous failures. |
| Quality | Measure matching recall and precision, false fulfillment, missed gaps, citation accuracy and unknown rates using labeled fixtures. Schema validity is not semantic correctness. |
| Security | Upload content is untrusted data. Validate IDs, citations and scope; recheck authorization before private reads, dispatch and commit. No model-directed writes. |
| Privacy | Consent cancellation fences future writes; actor and submission scopes remain isolated. Diagnostic captures require restricted access and retention limits. |
| Fairness | Interactive priority with guaranteed background progress; no application monopolizes shared capacity. |
| Observability | Correlate upload batch, document, requirement, job and attempt; record model/schema/prompt versions, usage, duration, failure class and applied/discarded outcome. |
| Operations | Worker health monitoring, cancellation, targeted replay, dead-letter inspection and recovery drills. Upload and manual review remain available during AI outages. |
| Compatibility | Version contracts and extractors; evaluate prompt/model changes on fixtures before rollout. Preserve rollback without destroying history. |

Existing development defaults are two global slots, 20 provider calls/minute, a 60-second provider timeout, a 90-second attempt deadline, three provider attempts and small daily budgets. These are limits, not measured performance guarantees. Retain the existing inexpensive model for the initial increment.

## Acceptance scenarios

1. One document matches two requirements; each assessment includes all existing associated evidence.
2. Three statements in one finalized batch support the same requirement; normally only one aggregate assessment runs after matching completes.
3. Repeated enqueue for the same snapshot returns the same live job; repeated evidence changes leave only one pending latest successor.
4. A running obsolete assessment cannot commit as current; its latest successor waits for it to finish or lose its lease.
5. One failed or unsupported file does not erase successful processing; incomplete batch coverage remains visible.
6. Removing/replacing evidence or changing a definition invalidates affected results and schedules authorized refresh work.
7. Manual priority survives coalescing; work belonging to another user, application, requirement or visibility scope is unaffected.
8. Worker crash, duplicate delivery and provider timeout do not duplicate application effects; recovery is bounded.
9. Missing mandatory evidence and contradictions never produce fulfilled; all supported findings have valid citations.
10. Lenders cannot inspect drafts; consent revocation and membership changes prevent unauthorized dispatch or commit.

## Implementation increments

- First increment implemented: coalesce obsolete pending requirement jobs; preserve interactive priority, history and user/scope isolation; serialize same-target assessment claims. The isolated PostgreSQL integration suite, 40 existing unit tests and TypeScript checks pass. No provider calls or schema migrations were used. This is source-level integration, not a deployment.
- Second increment implemented in source: persistent upload manifests, explicit finalization, five-minute expiry/barrier, retry/reselection reconciliation and upload UI integration. Worker reconciliation consumes durable markers for document, mapping, definition, subject and application-context changes. Failed matching no longer strands manually linked evidence. Pending work is coalesced and stale workers only dispose of work; they do not schedule replacements.
- Criterion-derived full/partial/not-fulfilled/unknown status is now presented for the existing all-mandatory catalog. Conflicts, unknown criteria, unsupported evidence and incomplete processing prevent fulfilled. Optional/alternative criterion definitions remain a future schema change.
- Remaining: reusable extraction artifacts, wider-format analysis, replacement/removal product endpoints, comprehensive semantic evaluation and operational drills. Existing immutable replacement records are excluded from current evidence and unresolved predecessor links prevent fulfilled; this does not add a replacement UI.
- Production readiness: labeled quality evaluation, latency/throughput measurements, operational dashboards and failure drills.

Current content analysis remains bounded CSV. PDF, spreadsheet and image extraction must be implemented and evaluated before those uploads are advertised as fully AI-reviewed.

The separate [edge case analysis](AI_WORKFLOW_EDGE_CASES.md) details expected behavior, recovery and implementation gaps by failure scenario.

The investigation is a historical snapshot. [AI_WORKFLOW_TEST_PLAN.md](AI_WORKFLOW_TEST_PLAN.md) traces all 43 scenarios to automated checks and remaining gaps after implementation. Migration `013_analysis_workflow.sql` must precede rollout of the second increment; validation applies it only to isolated test schemas. No shared preview deployment is implied.
