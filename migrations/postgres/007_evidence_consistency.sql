-- Keep compatibility arrays and relational review evidence exactly equivalent.
CREATE FUNCTION validate_review_arrays() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE declared text[]; linked text[];
BEGIN
 SELECT coalesce(array_agg(value ORDER BY value),ARRAY[]::text[]) INTO declared FROM jsonb_array_elements_text(NEW.document_ids::jsonb);
 SELECT coalesce(array_agg(document_id ORDER BY document_id),ARRAY[]::text[]) INTO linked FROM review_documents WHERE review_id=NEW.id;
 IF declared IS DISTINCT FROM linked THEN RAISE EXCEPTION 'Review document projection differs' USING ERRCODE='23514'; END IF;
 SELECT coalesce(array_agg(value ORDER BY value),ARRAY[]::text[]) INTO declared FROM jsonb_array_elements_text(NEW.explanation_ids);
 SELECT coalesce(array_agg(explanation_id ORDER BY explanation_id),ARRAY[]::text[]) INTO linked FROM review_explanations WHERE review_id=NEW.id;
 IF declared IS DISTINCT FROM linked THEN RAISE EXCEPTION 'Review explanation projection differs' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER review_arrays AFTER INSERT ON requirement_reviews DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_review_arrays();

CREATE FUNCTION stamp_fact_transaction() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.created_transaction := pg_current_xact_id(); RETURN NEW; END $$;
CREATE TRIGGER fact_transaction BEFORE INSERT ON facts FOR EACH ROW EXECUTE FUNCTION stamp_fact_transaction();
