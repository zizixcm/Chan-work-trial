-- Additive workflow state. No existing evidence or history is rewritten.
ALTER TABLE analysis_reservations ADD COLUMN input_usd_per_million numeric NOT NULL DEFAULT 0.10 CHECK(input_usd_per_million>=0),
 ADD COLUMN output_usd_per_million numeric NOT NULL DEFAULT 0.40 CHECK(output_usd_per_million>=0);
CREATE TABLE upload_batches (
 id text PRIMARY KEY, application_id text NOT NULL REFERENCES applications(id),
 user_id text NOT NULL REFERENCES "user"(id), manifest_hash text NOT NULL,
 state text NOT NULL DEFAULT 'open' CHECK(state IN ('open','finalized','expired')),
 created_at timestamptz NOT NULL DEFAULT now(), deadline_at timestamptz NOT NULL DEFAULT now()+interval '5 minutes',
 UNIQUE(application_id,id)
);
CREATE TABLE upload_batch_members (
 batch_id text NOT NULL REFERENCES upload_batches(id), id text NOT NULL, application_id text NOT NULL,
 name text NOT NULL, sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
 requirement_id text, document_id text,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','saved','failed')),
 PRIMARY KEY(batch_id,id), FOREIGN KEY(application_id,batch_id) REFERENCES upload_batches(application_id,id),
 FOREIGN KEY(application_id,document_id) REFERENCES documents(application_id,id),
 FOREIGN KEY(application_id,requirement_id) REFERENCES requirements(application_id,id),
 CHECK((state='saved')=(document_id IS NOT NULL))
);
CREATE INDEX upload_batch_due ON upload_batches(deadline_at) WHERE state='open';
CREATE TABLE analysis_invalidations (
 application_id text PRIMARY KEY REFERENCES applications(id), changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION invalidate_analysis_workflow() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO analysis_invalidations(application_id,changed_at) VALUES(NEW.application_id,clock_timestamp())
 ON CONFLICT(application_id) DO UPDATE SET changed_at=EXCLUDED.changed_at;
 RETURN NEW;
END $$;
CREATE TRIGGER analysis_requirement_change AFTER INSERT OR UPDATE ON requirements FOR EACH ROW EXECUTE FUNCTION invalidate_analysis_workflow();
CREATE TRIGGER analysis_document_change AFTER INSERT OR UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION invalidate_analysis_workflow();
CREATE TRIGGER analysis_mapping_change AFTER INSERT OR UPDATE ON requirement_documents FOR EACH ROW EXECUTE FUNCTION invalidate_analysis_workflow();
CREATE TRIGGER analysis_batch_change AFTER INSERT OR UPDATE ON upload_batches FOR EACH ROW EXECUTE FUNCTION invalidate_analysis_workflow();
CREATE TRIGGER analysis_member_change AFTER INSERT OR UPDATE ON upload_batch_members FOR EACH ROW EXECUTE FUNCTION invalidate_analysis_workflow();
CREATE TRIGGER analysis_subject_change AFTER INSERT OR UPDATE ON application_subjects FOR EACH ROW EXECUTE FUNCTION invalidate_analysis_workflow();
CREATE FUNCTION invalidate_application_analysis() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO analysis_invalidations(application_id,changed_at) VALUES(NEW.id,clock_timestamp())
 ON CONFLICT(application_id) DO UPDATE SET changed_at=EXCLUDED.changed_at;
 RETURN NEW;
END $$;
CREATE TRIGGER analysis_application_context AFTER UPDATE OF property_name,borrower_name ON applications FOR EACH ROW
 WHEN (ROW(OLD.property_name,OLD.borrower_name) IS DISTINCT FROM ROW(NEW.property_name,NEW.borrower_name))
 EXECUTE FUNCTION invalidate_application_analysis();
