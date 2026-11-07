# Database implementation and schema changes

The local application uses PostgreSQL through `lib/runtime.ts` and `PostgresRepository`; Better Auth uses the same PostgreSQL pool. Files remain private on disk. This document records the database assignment, not completion of every M1 product feature.

## Implemented

The existing auth/portal migrations remain unchanged. Forward migrations now provide:

| Migration | Contents |
|---|---|
| 003_domain.sql | Subjects, request recurrence/revisions, document series/versions, facts/findings/provenance, explanations, reviews/evidence, submissions, mutation receipts, workflow events and import batch ledger; existing rows backfilled without changing IDs or file keys |
| 004_domain_guards.sql | Immutable history, linear revision chains, same-application references, transaction-sealed attachment sets, review/submission validation, content revision tracking |
| 005_domain_finalization.sql | Sealed provenance, dependency invalidation, lender workflow authority and submission snapshot builder |
| 006_domain_audit.sql | Conditional occurrence validation, membership/note history and allowlisted borrower activity view |
| 007_evidence_consistency.sql | Review JSON/relational evidence equivalence and fact transaction stamping |
| 008_snapshot_allowlists.sql | Explicit snapshot field allowlists, fact source context and no phantom membership audit on conflict-do-nothing |

M1 schema is installed locally. AI analysis/suggestions and human conversation tables remain deferred, as designed. The database uses pg with reviewed SQL; Drizzle was not added.

`build_submission_manifest(application_id)` creates a stable, allowlisted package snapshot. `submissions` validates the snapshot against current state, stores canonical serialized text plus SHA-256, and automatically pins document references. Application code must still authorize the caller, reconcile rules, verify actual file bytes, collect exception acknowledgments, and resolve idempotency before inserting. The database does not access the private filesystem or call AI.

Document inserts without a series_id create a new series automatically for compatibility. Replacements supply the existing series, predecessor and next version; the database rejects skips/forks. Current review inserts capture missing revision tokens for the existing UI, but new review commands must supply expected evidence **and definition** tokens to detect a stale user screen. `review_scope=submission` pins a historical request snapshot. Evidence arrays populate normalized join tables automatically; callers must not insert those joins again.

Aggregates are sealed at transaction commit using a database-assigned transaction ID. Facts, files, findings, explanations, reviews, submissions, receipts and audit events cannot be updated/deleted through ordinary DML; later attachment/provenance inserts are rejected. Database owners can alter triggers: local administrative access is not a tamper-proof audit boundary. Separate least-privilege runtime/migration credentials remain a deployment hardening step; this local build retains the existing connection configuration.

## Verification

Executed successfully during this assignment:

- `npm run db:migrate`, including a repeat run with no pending migrations.
- `npm run db:verify`: 23 checks in a disposable PostgreSQL schema, covering empty installation, populated legacy upgrade, ID/key preservation, cross-application references, version forks, fact correction chains, text-only acceptance, recurrence, historical review, stale definition rejection, sealed snapshots and duplicate mutation receipts.
- `npm run typecheck`, `npm test` (seven existing tests), and `npm run build`.
- `npm run test:integration`: real Better Auth sign-in and PostgreSQL-backed HTTP borrower upload/exact-byte download, lender review/private notes, denial of anonymous/borrower-only lender access, validation failures, restart persistence and missing-file recovery. This now uses a disposable PostgreSQL schema and temporary file directory rather than the old unauthenticated SQLite assumptions.
- Both files referenced by the local database passed size/SHA-256 verification. Original file bytes were not rewritten. A pre-upgrade pg_dump is retained privately at `.data/backups/before-domain-schema.dump`.

The verification scripts isolate their data and clean up only their own generated schemas. They do not reset the app database. The preview process was not restarted by this assignment; a separate production preview needs a coordinated rebuild/restart to load changed TypeScript. A successful isolated test server does not establish what bundle an already-running preview has loaded.

## Ready boundaries and remaining integration

Existing routes `/api/application`, `/api/documents`, `/api/documents/[id]`, and `/api/lender` continue using the authenticated PostgreSQL repository. Public snapshot columns are explicitly selected, dates remain ISO strings, and internal storage keys are excluded. Existing upload/review/note operations passed actual HTTP verification.

New schema support is ready for document replacement/mapping, explanation/fact entry, rule findings, waivers, submission receipts and explicit collection workflow events. Dedicated command methods and endpoints for these new operations have **not** been added in this database assignment. No new UI was implemented. In particular, the existing review UI still handles document acceptance/change requests; text-only and historical review support is verified at the SQL layer, not yet through that UI.

The submission service must build its preview from the SQL snapshot builder, use the current revision/date token, and persist mutation receipt plus submission atomically. It must not trust browser-supplied actor identity, raw SQL, arbitrary snapshot JSON or acknowledgment completeness. SQL constraints protect relational truth; they do not replace server authorization, file checks or deterministic rule evaluation.

The full preservation-grade SQLite importer described in DATA_DESIGN.md remains a separate integration task. This upgrade preserves records already in PostgreSQL, including their current review ordering. The bootstrap seed can import legacy records, but it does not establish a reconciled multi-application SQLite import. Original SQLite rowid history that was not copied by an earlier import cannot be recovered by inventing it in a schema migration. Audit that source separately before retiring it.

## Updating the schema later

Most additions are easy: add a new numbered SQL migration, update repository types/queries and run verification. Never edit an applied migration; the runner checks its checksum and refuses changed history.

Typical safe workflow:

1. Back up the database and referenced file directory consistently; rehearse on a disposable copy.
2. Add `009_<change>.sql` (or the next unused sequence). Start with additive columns/tables/constraints that coexist with the old app.
3. Backfill existing records explicitly. For a required new field, add it nullable, populate it with known values, validate, then enforce NOT NULL. Do not guess missing business facts.
4. Update repository commands, DTO allowlists, snapshot serializers and schema checks. Keep the old app compatible during the transition where practical.
5. Run `npm run db:verify`, existing checks, `npm run db:migrate`, and the authenticated integration test. The runner serializes migration execution and applies each migration transactionally.
6. Deploy/restart application code in the agreed order. Remove obsolete columns only in a later migration once no running code needs them.

Adding an optional field/table is usually small. Renaming a field or changing its type is moderate because readers/writers and historical data must agree. Splitting entities, changing ownership rules, or reinterpreting financial facts is harder and needs a staged backfill/reconciliation plan.

For new submission content formats, bump manifest_version and retain readers for existing versions; never rewrite old submitted snapshots to make them look current. If a trigger must change, use CREATE OR REPLACE FUNCTION in a new migration and verify existing records remain readable. Migrations requiring PostgreSQL operations outside transactions (for example a concurrent index build) need an explicitly reviewed runner change; do not slip them into this transactional runner.

Rollback before any new writes can restore the coordinated backup. After new writes, prefer a forward repair; blindly restoring an old backup or switching to SQLite would discard recent work. No automatic destructive down/reset command is provided.

## Borrower add/remove document links — implemented endpoint

`PUT` and `DELETE /api/documents/{documentId}/requirements/{requirementId}?expectedEvidenceRevision={revision}` add or unlink an existing saved document for one request. Send the same-origin header and authenticated borrower cookie; no request body is needed. Read the decimal-string revision from `snapshot.requirements[].evidence_revision`. Success returns `{changed: boolean, snapshot: ApplicationSnapshot}` with `Cache-Control: no-store`.

The repository locks the application and rechecks active borrower membership before validating both IDs belong to that application. Active request required. An already-applied state returns changed=false without another audit entry/revision increment. Otherwise a stale token returns 409; invalid/missing token returns 400, inaccessible objects 404, wrong role 403 and no session 401. A stale removal cannot undo a subsequent relink.

Unlink sets only this mapping's unlinked_at and appends an attributed audit event in the same transaction. Database triggers increment the affected request evidence revision and application content revision. Original bytes, the document record, other requirement mappings, explicit general-upload selections, old reviews and submitted package references remain intact. Removing a document from a request does not globally delete it or implicitly exclude it from a separately selected general-upload package.

Snapshots expose evidence_revision and definition_revision on requirements plus is_current on reviews. The shared review-state helper uses is_current=false to keep acceptance stale even if the original file-ID set is later restored. Requirement details should list files whose requirement_ids include that request; all saved documents remain available in the application's file collection.

New file uploads continue through existing POST `/api/documents`, one file plus requirementId per request. Frontend can orchestrate several uploads without a new batch backend. Existing documents can be added with PUT. Preview/download uses the existing authenticated GET `/api/documents/{documentId}`; it returns exact bytes with original content type and attachment headers. Fetching a Blob for a browser-supported preview is a frontend concern; this endpoint does not render XLSX/CSV into HTML or expose public filesystem URLs.

Verification for this endpoint: typecheck and eight unit tests passed; a production build passed in a temporary copy (webpack). Extended authenticated PostgreSQL HTTP checks cover shared links, multi-file requests, unauthorized/foreign-origin/cross-application/stale mutations, no-op retries, retained bytes, unchanged submission manifests/file references, unaffected acceptance on the other linked request and no resurrection of acceptance after relinking. The production preview's build directory and process are untouched; platform owner must coordinate its normal rebuild/restart before the new route appears there. No schema migration or runtime/configuration change is required for this endpoint.


## Updated background execution direction

The user now authorizes a queue service and workers, with prioritization of active Verify completeness requests versus upload-triggered background analysis. This supersedes the earlier no-workers plan, but does not claim a queue has been implemented by the database work. Backend owns orchestration and its initial BACKEND_PLAN.md contract; database owns the resulting agreed schema/repositories, and platform owns runtime/services. Queue/run/attempt migrations and recovery acceptance checks will be aligned with that contract before implementation. Existing file durability, AI consent, stale-result rejection, human overrides and immutable evidence protections remain required. See DATA_DESIGN.md’s queue/worker scope update for the database contract questions.
