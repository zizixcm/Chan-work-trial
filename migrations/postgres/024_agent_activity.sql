-- Public progress metadata only; no prompts, arguments, evidence or model reasoning.
CREATE TABLE borrower_agent_activity (
 id text PRIMARY KEY,
 application_id text NOT NULL REFERENCES applications(id),
 user_id text NOT NULL REFERENCES "user"(id),
 run_id text NOT NULL,
 actor text NOT NULL CHECK (actor IN ('borrower','investigation')),
 lease_token text NOT NULL,
 label text NOT NULL,
 status text NOT NULL CHECK (status IN ('running','completed','failed')),
 started_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz
);
CREATE INDEX borrower_activity_scope ON borrower_agent_activity(application_id,user_id,started_at DESC);
