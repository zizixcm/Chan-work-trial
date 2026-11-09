-- Upload event admission is separate from polling and remains worker-owned.
ALTER TABLE borrower_agent_turns ADD COLUMN trigger_context jsonb;
CREATE TABLE borrower_agent_upload_admissions (
 batch_id text PRIMARY KEY REFERENCES upload_batches(id),
 saved_revision text NOT NULL,
 saved_document_ids jsonb NOT NULL DEFAULT '[]',
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE borrower_agent_inventory_admissions (
 application_id text NOT NULL REFERENCES applications(id),
 user_id text NOT NULL REFERENCES "user"(id),
 snapshot jsonb NOT NULL,
 PRIMARY KEY(application_id,user_id)
);
-- Historical receipts must not start paid work merely because this is deployed.
INSERT INTO borrower_agent_upload_admissions(batch_id,saved_revision,saved_document_ids)
 SELECT b.id,md5(coalesce(string_agg(m.id||':'||m.document_id,',' ORDER BY m.id),'')),coalesce(jsonb_agg(m.document_id) FILTER(WHERE m.document_id IS NOT NULL),'[]')
 FROM upload_batches b LEFT JOIN upload_batch_members m ON m.batch_id=b.id AND m.state='saved'
 WHERE b.state<>'open' GROUP BY b.id;
