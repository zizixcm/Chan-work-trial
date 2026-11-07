CREATE FUNCTION validate_condition_occurrence() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE previous requirements;
BEGIN
 IF TG_OP='UPDATE' THEN
   IF ROW(NEW.id,NEW.application_id,NEW.condition_key,NEW.occurrence_number,NEW.supersedes_requirement_id) IS DISTINCT FROM ROW(OLD.id,OLD.application_id,OLD.condition_key,OLD.occurrence_number,OLD.supersedes_requirement_id) THEN RAISE EXCEPTION 'Request identity and recurrence lineage are immutable' USING ERRCODE='23514'; END IF;
   RETURN NEW;
 END IF;
 IF NEW.condition_key IS NOT NULL THEN
   PERFORM 1 FROM applications WHERE id=NEW.application_id FOR UPDATE;
   SELECT * INTO previous FROM requirements WHERE application_id=NEW.application_id AND condition_key=NEW.condition_key ORDER BY occurrence_number DESC LIMIT 1;
   IF NEW.occurrence_number<>coalesce(previous.occurrence_number,0)+1 OR NEW.supersedes_requirement_id IS DISTINCT FROM previous.id OR (previous.id IS NOT NULL AND previous.lifecycle<>'superseded') THEN RAISE EXCEPTION 'Invalid conditional request recurrence' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER condition_occurrence BEFORE INSERT OR UPDATE ON requirements FOR EACH ROW EXECUTE FUNCTION validate_condition_occurrence();

CREATE FUNCTION audit_membership_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE app text;
BEGIN
 app := coalesce(NEW.application_id,OLD.application_id);
 PERFORM 1 FROM applications WHERE id=app FOR UPDATE;
 INSERT INTO audit_events(id,application_id,actor,action,target_id,created_at,actor_kind,target_type,details,visibility)
 VALUES(gen_random_uuid()::text,app,'Membership provisioning','membership.' || lower(TG_OP),coalesce(NEW.user_id,OLD.user_id),now(),'system','application_membership',jsonb_build_object('previous',CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,'current',CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END),'lender_internal');
 UPDATE applications SET revision=revision+1 WHERE id=app;
 RETURN coalesce(NEW,OLD);
END $$;
CREATE TRIGGER membership_audit BEFORE INSERT OR UPDATE OR DELETE ON application_memberships FOR EACH ROW EXECUTE FUNCTION audit_membership_change();

CREATE FUNCTION audit_note_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM 1 FROM applications WHERE id=NEW.application_id FOR UPDATE;
 IF NEW.updated_by_user_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM application_memberships WHERE application_id=NEW.application_id AND user_id=NEW.updated_by_user_id AND active AND role='lender') THEN RAISE EXCEPTION 'Note author must be lender' USING ERRCODE='23514'; END IF;
 NEW.revision := CASE WHEN TG_OP='UPDATE' THEN OLD.revision+1 ELSE 1 END;
 INSERT INTO audit_events(id,application_id,actor,action,target_id,created_at,actor_user_id,actor_kind,actor_role_at_event,target_type,details,visibility)
 VALUES(gen_random_uuid()::text,NEW.application_id,coalesce((SELECT name FROM "user" WHERE id=NEW.updated_by_user_id),'Legacy note import'),'lender.note.revised',NEW.application_id,now(),NEW.updated_by_user_id,CASE WHEN NEW.updated_by_user_id IS NULL THEN 'legacy_import' ELSE 'user' END,CASE WHEN NEW.updated_by_user_id IS NULL THEN NULL ELSE 'lender' END,'lender_note',jsonb_build_object('previous_body',CASE WHEN TG_OP='UPDATE' THEN OLD.body ELSE NULL END,'body',NEW.body,'revision',NEW.revision),'lender_internal');
 UPDATE applications SET revision=revision+1 WHERE id=NEW.application_id;
 RETURN NEW;
END $$;
CREATE TRIGGER note_history BEFORE INSERT OR UPDATE ON lender_notes FOR EACH ROW EXECUTE FUNCTION audit_note_change();

-- Minimum manifest payloads are explicit rather than SELECT * projections.
-- Metadata and rule input JSON remain bounded/validated by the command layer.
CREATE VIEW borrower_activity AS
 SELECT id,application_id,actor,action,target_id,created_at,sequence
 FROM audit_events WHERE visibility='borrower_visible' AND action IN (
 'document.uploaded','document.replaced','requirement.accepted','requirement.waived',
 'requirement.changes_requested','submission.created','explanation.created'
 );
