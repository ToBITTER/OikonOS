import nodemailer from "nodemailer";
import { hostname } from "node:os";
import { config } from "../platform/config.js";
import { pool, transaction } from "../platform/database.js";
import { renderEmail } from "./templates.js";
import type { NotificationEvent } from "./events.js";
const workerId = `${hostname()}:${process.pid}`;
let timer: NodeJS.Timeout | undefined,
  running = false;
function transport() {
  const c = config();
  return nodemailer.createTransport({
    host: c.SMTP_HOST,
    port: c.SMTP_PORT,
    secure: c.SMTP_SECURE === "true",
    auth: { user: c.SMTP_USER, pass: c.SMTP_PASSWORD },
    pool: true,
    maxConnections: 3,
    maxMessages: 100,
  });
}
export async function processEmailBatch(limit = 20) {
  if (running) return;
  running = true;
  const mailer = transport();
  try {
    const jobs = await transaction(async (client) => {
      const result = await client.query(
        `SELECT * FROM notification_outbox WHERE channel='email' AND status IN ('pending','failed') AND available_at<=now() AND attempts<6 ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT $1`,
        [limit],
      );
      if (result.rowCount)
        await client.query(
          `UPDATE notification_outbox SET status='processing',locked_at=now(),locked_by=$1 WHERE id=ANY($2::uuid[])`,
          [workerId, result.rows.map((r) => r.id)],
        );
      return result.rows;
    });
    for (const job of jobs) {
      try {
        const rendered = renderEmail(
          job.template as NotificationEvent,
          job.payload,
        );
        const sent = await mailer.sendMail({
          from: config().EMAIL_FROM,
          to: job.recipient_address,
          replyTo: config().EMAIL_REPLY_TO,
          subject: rendered.subject,
          text: rendered.text,
          html: rendered.html,
          headers: { "X-OikonOS-Event": job.event_type },
        });
        await pool.query(
          `UPDATE notification_outbox SET status='sent',sent_at=now(),attempts=attempts+1,provider_message_id=$2,last_error=NULL WHERE id=$1`,
          [job.id, sent.messageId],
        );
      } catch (error: any) {
        await pool.query(
          `UPDATE notification_outbox SET status='failed',attempts=attempts+1,last_error=$2,available_at=now()+(LEAST(3600,power(2,attempts+1)*30)||' seconds')::interval WHERE id=$1`,
          [job.id, String(error.message).slice(0, 1000)],
        );
      }
    }
  } finally {
    mailer.close();
    running = false;
  }
}
export function startEmailWorker(intervalMs = 5000) {
  if (timer) return;
  timer = setInterval(() => void processEmailBatch(), intervalMs);
  timer.unref();
  void processEmailBatch();
}
export function stopEmailWorker() {
  if (timer) clearInterval(timer);
  timer = undefined;
}
