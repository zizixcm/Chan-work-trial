-- Durable queue and application consent. No provider work runs in a SQL transaction.
CREATE TABLE ai_preferences (
 application_id text PRIMARY KEY REFERENCES applications(id), enabled boolean NOT NULL DEFAULT false,
 epoch bigint NOT NULL DEFAULT 0 CHECK(epoch>=0), changed_by text REFERENCES "user"(id), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE analysis_jobs (
 id text PRIMARY KEY, application_id text NOT NULL REFERENCES applications(id),
 initiated_by text NOT NULL REFERENCES "user"(id), task text NOT NULL CHECK(task IN ('match_document.v1','verify_requirement.v1')),
 target_id text NOT NULL, document_id text, requirement_id text,
 lane text NOT NULL CHECK(lane IN ('interactive','background')),
 state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','running','retry_wait','blocked','succeeded','failed','dead_letter','cancelled','stale','expired')),
 input jsonb NOT NULL, fingerprint text NOT NULL, consent_epoch bigint NOT NULL,
 attempt integer NOT NULL DEFAULT 0, provider_attempts integer NOT NULL DEFAULT 0,
 token bigint NOT NULL DEFAULT 0, lease_owner text, slot text CHECK(slot IN ('interactive','shared')),
 lease_expires_at timestamptz, attempt_deadline timestamptz,
 available_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), revision bigint NOT NULL DEFAULT 0,
 cancel_requested boolean NOT NULL DEFAULT false, safe_code text, result jsonb, result_fingerprint text,
 retry_of text, UNIQUE(application_id,id),
 FOREIGN KEY(application_id,document_id) REFERENCES documents(application_id,id),
 FOREIGN KEY(application_id,requirement_id) REFERENCES requirements(application_id,id),
 FOREIGN KEY(application_id,retry_of) REFERENCES analysis_jobs(application_id,id),
 CHECK((task='match_document.v1' AND document_id IS NOT NULL AND document_id=target_id AND requirement_id IS NULL) OR
       (task='verify_requirement.v1' AND requirement_id IS NOT NULL AND requirement_id=target_id AND document_id IS NULL))
);
CREATE UNIQUE INDEX analysis_live_input ON analysis_jobs(application_id,task,fingerprint)
 WHERE state IN ('queued','running','retry_wait','blocked');
CREATE INDEX analysis_due ON analysis_jobs(lane,available_at,created_at) WHERE state IN ('queued','retry_wait','blocked');
CREATE INDEX analysis_app_history ON analysis_jobs(application_id,created_at DESC);
CREATE TABLE analysis_scheduler (
 id integer PRIMARY KEY CHECK(id=1), interactive_streak integer NOT NULL DEFAULT 0,
 last_application text, cooldown_until timestamptz NOT NULL DEFAULT '-infinity'
);
INSERT INTO analysis_scheduler(id) VALUES(1);
CREATE TABLE analysis_reservations (
 id text PRIMARY KEY, application_id text NOT NULL, job_id text NOT NULL, token bigint NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), active_until timestamptz NOT NULL,
 model text NOT NULL, input_limit integer NOT NULL, output_limit integer NOT NULL,
 reserved_usd numeric NOT NULL CHECK(reserved_usd>=0), accounted_usd numeric,
 input_tokens integer, output_tokens integer, finished boolean NOT NULL DEFAULT false,
 UNIQUE(job_id,token), FOREIGN KEY(application_id,job_id) REFERENCES analysis_jobs(application_id,id)
);
CREATE INDEX analysis_budget_window ON analysis_reservations(created_at);
CREATE TABLE analysis_events (
 id bigserial PRIMARY KEY, application_id text NOT NULL, job_id text NOT NULL,
 event text NOT NULL, token bigint NOT NULL, safe_code text, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(application_id,job_id) REFERENCES analysis_jobs(application_id,id)
);
CREATE TRIGGER analysis_events_immutable BEFORE UPDATE OR DELETE ON analysis_events FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
ALTER TABLE requirement_documents ADD COLUMN origin text NOT NULL DEFAULT 'legacy' CHECK(origin IN ('human','model','legacy')),
 ADD COLUMN analysis_job_id text,
 ADD CONSTRAINT mapping_job_scope FOREIGN KEY(application_id,analysis_job_id) REFERENCES analysis_jobs(application_id,id);
ALTER TABLE requirement_documents DISABLE TRIGGER mapping_revision;
UPDATE requirement_documents SET origin='human' WHERE linked_by_user_id IS NOT NULL;
ALTER TABLE requirement_documents ENABLE TRIGGER mapping_revision;
CREATE TABLE document_match_events (
 id text PRIMARY KEY, application_id text NOT NULL, document_id text NOT NULL, requirement_id text NOT NULL,
 action text NOT NULL CHECK(action IN ('link','unlink','reject')), origin text NOT NULL CHECK(origin IN ('human','model')),
 actor_user_id text REFERENCES "user"(id), job_id text, evidence jsonb NOT NULL DEFAULT '[]', reason text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(application_id,document_id) REFERENCES documents(application_id,id),
 FOREIGN KEY(application_id,requirement_id) REFERENCES requirements(application_id,id),
 FOREIGN KEY(application_id,job_id) REFERENCES analysis_jobs(application_id,id),
 CHECK((origin='human' AND actor_user_id IS NOT NULL) OR (origin='model' AND job_id IS NOT NULL AND actor_user_id IS NULL))
);
CREATE TRIGGER match_events_immutable BEFORE UPDATE OR DELETE ON document_match_events FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE TABLE document_match_rejections (
 application_id text NOT NULL, document_id text NOT NULL, requirement_id text NOT NULL,
 rejected_by text NOT NULL REFERENCES "user"(id), created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(application_id,document_id,requirement_id),
 FOREIGN KEY(application_id,document_id) REFERENCES documents(application_id,id),
 FOREIGN KEY(application_id,requirement_id) REFERENCES requirements(application_id,id)
);
