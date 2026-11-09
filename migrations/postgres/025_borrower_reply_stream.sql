-- Provisional borrower-facing text only. Final replies and actions keep their existing commit boundary.
ALTER TABLE borrower_agent_turns ADD COLUMN draft_text text;
ALTER TABLE borrower_agent_turns ADD COLUMN draft_context_fingerprint text;
ALTER TABLE borrower_agent_turns ADD COLUMN draft_result_cursor text;
ALTER TABLE borrower_agent_turns ADD CONSTRAINT borrower_draft_length CHECK (draft_text IS NULL OR length(draft_text)<=6000);
