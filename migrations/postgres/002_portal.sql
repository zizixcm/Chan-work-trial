CREATE TABLE IF NOT EXISTS applications (
 id TEXT PRIMARY KEY, borrower_name TEXT NOT NULL, property_name TEXT NOT NULL,
 address TEXT NOT NULL, transaction_type TEXT NOT NULL, requested_amount INTEGER NOT NULL,
 loi_reference TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS requirements (
 id TEXT PRIMARY KEY, application_id TEXT NOT NULL REFERENCES applications(id),
 title TEXT NOT NULL, category TEXT NOT NULL, purpose TEXT NOT NULL, period TEXT NOT NULL,
 owner TEXT NOT NULL, applicability TEXT NOT NULL, sort_order INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS documents (
 id TEXT PRIMARY KEY, application_id TEXT NOT NULL REFERENCES applications(id),
 original_name TEXT NOT NULL, storage_key TEXT NOT NULL UNIQUE, content_type TEXT NOT NULL,
 size_bytes INTEGER NOT NULL CHECK(size_bytes > 0), sha256 TEXT NOT NULL,
 uploaded_by TEXT NOT NULL, created_at TEXT NOT NULL,
 UNIQUE(application_id, sha256)
);
CREATE TABLE IF NOT EXISTS requirement_documents (
 requirement_id TEXT NOT NULL REFERENCES requirements(id), document_id TEXT NOT NULL REFERENCES documents(id),
 PRIMARY KEY(requirement_id, document_id)
);
CREATE TABLE IF NOT EXISTS audit_events (
 id TEXT PRIMARY KEY, application_id TEXT NOT NULL REFERENCES applications(id),
 actor TEXT NOT NULL, action TEXT NOT NULL, target_id TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS documents_application ON documents(application_id);
CREATE INDEX IF NOT EXISTS requirements_application ON requirements(application_id);
CREATE TABLE requirement_reviews (
 id TEXT PRIMARY KEY,
 application_id TEXT NOT NULL REFERENCES applications(id),
 requirement_id TEXT NOT NULL REFERENCES requirements(id),
 decision TEXT NOT NULL CHECK(decision IN ('accepted', 'changes_requested')),
 message TEXT NOT NULL,
 document_ids TEXT NOT NULL,
 reviewer TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE INDEX reviews_requirement ON requirement_reviews(requirement_id, created_at);
CREATE TABLE lender_notes (
 application_id TEXT PRIMARY KEY REFERENCES applications(id),
 body TEXT NOT NULL,
 updated_at TEXT NOT NULL
);

CREATE TABLE application_memberships (
 application_id TEXT NOT NULL REFERENCES applications(id),
 user_id TEXT NOT NULL REFERENCES "user"(id),
 role TEXT NOT NULL CHECK(role IN ('borrower','lender')),
 active BOOLEAN NOT NULL DEFAULT true,
 PRIMARY KEY(application_id,user_id)
);
ALTER TABLE requirements ADD CONSTRAINT requirements_application_id_unique UNIQUE(application_id,id);
ALTER TABLE documents ADD CONSTRAINT documents_application_id_unique UNIQUE(application_id,id);
ALTER TABLE documents ADD COLUMN uploaded_by_user_id TEXT REFERENCES "user"(id);
ALTER TABLE requirement_documents ADD COLUMN application_id TEXT NOT NULL REFERENCES applications(id);
ALTER TABLE requirement_documents ADD CONSTRAINT mapping_requirement_application FOREIGN KEY(application_id,requirement_id) REFERENCES requirements(application_id,id);
ALTER TABLE requirement_documents ADD CONSTRAINT mapping_document_application FOREIGN KEY(application_id,document_id) REFERENCES documents(application_id,id);
ALTER TABLE requirement_reviews ADD COLUMN reviewer_user_id TEXT REFERENCES "user"(id);
ALTER TABLE requirement_reviews ADD CONSTRAINT review_requirement_application FOREIGN KEY(application_id,requirement_id) REFERENCES requirements(application_id,id);
ALTER TABLE audit_events ADD COLUMN actor_user_id TEXT REFERENCES "user"(id);
CREATE INDEX membership_user ON application_memberships(user_id,active);
