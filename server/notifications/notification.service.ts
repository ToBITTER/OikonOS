import type pg from "pg";
import type { NotificationEvent } from "./events.js";
import { notificationEvents } from "./events.js";
import { renderEmail } from "./templates.js";
type Publish = {
  organizationId?: string;
  recipientUserId?: string;
  recipientEmail: string;
  event: NotificationEvent;
  payload: Record<string, unknown>;
  deduplicationKey: string;
};
export async function queueEmail(client: pg.PoolClient, input: Publish) {
  const template = renderEmail(input.event, input.payload),
    meta = notificationEvents[input.event];
  await client.query(
    `INSERT INTO notification_outbox(organization_id,recipient_user_id,channel,event_type,severity,recipient_address,subject,template,payload,deduplication_key) VALUES($1,$2,'email',$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(channel,deduplication_key) DO NOTHING`,
    [
      input.organizationId || null,
      input.recipientUserId || null,
      input.event,
      meta.severity,
      input.recipientEmail,
      template.subject,
      input.event,
      JSON.stringify(input.payload),
      input.deduplicationKey,
    ],
  );
}
export async function queueAdminEmails(
  client: pg.PoolClient,
  input: Omit<Publish, "recipientEmail" | "recipientUserId">,
) {
  const recipients = await client.query<{ id: string; email: string }>(
    `SELECT u.id,u.email FROM organization_memberships m JOIN users u ON u.id=m.user_id LEFT JOIN notification_preferences p ON p.organization_id=m.organization_id AND p.user_id=u.id AND p.event_type=$2 WHERE m.organization_id=$1 AND m.status='active' AND m.role IN ('owner','admin') AND u.status='active' AND COALESCE(p.email_enabled,true)=true`,
    [input.organizationId, input.event],
  );
  for (const recipient of recipients.rows)
    await queueEmail(client, {
      ...input,
      recipientUserId: recipient.id,
      recipientEmail: recipient.email,
      deduplicationKey: `${input.deduplicationKey}:${recipient.id}`,
    });
}
export async function createInApp(
  client: pg.PoolClient,
  input: {
    organizationId: string;
    userId: string;
    event: NotificationEvent;
    title: string;
    body: string;
    actionUrl?: string;
    entityType?: string;
    entityId?: string;
  },
) {
  await client.query(
    `INSERT INTO in_app_notifications(organization_id,user_id,event_type,severity,title,body,action_url,entity_type,entity_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      input.organizationId,
      input.userId,
      input.event,
      notificationEvents[input.event].severity,
      input.title,
      input.body,
      input.actionUrl || null,
      input.entityType || null,
      input.entityId || null,
    ],
  );
}
