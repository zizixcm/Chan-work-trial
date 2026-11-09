# Borrower response quality evals

Owner scope: maintain borrower response cases and independent scoring, then tune
agent instructions based on failures. A shorter answer is not sufficient: it must
answer the question accurately and suggest concrete next steps only when needed.

`lib/evals/borrower-concision.ts` contains five synthetic cases: saved uploads,
empty inventory, pending uploads, a specific file question, and requested detail.
Simple answers have 60–120 word ceilings; the detail case allows 180. These are
fixture-specific evaluation limits, not production truncation. Larger inventories
must still include all requested files.

Run offline regression coverage with `npm run test:agent`. The native planner
harness accepts the existing metered `AgentTransport`; its default unit tests use
scripted outputs and prove wiring, not live model quality. No gold rubric or word
limit enters the agent input. Live evaluation must use the existing budgeted
transport and record configuration digest, actual action and provider cost.

Score a captured action from the matching fixture with:

```sh
npx tsx scripts/evaluate-borrower-concision.ts uploads-saved action.json review.json
```

`action.json` is the native action, e.g. `{ "kind": "reply", "message": "..." }`.
Omit `review.json` for mechanical checks and a `needs_review` result (exit 2).
Failure exits 1; only all gates passing exits 0. An independent reviewer supplies
these four keys, each containing `passed` (boolean) and `evidence` (nonempty text):

- `answersQuestion`: answer every requested part; name saved files for inventory
  questions, rather than substituting a missing-document checklist.
- `grounded`: use only supplied facts; distinguish pending, saved, reviewed and
  approved. Inventory alone cannot establish completeness.
- `appropriateNextSteps`: suggest a specific useful action for an empty or pending
  inventory. When no action is supported, omit recommendations. Never invent gaps,
  ask for duplicate uploads, or assign operator work to the borrower.
- `noRepetition`: do not repeat gaps as both findings and tasks, repeat disclaimers
  per file, or dump criterion findings into a simple status answer.

Review the actual response against the fixture and cite response/context evidence
for each judgment. Do not reuse test receipts as live reviews or use the answering
agent's self-assessment as an independent review. No aggregate can hide a failed
case. Compare before/after outputs on the same cases before claiming model quality
improved.

The deterministic upload answer also has regression coverage over empty, two-file,
and thirty-file inventories, each with/without pending uploads. Detailed source
metadata remains available through citations. The current completeness panel is
collapsed by default so its full findings do not overwhelm a short chat answer.

## Live execution and latest result

Explicitly authorized live runs use:

```sh
npx tsx scripts/run-borrower-concision-live.ts --live <unique-round-name>
```

The runner requires the configured OpenRouter credential, uses the existing
metered Gemini 2.5 Flash transport, and limits this evaluation batch to $2.
It saves the exact instructions, configuration digest, fixture, native action,
cost, and mechanical score under `artifacts/testing/borrower-concision/live/`.
It does not alter borrower application data. Every new round needs a unique name;
its output does not count as a quality pass until independently reviewed.

On November 8, 2026, three live rounds (15 calls) cost $0.006424 total, with no
unsettled reservations. Baseline passed 3/5 semantic reviews. The first tuning
attempt fixed empty-upload guidance but introduced an unsupported review claim
in the pending case (4/5 overall). The second tuning clarified the pending flag;
the pending case passed, but empty-upload guidance regressed (4/5 overall).
Saved-upload, specific-file, and detailed-answer cases passed in every round.
See each round's `reviewed-results.json` for exact replies and evidence for every
judgment. These are synthetic-context results, not an end-to-end UI evaluation.

Tuning stopped after two unsuccessful fix/reverify attempts per `docs/TESTING.md`.
The remaining decision is whether to enforce the empty-inventory next step with
a deterministic response rule; prompt-only reliability is not established.
