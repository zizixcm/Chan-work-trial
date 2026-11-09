-- Forward-only additions to the originally applied workflow migration.
ALTER TABLE analysis_reservations ADD COLUMN input_usd_per_million numeric NOT NULL DEFAULT 0.10 CHECK(input_usd_per_million>=0),
 ADD COLUMN output_usd_per_million numeric NOT NULL DEFAULT 0.40 CHECK(output_usd_per_million>=0);
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
