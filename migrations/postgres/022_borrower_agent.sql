-- Durable main-agent turns. Existing preparation tables remain investigation truth.
-- No activation, automatic linking, provider calls or data backfill.
ALTER TABLE borrower_conversations ADD COLUMN agent_trace_ref jsonb;
ALTER TABLE preparation_runs ADD COLUMN delegation_goal text;
ALTER TABLE preparation_runs ADD COLUMN parent_trace_ref jsonb;
ALTER TABLE preparation_steps ADD COLUMN trace_ref jsonb;
ALTER TABLE preparation_steps ADD COLUMN cost_settled boolean NOT NULL DEFAULT false;
CREATE TABLE borrower_agent_turns (
 id text PRIMARY KEY,
 application_id text NOT NULL REFERENCES applications(id),
 user_id text NOT NULL REFERENCES "user"(id),
 conversation_id text NOT NULL,
 source_key text NOT NULL,
 source_message_id text REFERENCES borrower_conversation_messages(id),
 state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','running','completed','blocked','superseded')),
 reserved_micros bigint NOT NULL DEFAULT 0, actual_micros bigint, cost_settled boolean NOT NULL DEFAULT false,
 token text, lease_until timestamptz, attempts integer NOT NULL DEFAULT 0,
 trace_ref jsonb, result_cursor text, context_fingerprint text, decision jsonb, outcome jsonb,
 response_text text, reason_code text,
 created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
 UNIQUE(application_id,user_id,source_key),
 FOREIGN KEY(application_id,conversation_id,user_id)
 REFERENCES borrower_conversations(application_id,id,borrower_user_id)
);
CREATE INDEX borrower_agent_pending ON borrower_agent_turns(state,created_at);
