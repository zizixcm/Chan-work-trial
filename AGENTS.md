<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Testing changes

Follow [docs/TESTING.md](docs/TESTING.md) for the test–fix–reverify workflow.
Run `npm run test:agent` for quick checks; use `npm run test:agent -- --full`
in a coordinated quiet window for a fresh build and simulated integration checks.
Complete the browser checklist before claiming UI verification; report blocked or
unrun checks explicitly. Preserve unrelated edits and existing local data.
