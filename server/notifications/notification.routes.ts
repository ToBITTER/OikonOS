import { Router } from "express";
import { z } from "zod";
import { query } from "../platform/database.js";
import {
  authenticate,
  requirePermission,
} from "../identity/auth.middleware.js";
import { notificationEvents } from "./events.js";
import { AppError } from "../platform/errors.js";
export const notificationRouter = Router();
notificationRouter.use(authenticate);
notificationRouter.get("/", async (req, res, next) => {
  try {
    const result = await query(
      `SELECT id,event_type,severity,title,body,action_url,entity_type,entity_id,read_at,created_at FROM in_app_notifications WHERE organization_id=$1 AND user_id=$2 ORDER BY created_at DESC LIMIT 100`,
      [req.actor!.organizationId, req.actor!.userId],
    );
    res.json(result.rows);
  } catch (e) {
    next(e);
  }
});
notificationRouter.patch("/:id/read", async (req, res, next) => {
  try {
    const result = await query(
      `UPDATE in_app_notifications SET read_at=COALESCE(read_at,now()) WHERE id=$1 AND organization_id=$2 AND user_id=$3 RETURNING id,read_at`,
      [req.params.id, req.actor!.organizationId, req.actor!.userId],
    );
    if (!result.rowCount)
      throw new AppError(404, "NOT_FOUND", "Notification not found.");
    res.json(result.rows[0]);
  } catch (e) {
    next(e);
  }
});
notificationRouter.get("/preferences/me", async (req, res, next) => {
  try {
    const saved = await query(
      `SELECT event_type,email_enabled,in_app_enabled,minimum_severity FROM notification_preferences WHERE organization_id=$1 AND user_id=$2`,
      [req.actor!.organizationId, req.actor!.userId],
    );
    const map = new Map(saved.rows.map((x) => [x.event_type, x]));
    res.json(
      Object.keys(notificationEvents).map(
        (eventType) =>
          map.get(eventType) || {
            event_type: eventType,
            email_enabled: true,
            in_app_enabled: true,
            minimum_severity: "info",
          },
      ),
    );
  } catch (e) {
    next(e);
  }
});
notificationRouter.put(
  "/preferences/me",
  requirePermission("settings.manage"),
  async (req, res, next) => {
    try {
      const body = z
        .array(
          z.object({
            eventType: z.string().refine((v) => v in notificationEvents),
            emailEnabled: z.boolean(),
            inAppEnabled: z.boolean(),
            minimumSeverity: z.enum(["info", "warning", "critical"]),
          }),
        )
        .parse(req.body);
      for (const item of body)
        await query(
          `INSERT INTO notification_preferences(organization_id,user_id,event_type,email_enabled,in_app_enabled,minimum_severity) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(organization_id,user_id,event_type) DO UPDATE SET email_enabled=EXCLUDED.email_enabled,in_app_enabled=EXCLUDED.in_app_enabled,minimum_severity=EXCLUDED.minimum_severity,updated_at=now()`,
          [
            req.actor!.organizationId,
            req.actor!.userId,
            item.eventType,
            item.emailEnabled,
            item.inAppEnabled,
            item.minimumSeverity,
          ],
        );
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  },
);
