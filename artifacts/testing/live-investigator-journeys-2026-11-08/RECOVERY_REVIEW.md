# Live investigator recovery — scoped evaluation review

Reviewed November 8, 2026, separately from the execution chat. The reviewer helped author the dataset; this is not external author-independent adjudication. Evidence hashes are retained in recovery-evidence-sha256.json.

**Outcome: genuine live investigator execution and one published partial assessment, with a confirmed semantic gap error. No full end-to-end journey pass is established.**

## Actual results

The first recovery round resumed three existing Aster investigations. Each reached document reading and attempted publication, but ended waiting_input with operator-owned tool_or_validation_limit, no result and no borrower question. It added 9 model calls and 14,753 micros ($0.014753).

The second round used a changed runtime with bounded validation correction. Two runs remained waiting_input and one became partial. Logs report incomplete/invalid criterion ledgers, unauthorized borrower-confirmation support, and one fabricated-text-quote rejection. It added 8 calls and 50,337 micros ($0.050337). Across these two rounds: **17 calls, $0.065090**. The shared cumulative ledger at the saved endpoint is **33 calls, $0.093934, held $0**; it includes earlier work and is not this evaluation's standalone cost. The three runs share the same evidence/scope, so they are repeated recovery attempts, not three independent test cases.

## Published result content

Saved bridge-result.json contains current result 55f4ea61-52df-4dd1-82d8-6967048496a8 from run9693e6a8-6810-4b5f-a568-0947f39fa324: 14 criterion checks, with 2 met, 11 unmet and 1 unknown. Only the 2025 operating report is uploaded. Its SHA-256 matches admitted D01 file f7dbacda2c2f3. The annual actuals finding is supported: Aster Quay, January–December 2025, rental income $49,368, expenses $16,456 and NOI $32,912. The saved citation matches preserved native extraction after whitespace normalization. The lease-amendment applicability finding correctly uses the stored zero-amendment borrower declaration. Missing leases, roll, current operating results, bank statements and entity governing/formation documents are real gaps in this one-file snapshot. No documentary-completeness or lender-approval claim appears in the result.

**Confirmed agent semantic error:** the governing-document gap says “Operating agreement and entity amendments are missing.” The operating agreement is absent, but the supplied declaration explicitly states zero entity amendments. Requesting nonexistent amendments ignores available facts. Passing backend validation did not catch this error.

**State-calibration issue requiring policy adjudication:** lease/roll comparison is marked unmet when neither input is present, while the analogous admitted comparison case uses unknown until comparison is possible. This is not a false-completeness error. The operating rent comparison is correctly unknown, though its not_applicable reason label is imprecise.

The saved bridge does not contain a final borrower-facing summary after publication. Full main-agent follow-through and browser completion are not established by this artifact.

## Separate causes

- **Agent quality:** confirmed unnecessary entity-amendment gap; validator-reported incomplete findings, unauthorized confirmation and quote mismatch in rejected attempts. Raw rejected action arguments are not preserved in these redacted trace artifacts, so those validation categories are not independently adjudicated semantic conclusions.
- **Runtime/harness:** original recovery lacked a correction opportunity after validation failure; accounting retained stale reservations. Separately, the new eval runner's first root offline attempt failed on a nonexistent created_at column and its initial completion assertions were too weak. Both are preserved as infrastructure/harness failures, not model failures. Strengthened frozen D01 and D03 offline checks pass.
- **Dataset applicability:** this recovery snapshot includes only one PDF. Canonical D01 checkpoint1 includes both this report and a rent roll. Applying the canonical oracle wholesale would incorrectly blame the model for an absent input. This is a development recovery diagnostic, not an admitted full-journey score.
- **Observability limitation:** metadata-only trace redaction correctly hides document text but cannot alone support semantic review of rejected tool arguments. The new isolated journey runner captures private native inputs/outputs separately for that purpose.

## Accounting review

All seven repaired historical charges match exact step/turn-correlated actualMicros in before-trace.json, totaling14,485. Application known spending moved9,967→24,452, its limit stayed5,000,000, and4,200,000 in stale reservations was released. This was reservation reconciliation, not a refund or added provider spend.

## Full-journey status

D01 and D03 were verified offline on a physically fixed candidate with native Mastra agents, workflows, scorers and local observability. D01:30scripted calls/3checkpoints; D03:32scripted calls/3checkpoints; each checkpoint has14findings and no controller errors. Scripted unknown findings deliberately do not pass semantic quality. No paid D01 or D03 call was dispatched by this evaluation chat. The coordinating chat is resolving conflicting cross-chat live-run/pause instructions before a new dispatch.

Update: the user explicitly resolved the cross-chat instruction conflict with “Leave live evals pending; finish deployment only.” D01/D03 live execution remains paused; no new paid run was dispatched by this evaluation chat.
