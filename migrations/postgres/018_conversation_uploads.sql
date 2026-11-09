-- Durable UI anchors only. No evidence changes or analysis dispatch/backfill.
ALTER TABLE upload_batches ADD UNIQUE(application_id,id,user_id);
CREATE TABLE borrower_conversation_uploads (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 application_id text NOT NULL,
 conversation_id text NOT NULL,
 borrower_user_id text NOT NULL,
 batch_id text NOT NULL UNIQUE,
 created_at timestamptz NOT NULL,
 FOREIGN KEY(application_id,conversation_id,borrower_user_id)
   REFERENCES borrower_conversations(application_id,id,borrower_user_id),
 FOREIGN KEY(application_id,batch_id,borrower_user_id)
   REFERENCES upload_batches(application_id,id,user_id)
);
CREATE INDEX conversation_upload_history ON borrower_conversation_uploads(conversation_id,id DESC);

CREATE FUNCTION anchor_conversation_upload() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE conversation_id_value text;
BEGIN
 IF EXISTS(SELECT 1 FROM application_memberships WHERE application_id=NEW.application_id
   AND user_id=NEW.user_id AND active AND role='borrower') THEN
   INSERT INTO borrower_conversations(id,application_id,borrower_user_id)
     VALUES(gen_random_uuid()::text,NEW.application_id,NEW.user_id)
     ON CONFLICT(application_id,borrower_user_id) DO NOTHING;
   SELECT id INTO conversation_id_value FROM borrower_conversations
     WHERE application_id=NEW.application_id AND borrower_user_id=NEW.user_id;
   INSERT INTO borrower_conversation_uploads(application_id,conversation_id,borrower_user_id,batch_id,created_at)
     VALUES(NEW.application_id,conversation_id_value,NEW.user_id,NEW.id,NEW.created_at)
     ON CONFLICT(batch_id) DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER conversation_upload_anchor AFTER INSERT ON upload_batches
 FOR EACH ROW EXECUTE FUNCTION anchor_conversation_upload();

-- Recover existing receipt history without reprocessing documents.
INSERT INTO borrower_conversations(id,application_id,borrower_user_id)
 SELECT gen_random_uuid()::text,application_id,user_id FROM
 (SELECT DISTINCT b.application_id,b.user_id FROM upload_batches b
 JOIN application_memberships m ON m.application_id=b.application_id AND m.user_id=b.user_id
 WHERE m.active AND m.role='borrower') owners
 ON CONFLICT(application_id,borrower_user_id) DO NOTHING;
INSERT INTO borrower_conversation_uploads(application_id,conversation_id,borrower_user_id,batch_id,created_at)
 SELECT b.application_id,c.id,b.user_id,b.id,b.created_at FROM upload_batches b
 JOIN borrower_conversations c ON c.application_id=b.application_id AND c.borrower_user_id=b.user_id
 ORDER BY b.created_at,b.id
 ON CONFLICT(batch_id) DO NOTHING;
