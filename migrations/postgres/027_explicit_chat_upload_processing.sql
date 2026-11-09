-- A chat Upload click is an explicit processing request, independent of the
-- preference for background automatic processing. Existing batches are unchanged.
ALTER TABLE upload_batches ADD COLUMN processing_requested_at timestamptz;
ALTER TABLE upload_batches ADD COLUMN processing_request_epoch text;
ALTER TABLE upload_batches ADD CONSTRAINT upload_processing_request_pair CHECK
 ((processing_requested_at IS NULL) = (processing_request_epoch IS NULL));
