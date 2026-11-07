# Proximitty local borrower and lender portal

The approved local runtime is **PostgreSQL 17 in Docker Compose, with Next.js running on the Mac host**. It is not a fully containerized application or a public deployment. REQUIREMENTS.md defines product scope; docs/DATA_DESIGN.md defines the evolving domain contract; docs/PLATFORM_PLAN.md defines runtime ownership and coordination.

## Canonical configuration

| Component | Current configuration |
|---|---|
| Database | Compose service `db`, image `postgres:17-alpine` |
| Database address from host | `127.0.0.1:5433` → container port `5432` |
| Database persistence | Compose volume `postgres_data`, actual name `proximity_postgres_data`, mounted at `/var/lib/postgresql/data` |
| App | Next.js/React/TypeScript running on host, bound to loopback |
| Browser and Better Auth origin | `http://127.0.0.1:3001` |
| Sign-in | Better Auth; PostgreSQL-backed borrower/lender accounts and sessions |
| File bytes | `<PORTAL_DATA_DIR>/files`, default `<project>/.data/files`; private host filesystem |
| AI | Server-only Mastra/OpenRouter; credentials optional for M1 |

Use `127.0.0.1`, not a mixture of localhost and IP URLs. Do not independently change ports, auth origins, services, dependencies, or deployment architecture. Platform owns runtime changes and preview restarts; database owns migrations/repositories; frontend owns presentation. Coordinate any shared-file change first.

## Initial setup — a new checkout only

Requires Node 22.13+ (local setup used 22.22.2), npm, and a running Docker Desktop engine. Docker account sign-in is optional for this local runtime.

```sh
npm ci
npm run setup:local
npm run db:up
npm run db:migrate
npm run db:seed
```

- `setup:local` only fills missing configuration and generates initial local account credentials. It does **not** start Docker, migrate, seed, or start the app. Do not overwrite existing `.env.local` or `.data/local-accounts.json`.
- `db:up` uses `scripts/compose.mjs`, explicitly loads `.env.local`, and waits for database health. The wrapper supports Docker Desktop's bundled CLI/credential helper even if the CLI is not on PATH.
- `db:migrate` applies checked-in `migrations/postgres/*.sql` in order under a lock with checksum tracking. Auth SQL is already checked in: do not regenerate it during normal setup. A missing checked-in migration is a checkout/integration issue, not permission to invent or bypass it.
- `db:seed` creates missing synthetic borrower/lender accounts and memberships. On first import it preserves existing SQLite application/file metadata, reviews, notes, and audit history. Reruns preserve existing accounts and application data; this is not a reset command. Original SQLite/files remain intact.

Sign-in credentials are stored in `.data/local-accounts.json`, ignored by Git and owner-readable. Account identities are `borrower@proximitty.example` and `lender@proximitty.example`; passwords are not published here. Public registration is disabled. Use separate browser profiles or sign out to switch roles. Authentication remains enabled; evaluating an unauthenticated demo is not authorization to remove it.

## Daily startup and stable preview

Only platform starts/stops the shared preview. Check for an existing listener first:

```sh
lsof -iTCP:3001 -sTCP:LISTEN -n -P
node scripts/compose.mjs ps
```

If the existing preview is running, reuse it. Do not start another dev server/build. If the preview is stopped and no source/database work is active:

```sh
npm run db:up
npm run preview
```

Open `http://127.0.0.1:3001/login`. `preview` runs a production build followed by `next start`; it remains local and does not deploy anything. If the current build is already verified and no source or dependency changes occurred, `npm run start` starts it without rebuilding.

Development mode (`npm run dev`) uses the same port and automatic reloads. Reserve it for coordinated editing; stop the preview first. It is not the default demo mode. Do not run dev, build, or a second preview concurrently against the shared `.next` directory. The earlier preview refresh loop was observed in development-mode recompilation; the stable preview removes the automatic reload mechanism.

## Coordinated migration and preview refresh

After frontend/database owners report their work ready, platform performs this sequence in one agreed window:

1. Confirm no further shared source/schema edits or competing build are active.
2. Stop the current preview with Ctrl-C in its owning terminal. If that terminal is unavailable, identify its process with `lsof`/`ps` and terminate only that confirmed preview process—never a broad `killall node`.
3. Keep the DB running (`npm run db:up` if needed). Database owner approves/applies pending reviewed migrations with `npm run db:migrate`; never edit an applied migration or reset data to bypass a failure.
4. Run `npm run db:seed` only when the database owner calls for missing fixture/account provisioning; routine preview refresh does not require reseeding.
5. Run existing agreed checks, then platform runs `npm run preview` once. Build failure means fix/review the change, not reset the database.
6. Reopen the canonical login URL and verify borrower/lender sign-in plus the newly integrated journey. Refresh each browser once if it still has the old build loaded.

`npm run typecheck`, `npm run db:verify`, and existing test commands remain available; the coordinator/database owner chooses relevant checks. No new test framework is required. Do not run integration checks or builds in parallel with another owner's build/runtime verification. These commands are not substitutes for the milestone's manual product walkthrough.

For an agreed DB-engine-only restart, platform can run:

```sh
node scripts/compose.mjs restart db
npm run db:up
```

Requests may fail during that restart; do not perform it during active uploads/reviews. `npm run db:stop` stops the DB while retaining its volume and host files. **Never remove the volume, run `down -v`, prune volumes, reset fixtures, or delete uploaded files as part of startup, migrations, or troubleshooting.**

## Environment and data preservation

`.env.example` lists configuration names. Compose reads `.env.local` explicitly; Next.js and scripts/env.ts load local configuration for their respective processes. Keep DATABASE_URL, POSTGRES_PASSWORD, BETTER_AUTH_SECRET, OPENROUTER_API_KEY, session tokens, and local account passwords out of logs, browser bundles, screenshots, and source control. Do not use `NEXT_PUBLIC_` for secrets or print full Compose resolved configuration.

Keep the existing PORTAL_DATA_DIR unchanged during routine work. Changing it does not create a fresh PostgreSQL application and can make existing file references unavailable. Files are private and downloads go through authenticated backend endpoints; raw paths/storage keys are not public URLs. Stable generated file keys and checksums preserve original bytes.

Database and file storage are separate resources. A backup must cover **both** PostgreSQL and the corresponding persistent files, with writes quiesced for consistency. Copying `.data/portal.sqlite` alone does not back up the current application. There is no automatic reset on app startup and no SQLite runtime fallback.

## Current feature boundaries

The foundation supports authenticated application access, bounded uploads, private downloads, and lender review. Product features and domain migrations continue under the three-milestone plan; their presence in a design document is not proof the UI or full acceptance journey is complete.

Upload validation currently accepts PDF, XLSX, CSV, JPG/JPEG, PNG, and WebP up to 25 MiB (26,214,400 bytes; UI shorthand is 25 MB). It checks file structure, not correctness of lending evidence or malware safety. Scanned-file acceptance does not imply OCR. Review source and REQUIREMENTS.md for the latest format policy.

Mastra/OpenRouter connectivity is preparatory only. The lender-only `/settings/ai` connection check sends a fixed sample message only when explicitly invoked and may consume provider credit. It does not send uploaded files, enable document analysis, or satisfy application-level AI consent. M1 startup, sign-in, uploads, and review need no AI credentials or provider calls.

Hosting, background workers, broad OCR, and a fully containerized app remain deferred. Real borrower use still requires the production controls in REQUIREMENTS.md, including malware handling, retention/recovery, and finer party-level access. The local app currently uses a PostgreSQL owner connection; separate least-privilege runtime/migration roles are not claimed implemented.

## Code ownership map

| Area | Owner / files |
|---|---|
| Platform/runtime | `compose.yaml`, `scripts/compose.mjs`, local environment/setup, preview process, startup documentation |
| Auth/access and private files | Better Auth config/routes, `lib/authorization.ts`, `lib/runtime.ts`, `lib/storage/local.ts`; coordinate shared changes |
| Database/domain | `lib/db.ts`, `lib/postgres.ts`, `migrations/postgres`, migration/seed/verification scripts, docs/DATA_DESIGN.md |
| Presentation | Borrower/lender/login UI and styling; frontend owner |
| Legacy import | `lib/local.ts`, old SQLite migrations; not used for request-time persistence |

## Verified state and pending integration

Read-only alignment audit, November 6, 2026: Compose `db` was healthy, published only `127.0.0.1:5433`, and mounted `proximity_postgres_data` at the expected path. The host preview was listening on `127.0.0.1:3001` under `npm run start`; configured auth origin and DATABASE_URL host/port matched. Auth/database configuration is present without exposing its values. Current upload root resolves to the project's `.data` directory. Migrations 001 through 008 were present in the live migration ledger at inspection time.

Earlier cutover checks verified both accounts, anonymous/wrong-role denial, sign-out, retained-file download, and database restart persistence. Those results do not establish readiness of subsequently edited domain/UI features. This alignment assignment performed no build, migration, seed, restart, or provider call. **A single coordinated rebuild/restart is needed after frontend/database owners finish current changes.** Until then, the running preview may show the previous built code.

## Document AI worker and review controls

The optional CSV analysis path defaults to `google/gemini-2.5-flash` through Mastra/OpenRouter. Existing `OPENROUTER_MODEL` settings override that default. Flash-Lite remains available for evaluation, but failed the missing-rent quality fixture; use Flash for the new workflow. Both models have explicit admission prices pinned per reservation. Run migrations (including `013_analysis_workflow.sql`) before starting the new server and worker:

```sh
npm run db:migrate
npm run worker:analysis
```

Keep the worker running alongside the Next.js app (`npm run dev`, loopback port 3001). The worker has no public listener. PostgreSQL remains the durable job store; no Redis or new hosted service is used. Credentials stay server-side and remain optional for the manual portal.

Borrowers opt in under **AI assistance**. New supported CSV uploads then enqueue background matching and affected requirement assessments. Both portals offer **Verify completeness** on a requirement; these checks use the interactive lane. The AI assessment is distinct from lender acceptance. PDF/XLSX/photos remain uploadable but are not automatically extracted in this slice. Unassigned files remain accessible under **All saved files**, where borrowers can add manual links or request AI matching.

For developer diagnostics, `ANALYSIS_DEBUG_CAPTURE=1` enables bounded private captures under the configured data directory; `ANALYSIS_DEBUG_USER_IDS` is a comma-separated allowlist of exact signed-in user IDs permitted to open `/internal/analysis-runs`. It does not grant lender authority or bypass application AI consent. Capture is off and access denied when unconfigured. Never expose this page publicly or put raw prompts/responses into console logs. See `docs/ANALYSIS_DEBUG.md` for retention and redaction limits.

`npm run test:ai-integration` uses a disposable PostgreSQL schema and temporary private file directory with a simulated provider to check the actual authenticated routes/worker/repository flow. `AI_SMOKE_REAL=1 npm run test:ai-integration` instead makes a maximum of five synthetic provider calls and incurs a small charge; it requires the configured provider key. It never resets the seeded demo or deletes persistent volumes.

Uploads now declare durable batch manifests. Matching runs per document; assessments wait for finalization and matching, with a five-minute bounded wait and explicit incomplete-processing limitations. A worker recovery sweep reconciles persisted mutation markers independently from stale-job disposal. Repeated changes coalesce into the latest pending assessment. Criterion findings determine full, partial, unfulfilled or unknown status; model summaries cannot override missing evidence.

Run `npm run test:workflow-integration` for isolated failure/convergence scenarios. `AI_SMOKE_CASE=missing-rent` selects the negative HTTP/model fixture. Start with the maintained [workflow design](docs/AI_WORKFLOW_DESIGN.md), then consult [requirements](docs/AI_WORKFLOW_REQUIREMENTS.md), [edge cases](docs/AI_WORKFLOW_EDGE_CASES.md) and [test coverage and rollout](docs/AI_WORKFLOW_TEST_PLAN.md). The source checkpoint is tagged `checkpoint/pre-ai-workflow`; it does not back up database contents or private uploads.

Current AI capabilities and remaining work: [AI feature support](docs/AI_FEATURE_STATUS.md). This inventory is updated alongside workflow implementation and design.

AI reader formats, prompt strategy, evaluation commands, human-feedback API and metrics plan: [AI prompts, evaluations and metrics](docs/AI_PROMPTS_EVALS_AND_METRICS.md).
