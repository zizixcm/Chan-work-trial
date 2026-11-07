-- Review criteria are part of the definition, so edits invalidate prior current acceptance.
ALTER TABLE requirements
 ADD COLUMN criteria text[] NOT NULL DEFAULT ARRAY[]::text[],
 ADD COLUMN collection text NOT NULL DEFAULT 'borrower' CHECK(collection IN ('borrower','lender')),
 ADD COLUMN stage text NOT NULL DEFAULT 'Underwriting',
 ADD COLUMN condition text NOT NULL DEFAULT '';

CREATE OR REPLACE FUNCTION requirement_definition_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
   IF OLD.lifecycle='superseded' AND NEW.lifecycle <> OLD.lifecycle THEN RAISE EXCEPTION 'Create a new request occurrence' USING ERRCODE='23514'; END IF;
   IF ROW(NEW.title,NEW.purpose,NEW.period,NEW.applicability,NEW.response_mode,NEW.period_start,NEW.period_end,NEW.as_of,NEW.lifecycle,NEW.accepted_formats,NEW.subject_id,NEW.criteria,NEW.collection,NEW.stage,NEW.condition,NEW.owner,NEW.category)
     IS NOT DISTINCT FROM ROW(OLD.title,OLD.purpose,OLD.period,OLD.applicability,OLD.response_mode,OLD.period_start,OLD.period_end,OLD.as_of,OLD.lifecycle,OLD.accepted_formats,OLD.subject_id,OLD.criteria,OLD.collection,OLD.stage,OLD.condition,OLD.owner,OLD.category) THEN RETURN NEW; END IF;
   NEW.definition_revision := OLD.definition_revision+1;
   NEW.revision := OLD.revision+1;
 END IF;
 UPDATE applications SET revision=revision+1,content_revision=content_revision+1 WHERE id=NEW.application_id;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION build_submission_manifest(app text) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object(
 'application_id',a.id,
 'application',jsonb_build_object('id',a.id,'borrower_name',a.borrower_name,'property_name',a.property_name,'address',a.address,'transaction_type',a.transaction_type,'requested_amount',a.requested_amount::text,'loi_reference',a.loi_reference,'checklist_version',a.checklist_version,'policy_timezone',a.policy_timezone),
 'document_ids',coalesce((SELECT jsonb_agg(d.id ORDER BY d.id) FROM documents d WHERE d.application_id=app AND (EXISTS(SELECT 1 FROM requirement_documents rd JOIN requirements r ON r.id=rd.requirement_id WHERE rd.document_id=d.id AND rd.unlinked_at IS NULL AND r.lifecycle='active') OR EXISTS(SELECT 1 FROM draft_document_selections ds WHERE ds.document_id=d.id AND ds.included))),'[]'::jsonb),
 'documents',coalesce((SELECT jsonb_agg(jsonb_build_object('id',d.id,'series_id',d.series_id,'version_number',d.version_number,'original_name',d.original_name,'content_type',d.content_type,'size_bytes',d.size_bytes,'sha256',d.sha256,'uploaded_by',d.uploaded_by,'created_at',d.created_at) ORDER BY d.id) FROM documents d WHERE d.application_id=app AND (EXISTS(SELECT 1 FROM requirement_documents rd JOIN requirements r ON r.id=rd.requirement_id WHERE rd.document_id=d.id AND rd.unlinked_at IS NULL AND r.lifecycle='active') OR EXISTS(SELECT 1 FROM draft_document_selections ds WHERE ds.document_id=d.id AND ds.included))),'[]'::jsonb),
 'requirements',coalesce((SELECT jsonb_agg(jsonb_build_object('id',r.id,'title',r.title,'purpose',r.purpose,'period',r.period,'owner',r.owner,'applicability',r.applicability,'source',r.source,'lifecycle',r.lifecycle,'response_mode',r.response_mode,'evidence_revision',r.evidence_revision,'definition_revision',r.definition_revision,'criteria',r.criteria,'collection',r.collection,'stage',r.stage,'condition',r.condition,'category',r.category,
  'document_ids',coalesce((SELECT jsonb_agg(rd.document_id ORDER BY rd.document_id) FROM requirement_documents rd WHERE rd.requirement_id=r.id AND rd.unlinked_at IS NULL),'[]'::jsonb),
  'explanation_ids',coalesce((SELECT jsonb_agg(e.id ORDER BY e.id) FROM explanations e JOIN explanation_series es ON es.id=e.explanation_series_id WHERE es.requirement_id=r.id AND NOT EXISTS(SELECT 1 FROM explanations successor WHERE successor.supersedes_id=e.id)),'[]'::jsonb)
 ) ORDER BY r.id) FROM requirements r WHERE r.application_id=app AND r.lifecycle='active'),'[]'::jsonb),
 'explanations',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'explanation_series_id',e.explanation_series_id,'revision_number',e.revision_number,'body',e.body,'author_label',e.author_label,'author_role',e.author_role,'author_user_id',e.author_user_id,'created_at',e.created_at) || jsonb_build_object('requirement_id',es.requirement_id,'finding_id',es.finding_id,'kind',es.kind) ORDER BY e.id) FROM explanations e JOIN explanation_series es ON es.id=e.explanation_series_id WHERE e.application_id=app AND NOT EXISTS(SELECT 1 FROM explanations successor WHERE successor.supersedes_id=e.id)),'[]'::jsonb),
 'facts',coalesce((SELECT jsonb_agg(jsonb_build_object('id',f.id,'fact_series_id',f.fact_series_id,'revision_number',f.revision_number,'value',f.value,'period_start',f.period_start,'period_end',f.period_end,'as_of',f.as_of,'provenance',f.provenance,'confirmation',f.confirmation,'author_user_id',f.author_user_id,'author_label',f.author_label,'author_role',f.author_role,'confirmed_by_user_id',f.confirmed_by_user_id,'confirmed_at',f.confirmed_at,'created_at',f.created_at,'subject_id',fs.subject_id,'fact_key',fs.fact_key,'unit',fs.unit,'scope_key',fs.scope_key,'sources',coalesce((SELECT jsonb_agg(jsonb_build_object('document_id',src.document_id,'location',src.location) ORDER BY src.document_id) FROM fact_sources src WHERE src.fact_id=f.id),'[]'::jsonb)) ORDER BY f.id) FROM facts f JOIN fact_series fs ON fs.id=f.fact_series_id WHERE f.application_id=app AND NOT EXISTS(SELECT 1 FROM facts successor WHERE successor.supersedes_id=f.id)),'[]'::jsonb),
 'findings',coalesce((SELECT jsonb_agg(jsonb_build_object('id',f.id,'requirement_id',f.requirement_id,'subject_id',f.subject_id,'origin',f.origin,'rule_key',f.rule_key,'rule_version',f.rule_version,'input_fingerprint',f.input_fingerprint,'result',f.result,'reason',f.reason,'input_snapshot',f.input_snapshot,'evidence',f.evidence,'created_at',f.created_at,'fact_ids',coalesce((SELECT jsonb_agg(ff.fact_id ORDER BY ff.fact_id) FROM finding_facts ff WHERE ff.finding_id=f.id),'[]'::jsonb)) ORDER BY f.id) FROM findings f WHERE f.application_id=app AND NOT EXISTS(SELECT 1 FROM findings successor WHERE successor.supersedes_id=f.id)),'[]'::jsonb),
 'reviews',coalesce((SELECT jsonb_agg(jsonb_build_object('id',v.id,'requirement_id',v.requirement_id,'decision',v.decision,'message',v.message,'document_ids',v.document_ids::jsonb,'explanation_ids',v.explanation_ids,'reviewer',v.reviewer,'reviewer_user_id',v.reviewer_user_id,'reviewer_role',v.reviewer_role,'created_at',v.created_at,'sequence',v.sequence,'evidence_revision',v.evidence_revision,'definition_revision',v.definition_revision,'review_scope',v.review_scope,'submission_id',v.submission_id) ORDER BY v.requirement_id,v.sequence) FROM requirement_reviews v WHERE v.application_id=app),'[]'::jsonb)
 ) FROM applications a WHERE a.id=app
$$;
ALTER FUNCTION build_submission_manifest(text) SET timezone='UTC';
