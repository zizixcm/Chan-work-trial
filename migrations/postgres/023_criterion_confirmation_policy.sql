-- Explicit lender/pilot policy only; existing requirements retain documentary proof.
ALTER TABLE requirements ADD COLUMN criterion_confirmation_policy jsonb NOT NULL DEFAULT '{}'::jsonb
 CHECK (jsonb_typeof(criterion_confirmation_policy) = 'object');
