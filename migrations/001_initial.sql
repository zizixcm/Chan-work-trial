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
