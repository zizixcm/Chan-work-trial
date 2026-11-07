-- Seal fact/finding provenance at the same boundary as its immutable values.
ALTER TABLE facts ADD COLUMN created_transaction xid8 NOT NULL DEFAULT pg_current_xact_id();
ALTER TABLE findings ADD COLUMN created_transaction xid8 NOT NULL DEFAULT pg_current_xact_id();
CREATE FUNCTION guard_provenance_child() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE tx xid8;
BEGIN
 IF TG_TABLE_NAME='fact_sources' THEN SELECT created_transaction INTO tx FROM facts WHERE application_id=NEW.application_id AND id=NEW.fact_id;
 ELSE SELECT created_transaction INTO tx FROM findings WHERE application_id=NEW.application_id AND id=NEW.finding_id;
 END IF;
 IF tx IS DISTINCT FROM pg_current_xact_id() THEN RAISE EXCEPTION 'Provenance set is sealed' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sealed_sources BEFORE INSERT ON fact_sources FOR EACH ROW EXECUTE FUNCTION guard_provenance_child();
CREATE TRIGGER sealed_inputs BEFORE INSERT ON finding_facts FOR EACH ROW EXECUTE FUNCTION guard_provenance_child();

CREATE FUNCTION invalidate_fact_dependents() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='documents' THEN
   UPDATE requirements SET evidence_revision=evidence_revision+1,revision=revision+1
   WHERE application_id=NEW.application_id AND id IN (
     SELECT f.requirement_id FROM findings f JOIN finding_facts ff ON ff.finding_id=f.id
     JOIN fact_sources fs ON fs.fact_id=ff.fact_id WHERE fs.document_id=NEW.replaces_document_id
   );
 ELSE
   UPDATE requirements SET evidence_revision=evidence_revision+1,revision=revision+1
   WHERE application_id=NEW.application_id AND id IN (
     SELECT f.requirement_id FROM findings f JOIN finding_facts ff ON ff.finding_id=f.id WHERE ff.fact_id=NEW.supersedes_id
   );
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER replaced_fact_sources AFTER INSERT ON documents FOR EACH ROW EXECUTE FUNCTION invalidate_fact_dependents();
CREATE TRIGGER corrected_fact_inputs AFTER INSERT ON facts FOR EACH ROW EXECUTE FUNCTION invalidate_fact_dependents();

CREATE FUNCTION prepare_finding() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM 1 FROM applications WHERE id=NEW.application_id FOR UPDATE;
 IF NEW.origin='reviewer_manual' AND NOT EXISTS(SELECT 1 FROM application_memberships WHERE application_id=NEW.application_id AND user_id=NEW.author_user_id AND active AND role='lender') THEN RAISE EXCEPTION 'Manual finding requires lender' USING ERRCODE='23514'; END IF;
 NEW.created_transaction := pg_current_xact_id();
 RETURN NEW;
END $$;
CREATE TRIGGER finding_actor BEFORE INSERT ON findings FOR EACH ROW EXECUTE FUNCTION prepare_finding();
CREATE FUNCTION invalidate_finding_request() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 UPDATE requirements SET evidence_revision=evidence_revision+1,revision=revision+1 WHERE application_id=NEW.application_id AND id=NEW.requirement_id;
 RETURN NULL;
END $$;
CREATE TRIGGER finding_request_revision AFTER INSERT ON findings FOR EACH ROW EXECUTE FUNCTION invalidate_finding_request();

CREATE FUNCTION record_review_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 UPDATE applications SET revision=revision+1 WHERE id=NEW.application_id;
 UPDATE requirements SET revision=revision+1 WHERE application_id=NEW.application_id AND id=NEW.requirement_id;
 RETURN NULL;
END $$;
CREATE TRIGGER review_revision AFTER INSERT ON requirement_reviews FOR EACH ROW EXECUTE FUNCTION record_review_revision();
CREATE FUNCTION validate_workflow_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s submissions; a applications;
BEGIN
 SELECT * INTO a FROM applications WHERE id=NEW.application_id FOR UPDATE;
 SELECT * INTO s FROM submissions WHERE application_id=NEW.application_id AND id=NEW.submission_id;
 IF NOT EXISTS(SELECT 1 FROM application_memberships WHERE application_id=NEW.application_id AND user_id=NEW.actor_user_id AND active AND role='lender') THEN RAISE EXCEPTION 'Workflow action requires lender' USING ERRCODE='23514'; END IF;
 IF NEW.event='collection_completed' THEN
   IF s.source_content_revision <> a.content_revision OR EXISTS(SELECT 1 FROM submissions WHERE application_id=NEW.application_id AND revision_number>s.revision_number) THEN RAISE EXCEPTION 'Complete only the current submitted package' USING ERRCODE='23514'; END IF;
   IF EXISTS(SELECT 1 FROM requirements r LEFT JOIN LATERAL (
     SELECT * FROM requirement_reviews v WHERE v.application_id=r.application_id AND v.requirement_id=r.id AND
      (v.review_scope='current' OR v.submission_id=NEW.submission_id) ORDER BY sequence DESC LIMIT 1
   ) v ON true WHERE r.application_id=NEW.application_id AND r.lifecycle='active' AND
    (v.id IS NULL OR v.definition_revision<>r.definition_revision OR NOT (v.decision='waived' OR (v.decision='accepted' AND v.evidence_revision=r.evidence_revision)))) THEN RAISE EXCEPTION 'Unresolved requests remain' USING ERRCODE='23514'; END IF;
 END IF;
 UPDATE applications SET revision=revision+1 WHERE id=NEW.application_id;
 RETURN NEW;
END $$;
CREATE TRIGGER workflow_authority BEFORE INSERT ON application_workflow_events FOR EACH ROW EXECUTE FUNCTION validate_workflow_event();

-- A deterministic, private-field-free snapshot builder. Caller still verifies
-- file availability/checksums and reconciles rules before issuing the preview.
CREATE FUNCTION build_submission_manifest(app text) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object(
 'application_id',a.id,
 'application',jsonb_build_object('id',a.id,'borrower_name',a.borrower_name,'property_name',a.property_name,'address',a.address,'transaction_type',a.transaction_type,'requested_amount',a.requested_amount::text,'loi_reference',a.loi_reference,'checklist_version',a.checklist_version,'policy_timezone',a.policy_timezone),
 'document_ids',coalesce((SELECT jsonb_agg(d.id ORDER BY d.id) FROM documents d WHERE d.application_id=app AND (EXISTS(SELECT 1 FROM requirement_documents rd JOIN requirements r ON r.id=rd.requirement_id WHERE rd.document_id=d.id AND rd.unlinked_at IS NULL AND r.lifecycle='active') OR EXISTS(SELECT 1 FROM draft_document_selections ds WHERE ds.document_id=d.id AND ds.included))),'[]'::jsonb),
 'documents',coalesce((SELECT jsonb_agg(jsonb_build_object('id',d.id,'series_id',d.series_id,'version_number',d.version_number,'original_name',d.original_name,'content_type',d.content_type,'size_bytes',d.size_bytes,'sha256',d.sha256,'uploaded_by',d.uploaded_by,'created_at',d.created_at) ORDER BY d.id) FROM documents d WHERE d.application_id=app AND (EXISTS(SELECT 1 FROM requirement_documents rd JOIN requirements r ON r.id=rd.requirement_id WHERE rd.document_id=d.id AND rd.unlinked_at IS NULL AND r.lifecycle='active') OR EXISTS(SELECT 1 FROM draft_document_selections ds WHERE ds.document_id=d.id AND ds.included))),'[]'::jsonb),
 'requirements',coalesce((SELECT jsonb_agg(jsonb_build_object('id',r.id,'title',r.title,'purpose',r.purpose,'period',r.period,'owner',r.owner,'applicability',r.applicability,'source',r.source,'lifecycle',r.lifecycle,'response_mode',r.response_mode,'evidence_revision',r.evidence_revision,'definition_revision',r.definition_revision,
  'document_ids',coalesce((SELECT jsonb_agg(rd.document_id ORDER BY rd.document_id) FROM requirement_documents rd WHERE rd.requirement_id=r.id AND rd.unlinked_at IS NULL),'[]'::jsonb),
  'explanation_ids',coalesce((SELECT jsonb_agg(e.id ORDER BY e.id) FROM explanations e JOIN explanation_series es ON es.id=e.explanation_series_id WHERE es.requirement_id=r.id AND NOT EXISTS(SELECT 1 FROM explanations successor WHERE successor.supersedes_id=e.id)),'[]'::jsonb)
 ) ORDER BY r.id) FROM requirements r WHERE r.application_id=app AND r.lifecycle='active'),'[]'::jsonb),
 'explanations',coalesce((SELECT jsonb_agg((to_jsonb(e)-'created_transaction') || jsonb_build_object('requirement_id',es.requirement_id,'finding_id',es.finding_id,'kind',es.kind) ORDER BY e.id) FROM explanations e JOIN explanation_series es ON es.id=e.explanation_series_id WHERE e.application_id=app AND NOT EXISTS(SELECT 1 FROM explanations successor WHERE successor.supersedes_id=e.id)),'[]'::jsonb),
 'facts',coalesce((SELECT jsonb_agg(to_jsonb(f)-'created_transaction' ORDER BY f.id) FROM facts f WHERE f.application_id=app AND NOT EXISTS(SELECT 1 FROM facts successor WHERE successor.supersedes_id=f.id)),'[]'::jsonb),
 'findings',coalesce((SELECT jsonb_agg(to_jsonb(f)-'created_transaction' ORDER BY f.id) FROM findings f WHERE f.application_id=app AND NOT EXISTS(SELECT 1 FROM findings successor WHERE successor.supersedes_id=f.id)),'[]'::jsonb),
 'reviews',coalesce((SELECT jsonb_agg(to_jsonb(v)-'created_transaction' ORDER BY v.requirement_id,v.sequence) FROM requirement_reviews v WHERE v.application_id=app),'[]'::jsonb)
 ) FROM applications a WHERE a.id=app
$$;

-- Binding to a server-generated preview prevents caller-edited snapshot text.
-- The explicit document/requirement-set validator remains a second line of defense.
CREATE FUNCTION validate_manifest_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.manifest IS DISTINCT FROM build_submission_manifest(NEW.application_id) THEN RAISE EXCEPTION 'Manifest does not match current package' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER submission_snapshot BEFORE INSERT ON submissions FOR EACH ROW EXECUTE FUNCTION validate_manifest_snapshot();
