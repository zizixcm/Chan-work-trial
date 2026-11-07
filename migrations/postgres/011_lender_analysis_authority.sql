-- Existing jobs retain their original borrower-consent contract. Only new,
-- explicitly lender-initiated verification receives independent authority.
ALTER TABLE analysis_jobs ADD COLUMN consent_scope text NOT NULL DEFAULT 'borrower'
 CHECK(consent_scope IN ('borrower','lender'));
ALTER TABLE analysis_jobs ADD CONSTRAINT lender_verification_authority
 CHECK(consent_scope='borrower' OR (task='verify_requirement.v1' AND lane='interactive' AND consent_epoch=0));
CREATE INDEX analysis_borrower_consent_jobs ON analysis_jobs(application_id)
 WHERE consent_scope='borrower' AND state IN ('queued','running','retry_wait','blocked');
