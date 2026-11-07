-- Personal opt-in cannot be inferred from a historical application-wide choice.
-- Preserve ai_preferences and all analysis history for audit.
CREATE TABLE user_ai_preferences (
 user_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
 enabled boolean NOT NULL DEFAULT false,
 epoch bigint NOT NULL DEFAULT 0 CHECK(epoch>=0),
 updated_at timestamptz NOT NULL DEFAULT now()
);
