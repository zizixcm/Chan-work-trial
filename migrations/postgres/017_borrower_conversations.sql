-- Additive borrower read-model association and conversation foundation.
-- No backfill, existing application/evidence mutations, or model scheduling.
CREATE TABLE application_loi_documents (
 application_id text PRIMARY KEY REFERENCES applications(id),
 document_id text NOT NULL,
 FOREIGN KEY(application_id,document_id) REFERENCES documents(application_id,id)
);

CREATE TABLE borrower_conversations (
 id text PRIMARY KEY,
 application_id text NOT NULL REFERENCES applications(id),
 borrower_user_id text NOT NULL REFERENCES "user"(id),
 last_sequence bigint NOT NULL DEFAULT 0 CHECK(last_sequence >= 0),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(application_id,borrower_user_id),
 UNIQUE(application_id,id,borrower_user_id),
 FOREIGN KEY(application_id,borrower_user_id) REFERENCES application_memberships(application_id,user_id)
);

CREATE TABLE borrower_conversation_messages (
 id text PRIMARY KEY,
 application_id text NOT NULL,
 conversation_id text NOT NULL,
 borrower_user_id text NOT NULL,
 sequence bigint NOT NULL CHECK(sequence > 0),
 client_message_id text NOT NULL CHECK(client_message_id ~ '^[A-Za-z0-9_-]{1,100}$'),
 body text NOT NULL CHECK(length(btrim(body)) > 0 AND octet_length(body) <= 16000),
 body_digest text NOT NULL CHECK(body_digest ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(application_id,conversation_id,borrower_user_id)
   REFERENCES borrower_conversations(application_id,id,borrower_user_id),
 UNIQUE(conversation_id,client_message_id),
 UNIQUE(conversation_id,sequence)
);
