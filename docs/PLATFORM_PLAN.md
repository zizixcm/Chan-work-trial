# Canonical local platform and integration plan

Updated November 6, 2026. The coordinator-approved baseline below governs runtime work. REQUIREMENTS.md governs product scope; docs/DATA_DESIGN.md governs schema/domain design. README contains the operator procedure. Earlier proposals for Supabase/Vercel/Inngest, a port-3000 preview, an automatically seeded SQLite runtime, and a full Docker app deployment are superseded.

## Approved runtime

| Layer | Canonical choice |
|---|---|
| App | Host-run Next.js + React + TypeScript |
| Database | Docker Compose service `db`, `postgres:17-alpine` |
| Host database binding | `127.0.0.1:5433` → container `5432` |
| Database volume | Compose `postgres_data` → Docker `proximity_postgres_data`, mounted at `/var/lib/postgresql/data` |
| Browser/auth origin | `http://127.0.0.1:3001` |
| Authentication | Better Auth with PostgreSQL-backed users/sessions and separate borrower/lender accounts |
| Authorization | Server-side active application membership plus role checks on each application/file operation |
| File bytes | Private persistent host directory `<PORTAL_DATA_DIR>/files`, default `.data/files` |
| Database access | `pg` and checked-in SQL migrations; one checksum-tracked migration ledger including auth |
| Optional AI | Server-side Mastra/OpenRouter; preparatory connectivity only for M1 |

Docker runs the database only. Next.js is not a Docker service. This is not public hosting. Queue services and background workers are now authorized as a planned extension, pending aligned contracts in `docs/BACKEND_PLAN.md`; they are not yet part of this running baseline. Cloud storage, a new testing framework, and broad OCR remain outside this baseline. Authentication stays enabled; a discussion about demo convenience is not approval to remove it.

## Ownership and coordination

- **Platform alone:** Compose, runtime/environment/setup configuration, startup/preview documentation, and shared preview starts/stops/rebuilds.
- **Backend owner:** serving/job orchestration and Mastra/OpenRouter execution plumbing; defines the queue and worker contracts in `docs/BACKEND_PLAN.md` before shared implementation.
- **AI owner:** prompts, extraction, matching, evidence, and evaluations.
- **Database owner:** schema/domain contract, PostgreSQL migrations, repositories, pool/transaction behavior, domain seeds and database verification.
- **Frontend owner:** presentation, login/borrower/lender UI and styling; no independent port/origin/service/dependency changes.
- **Coordinator:** freezes cross-owner contracts and authorizes the integration window. Shared auth/access/storage/API edits must be assigned explicitly.

No owner independently changes ports, origins, Docker services, dependencies, or architecture. Report conflicts for coordinator resolution. Platform does not restart or build while relevant frontend/backend/AI/database changes are active. Do not message other chats without explicit user authorization; report readiness and conflicts in this assignment's result.

## Canonical operator sequence

Run from the project root. `scripts/compose.mjs` resolves Docker Desktop's bundled CLI/helper and passes `.env.local` explicitly.

**First setup on a new checkout:**

```sh
npm ci
npm run setup:local
npm run db:up
npm run db:migrate
npm run db:seed
```

`setup:local` only creates missing local configuration/initial account credentials; it does not start services or apply migrations. Preserve all existing environment values and accounts. Auth migration `001_auth.sql` is checked in; ordinary startup must not regenerate it. PostgreSQL migrations use `migrations/postgres`, never the legacy SQLite migration directory.

**Normal preview startup, only when no preview or active edits/build exist:**

```sh
lsof -iTCP:3001 -sTCP:LISTEN -n -P
node scripts/compose.mjs ps
npm run db:up
npm run preview
```

If a preview already listens, reuse it instead of starting a competing process. `preview` builds and starts the host app at `http://127.0.0.1:3001/login`. `npm run start` reuses an already verified unchanged build. `npm run dev` is an explicit editing mode with automatic reloads, not the default demo; it shares port 3001 and `.next` with the preview. Never run dev/build/preview concurrently.

**Coordinated integration refresh:**

1. Relevant frontend/backend/AI/database owners report completion; coordinator confirms a stable integration window.
2. Platform stops only the identified preview process (Ctrl-C in its owning terminal, or confirmed PID after inspection).
3. Database owner approves/applies pending migrations with `npm run db:migrate`; provision missing fixture/account data with `npm run db:seed` only when called for. No reset.
4. Run agreed existing checks. Platform runs `npm run preview` once after changes are stable.
5. Verify login, borrower/lender role boundaries, and the newly integrated workflow; reload browser tabs once to pick up the new build.

**Database-only maintenance, only in an agreed quiet window:**

```sh
node scripts/compose.mjs restart db
npm run db:up
```

`npm run db:stop` stops without deleting data. Never remove/prune the database volume, run `down -v`, reset fixtures, or delete uploads to resolve a startup/migration failure. Database restarts interrupt requests; avoid active uploads or reviews.

## Configuration and preservation

Environment names: DATABASE_URL, POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB, POSTGRES_PORT, BETTER_AUTH_SECRET, BETTER_AUTH_URL, optional PORTAL_DATA_DIR, optional OPENROUTER_API_KEY and OPENROUTER_MODEL. No separate migration URL is currently wired. Preserve values; do not print complete connection URLs, full resolved Compose configuration, secrets, passwords, tokens, or provider content.

Current database/auth origins match the table above. Do not alternate `localhost` and `127.0.0.1` because cookies and trusted origins differ. Ports should not silently move when occupied: identify the existing process and coordinate.

Accounts are provisioned through Better Auth-compatible setup. Local initial credentials live in ignored owner-readable `.data/local-accounts.json`. Public registration is disabled. Session identity supplies actors; client role/user/actor claims are not trusted. Borrower/lender are per-application memberships, not global access grants. Keep middleware/UI redirects supplemental to API enforcement.

Changing PORTAL_DATA_DIR does not create a fresh PostgreSQL demo. Keep the configured persistent directory paired with its database metadata. Uploads remain outside public assets; backend-authorized downloads resolve private keys and verify bytes. Storage writes create new keys rather than overwrite retained versions. Preserve originals and the legacy SQLite files retained during import.

A backup must include PostgreSQL and corresponding host file bytes, quiescing writes for a consistent capture. A SQLite file alone is not a current backup. The existing owner-level PostgreSQL connection is a local prototype limitation; do not claim least-privilege runtime roles, full recovery automation, malware quarantine, or production bank readiness.

## Integration interfaces and milestone boundaries

The implemented runtime uses `adapters(request, roles, documentId?)` from lib/runtime.ts. It resolves `accessFor` through Better Auth and membership checks, constructs an application-scoped PostgreSQL repository, and provides private local storage. Database methods must recheck membership/roles in mutations and enforce same-application relationships. Unknown/unassigned objects return 404, missing session 401, and forbidden role actions 403. Public DTOs exclude credentials, physical storage keys, and lender-private notes.

Backend application/file authorization, persisted audit identity, upload compensation, and private storage are platform/domain dependencies for the portal. Immutable versions, submission manifests, deterministic checks, explanations, and concurrency semantics belong to DATA_DESIGN.md and the database/portal owners; this runtime plan does not declare them complete merely because migrations exist.

M1 needs no model credentials or calls. `/settings/ai` remains authenticated lender-only developer connectivity tooling. It is not consent to analyze borrower files. The user has authorized upload-triggered background analysis and active Verify completeness calls. The prior no-workers restriction is superseded. M2 still requires validation, evidence provenance, manual parity, and stale-result suppression. Backend and AI contracts must define when analysis is enabled and how upload-triggered work is prioritized relative to active Verify completeness calls; this platform document does not choose a queue implementation or scheduling policy. M3 human messaging uses the same session/application boundary when implemented.

Existing validation commands remain available: typecheck/build, current test commands, and database-owned `db:verify`. Run only the relevant agreed checks; do not add a framework or launch checks that compete with another owner's build/integration work.

## Readiness audit and next handoff

Read-only verification in this alignment assignment found:

- Docker `proximity-db-1` healthy, image `postgres:17-alpine`, loopback-only `5433:5432` binding.
- Actual persistent volume `proximity_postgres_data` mounted at `/var/lib/postgresql/data`.
- Host `npm run start` preview listening on port 3001, matching configured Better Auth origin.
- DATABASE_URL resolves to `127.0.0.1:5433`; secret presence verified without logging values.
- Current data root is `/Users/chanrao/Documents/ChatGPT/proximity/.data`; account/config files remain Git-ignored.
- Live migration ledger contains 001–008 at inspection time; no migration was applied by this assignment.

**Infrastructure is aligned.** No environment, port, dependency, service, account, or data change was necessary. This assignment edits only README.md and this document, with no preview restart, competing build, seed/reset, or provider call. Current running preview may predate ongoing frontend/database source changes. Request one coordinated build/restart after those owners finish; it is not safe to claim their latest work is already visible in the current preview.

## Pending queue and worker contract alignment

The dedicated backend owner is producing `docs/BACKEND_PLAN.md` first. Platform preserves the current runtime until the coordinator aligns backend, AI, database, and platform contracts. Do not introduce a competing queue, implement a new synchronous-only analysis architecture, add services/dependencies, or change the preview during planning.

Before platform implementation, the agreed contract must specify:

- Queue technology, persistence ownership, worker entry points, and Docker versus host execution.
- Scheduling and capacity allocation for upload-triggered analysis versus active Verify completeness requests, including duplicate work and stale-result handling.
- Job identity, application scope, retries, cancellation, shutdown behavior, and recovery after process restart, with schema/repository changes owned by database.
- Private-file access and provider credentials for workers, configuration names, health/readiness signals, and logs that exclude secrets and document content.
- A coordinated rollout and verification plan preserving database volumes, uploaded originals, sessions, current ports, and auth origin. Acceptance must cover restart recovery and interactive work under background load without claiming these capabilities already exist.

Backend owns execution behavior; AI owns analysis behavior; platform owns the agreed service lifecycle and startup documentation. This scope update changes guidance only and does not deploy queues or workers.
