BEGIN;
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;
UPDATE users u
SET must_change_password = true
FROM organization_memberships m
WHERE m.user_id = u.id
  AND m.role <> 'owner'
  AND u.email_verified_at IS NULL;
COMMIT;
