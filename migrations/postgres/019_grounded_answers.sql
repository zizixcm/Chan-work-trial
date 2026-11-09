-- Synchronous deterministic answers: no pending model turn, worker or new queue.
ALTER TABLE borrower_conversation_messages ADD UNIQUE(application_id,id,borrower_user_id);
CREATE TABLE borrower_conversation_answers (
 id text PRIMARY KEY,
 application_id text NOT NULL,
 borrower_user_id text NOT NULL,
 message_id text NOT NULL UNIQUE,
 intent text NOT NULL CHECK(intent IN ('requested','uploaded','missing')),
 context_revision text NOT NULL,
 answer jsonb NOT NULL CHECK(answer->>'schemaVersion'='grounded-answer.v1'),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(application_id,message_id,borrower_user_id)
   REFERENCES borrower_conversation_messages(application_id,id,borrower_user_id)
);
