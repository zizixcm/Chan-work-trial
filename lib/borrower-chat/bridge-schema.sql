-- Isolated bridge integration schema only. Not a normal application migration.
-- Apply after migration 019 in a disposable/isolated candidate database.
-- No public route/worker is enabled until the processor admission API is wired.
CREATE TABLE borrower_chat_delegations (
 id text PRIMARY KEY,
 application_id text NOT NULL,
 borrower_user_id text NOT NULL,
 message_id text NOT NULL UNIQUE,
 intent text NOT NULL CHECK(intent IN ('investigate_gap','review_documents')),
 requirement_id text,
 content_revision text NOT NULL,
 expected_context_revision text NOT NULL CHECK(expected_context_revision ~ '^[a-f0-9]{64}$'),
 body_digest text NOT NULL CHECK(body_digest ~ '^[a-f0-9]{64}$'),
 admission_attempts integer NOT NULL DEFAULT 0,
 next_admission_at timestamptz NOT NULL DEFAULT now(),
 admission_error text,
 processing_request jsonb,
 accepted_event jsonb,
 CHECK((processing_request IS NULL)=(accepted_event IS NULL)),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK((intent='investigate_gap' AND requirement_id IS NOT NULL) OR (intent='review_documents' AND requirement_id IS NULL)),
 FOREIGN KEY(application_id,message_id,borrower_user_id)
   REFERENCES borrower_conversation_messages(application_id,id,borrower_user_id),
 FOREIGN KEY(application_id,requirement_id) REFERENCES requirements(application_id,id)
);

CREATE TABLE borrower_chat_processing_views (
 application_id text NOT NULL,
 borrower_user_id text NOT NULL,
 preparation_id text NOT NULL,
 revision bigint NOT NULL CHECK(revision>0),
 projection jsonb NOT NULL,
 PRIMARY KEY(application_id,borrower_user_id,preparation_id),
 FOREIGN KEY(application_id,borrower_user_id) REFERENCES application_memberships(application_id,user_id)
);
