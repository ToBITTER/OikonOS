import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { rateLimit } from "express-rate-limit";
import { config } from "./platform/config.js";
import { health } from "./platform/database.js";
import { requestContext } from "./platform/request-context.js";
import { errorHandler, notFound } from "./platform/errors.js";
import { authenticate, requirePermission } from "./identity/auth.middleware.js";
import { notificationRouter } from "./notifications/notification.routes.js";

export function createProductionApp() {
  const env = config();
  const app = express();
  app.disable("x-powered-by");
  if (env.TRUST_PROXY === "true") app.set("trust proxy", 1);
  app.use(
    requestContext,
    helmet(),
    cors({ origin: env.WEB_ORIGIN, credentials: true }),
    express.json({ limit: "1mb" }),
    cookieParser(),
  );
  app.use(
    "/api/auth",
    rateLimit({
      windowMs: 15 * 60_000,
      limit: 30,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );
  app.get("/health/live", (_req, res) => res.json({ status: "up" }));
  app.get("/health/ready", async (_req, res, next) => {
    try {
      res.json({ status: "ready", ...(await health()) });
    } catch (e) {
      next(e);
    }
  });
  app.get(
    "/api/v1/context",
    authenticate,
    requirePermission("dashboard.read"),
    (req, res) => res.json({ actor: req.actor }),
  );
  app.use("/api/v1/notifications", notificationRouter);
  app.use(notFound, errorHandler);
  return app;
}
