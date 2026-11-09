-- Preserve historical consent semantics; only newly created jobs opt into auto policy.
ALTER TABLE analysis_jobs ADD COLUMN automatic boolean NOT NULL DEFAULT false;
ALTER TABLE analysis_jobs ADD CONSTRAINT automatic_borrower_authority CHECK(NOT automatic OR consent_scope='borrower');
CREATE TABLE draft_document_removals (
 application_id text NOT NULL,
 document_id text NOT NULL,
 removed_by text NOT NULL REFERENCES "user"(id),
 removed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(application_id,document_id),
 FOREIGN KEY(application_id,document_id) REFERENCES documents(application_id,id)
);
CREATE TRIGGER analysis_draft_removal AFTER INSERT ON draft_document_removals FOR EACH ROW EXECUTE FUNCTION invalidate_analysis_workflow();
