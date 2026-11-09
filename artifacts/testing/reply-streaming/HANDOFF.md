# Native reply streaming transport handoff

November 8, 2026. Source-only subtask; no provider calls, database writes, restarts or deployment.

Changed files/hashes are in sha256.txt. npm run test:agent PASS: 147 unit tests and TypeScript. Focused tests prove native Mastra tool-input reply text before provider EOF, one generation/durable action, safe message-only filtering, escaped/chunked JSON, optional callback-failure draining, confirmed cost on terminal failure, and unknown-cost retention on disconnect. Meter tests cover EOF, missing usage, stream failure, cancellation and unchanged nonstream usage accounting. quick.log records verification.

Transport calls agent.stream once and drains fullStream. Only the borrower-preparation agent may invoke optional execution.onReplyText; payload is cumulative decoded top-level message from reply_to_borrower, investigate_documents or answer_investigation_question. Reasoning/text channels, nested messages, other args, other tools, subsequent call IDs and tool results are ignored. Draft output is provisional; durable tool success owns final reply. Callback failure disables further draft delivery but drains provider output so accounting and durable effects are not lost.

The OpenRouter guard forwards SSE bytes without cloning/buffering the full response. It meters usage during downstream consumption and settles once on EOF/error/cancel; absent confirmed usage retains the full reservation. Transport errors after confirmed usage carry actualMicros in AgentExecutionError. Existing global fetch restoration/sequential generation remain.

Ownership returned to Integrated borrower platform deployment for the user-requested model configuration change and unified deployment. This snapshot intentionally keeps the existing 2.5 Flash model and guard caps; deployment owns coordinated 3.8 Flash settings and matching reservations. UI/SSE/persistence owner owns borrower-service/runtime hooks. Runtime catch must preserve a typed transport error's actualMicros rather than replace it with null when wrapping a backend tool failure; this exact follow-up was relayed to deployment.

Full frozen build, integrations and browser streaming verification: NOT RUN by this subtask; deployment owns these after all model/UI changes. Earlier port3102 recovery results are separate.
