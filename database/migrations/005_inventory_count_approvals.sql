BEGIN;
ALTER TABLE inventory_count_sessions
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'approved'
    CHECK (approval_status IN ('pending','approved','rejected')),
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_note text;
CREATE INDEX inventory_count_sessions_approval_idx
  ON inventory_count_sessions(organization_id,approval_status,completed_at DESC);
COMMIT;
