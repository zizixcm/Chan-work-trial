-- M1 domain schema. Forward-only expansion; existing IDs and file keys are retained.
ALTER TABLE applications
  ADD COLUMN checklist_version text NOT NULL DEFAULT 'demo-v1',
  ADD COLUMN revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  ADD COLUMN content_revision bigint NOT NULL DEFAULT 0 CHECK (content_revision >= 0),
  ADD COLUMN policy_timezone text NOT NULL DEFAULT 'America/Los_Angeles',
  ADD COLUMN assigned_reviewer_user_id text REFERENCES "user"(id);
ALTER TABLE applications ALTER COLUMN requested_amount TYPE numeric(20,2);
ALTER TABLE applications ALTER COLUMN created_at TYPE timestamptz USING created_at::timestamptz;

CREATE TABLE application_subjects (
 id text PRIMARY KEY, application_id text NOT NULL REFERENCES applications(id),
 kind text NOT NULL CHECK (kind IN ('property','borrower','guarantor','tenant')),
 label text NOT NULL CHECK (length(trim(label)) > 0),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(application_id,id)
);
INSERT INTO application_subjects(id,application_id,kind,label)
 SELECT id || ':property',id,'property',property_name FROM applications
 UNION ALL SELECT id || ':borrower',id,'borrower',borrower_name FROM applications;

ALTER TABLE requirements
 ADD COLUMN subject_id text,
 ADD COLUMN source text NOT NULL DEFAULT 'template' CHECK(source IN ('template','lender','rule')),
 ADD COLUMN source_reference text,
 ADD COLUMN parent_requirement_id text,
 ADD COLUMN supersedes_requirement_id text,
 ADD COLUMN lifecycle text NOT NULL DEFAULT 'active' CHECK(lifecycle IN ('active','superseded')),
 ADD COLUMN response_mode text NOT NULL DEFAULT 'documents' CHECK(response_mode IN ('documents','explanation','either')),
 ADD COLUMN revision bigint NOT NULL DEFAULT 0 CHECK(revision >= 0),
 ADD COLUMN evidence_revision bigint NOT NULL DEFAULT 0 CHECK(evidence_revision >= 0),
 ADD COLUMN definition_revision bigint NOT NULL DEFAULT 0 CHECK(definition_revision >= 0),
 ADD COLUMN period_start date, ADD COLUMN period_end date, ADD COLUMN as_of date,
 ADD COLUMN accepted_formats text[] NOT NULL DEFAULT ARRAY['application/pdf','text/csv','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
 ADD COLUMN condition_key text, ADD COLUMN occurrence_number integer,
 ADD COLUMN created_by_user_id text REFERENCES "user"(id),
 ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(),
 ADD COLUMN superseded_at timestamptz,
 ADD CONSTRAINT requirement_subject FOREIGN KEY(application_id,subject_id) REFERENCES application_subjects(application_id,id),
 ADD CONSTRAINT requirement_parent FOREIGN KEY(application_id,parent_requirement_id) REFERENCES requirements(application_id,id),
 ADD CONSTRAINT requirement_successor FOREIGN KEY(application_id,supersedes_requirement_id) REFERENCES requirements(application_id,id),
 ADD CONSTRAINT requirement_period CHECK(period_start IS NULL OR period_end IS NULL OR period_start <= period_end),
 ADD CONSTRAINT requirement_condition CHECK((condition_key IS NULL AND occurrence_number IS NULL) OR (condition_key IS NOT NULL AND occurrence_number > 0)),
 ADD CONSTRAINT requirement_lifecycle CHECK((lifecycle='active' AND superseded_at IS NULL) OR (lifecycle='superseded' AND superseded_at IS NOT NULL)),
 ADD CONSTRAINT requirement_occurrence UNIQUE(application_id,condition_key,occurrence_number);
CREATE UNIQUE INDEX one_active_condition ON requirements(application_id,condition_key) WHERE lifecycle='active' AND condition_key IS NOT NULL;
CREATE INDEX requirements_checklist ON requirements(application_id,lifecycle,sort_order,id);

CREATE TABLE document_series (
 id text PRIMARY KEY, application_id text NOT NULL REFERENCES applications(id),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(application_id,id)
);
INSERT INTO document_series(id,application_id,created_at) SELECT id,application_id,created_at::timestamptz FROM documents;
ALTER TABLE documents
 ADD COLUMN series_id text,
 ADD COLUMN version_number integer NOT NULL DEFAULT 1 CHECK(version_number > 0),
 ADD COLUMN replaces_document_id text,
 ADD CONSTRAINT documents_series_identity UNIQUE(application_id,series_id,id);
UPDATE documents SET series_id=id;
ALTER TABLE documents ALTER COLUMN series_id SET NOT NULL;
ALTER TABLE documents ALTER COLUMN size_bytes TYPE bigint;
ALTER TABLE documents ALTER COLUMN created_at TYPE timestamptz USING created_at::timestamptz;
ALTER TABLE documents
 ADD CONSTRAINT document_series_owner FOREIGN KEY(application_id,series_id) REFERENCES document_series(application_id,id),
 ADD CONSTRAINT document_predecessor FOREIGN KEY(application_id,series_id,replaces_document_id) REFERENCES documents(application_id,series_id,id),
 ADD CONSTRAINT document_version UNIQUE(application_id,series_id,version_number),
 ADD CONSTRAINT document_successor UNIQUE(application_id,replaces_document_id),
 ADD CONSTRAINT document_root CHECK((version_number=1) = (replaces_document_id IS NULL)),
 ADD CONSTRAINT document_sha CHECK(sha256 ~ '^[a-f0-9]{64}$');
CREATE UNIQUE INDEX one_document_root ON documents(application_id,series_id) WHERE replaces_document_id IS NULL;

ALTER TABLE requirement_documents
 ADD COLUMN linked_at timestamptz NOT NULL DEFAULT now(),
 ADD COLUMN linked_by_user_id text REFERENCES "user"(id),
 ADD COLUMN unlinked_at timestamptz,
 ADD CONSTRAINT mapping_dates CHECK(unlinked_at IS NULL OR unlinked_at >= linked_at);
CREATE INDEX active_requirement_documents ON requirement_documents(application_id,requirement_id) WHERE unlinked_at IS NULL;
CREATE TABLE draft_document_selections (
 application_id text NOT NULL REFERENCES applications(id), document_id text NOT NULL,
 included boolean NOT NULL DEFAULT true, updated_by_user_id text REFERENCES "user"(id),
 updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(application_id,document_id),
 FOREIGN KEY(application_id,document_id) REFERENCES documents(application_id,id)
);

CREATE TABLE fact_series (
 id text PRIMARY KEY, application_id text NOT NULL REFERENCES applications(id), subject_id text NOT NULL,
 fact_key text NOT NULL, unit text NOT NULL, scope_key text NOT NULL,
 author_user_id text NOT NULL REFERENCES "user"(id),
 UNIQUE(application_id,id), UNIQUE(application_id,subject_id,fact_key,unit,scope_key,author_user_id),
 FOREIGN KEY(application_id,subject_id) REFERENCES application_subjects(application_id,id)
);
CREATE TABLE facts (
 id text PRIMARY KEY, application_id text NOT NULL REFERENCES applications(id), fact_series_id text NOT NULL,
 revision_number integer NOT NULL CHECK(revision_number > 0), supersedes_id text,
 value jsonb NOT NULL, period_start date, period_end date, as_of date,
 provenance text NOT NULL CHECK(provenance IN ('borrower_manual','reviewer_manual')),
 confirmation text NOT NULL CHECK(confirmation IN ('asserted','confirmed')),
 author_user_id text NOT NULL REFERENCES "user"(id), author_label text NOT NULL,
 author_role text NOT NULL CHECK(author_role IN ('borrower','lender')),
 confirmed_by_user_id text REFERENCES "user"(id), confirmed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(application_id,id), UNIQUE(application_id,fact_series_id,id),
 UNIQUE(application_id,fact_series_id,revision_number), UNIQUE(application_id,supersedes_id),
 FOREIGN KEY(application_id,fact_series_id) REFERENCES fact_series(application_id,id),
 FOREIGN KEY(application_id,fact_series_id,supersedes_id) REFERENCES facts(application_id,fact_series_id,id),
 CHECK((revision_number=1)=(supersedes_id IS NULL)),
 CHECK((confirmation='confirmed')=(confirmed_by_user_id IS NOT NULL AND confirmed_at IS NOT NULL)),
 CHECK(confirmation='confirmed' OR (confirmed_by_user_id IS NULL AND confirmed_at IS NULL)),
 CHECK(period_start IS NULL OR period_end IS NULL OR period_start <= period_end)
);
CREATE UNIQUE INDEX fact_series_root ON facts(application_id,fact_series_id) WHERE supersedes_id IS NULL;
CREATE TABLE fact_sources (
 application_id text NOT NULL, fact_id text NOT NULL, document_id text NOT NULL,
 location jsonb NOT NULL DEFAULT '{}'::jsonb,
 PRIMARY KEY(fact_id,document_id),
 FOREIGN KEY(application_id,fact_id) REFERENCES facts(application_id,id),
 FOREIGN KEY(application_id,document_id) REFERENCES documents(application_id,id)
);
CREATE TABLE findings (
 id text PRIMARY KEY, application_id text NOT NULL REFERENCES applications(id), requirement_id text, subject_id text,
 origin text NOT NULL CHECK(origin IN ('deterministic_rule','reviewer_manual')),
 rule_key text, rule_version text, input_fingerprint text NOT NULL,
 result text NOT NULL CHECK(result IN ('clear','triggered','needs_clarification')),
 reason text NOT NULL, input_snapshot jsonb NOT NULL, evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
 author_user_id text REFERENCES "user"(id), supersedes_id text,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(application_id,id),
 FOREIGN KEY(application_id,requirement_id) REFERENCES requirements(application_id,id),
 FOREIGN KEY(application_id,subject_id) REFERENCES application_subjects(application_id,id),
 FOREIGN KEY(application_id,supersedes_id) REFERENCES findings(application_id,id),
 CHECK((origin='deterministic_rule' AND rule_key IS NOT NULL AND rule_version IS NOT NULL) OR (origin='reviewer_manual' AND author_user_id IS NOT NULL))
);
CREATE UNIQUE INDEX finding_evaluation ON findings(application_id,rule_key,rule_version,input_fingerprint) WHERE origin='deterministic_rule';
CREATE TABLE finding_facts (
 application_id text NOT NULL, finding_id text NOT NULL, fact_id text NOT NULL,
 PRIMARY KEY(finding_id,fact_id),
 FOREIGN KEY(application_id,finding_id) REFERENCES findings(application_id,id),
 FOREIGN KEY(application_id,fact_id) REFERENCES facts(application_id,id)
);
CREATE TABLE explanation_series (
 id text PRIMARY KEY, application_id text NOT NULL REFERENCES applications(id), requirement_id text, finding_id text,
 kind text NOT NULL CHECK(kind IN ('explanation','not_applicable','intentionally_omitted','correction_request')),
 author_user_id text NOT NULL REFERENCES "user"(id), UNIQUE(application_id,id),
 FOREIGN KEY(application_id,requirement_id) REFERENCES requirements(application_id,id),
 FOREIGN KEY(application_id,finding_id) REFERENCES findings(application_id,id)
);
CREATE TABLE explanations (
 id text PRIMARY KEY, application_id text NOT NULL REFERENCES applications(id), explanation_series_id text NOT NULL,
 revision_number integer NOT NULL CHECK(revision_number > 0), supersedes_id text,
 body text NOT NULL CHECK(length(trim(body)) BETWEEN 1 AND 10000),
 author_user_id text NOT NULL REFERENCES "user"(id), author_label text NOT NULL,
 author_role text NOT NULL CHECK(author_role IN ('borrower','lender')),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(application_id,id),
 UNIQUE(application_id,explanation_series_id,id), UNIQUE(application_id,explanation_series_id,revision_number),
 UNIQUE(application_id,supersedes_id),
 FOREIGN KEY(application_id,explanation_series_id) REFERENCES explanation_series(application_id,id),
 FOREIGN KEY(application_id,explanation_series_id,supersedes_id) REFERENCES explanations(application_id,explanation_series_id,id),
 CHECK((revision_number=1)=(supersedes_id IS NULL))
);
CREATE UNIQUE INDEX explanation_series_root ON explanations(application_id,explanation_series_id) WHERE supersedes_id IS NULL;

CREATE TABLE submissions (
 id text PRIMARY KEY, application_id text NOT NULL REFERENCES applications(id),
 revision_number integer NOT NULL CHECK(revision_number > 0),
 source_application_revision bigint NOT NULL, source_content_revision bigint NOT NULL,
 submitted_by_user_id text NOT NULL REFERENCES "user"(id), submitted_by_label text NOT NULL,
 submitted_by_role text NOT NULL DEFAULT 'borrower' CHECK(submitted_by_role='borrower'),
 submitted_at timestamptz NOT NULL DEFAULT now(), manifest_version integer NOT NULL DEFAULT 1 CHECK(manifest_version=1),
 manifest jsonb NOT NULL, canonical_manifest text NOT NULL, manifest_sha256 text NOT NULL,
 idempotency_key text NOT NULL, acknowledgment jsonb NOT NULL,
 created_transaction xid8 NOT NULL DEFAULT pg_current_xact_id(),
 UNIQUE(application_id,id), UNIQUE(application_id,revision_number),
 UNIQUE(application_id,submitted_by_user_id,idempotency_key),
 CHECK(manifest=canonical_manifest::jsonb),
 CHECK(manifest_sha256=encode(sha256(convert_to(canonical_manifest,'UTF8')),'hex')),
 CHECK(jsonb_typeof(manifest)='object'),
 CHECK(manifest ? 'document_ids' AND jsonb_typeof(manifest->'document_ids')='array')
);
CREATE TABLE submission_documents (
 application_id text NOT NULL, submission_id text NOT NULL, document_id text NOT NULL,
 PRIMARY KEY(submission_id,document_id),
 FOREIGN KEY(application_id,submission_id) REFERENCES submissions(application_id,id),
 FOREIGN KEY(application_id,document_id) REFERENCES documents(application_id,id)
);
ALTER TABLE requirement_reviews DROP CONSTRAINT requirement_reviews_decision_check;
ALTER TABLE requirement_reviews
 ADD CONSTRAINT requirement_reviews_decision_check CHECK(decision IN ('accepted','waived','changes_requested')),
 ADD COLUMN sequence bigint,
 ADD COLUMN evidence_revision bigint NOT NULL DEFAULT 0,
 ADD COLUMN definition_revision bigint NOT NULL DEFAULT 0,
 ADD COLUMN submission_id text,
 ADD COLUMN review_scope text NOT NULL DEFAULT 'current' CHECK(review_scope IN ('current','submission')),
 ADD COLUMN explanation_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
 ADD COLUMN reviewer_role text NOT NULL DEFAULT 'lender' CHECK(reviewer_role='lender'),
 ADD COLUMN legacy_import boolean NOT NULL DEFAULT false,
 ADD COLUMN created_transaction xid8 NOT NULL DEFAULT pg_current_xact_id(),
 ADD CONSTRAINT review_identity UNIQUE(application_id,id),
 ADD CONSTRAINT review_submission FOREIGN KEY(application_id,submission_id) REFERENCES submissions(application_id,id),
 ADD CONSTRAINT review_scope_match CHECK((review_scope='submission')=(submission_id IS NOT NULL)),
 ADD CONSTRAINT review_reason CHECK(decision='accepted' OR length(trim(message)) > 0),
 ADD CONSTRAINT review_explanations_array CHECK(jsonb_typeof(explanation_ids)='array');
-- Existing PG records have no retained SQLite rowid. Preserve current PG ordering;
-- a future source importer must explicitly supply its original review sequence.
WITH ranked AS (SELECT id,row_number() OVER(PARTITION BY application_id,requirement_id ORDER BY created_at,id) n FROM requirement_reviews)
UPDATE requirement_reviews r SET sequence=ranked.n,legacy_import=(r.reviewer_user_id IS NULL) FROM ranked WHERE r.id=ranked.id;
ALTER TABLE requirement_reviews ALTER COLUMN sequence SET NOT NULL;
ALTER TABLE requirement_reviews ALTER COLUMN created_at TYPE timestamptz USING created_at::timestamptz;
ALTER TABLE requirement_reviews ADD CONSTRAINT review_sequence UNIQUE(application_id,requirement_id,sequence);
CREATE TABLE review_documents (
 application_id text NOT NULL, review_id text NOT NULL, document_id text NOT NULL,
 PRIMARY KEY(review_id,document_id),
 FOREIGN KEY(application_id,review_id) REFERENCES requirement_reviews(application_id,id),
 FOREIGN KEY(application_id,document_id) REFERENCES documents(application_id,id)
);
INSERT INTO review_documents SELECT r.application_id,r.id,j.value FROM requirement_reviews r CROSS JOIN LATERAL jsonb_array_elements_text(r.document_ids::jsonb) j;
CREATE TABLE review_explanations (
 application_id text NOT NULL, review_id text NOT NULL, explanation_id text NOT NULL,
 PRIMARY KEY(review_id,explanation_id),
 FOREIGN KEY(application_id,review_id) REFERENCES requirement_reviews(application_id,id),
 FOREIGN KEY(application_id,explanation_id) REFERENCES explanations(application_id,id)
);

ALTER TABLE lender_notes
 ADD COLUMN revision bigint NOT NULL DEFAULT 0,
 ADD COLUMN updated_by_user_id text REFERENCES "user"(id);
ALTER TABLE lender_notes ALTER COLUMN updated_at TYPE timestamptz USING updated_at::timestamptz;
ALTER TABLE audit_events
 ADD COLUMN actor_kind text NOT NULL DEFAULT 'legacy_import' CHECK(actor_kind IN ('user','system','legacy_import')),
 ADD COLUMN actor_role_at_event text CHECK(actor_role_at_event IN ('borrower','lender')),
 ADD COLUMN target_type text NOT NULL DEFAULT 'legacy',
 ADD COLUMN details jsonb NOT NULL DEFAULT '{}'::jsonb,
 ADD COLUMN visibility text NOT NULL DEFAULT 'lender_internal' CHECK(visibility IN ('borrower_visible','lender_internal')),
 ADD COLUMN correlation_id text,
 ADD COLUMN sequence bigint GENERATED ALWAYS AS IDENTITY;
UPDATE audit_events SET actor_kind='user' WHERE actor_user_id IS NOT NULL;
ALTER TABLE audit_events ALTER COLUMN created_at TYPE timestamptz USING created_at::timestamptz;
CREATE INDEX audit_application_sequence ON audit_events(application_id,sequence);
CREATE INDEX reviews_application_sequence ON requirement_reviews(application_id,requirement_id,sequence DESC);
CREATE INDEX submissions_application ON submissions(application_id,revision_number DESC);
CREATE INDEX facts_series_lookup ON facts(application_id,fact_series_id,revision_number DESC);
CREATE INDEX explanations_series_lookup ON explanations(application_id,explanation_series_id,revision_number DESC);

CREATE TABLE mutation_receipts (
 application_id text NOT NULL REFERENCES applications(id), actor_user_id text NOT NULL REFERENCES "user"(id),
 operation text NOT NULL, idempotency_key text NOT NULL, request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
 result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(application_id,actor_user_id,operation,idempotency_key)
);
CREATE TABLE application_workflow_events (
 id text PRIMARY KEY, application_id text NOT NULL REFERENCES applications(id),
 event text NOT NULL CHECK(event IN ('review_started','follow_up_requested','collection_completed','collection_reopened')),
 submission_id text NOT NULL, actor_user_id text NOT NULL REFERENCES "user"(id),
 reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(application_id,submission_id) REFERENCES submissions(application_id,id)
);
CREATE TABLE import_batches (
 id text PRIMARY KEY, source_checksum text NOT NULL UNIQUE CHECK(source_checksum ~ '^[a-f0-9]{64}$'),
 source_kind text NOT NULL, imported_at timestamptz NOT NULL DEFAULT now(),
 reconciliation jsonb NOT NULL
);
