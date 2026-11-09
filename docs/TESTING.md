# Agent test–fix–reverify workflow

Use local development and the existing stable local preview. No new hosting,
CI service, or test framework is required. This workflow does not deploy or
promote anything automatically.

## Repeatable commands

From the project root, with dependencies installed (`npm ci` on a new checkout):

```sh
npm run test:agent
```

Runs all unit tests and TypeScript checks, sequentially and stopping at the first
failure. No database, running app, or provider credentials are required. It does
not establish that the deployed UI or production build works.

Before accepting a candidate, run:

```sh
npm run test:agent -- --full
```

Prerequisites: complete the README's initial local setup, have Docker/PostgreSQL
running (`npm run db:up`), and have local `DATABASE_URL` and `BETTER_AUTH_SECRET`
configured. Use the local test database, never a production database. The database
account must be able to create/drop disposable schemas. Do not print credentials.

Coordinate a quiet window: finish edits, stop the shared preview in its owning
terminal, and ensure no other dev server, build, or integration run is active.
The command refuses to build while port 3001 is listening; that guard cannot detect
every competing build or server on another port. It does not stop any process.

The full command runs:

1. Unit tests and TypeScript.
2. A fresh production build in `.next`.
3. HTTP integration: authentication, authorization, uploads and private files.
4. Job integration: scheduling, retries, ownership and stale-result protection.
5. Workflow integration: matching, completeness, mutation and failure scenarios.
6. AI HTTP integration with complete evidence, then missing-rent evidence.

Existing integration suites create disposable PostgreSQL schemas, synthetic
accounts and temporary files; HTTP suites start their own servers on temporary
ports. They apply migrations only to those schemas and clean them up on normal
completion. They do not migrate/seed/reset the shared application. An interrupted
suite may leave its temporary resources; never reset the database to clean up.
The wrapper forces simulated AI calls even if `AI_SMOKE_REAL=1` was inherited.
Live model accuracy is a separate, explicitly requested evaluation; mocked passes
prove workflow behavior, not model quality.

To investigate a failure, use its printed `npm run ...` command. For the negative
AI fixture use `AI_SMOKE_REAL=0 AI_SMOKE_CASE=missing-rent npm run test:ai-integration`.
Direct HTTP/AI commands reuse the current build: rerun the full command after code
changes so results cannot silently apply to old compiled routes.

## Browser checklist (agent-operated)

After full checks pass, start the verified build with `npm run start` and open
`http://127.0.0.1:3001/login`. If shared schema changes are pending, follow the
README's coordinated migration procedure first. Use synthetic files and the
local accounts in `.data/local-accounts.json`; never include passwords in reports.
Reuse the running preview if only doing a browser check, and record whether it
actually represents the candidate being tested.

Record **PASS / FAIL / BLOCKED / NOT RUN** for each item. A missing tool, account,
worker, or provider is a blocked check, not a pass.

- [ ] **Sign-in and access:** borrower and lender can sign in and sign out;
  anonymous access redirects/denies; the wrong role cannot open protected views.
- [ ] **Borrower navigation:** open an application, switch requirements and saved
  files, inspect empty states, and return to the application list without errors.
- [ ] **Upload and persistence:** upload a small supported synthetic file, confirm
  progress finishes and the correct file/requirement appears; refresh and verify
  it persists. Preview/download it and check the bytes/content are correct.
- [ ] **Validation and recovery:** try an unsupported file; see a useful error and
  confirm a subsequent valid upload still works. No indefinite spinner or false
  success. Exercise any failure/retry UI affected by the change.
- [ ] **Organization:** link/unlink a synthetic file to a requirement; ensure both
  file and requirement views agree after refresh. Exercise draft removal/restore
  if affected; do not remove unrelated saved data.
- [ ] **Submission and lender review:** submit the synthetic evidence, sign in as
  lender, inspect it, record a review/requested change, then verify the borrower
  sees the expected state. Unsubmitted drafts must not become visible to lenders.
- [ ] **AI behavior:** on a configured test worker, verify upload matching and
  requirement completeness reach a terminal state; inspect evidence citations and
  missing criteria. Missing evidence must not become complete; AI completeness
  must remain distinct from lender acceptance. A changed file/link must not leave
  a stale result presented as current. Use the automated simulated suites above
  for repeatable coverage; browser actions with the normal worker can incur real
  provider calls, so run those only when live testing has been requested.
- [ ] **UI quality:** check desktop (1280px) and mobile (390px); no clipped controls,
  horizontal overflow, obstructed dialogs, or broken previews. Check keyboard focus
  and record console errors/failed requests. Capture screenshots for UI failures.
- [ ] **Changed behavior:** explicitly reproduce the original bug or new feature's
  acceptance steps, including the failure/empty case, and verify the expected result.

## Fix and reverify

One coordinating chat owns the checklist and candidate. Capture the commit SHA
(`git rev-parse HEAD`), dirty-file summary (`git status --short`), build/check time,
and preview URL before testing. A dirty checkout is not identified by SHA alone;
finish concurrent edits before claiming a verified candidate.

For every failure, record exact steps, expected/actual result, relevant command
output, and a screenshot for UI defects. Assign a scoped fix to a subagent when
available; use a new sidebar chat only when the user requests one. Avoid overlapping
file edits and leave unrelated work intact. Add a regression assertion for a
behavioral bug when practical; do not weaken expectations just to get green tests.

Rerun the failed check first, then the full command and affected browser checklist
on the final candidate. Any new edit invalidates the previous candidate result.
After two unsuccessful fix/reverify attempts, report the unresolved issue and
needed decision rather than looping indefinitely. Do not automatically push,
release, reset data, or restart another owner's preview.

Paste this compact report into the coordinating chat (store screenshots/logs under
`artifacts/testing/` if needed; omit credentials and private borrower data):

```text
Candidate: <SHA + dirty changes, build/check time>
Preview: <URL and whether it matches candidate>
Automated: <quick/full command, PASS/FAIL/BLOCKED, failing step>
Browser: <checklist outcomes, including NOT RUN/BLOCKED>
Bugs: <steps, expected/actual, evidence, fix and regression check>
Reverification: <commands and browser steps rerun after the last edit>
Result: <verified within listed scope / blocked / needs fixes>
```

Detailed AI coverage and known gaps remain in [AI workflow test plan](AI_WORKFLOW_TEST_PLAN.md).
