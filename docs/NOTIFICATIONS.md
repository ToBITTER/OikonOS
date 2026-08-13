# Notifications

Business writes and email delivery are separated through a transactional outbox.
The originating database transaction inserts the domain record, audit event, and
notification job together. A worker delivers committed jobs over SMTP and retries
failures with exponential backoff. Email-provider failure cannot roll back or
duplicate a sale.

Authentication events go only to the affected user. Operational events go to
active owners and administrators whose preferences permit the event. All activity
still remains in the audit log even when its email preference is disabled.

Default email events: verification, password reset/change, new login, completed
sale, refund, stock adjustment, low/out-of-stock, anomaly, stock import, member
invitation/role change, and settings changes. Owners can disable routine emails;
critical account-security emails are always delivered.

SMTP credentials must be configured through environment variables. Production
deployments should configure SPF, DKIM, and DMARC for the sending domain and
process provider bounce/complaint webhooks before enabling customer-facing mail.
