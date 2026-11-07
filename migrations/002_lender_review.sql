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
