# Chat upload journey: critical regression

Run `npm run eval:chat-upload` with the local test database available. It creates
and removes a disposable schema, uses synthetic text documents and scripted
native Mastra agents, and makes no provider calls. Set `CHAT_UPLOAD_EVAL_DIRECTORY`
to an absolute path to choose where its report and local traces are retained.

The scenario starts with a validated operating-income finding. The borrower then
uploads a current rent roll while another batch remains unfinished. The main
agent delegates only the newly uploaded files, the investigator reads every file’s actual bytes,
publishes the new finding and reaffirms the supported old finding, and the main
agent gives an application update from the committed result.

The automatic-processing preference is disabled throughout this scenario. Only
the explicit Upload action requests a review; no extra borrower message is sent.
The preference must remain disabled.

Version 4 runs both one-file and three-file uploads, and submits the manual finalization HTTP body without `requestProcessing`,
using the same command handler as the authenticated upload endpoint. This covers
older clients and other upload surfaces that omit the flag. Explicit `false`
remains storage-only; malformed flags are rejected by HTTP command unit tests.

All twelve assertions must pass; a failure cannot be averaged away:

1. Explicit upload queues and runs the borrower/investigation agents while the
   background automatic-processing preference remains disabled.
2. The saved upload receipt exists before the agent runs.
3. The upload trigger identifies the correct new document IDs and batch.
4. One delegated investigation focuses on all files in this upload batch.
5. Every new file is actually read; the old file is not needlessly reread.
6. The previously supported finding remains supported.
7. The new finding is validated and committed.
8. The borrower update reflects current results and does not claim completeness
   while another upload remains unfinished.
9. Repeated finalization and worker ticks create no duplicate investigation.
10. Processing activity appears while work is pending and disappears when idle.
11. Native tool spans and upload-batch correlation are retained in one trace.
12. Upload commit itself sends one durable `files_uploaded` agent message with
    all saved document IDs and filenames, before any worker inventory scan.

The single-file report is `report.json`; the three-file report is
`multi-file/report.json`. Both must pass. The admission integration also checks
that a first-ever upload creates the conversation and sends its message without
retroactively admitting an older batch.

`report.json` records the configuration digest, gates, synthetic interaction
sequence and trace reference. The local trace stores metadata and tool identity,
not raw documents, prompts, reasoning or credentials. Production upload turns
retain their server-verified batch/document trigger in PostgreSQL and carry the
opaque upload batch ID in existing local Mastra traces. Investigations and final
replies retain their durable result/turn references for replay and review.

Related adversarial controller checks:

- `node --import tsx tests/chat-upload-agents.integration.ts`: incomplete parallel
  batches, retries, context changes, consent and epoch revocation, duplicate
  admission, and ordinary evidence mutations.
- `node --import tsx tests/chat-upload-upgrade.integration.ts`: an upgrade must not
  dispatch work for historical receipts; a new batch must be admitted once.
- `node --import tsx tests/pilot-upload-evidence.integration.ts`: scoped saved-file
  receipts, initial corpus hashes, open-batch independence, and rejection of
  forged/cross-user/cross-application/unsaved/removed/hash-mismatched evidence.

## Interpretation and live-quality follow-up

This is a critical orchestration gate, not a live model quality score. The scripted
agents deliberately exercise the required native tools. It will not detect a
live model choosing a poor goal or writing an unsupported answer. A corresponding
live-model evaluation must use the same synthetic scenario and independently
review: whether it chooses the necessary focused investigation, reads the new
file, retains valid prior evidence, accurately explains the change, distinguishes
remaining gaps, and avoids lender approval claims or unnecessary whole-application
reviews. Expected findings must remain evaluator-private. Any live run must use
an explicitly authorized metered transport and existing spending limits.

The browser upload fixture separately checks staging/add/remove, explicit commit,
tray closure, receipts, activity and partial-failure recovery. Neither the scripted
browser fixture nor this controller eval measures real database-save-to-visible
UI latency; that metric remains unmeasured.
