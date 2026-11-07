-- Invariants shared by all callers, including scripts. Identity authorization stays
-- in the server transaction; these functions never trust a browser role field.
CREATE FUNCTION reject_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE='23514'; END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['documents','document_series','fact_series','facts','fact_sources','findings','finding_facts','explanation_series','explanations','submissions','submission_documents','requirement_reviews','review_documents','review_explanations','audit_events','mutation_receipts','application_workflow_events','import_batches'] LOOP
 EXECUTE format('CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION reject_history_mutation()',t);
 END LOOP;
END $$;

CREATE FUNCTION prepare_document_version() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE previous documents; head integer;
BEGIN
 PERFORM 1 FROM applications WHERE id=NEW.application_id FOR UPDATE;
 IF NEW.series_id IS NULL THEN
   NEW.series_id := NEW.id;
   INSERT INTO document_series(id,application_id) VALUES(NEW.series_id,NEW.application_id);
 END IF;
 PERFORM 1 FROM document_series WHERE application_id=NEW.application_id AND id=NEW.series_id FOR UPDATE;
 SELECT max(version_number) INTO head FROM documents WHERE application_id=NEW.application_id AND series_id=NEW.series_id;
 IF NEW.version_number <> coalesce(head,0)+1 THEN RAISE EXCEPTION 'Version must follow current head' USING ERRCODE='23514'; END IF;
 IF NEW.replaces_document_id IS NOT NULL THEN
   SELECT * INTO previous FROM documents WHERE application_id=NEW.application_id AND series_id=NEW.series_id AND id=NEW.replaces_document_id;
   IF previous.id IS NULL OR previous.version_number <> head THEN RAISE EXCEPTION 'Invalid predecessor' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER document_chain BEFORE INSERT ON documents FOR EACH ROW EXECUTE FUNCTION prepare_document_version();

CREATE FUNCTION prepare_fact_revision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s fact_series; previous facts; head integer;
BEGIN
 SELECT * INTO s FROM fact_series WHERE application_id=NEW.application_id AND id=NEW.fact_series_id FOR UPDATE;
 IF s.id IS NULL OR s.author_user_id <> NEW.author_user_id THEN RAISE EXCEPTION 'Invalid fact author/series' USING ERRCODE='23514'; END IF;
 SELECT max(revision_number) INTO head FROM facts WHERE application_id=NEW.application_id AND fact_series_id=NEW.fact_series_id;
 IF NEW.revision_number <> coalesce(head,0)+1 THEN RAISE EXCEPTION 'Stale fact revision' USING ERRCODE='23514'; END IF;
 IF NEW.supersedes_id IS NOT NULL THEN
   SELECT * INTO previous FROM facts WHERE application_id=NEW.application_id AND fact_series_id=NEW.fact_series_id AND id=NEW.supersedes_id;
   IF previous.id IS NULL OR previous.revision_number <> head OR
     ROW(previous.period_start,previous.period_end,previous.as_of) IS DISTINCT FROM ROW(NEW.period_start,NEW.period_end,NEW.as_of)
   THEN RAISE EXCEPTION 'Invalid fact predecessor/period' USING ERRCODE='23514'; END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM application_memberships WHERE application_id=NEW.application_id AND user_id=NEW.author_user_id AND active AND role=NEW.author_role) THEN
   RAISE EXCEPTION 'Fact author is not an active member' USING ERRCODE='23514';
 END IF;
 IF (NEW.provenance='borrower_manual') <> (NEW.author_role='borrower') THEN RAISE EXCEPTION 'Invalid fact provenance' USING ERRCODE='23514'; END IF;
 IF NEW.confirmed_by_user_id IS NOT NULL AND NEW.confirmed_by_user_id <> NEW.author_user_id THEN
   RAISE EXCEPTION 'A distinct reviewer creates a separately attributed assertion' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER fact_chain BEFORE INSERT ON facts FOR EACH ROW EXECUTE FUNCTION prepare_fact_revision();

CREATE FUNCTION prepare_explanation_revision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s explanation_series; head integer; predecessor integer;
BEGIN
 SELECT * INTO s FROM explanation_series WHERE application_id=NEW.application_id AND id=NEW.explanation_series_id FOR UPDATE;
 IF s.id IS NULL OR s.author_user_id <> NEW.author_user_id THEN RAISE EXCEPTION 'Invalid explanation author/series' USING ERRCODE='23514'; END IF;
 SELECT max(revision_number) INTO head FROM explanations WHERE application_id=NEW.application_id AND explanation_series_id=NEW.explanation_series_id;
 IF NEW.revision_number <> coalesce(head,0)+1 THEN RAISE EXCEPTION 'Stale explanation revision' USING ERRCODE='23514'; END IF;
 IF NEW.supersedes_id IS NOT NULL THEN
   SELECT revision_number INTO predecessor FROM explanations WHERE application_id=NEW.application_id AND explanation_series_id=NEW.explanation_series_id AND id=NEW.supersedes_id;
   IF predecessor IS DISTINCT FROM head THEN RAISE EXCEPTION 'Invalid explanation predecessor' USING ERRCODE='23514'; END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM application_memberships WHERE application_id=NEW.application_id AND user_id=NEW.author_user_id AND active AND role=NEW.author_role) THEN
   RAISE EXCEPTION 'Explanation author is not an active member' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER explanation_chain BEFORE INSERT ON explanations FOR EACH ROW EXECUTE FUNCTION prepare_explanation_revision();

-- Aggregates become sealed at commit. Children may only be added in the parent's
-- creating transaction. Deferred validators inspect the final set at commit.
CREATE FUNCTION guard_aggregate_child() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_transaction xid8;
BEGIN
 IF TG_TABLE_NAME='submission_documents' THEN
   SELECT created_transaction INTO parent_transaction FROM submissions WHERE application_id=NEW.application_id AND id=NEW.submission_id;
 ELSE
   SELECT created_transaction INTO parent_transaction FROM requirement_reviews WHERE application_id=NEW.application_id AND id=NEW.review_id;
 END IF;
 IF parent_transaction IS DISTINCT FROM pg_current_xact_id() THEN RAISE EXCEPTION 'Evidence set is sealed' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sealed_children BEFORE INSERT ON submission_documents FOR EACH ROW EXECUTE FUNCTION guard_aggregate_child();
CREATE TRIGGER sealed_children BEFORE INSERT ON review_documents FOR EACH ROW EXECUTE FUNCTION guard_aggregate_child();
CREATE TRIGGER sealed_children BEFORE INSERT ON review_explanations FOR EACH ROW EXECUTE FUNCTION guard_aggregate_child();

CREATE FUNCTION prepare_review() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r requirements; latest bigint;
BEGIN
 PERFORM 1 FROM applications WHERE id=NEW.application_id FOR UPDATE;
 SELECT * INTO r FROM requirements WHERE application_id=NEW.application_id AND id=NEW.requirement_id;
 SELECT max(sequence) INTO latest FROM requirement_reviews WHERE application_id=NEW.application_id AND requirement_id=NEW.requirement_id;
 IF NEW.sequence IS NULL THEN NEW.sequence := coalesce(latest,0)+1; END IF;
 IF NEW.sequence <= coalesce(latest,0) THEN RAISE EXCEPTION 'Review sequence must increase' USING ERRCODE='23514'; END IF;
 IF NOT NEW.legacy_import THEN
   IF NOT EXISTS(SELECT 1 FROM application_memberships WHERE application_id=NEW.application_id AND user_id=NEW.reviewer_user_id AND active AND role='lender') THEN
     RAISE EXCEPTION 'Reviewer must be an active lender' USING ERRCODE='23514';
   END IF;
   IF NEW.review_scope='current' THEN
     IF NEW.evidence_revision IS NULL THEN NEW.evidence_revision := r.evidence_revision; END IF;
     IF NEW.definition_revision IS NULL THEN NEW.definition_revision := r.definition_revision; END IF;
     IF NEW.evidence_revision <> r.evidence_revision OR NEW.definition_revision <> r.definition_revision THEN RAISE EXCEPTION 'Stale review scope' USING ERRCODE='23514'; END IF;
   END IF;
 END IF;
 NEW.evidence_revision := coalesce(NEW.evidence_revision,0);
 NEW.definition_revision := coalesce(NEW.definition_revision,0);
 NEW.created_transaction := pg_current_xact_id();
 RETURN NEW;
END $$;
ALTER TABLE requirement_reviews ALTER COLUMN evidence_revision DROP DEFAULT;
ALTER TABLE requirement_reviews ALTER COLUMN definition_revision DROP DEFAULT;
CREATE TRIGGER review_scope BEFORE INSERT ON requirement_reviews FOR EACH ROW EXECUTE FUNCTION prepare_review();
CREATE FUNCTION populate_review_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO review_documents(application_id,review_id,document_id)
 SELECT NEW.application_id,NEW.id,value FROM jsonb_array_elements_text(NEW.document_ids::jsonb);
 INSERT INTO review_explanations(application_id,review_id,explanation_id)
 SELECT NEW.application_id,NEW.id,value FROM jsonb_array_elements_text(NEW.explanation_ids);
 RETURN NEW;
END $$;
CREATE TRIGGER review_evidence AFTER INSERT ON requirement_reviews FOR EACH ROW EXECUTE FUNCTION populate_review_evidence();
CREATE FUNCTION validate_review_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r requirements; snapshot jsonb; mode text; actual text[]; provided text[];
BEGIN
 IF NEW.legacy_import THEN RETURN NULL; END IF;
 SELECT * INTO r FROM requirements WHERE application_id=NEW.application_id AND id=NEW.requirement_id;
 SELECT coalesce(array_agg(document_id ORDER BY document_id),ARRAY[]::text[]) INTO provided FROM review_documents WHERE review_id=NEW.id;
 IF NEW.review_scope='current' THEN
   IF r.evidence_revision <> NEW.evidence_revision OR r.definition_revision <> NEW.definition_revision THEN RAISE EXCEPTION 'Evidence changed within review transaction' USING ERRCODE='23514'; END IF;
   SELECT coalesce(array_agg(document_id ORDER BY document_id),ARRAY[]::text[]) INTO actual FROM requirement_documents WHERE application_id=NEW.application_id AND requirement_id=NEW.requirement_id AND unlinked_at IS NULL;
   mode := r.response_mode;
   IF EXISTS(SELECT 1 FROM review_explanations re JOIN explanations e ON e.id=re.explanation_id JOIN explanation_series s ON s.id=e.explanation_series_id WHERE re.review_id=NEW.id AND (s.requirement_id IS DISTINCT FROM NEW.requirement_id OR EXISTS(SELECT 1 FROM explanations successor WHERE successor.supersedes_id=e.id))) THEN
     RAISE EXCEPTION 'Explanation is not current evidence for request' USING ERRCODE='23514';
   END IF;
 ELSE
   SELECT item INTO snapshot FROM submissions s CROSS JOIN LATERAL jsonb_array_elements(s.manifest->'requirements') item WHERE s.id=NEW.submission_id AND item->>'id'=NEW.requirement_id;
   IF snapshot IS NULL OR (snapshot->>'evidence_revision')::bigint IS DISTINCT FROM NEW.evidence_revision OR (snapshot->>'definition_revision')::bigint IS DISTINCT FROM NEW.definition_revision THEN RAISE EXCEPTION 'Invalid historical scope' USING ERRCODE='23514'; END IF;
   SELECT coalesce(array_agg(value ORDER BY value),ARRAY[]::text[]) INTO actual FROM jsonb_array_elements_text(snapshot->'document_ids');
   mode := snapshot->>'response_mode';
   IF EXISTS(SELECT 1 FROM review_explanations re WHERE re.review_id=NEW.id AND NOT (snapshot->'explanation_ids' ? re.explanation_id)) THEN RAISE EXCEPTION 'Explanation not in submission' USING ERRCODE='23514'; END IF;
 END IF;
 IF actual IS DISTINCT FROM provided THEN RAISE EXCEPTION 'Review files do not match evidence scope' USING ERRCODE='23514'; END IF;
 IF NEW.decision='accepted' AND NOT (
   (mode IN ('documents','either') AND cardinality(provided)>0) OR
   (mode IN ('explanation','either') AND EXISTS(SELECT 1 FROM review_explanations WHERE review_id=NEW.id))
 ) THEN RAISE EXCEPTION 'Request has no acceptable evidence' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER review_complete AFTER INSERT ON requirement_reviews DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_review_evidence();

CREATE FUNCTION prepare_submission() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a applications; latest integer;
BEGIN
 SELECT * INTO a FROM applications WHERE id=NEW.application_id FOR UPDATE;
 IF NEW.source_application_revision <> a.revision OR NEW.source_content_revision <> a.content_revision THEN RAISE EXCEPTION 'Stale submission preview' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM application_memberships WHERE application_id=NEW.application_id AND user_id=NEW.submitted_by_user_id AND active AND role='borrower') THEN RAISE EXCEPTION 'Submitter must be an active borrower' USING ERRCODE='23514'; END IF;
 SELECT max(revision_number) INTO latest FROM submissions WHERE application_id=NEW.application_id;
 IF NEW.revision_number <> coalesce(latest,0)+1 THEN RAISE EXCEPTION 'Invalid submission revision' USING ERRCODE='23514'; END IF;
 NEW.created_transaction := pg_current_xact_id();
 RETURN NEW;
END $$;
CREATE TRIGGER submission_scope BEFORE INSERT ON submissions FOR EACH ROW EXECUTE FUNCTION prepare_submission();
CREATE FUNCTION populate_submission_documents() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO submission_documents(application_id,submission_id,document_id)
 SELECT NEW.application_id,NEW.id,value FROM jsonb_array_elements_text(NEW.manifest->'document_ids');
 RETURN NEW;
END $$;
CREATE TRIGGER submission_evidence AFTER INSERT ON submissions FOR EACH ROW EXECUTE FUNCTION populate_submission_documents();
CREATE FUNCTION validate_submission() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expected text[]; actual text[]; item jsonb;
BEGIN
 SELECT coalesce(array_agg(value ORDER BY value),ARRAY[]::text[]) INTO expected FROM jsonb_array_elements_text(NEW.manifest->'document_ids');
 SELECT coalesce(array_agg(document_id ORDER BY document_id),ARRAY[]::text[]) INTO actual FROM submission_documents WHERE submission_id=NEW.id;
 IF expected IS DISTINCT FROM actual THEN RAISE EXCEPTION 'Submission attachment set mismatch' USING ERRCODE='23514'; END IF;
 IF NEW.manifest->>'application_id' IS DISTINCT FROM NEW.application_id OR jsonb_typeof(NEW.manifest->'requirements') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid manifest application/requests' USING ERRCODE='23514'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(NEW.manifest->'requirements') LOOP
   IF NOT EXISTS(SELECT 1 FROM requirements WHERE application_id=NEW.application_id AND id=item->>'id') OR
     jsonb_typeof(item->'document_ids') IS DISTINCT FROM 'array' OR jsonb_typeof(item->'explanation_ids') IS DISTINCT FROM 'array' OR
     item->>'response_mode' IS NULL OR item->>'response_mode' NOT IN ('documents','explanation','either') OR
     item->>'evidence_revision' IS NULL OR item->>'definition_revision' IS NULL THEN RAISE EXCEPTION 'Invalid frozen request' USING ERRCODE='23514'; END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(item->'document_ids') d WHERE NOT (NEW.manifest->'document_ids' ? d.value)) OR
     EXISTS(SELECT 1 FROM jsonb_array_elements_text(item->'explanation_ids') e WHERE NOT EXISTS(SELECT 1 FROM explanations x JOIN explanation_series s ON s.id=x.explanation_series_id WHERE x.application_id=NEW.application_id AND x.id=e.value AND s.requirement_id=item->>'id')) THEN RAISE EXCEPTION 'Invalid frozen evidence' USING ERRCODE='23514'; END IF;
 END LOOP;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER submission_complete AFTER INSERT ON submissions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_submission();

CREATE FUNCTION bump_content_revision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE app text; req text;
BEGIN
 app := coalesce(NEW.application_id,OLD.application_id);
 UPDATE applications SET revision=revision+1,content_revision=content_revision+1 WHERE id=app;
 IF TG_TABLE_NAME='requirement_documents' THEN req := coalesce(NEW.requirement_id,OLD.requirement_id);
 ELSIF TG_TABLE_NAME='explanations' THEN SELECT requirement_id INTO req FROM explanation_series WHERE id=NEW.explanation_series_id;
 END IF;
 IF req IS NOT NULL THEN UPDATE requirements SET revision=revision+1,evidence_revision=evidence_revision+1 WHERE application_id=app AND id=req; END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER mapping_revision AFTER INSERT OR UPDATE OR DELETE ON requirement_documents FOR EACH ROW EXECUTE FUNCTION bump_content_revision();
CREATE TRIGGER selection_revision AFTER INSERT OR UPDATE OR DELETE ON draft_document_selections FOR EACH ROW EXECUTE FUNCTION bump_content_revision();
CREATE TRIGGER explanation_revision AFTER INSERT ON explanations FOR EACH ROW EXECUTE FUNCTION bump_content_revision();
CREATE TRIGGER fact_revision AFTER INSERT ON facts FOR EACH ROW EXECUTE FUNCTION bump_content_revision();
CREATE TRIGGER finding_revision AFTER INSERT ON findings FOR EACH ROW EXECUTE FUNCTION bump_content_revision();
CREATE TRIGGER document_revision AFTER INSERT ON documents FOR EACH ROW EXECUTE FUNCTION bump_content_revision();

CREATE FUNCTION requirement_definition_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
   IF OLD.lifecycle='superseded' AND NEW.lifecycle <> OLD.lifecycle THEN RAISE EXCEPTION 'Create a new request occurrence' USING ERRCODE='23514'; END IF;
   IF ROW(NEW.title,NEW.purpose,NEW.period,NEW.applicability,NEW.response_mode,NEW.period_start,NEW.period_end,NEW.as_of,NEW.lifecycle,NEW.accepted_formats,NEW.subject_id)
     IS NOT DISTINCT FROM ROW(OLD.title,OLD.purpose,OLD.period,OLD.applicability,OLD.response_mode,OLD.period_start,OLD.period_end,OLD.as_of,OLD.lifecycle,OLD.accepted_formats,OLD.subject_id) THEN RETURN NEW; END IF;
   NEW.definition_revision := OLD.definition_revision+1;
   NEW.revision := OLD.revision+1;
 END IF;
 UPDATE applications SET revision=revision+1,content_revision=content_revision+1 WHERE id=NEW.application_id;
 RETURN NEW;
END $$;
CREATE TRIGGER requirement_revision BEFORE INSERT OR UPDATE ON requirements FOR EACH ROW EXECUTE FUNCTION requirement_definition_change();

-- Current fact eligibility never searches backwards for an old confirmation.
CREATE VIEW current_confirmed_facts AS
 SELECT f.* FROM facts f WHERE confirmation='confirmed'
 AND NOT EXISTS(SELECT 1 FROM facts successor WHERE successor.supersedes_id=f.id)
 AND NOT EXISTS(SELECT 1 FROM fact_sources s JOIN documents newer ON newer.replaces_document_id=s.document_id WHERE s.fact_id=f.id);
