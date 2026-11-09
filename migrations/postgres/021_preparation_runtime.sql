-- Opt-in runtime. No application is switched and no work is scheduled by migration.
CREATE TABLE preparation_processor_modes (
 application_id text PRIMARY KEY REFERENCES applications(id),
 mode text NOT NULL CHECK(mode IN ('baseline','adaptive')),
 execution_epoch bigint NOT NULL DEFAULT 1
);
CREATE TABLE borrower_preparations (
 id text PRIMARY KEY,
 application_id text NOT NULL REFERENCES applications(id),
 user_id text NOT NULL,
 revision bigint NOT NULL DEFAULT 1,
 fingerprint text NOT NULL,
 state jsonb NOT NULL,
 UNIQUE(application_id,user_id),
 FOREIGN KEY(application_id,user_id) REFERENCES application_memberships(application_id,user_id)
);
CREATE TABLE preparation_commands (
 application_id text NOT NULL,user_id text NOT NULL,idempotency_key text NOT NULL,
 payload_hash text NOT NULL,run_id text NOT NULL,
 PRIMARY KEY(application_id,user_id,idempotency_key)
);
CREATE TABLE preparation_runs (
 id text PRIMARY KEY,preparation_id text NOT NULL REFERENCES borrower_preparations(id),
 application_id text NOT NULL,user_id text NOT NULL,execution_epoch bigint NOT NULL,
 revision bigint NOT NULL DEFAULT 1,state text NOT NULL,request jsonb NOT NULL,
 inventory jsonb NOT NULL,observations jsonb NOT NULL DEFAULT '[]',
 token text,lease_until timestamptz,spent_micros bigint NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(application_id,user_id) REFERENCES application_memberships(application_id,user_id)
);
CREATE TABLE preparation_results (
 id text NOT NULL,revision bigint NOT NULL,application_id text NOT NULL,user_id text NOT NULL,
 preparation_id text NOT NULL REFERENCES borrower_preparations(id),payload jsonb NOT NULL,
 PRIMARY KEY(id,revision)
);
CREATE TABLE preparation_stream (
 sequence bigserial PRIMARY KEY,id text UNIQUE NOT NULL,application_id text NOT NULL,user_id text NOT NULL,payload jsonb NOT NULL
);
CREATE TABLE preparation_steps (
 run_id text NOT NULL REFERENCES preparation_runs(id),id text NOT NULL,input_hash text NOT NULL,
 status text NOT NULL,reserved_micros bigint NOT NULL,output jsonb,
 PRIMARY KEY(run_id,id)
);
CREATE TABLE preparation_upload_obligations (
 id text PRIMARY KEY,application_id text NOT NULL,user_id text NOT NULL,
 source_key text NOT NULL,execution_epoch bigint NOT NULL,state text NOT NULL DEFAULT 'pending',
 UNIQUE(application_id,user_id,source_key,execution_epoch)
);

-- Evidence mutations atomically invalidate completed projections as well as active runs.
CREATE FUNCTION invalidate_preparation_projection() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p record; e text; c text; old_ref jsonb; app_id text;
BEGIN
 IF TG_TABLE_NAME='applications' THEN
  IF NEW.content_revision IS NOT DISTINCT FROM OLD.content_revision THEN RETURN NEW; END IF;
  app_id=NEW.id;
 ELSE app_id=NEW.application_id; END IF;
 FOR p IN SELECT * FROM borrower_preparations WHERE application_id=app_id FOR UPDATE LOOP
  old_ref=p.state->'currentResultRef';
  UPDATE borrower_preparations SET revision=revision+1,fingerprint='',state=jsonb_set(state,'{currentResultRef}','null') WHERE id=p.id;
  UPDATE preparation_runs SET state='superseded',revision=revision+1,token=NULL,lease_until=NULL WHERE preparation_id=p.id AND state IN ('queued','running','waiting_input');
  e=gen_random_uuid()::text;c=gen_random_uuid()::text;
  INSERT INTO preparation_stream(id,application_id,user_id,payload) VALUES(e,app_id,p.user_id,jsonb_build_object(
   'schemaVersion','preparation-invalidation.v1','type','application.preparation_invalidated','eventId',e,'applicationId',app_id,'cursor',c,
   'occurredAt',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'preparationId',p.id,'preparationRevision',(p.revision+1)::text,
   'affectedResultRefs',CASE WHEN old_ref IS NULL OR old_ref='null'::jsonb THEN '[]'::jsonb ELSE jsonb_build_array(old_ref) END,
   'affectedRequirementIds','[]'::jsonb,'reasonCode','evidence_changed'));
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER preparation_content_invalidation AFTER UPDATE OF content_revision ON applications FOR EACH ROW EXECUTE FUNCTION invalidate_preparation_projection();
CREATE TABLE preparation_questions (
 id text PRIMARY KEY,revision bigint NOT NULL DEFAULT 1,application_id text NOT NULL,user_id text NOT NULL,
 preparation_id text NOT NULL REFERENCES borrower_preparations(id),run_id text NOT NULL REFERENCES preparation_runs(id),
 payload jsonb NOT NULL,answer jsonb,answer_key text,answer_hash text,
 FOREIGN KEY(application_id,user_id) REFERENCES application_memberships(application_id,user_id)
);

CREATE TABLE preparation_coverage (id text NOT NULL,revision bigint NOT NULL,application_id text NOT NULL,user_id text NOT NULL,payload jsonb NOT NULL,PRIMARY KEY(id,revision));
ALTER TABLE preparation_upload_obligations ADD COLUMN intent jsonb, ADD COLUMN run_id text REFERENCES preparation_runs(id);
ALTER TABLE preparation_runs ADD UNIQUE(application_id,id);
ALTER TABLE requirement_documents ADD COLUMN preparation_run_id text,
 ADD FOREIGN KEY(application_id,preparation_run_id) REFERENCES preparation_runs(application_id,id);
ALTER TABLE document_match_events ADD COLUMN preparation_run_id text,
 ADD FOREIGN KEY(application_id,preparation_run_id) REFERENCES preparation_runs(application_id,id);
-- Keep human and model provenance distinct without fabricating baseline job IDs.
ALTER TABLE document_match_events DROP CONSTRAINT document_match_events_check;
ALTER TABLE document_match_events ADD CHECK((origin='human' AND actor_user_id IS NOT NULL) OR (origin='model' AND (job_id IS NOT NULL OR preparation_run_id IS NOT NULL) AND actor_user_id IS NULL));
CREATE TABLE preparation_mapping_gates (
 application_id text PRIMARY KEY REFERENCES applications(id),enabled boolean NOT NULL DEFAULT false,
 evaluation_id text NOT NULL,evaluation_digest text NOT NULL,configuration_digest text NOT NULL
);
CREATE TABLE preparation_mapping_commands (
 application_id text NOT NULL,user_id text NOT NULL,idempotency_key text NOT NULL,payload_hash text NOT NULL,outcome jsonb NOT NULL,
 PRIMARY KEY(application_id,user_id,idempotency_key)
);

ALTER TABLE preparation_upload_obligations ADD COLUMN attempts integer NOT NULL DEFAULT 0, ADD COLUMN reason_code text;

CREATE TABLE preparation_mapping_proposals (id text PRIMARY KEY,application_id text NOT NULL,user_id text NOT NULL,run_id text NOT NULL REFERENCES preparation_runs(id),document_id text NOT NULL,requirement_id text NOT NULL,dependency_fingerprint text NOT NULL,payload jsonb NOT NULL,UNIQUE(run_id,document_id,requirement_id));

CREATE TRIGGER preparation_batch_invalidation AFTER INSERT OR UPDATE ON upload_batches FOR EACH ROW EXECUTE FUNCTION invalidate_preparation_projection();
CREATE TRIGGER preparation_member_invalidation AFTER INSERT OR UPDATE ON upload_batch_members FOR EACH ROW EXECUTE FUNCTION invalidate_preparation_projection();
