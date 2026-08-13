BEGIN;
CREATE TYPE notification_channel AS ENUM ('email','in_app');
CREATE TYPE notification_status AS ENUM ('pending','processing','sent','failed','cancelled');
CREATE TABLE notification_preferences (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), user_id uuid NOT NULL REFERENCES users(id),
 event_type text NOT NULL, email_enabled boolean NOT NULL DEFAULT true, in_app_enabled boolean NOT NULL DEFAULT true,
 minimum_severity text NOT NULL DEFAULT 'info' CHECK(minimum_severity IN ('info','warning','critical')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(organization_id,user_id,event_type)
);
CREATE TABLE notification_outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid REFERENCES organizations(id), recipient_user_id uuid REFERENCES users(id),
 channel notification_channel NOT NULL, event_type text NOT NULL, severity text NOT NULL DEFAULT 'info', recipient_address text NOT NULL,
 subject text NOT NULL, template text NOT NULL, payload jsonb NOT NULL, deduplication_key text NOT NULL,
 status notification_status NOT NULL DEFAULT 'pending', attempts integer NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT now(),
 locked_at timestamptz, locked_by text, sent_at timestamptz, last_error text, provider_message_id text,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(channel,deduplication_key)
);
CREATE INDEX notification_outbox_worker_idx ON notification_outbox(status,available_at) WHERE status IN ('pending','failed');
CREATE TABLE in_app_notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), user_id uuid NOT NULL REFERENCES users(id),
 event_type text NOT NULL, severity text NOT NULL DEFAULT 'info', title text NOT NULL, body text NOT NULL, action_url text,
 entity_type text, entity_id uuid, read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX in_app_notifications_unread_idx ON in_app_notifications(user_id,created_at DESC) WHERE read_at IS NULL;
CREATE TABLE email_verification_tokens (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), token_hash text NOT NULL UNIQUE,
 expires_at timestamptz NOT NULL, used_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE password_reset_tokens (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), token_hash text NOT NULL UNIQUE,
 expires_at timestamptz NOT NULL, used_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
