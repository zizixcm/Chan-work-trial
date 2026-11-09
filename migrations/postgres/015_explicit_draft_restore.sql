-- Explicit fresh re-upload may restore the retained immutable file.
ALTER TABLE draft_document_removals
 ADD COLUMN restored_at timestamptz,
 ADD COLUMN restored_by text REFERENCES "user"(id),
 ADD CONSTRAINT draft_restore_pair CHECK((restored_at IS NULL)=(restored_by IS NULL));
