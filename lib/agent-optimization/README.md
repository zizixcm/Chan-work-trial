# Bounded borrower prompt optimization

Run from the repository root after `npm run test:agent`:

```sh
npx tsx scripts/optimize-borrower-agent.ts --live --budget-usd 20
```

This explicitly spends up to the selected API cap (5, 10, or 20 USD) for a **new**
experiment. It requires `OPENROUTER_API_KEY` via the existing environment loader.
Each invocation creates a separate budget and immutable output directory; do not
rerun casually: without `--ledger`, a new invocation allocates a new budget.
To continue experiments within the same $20 total, append
`--ledger /absolute/path/to/the/original/ledger.json`. Prior spend and uncertain
reservations remain charged; artifacts go in a new directory. No failed results
are reused. Reusing a ledger requires its total cap to match the requested cap.
There are no background jobs, database writes, deployment changes, or automatic
prompt promotion. Tool execution uses an evaluation-only handler.

The experiment runs the actual native borrower agent with its existing tool
schema and mandatory base instructions. The optimizer proposes two bounded
instruction supplements. Five development cases run twice per configuration;
four separate held-out cases run twice after selection is frozen. Baseline
held-out results are also recorded. Held-out cases are never sent to the proposer.

Each output receives a separate blind semantic review using the configured pilot
model. This is independent execution, **not** a different-model or human review.
Before evaluation, the judge must correctly classify known supported and
unsupported statements in a calibration set, including the distinction between
"saving does not mean approval" and an invented actual review status.
The judge checks grounding, directness, useful next steps, repetition and critical
failures. Deterministic checks enforce action kind and fixture word limits.
Candidate selection requires more passing cases, no regression on previously
passing cases, and no hard failure. Equal scores retain the baseline. A finalist
must pass every held-out repetition. Missing/invalid reviews stop the run.

All agent, proposer and judge calls share one budget ledger using the existing
provider price restrictions and full-context reservations. Unknown costs retain
reservations and stop the run; per-call reservations may stop execution before
the nominal remaining budget is spent. No automatic API retries are introduced.

Artifacts are written under `artifacts/testing/agent-optimization/optimizer-*`:

- `manifest.json`: source hashes, revision/dirty state, model, dataset hashes,
  budget, judge version and repeat count.
- `*-config.json`: exact immutable base instructions, supplement and digest.
- `*-action.json` / `*-score.json`: actual outputs, independent reviews and scores.
- `auxiliary-*.json`: proposer/judge inputs and outputs.
- `frozen-selection.json`: selection before held-out evaluation.
- `report.json`: retain baseline, reject finalist, or candidate ready for review.
- `ledger.json`, `budget-final.json`, or `failure.json`: costs and completion state.

Scope: synthetic inventory/status/approval borrower turns. This does not certify
investigation, delegation, document reasoning, durable controller integration or
UI behavior. Before production promotion, run broader borrower regression cases,
full two-agent journeys with independent evidence review, the full repository
checks in a coordinated quiet window, and the applicable browser checklist.
Promotion requires explicitly applying a reviewed supplement and revalidating the
resulting configuration. Existing live application instructions remain unchanged.

Tests: `npx tsx --test tests/agent-optimization.test.ts`; normal repository quick
checks include these tests. Mocked tests establish optimizer wiring and selection
rules only. They do not measure model quality.

## Validate a reviewed production prompt

Use `--validate-current` with the same live command to evaluate the current default
borrower instructions without generating candidates or adding a supplement. This
runs the original nine synthetic cases plus five promotion regression cases, each
twice, after judge calibration. `production-validation.json` records the exact
configuration and every result; any failed case yields a nonzero exit. This is
prompt validation, not an application deployment or full journey certification.

To preserve the existing total budget, use the original ledger:

```sh
npx tsx scripts/optimize-borrower-agent.ts --live --budget-usd 20 --ledger /absolute/path/to/original/ledger.json --validate-current
```

For evaluator corrections, `--validate-current --rescore /absolute/prior/run`
reuses the prior run's saved actions. Candidate digest and exact input must match;
missing/mismatched artifacts fail closed. This re-runs judge calibration and
reviews without generating new agent responses. The new manifest records the
source directory; prior results remain intact. Both positive and negative judge
calibration cases distinguish assistant investigation from lender review.
