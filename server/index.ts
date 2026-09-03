import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { z } from "zod";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { get, id, load, save } from "./store.js";
import * as authRepo from "./identity/auth.repository.js";
import { createOperationalRouter } from "./operations/operational.routes.js";
import { pool, transaction as dbTransaction } from "./platform/database.js";
import { queueEmail } from "./notifications/notification.service.js";
import { startEmailWorker } from "./notifications/email.worker.js";
import { startBriefingWorker } from "./notifications/briefing.worker.js";
load();
const app = express();
const secret = process.env.JWT_SECRET || "oikonos-local-development-secret";
const persistentAuth = Boolean(process.env.DATABASE_URL);
const platformAdminEmails = new Set(
  `tobiloba.gbenle@gmail.com,${process.env.PLATFORM_ADMIN_EMAILS || ""}`
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);
const isPlatformAdmin = (user: { email?: string }) =>
  platformAdminEmails.has((user.email || "").toLowerCase());
app.use(cors());
// Workbook rows are converted to JSON in the browser before upload. A normal
// 1,000-row stock workbook can exceed Express's 100 KB default body limit.
app.use(express.json({ limit: "5mb" }));
const auth = async (req: any, res: any, next: any) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    const claims: any = jwt.verify(token, secret);
    const current = persistentAuth
      ? await authRepo.findById(claims.id, claims.organizationId)
      : get().users.find((u) => u.id === claims.id);
    if (!current || current.status !== "active")
      return res.status(401).json({
        message:
          "This account no longer has access. Contact your business owner.",
      });
    req.user = {
      id: current.id,
      name: current.name,
      email: current.email,
      role: current.role,
      organizationId: persistentAuth
        ? (current as authRepo.AuthUser).organizationId
        : undefined,
    };
    next();
  } catch {
    return res
      .status(401)
      .json({ message: "Your session has expired. Please sign in again." });
  }
};
const fail = (res: any, e: any) =>
  res.status(400).json({
    message: e?.issues?.[0]?.message || e.message || "Something went wrong.",
  });
const passwordSchema = z
  .string()
  .min(8, "Password must contain at least 8 characters.")
  .max(128, "Password cannot exceed 128 characters.")
  .refine((v) => /[a-z]/.test(v), "Password must include a lowercase letter.")
  .refine((v) => /[A-Z]/.test(v), "Password must include an uppercase letter.")
  .refine((v) => /[0-9]/.test(v), "Password must include a number.");
app.post("/api/auth/login", async (req, res) => {
  const parsed = z
    .object({
      email: z
        .string()
        .trim()
        .toLowerCase()
        .email("Enter a valid email address."),
      password: z.string().min(1, "Enter your password.").max(128),
    })
    .safeParse(req.body);
  if (!parsed.success) return fail(res, parsed.error);
  const record = persistentAuth
    ? await authRepo.findByEmail(parsed.data.email)
    : null;
  const u: any =
    record?.user ||
    get().users.find(
      (x) => x.email.toLowerCase() === parsed.data.email.toLowerCase(),
    );
  const hash = record?.passwordHash || u?.password;
  const passwordIsValid =
    Boolean(hash?.startsWith("$2")) &&
    bcrypt.compareSync(parsed.data.password, hash);
  if (!u || u.status === "inactive" || !passwordIsValid)
    return res.status(401).json({ message: "Email or password is incorrect." });
  if (persistentAuth)
    await pool.query(`UPDATE users SET last_login_at=now() WHERE id=$1`, [u.id]);
  const user = {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    organizationId: u.organizationId,
  };
  if (persistentAuth && u.mustChangePassword)
    return res.json({
      passwordChangeRequired: true,
      passwordChangeToken: jwt.sign(
        {
          id: u.id,
          organizationId: u.organizationId,
          purpose: "first-login-password-change",
        },
        secret,
        { expiresIn: "15m" },
      ),
      user,
      business: { name: u.businessName, currency: "NGN" },
    });
  if (persistentAuth)
    void dbTransaction((client) =>
      queueEmail(client, {
        organizationId: u.organizationId,
        recipientUserId: u.id,
        recipientEmail: u.email,
        event: "auth.new_login",
        payload: {
          businessName: u.businessName,
          time: new Date().toLocaleString("en-NG", {
            timeZone: "Africa/Lagos",
          }),
          ip: req.ip,
        },
        deduplicationKey: `auth.new_login:${u.id}:${Date.now()}`,
      }),
    ).catch((error) => console.error("Could not queue login email", error));
  res.json({
    token: jwt.sign(user, secret, { expiresIn: "12h" }),
    user,
    business: persistentAuth
      ? { name: u.businessName, currency: "NGN" }
      : get().business,
  });
});
app.post("/api/auth/complete-first-login", async (req, res) => {
  try {
    if (!persistentAuth)
      throw new Error("First-login setup requires the production database.");
    const input = z
      .object({ token: z.string().min(20), password: passwordSchema })
      .parse(req.body);
    const claims: any = jwt.verify(input.token, secret);
    if (claims.purpose !== "first-login-password-change")
      throw new Error("This password setup session is invalid.");
    const current = await authRepo.findById(claims.id, claims.organizationId);
    if (!current || current.status !== "active" || !current.mustChangePassword)
      throw new Error("This password setup session has expired or was completed.");
    await pool.query(
      `UPDATE users
       SET password_hash=$2,must_change_password=false,
           email_verified_at=COALESCE(email_verified_at,now()),updated_at=now()
       WHERE id=$1`,
      [current.id, bcrypt.hashSync(input.password, 12)],
    );
    const user = {
      id: current.id,
      name: current.name,
      email: current.email,
      role: current.role,
      organizationId: current.organizationId,
    };
    res.json({
      token: jwt.sign(user, secret, { expiresIn: "12h" }),
      user,
      business: { name: current.businessName, currency: "NGN" },
    });
  } catch (e) {
    fail(res, e);
  }
});
app.post("/api/auth/register", async (req, res) => {
  try {
    const x = z
      .object({
        name: z.string().trim().min(2),
        businessName: z.string().trim().min(2),
        email: z
          .string()
          .trim()
          .toLowerCase()
          .email("Enter a valid email address."),
        password: passwordSchema,
      })
      .parse(req.body);
    if (persistentAuth) {
      const user = await authRepo.registerOwner(x);
      const claims = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId,
      };
      return res.status(201).json({
        token: jwt.sign(claims, secret, { expiresIn: "12h" }),
        user: claims,
        business: { name: user.businessName, currency: "NGN" },
      });
    }
    const d = get();
    if (d.users.some((u) => u.email.toLowerCase() === x.email.toLowerCase()))
      throw new Error("An account with this email already exists.");
    const user = {
      id: id(),
      name: x.name,
      email: x.email.toLowerCase(),
      password: bcrypt.hashSync(x.password, 12),
      role: "owner" as const,
      status: "active" as const,
      createdAt: new Date().toISOString(),
    };
    d.users.push(user);
    d.business = { name: x.businessName, currency: "NGN" };
    save();
    const claims = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    };
    res.status(201).json({
      token: jwt.sign(claims, secret, { expiresIn: "12h" }),
      user: claims,
      business: d.business,
    });
  } catch (e) {
    fail(res, e);
  }
});
app.post("/api/auth/accept-invite", async (req, res) => {
  try {
    if (!persistentAuth)
      throw new Error("Invitations require the production database.");
    const input = z
      .object({ token: z.string().min(32), password: passwordSchema })
      .parse(req.body);
    const tokenHash = createHash("sha256").update(input.token).digest("hex");
    const accepted = await dbTransaction(async (client) => {
      const token = await client.query(
        `SELECT t.id,t.user_id FROM password_reset_tokens t WHERE t.token_hash=$1 AND t.used_at IS NULL AND t.expires_at>now() FOR UPDATE`,
        [tokenHash],
      );
      if (!token.rowCount)
        throw new Error("This invitation is invalid or has expired.");
      await client.query(
        `UPDATE users SET password_hash=$2,email_verified_at=COALESCE(email_verified_at,now()),must_change_password=false,updated_at=now() WHERE id=$1`,
        [token.rows[0].user_id, bcrypt.hashSync(input.password, 12)],
      );
      await client.query(
        `UPDATE password_reset_tokens SET used_at=now() WHERE id=$1`,
        [token.rows[0].id],
      );
      return true;
    });
    res.json({ accepted, message: "Password created. You can now sign in." });
  } catch (e) {
    fail(res, e);
  }
});
app.get("/api/me", auth, async (req: any, res) => {
  if (persistentAuth) {
    const current = await authRepo.findById(
      req.user.id,
      req.user.organizationId,
    );
    return res.json({
      user: req.user,
      business: { name: current?.businessName, currency: "NGN" },
    });
  }
  res.json({ user: req.user, business: get().business });
});
app.get("/api/staff", auth, async (req: any, res) => {
  if (req.user.role !== "owner" && req.user.role !== "manager")
    return res
      .status(403)
      .json({ message: "You do not have permission to manage staff." });
  if (persistentAuth)
    return res.json(await authRepo.listStaff(req.user.organizationId));
  res.json(
    get()
      .users.map(({ password, ...user }) => user)
      .sort((a, b) => a.name.localeCompare(b.name)),
  );
});
app.get("/api/platform/users", auth, async (req: any, res) => {
  if (!isPlatformAdmin(req.user))
    return res.status(403).json({ message: "Platform administrator access is required." });

  if (!persistentAuth) {
    const d = get();
    const activities = [
      ...d.sales.map((sale) => ({
        id: `sale-${sale.id}`,
        userId: sale.sellerId,
        userName: sale.sellerName,
        businessName: d.business?.name || "Local workspace",
        type: "sale",
        detail: `${sale.number} · ${sale.total.toLocaleString("en-NG", { style: "currency", currency: "NGN" })}`,
        createdAt: sale.createdAt,
      })),
      ...d.stockMovements.map((movement) => ({
        id: `stock-${movement.id}`,
        userId: movement.userId,
        userName: movement.userName,
        businessName: d.business?.name || "Local workspace",
        type: "inventory",
        detail: `${movement.type}: ${movement.productName}`,
        createdAt: movement.createdAt,
      })),
    ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return res.json({
      users: d.users.map(({ password: _password, ...user }) => ({
        ...user,
        businessName: d.business?.name || "Local workspace",
        lastLoginAt: null,
        lastActivityAt: activities.find((item) => item.userId === user.id)?.createdAt || null,
      })),
      activities: activities.slice(0, 200),
    });
  }

  const [users, activities] = await Promise.all([
    pool.query(`
      SELECT u.id,trim(concat(u.first_name,' ',u.last_name)) name,u.email,u.status,
             u.created_at "createdAt",u.last_login_at "lastLoginAt",o.name "businessName",
             m.role,m.status "membershipStatus",latest.created_at "lastActivityAt"
      FROM users u
      LEFT JOIN organization_memberships m ON m.user_id=u.id
      LEFT JOIN organizations o ON o.id=m.organization_id
      LEFT JOIN LATERAL (
        SELECT created_at FROM (
          SELECT completed_at created_at FROM sales WHERE seller_id=u.id AND completed_at IS NOT NULL
          UNION ALL SELECT occurred_at FROM stock_movements WHERE performed_by=u.id
          UNION ALL SELECT created_at FROM expenses WHERE recorded_by=u.id
          UNION ALL SELECT created_at FROM audit_events WHERE actor_id=u.id
        ) activity ORDER BY created_at DESC NULLS LAST LIMIT 1
      ) latest ON true
      ORDER BY COALESCE(latest.created_at,u.last_login_at,u.created_at) DESC
    `),
    pool.query(`
      SELECT * FROM (
        SELECT 'sale-'||s.id id,s.seller_id "userId",trim(concat(u.first_name,' ',u.last_name)) "userName",
               o.name "businessName",'sale' type,
               'Completed sale #'||s.receipt_number||' · NGN '||trim(to_char(s.total,'FM999,999,999,990')) detail,
               COALESCE(s.completed_at,s.created_at) "createdAt"
        FROM sales s JOIN users u ON u.id=s.seller_id JOIN organizations o ON o.id=s.organization_id
        UNION ALL
        SELECT 'stock-'||sm.id,sm.performed_by,trim(concat(u.first_name,' ',u.last_name)),o.name,'inventory',
               initcap(replace(sm.type::text,'_',' '))||': '||p.name||' ('||sm.quantity||')',sm.occurred_at
        FROM stock_movements sm JOIN users u ON u.id=sm.performed_by JOIN organizations o ON o.id=sm.organization_id JOIN products p ON p.id=sm.product_id
        UNION ALL
        SELECT 'expense-'||e.id,e.recorded_by,trim(concat(u.first_name,' ',u.last_name)),o.name,'expense',
               'Recorded expense: '||e.description||' · NGN '||trim(to_char(e.amount,'FM999,999,999,990')),e.created_at
        FROM expenses e JOIN users u ON u.id=e.recorded_by JOIN organizations o ON o.id=e.organization_id
        UNION ALL
        SELECT 'audit-'||a.id,a.actor_id,COALESCE(trim(concat(u.first_name,' ',u.last_name)),'System'),COALESCE(o.name,'Platform'),'audit',
               initcap(replace(a.action,'_',' '))||' · '||initcap(replace(a.entity_type,'_',' ')),a.created_at
        FROM audit_events a LEFT JOIN users u ON u.id=a.actor_id LEFT JOIN organizations o ON o.id=a.organization_id
      ) activity ORDER BY "createdAt" DESC LIMIT 200
    `),
  ]);
  res.json({ users: users.rows, activities: activities.rows });
});
app.post("/api/staff", auth, async (req: any, res) => {
  try {
    if (req.user.role !== "owner")
      return res
        .status(403)
        .json({ message: "Only the business owner can add staff." });
    const x = z
        .object({
          name: z.string().trim().min(2),
          email: z
            .string()
            .trim()
            .toLowerCase()
            .email("Enter a valid email address."),
          role: z.enum(["manager", "seller"]),
          temporaryPassword: passwordSchema,
        })
        .parse(req.body),
      d = get();
    if (persistentAuth) {
      const created = await authRepo.createStaff(req.user.organizationId, {
        name: x.name,
        email: x.email,
        password: x.temporaryPassword,
        role: x.role,
      });
      const inviteUrl = process.env.APP_URL || "https://oikonos.onrender.com";
      await dbTransaction(async (client) => {
        await queueEmail(client, {
          organizationId: req.user.organizationId,
          recipientUserId: created.id,
          recipientEmail: created.email,
          event: "member.invited",
          payload: {
            name: created.name,
            businessName: created.businessName,
            role: created.role,
            loginEmail: created.email,
            temporaryPassword: x.temporaryPassword,
            inviterName: req.user.name,
            url: inviteUrl,
          },
          deduplicationKey: `member.invited:${created.id}:${Date.now()}`,
        });
      });
      return res.status(201).json(created);
    }
    if (d.users.some((u) => u.email.toLowerCase() === x.email.toLowerCase()))
      throw new Error("A staff account with this email already exists.");
    const user = {
      id: id(),
      name: x.name,
      email: x.email.toLowerCase(),
      password: bcrypt.hashSync(x.temporaryPassword, 12),
      role: x.role,
      status: "active" as const,
      createdAt: new Date().toISOString(),
    };
    d.users.push(user);
    save();
    const { password, ...result } = user;
    res.status(201).json(result);
  } catch (e) {
    fail(res, e);
  }
});
app.post("/api/staff/:id/resend-onboarding", auth, async (req: any, res) => {
  try {
    if (!persistentAuth)
      throw new Error("Staff onboarding requires the production database.");
    if (req.user.role !== "owner")
      return res.status(403).json({
        message: "Only the business owner can resend staff onboarding.",
      });
    const temporaryPassword = `Oi${randomBytes(6).toString("base64url")}9!`;
    const inviteUrl = process.env.APP_URL || "https://oikonos.onrender.com";
    const member = await dbTransaction(async (client) => {
      const found = await client.query(
        `SELECT u.id,u.email,trim(concat(u.first_name,' ',u.last_name)) name,m.role,o.name business_name
         FROM users u
         JOIN organization_memberships m ON m.user_id=u.id
         JOIN organizations o ON o.id=m.organization_id
         WHERE u.id=$1 AND m.organization_id=$2 AND m.role<>'owner' LIMIT 1`,
        [req.params.id, req.user.organizationId],
      );
      if (!found.rowCount) throw new Error("Staff member was not found.");
      const staff = found.rows[0];
      await client.query(
        `UPDATE users SET password_hash=$2,must_change_password=true,updated_at=now() WHERE id=$1`,
        [staff.id, bcrypt.hashSync(temporaryPassword, 12)],
      );
      await client.query(
        `UPDATE password_reset_tokens SET used_at=now() WHERE user_id=$1 AND used_at IS NULL`,
        [staff.id],
      );
      await queueEmail(client, {
        organizationId: req.user.organizationId,
        recipientUserId: staff.id,
        recipientEmail: staff.email,
        event: "member.invited",
        payload: {
          name: staff.name,
          businessName: staff.business_name,
          role: staff.role,
          loginEmail: staff.email,
          temporaryPassword,
          inviterName: req.user.name,
          url: inviteUrl,
        },
        deduplicationKey: `member.invited:${staff.id}:resend:${Date.now()}`,
      });
      return staff;
    });
    res.json({
      message: `A fresh onboarding email has been queued for ${member.email}.`,
    });
  } catch (e) {
    fail(res, e);
  }
});
app.patch("/api/staff/:id", auth, async (req: any, res) => {
  try {
    if (req.user.role !== "owner")
      return res
        .status(403)
        .json({ message: "Only the business owner can change staff access." });
    if (req.params.id === req.user.id)
      return res.status(400).json({
        message: "You cannot change or deactivate your own owner account.",
      });
    const x = z
        .object({
          role: z.enum(["manager", "seller"]).optional(),
          status: z.enum(["active", "inactive"]).optional(),
        })
        .refine((v) => v.role || v.status, {
          message: "Choose a role or access status to update.",
        })
        .parse(req.body),
      user = get().users.find((u) => u.id === req.params.id);
    if (persistentAuth) {
      const updated = await authRepo.updateStaff(
        req.user.organizationId,
        req.params.id,
        x,
      );
      if (!updated)
        return res.status(404).json({ message: "Staff member not found." });
      return res.json(updated);
    }
    if (!user)
      return res.status(404).json({ message: "Staff member not found." });
    if (user.role === "owner")
      return res
        .status(400)
        .json({ message: "Owner access cannot be changed here." });
    Object.assign(user, x);
    save();
    const { password, ...result } = user;
    res.json(result);
  } catch (e) {
    fail(res, e);
  }
});
app.delete("/api/staff/:id", auth, async (req: any, res) => {
  try {
    if (req.user.role !== "owner" && req.user.role !== "manager")
      return res.status(403).json({
        message: "Only an owner or manager can delete a seller.",
      });
    if (req.params.id === req.user.id)
      return res.status(400).json({
        message: "You cannot delete your own account.",
      });
    if (persistentAuth) {
      const removed = await authRepo.removeSeller(
        req.user.organizationId,
        req.params.id,
      );
      return res.json({
        message: `${removed.name || removed.email} was removed from the business.`,
      });
    }
    const d = get();
    const index = d.users.findIndex((member) => member.id === req.params.id);
    if (index < 0) throw new Error("Seller was not found.");
    if (d.users[index].role !== "seller")
      throw new Error("Only Seller accounts can be deleted here.");
    const [removed] = d.users.splice(index, 1);
    save();
    return res.json({
      message: `${removed.name || removed.email} was removed from the business.`,
    });
  } catch (e) {
    fail(res, e);
  }
});
app.get("/api/email/status", auth, async (req: any, res) => {
  if (!persistentAuth || req.user.role !== "owner")
    return res.status(403).json({
      message: "Only the business owner can view email delivery status.",
    });
  const counts = await pool.query(
    `SELECT status,count(*)::int count FROM notification_outbox WHERE organization_id=$1 AND channel='email' GROUP BY status`,
    [req.user.organizationId],
  );
  const recent = await pool.query(
    `SELECT event_type "eventType",recipient_address recipient,status,attempts,last_error "lastError",created_at "createdAt",sent_at "sentAt" FROM notification_outbox WHERE organization_id=$1 AND channel='email' ORDER BY created_at DESC LIMIT 20`,
    [req.user.organizationId],
  );
  const preference = await pool.query(
    `SELECT email_enabled FROM notification_preferences WHERE organization_id=$1 AND user_id=$2 AND event_type='owner.daily_briefing'`,
    [req.user.organizationId, req.user.id],
  );
  res.json({
    counts: counts.rows,
    recent: recent.rows,
    briefingEnabled: preference.rows[0]?.email_enabled ?? true,
  });
});
app.put("/api/email/briefing", auth, async (req: any, res) => {
  if (!persistentAuth || req.user.role !== "owner")
    return res
      .status(403)
      .json({
        message: "Only the business owner can change briefing delivery.",
      });
  const input = z.object({ enabled: z.boolean() }).parse(req.body);
  await pool.query(
    `INSERT INTO notification_preferences(organization_id,user_id,event_type,email_enabled,in_app_enabled,minimum_severity) VALUES($1,$2,'owner.daily_briefing',$3,true,'info') ON CONFLICT(organization_id,user_id,event_type) DO UPDATE SET email_enabled=EXCLUDED.email_enabled,updated_at=now()`,
    [req.user.organizationId, req.user.id, input.enabled],
  );
  res.json({ briefingEnabled: input.enabled });
});
app.post("/api/email/test", auth, async (req: any, res) => {
  if (!persistentAuth || req.user.role !== "owner")
    return res
      .status(403)
      .json({ message: "Only the business owner can send a test email." });
  await dbTransaction(async (client) => {
    const business = await client.query(
      `SELECT name FROM organizations WHERE id=$1`,
      [req.user.organizationId],
    );
    await queueEmail(client, {
      organizationId: req.user.organizationId,
      recipientUserId: req.user.id,
      recipientEmail: req.user.email,
      event: "settings.changed",
      payload: {
        businessName: business.rows[0]?.name,
        actorName: req.user.name,
        setting: "Email delivery test",
        actionUrl: process.env.APP_URL || "https://oikonos.onrender.com",
      },
      deduplicationKey: `email-test:${req.user.id}:${Date.now()}`,
    });
  });
  res.status(202).json({ message: `Test email queued for ${req.user.email}.` });
});
// Public authentication and protected staff routes must be registered before
// this tenant-wide operational router. Otherwise its auth middleware intercepts
// sign-in and registration requests before they reach their public handlers.
if (persistentAuth) app.use("/api", createOperationalRouter(auth));
app.get("/api/dashboard", auth, (_req, res) => {
  const d = get();
  const month = Date.now() - 30 * 86400000;
  const recent = d.sales.filter((s) => +new Date(s.createdAt) > month);
  const revenue = recent.reduce((a, s) => a + s.total, 0);
  const profit =
    recent.reduce((a, s) => a + s.profit, 0) -
    d.expenses
      .filter((e) => +new Date(e.date) > month)
      .reduce((a, e) => a + e.amount, 0);
  const expenses = d.expenses.reduce((a, e) => a + e.amount, 0);
  const cashSales = recent
    .filter((s) => s.payment === "cash")
    .reduce((a, s) => a + s.total, 0);
  const posSales = recent
    .filter((s) => s.payment === "pos")
    .reduce((a, s) => a + s.total, 0);
  const lowStock = d.products.filter(
    (p) => p.stock <= p.threshold && p.status === "active",
  );
  const byDay = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(Date.now() - (6 - i) * 86400000);
    const key = date.toISOString().slice(0, 10);
    return {
      day: date.toLocaleDateString("en", { weekday: "short" }),
      value: d.sales
        .filter((s) => s.createdAt.slice(0, 10) === key)
        .reduce((a, s) => a + s.total, 0),
    };
  });
  const productMap = new Map<string, number>();
  recent.forEach((s) =>
    s.items.forEach((i) =>
      productMap.set(i.name, (productMap.get(i.name) || 0) + i.qty),
    ),
  );
  const topProducts = [...productMap]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([name, units]) => ({ name, units }));
  res.json({
    revenue,
    profit,
    expenses,
    cashSales,
    posSales,
    inventoryValue: d.products.reduce((a, p) => a + p.cost * p.stock, 0),
    outOfStock: d.products.filter((p) => p.stock === 0 && p.status === "active")
      .length,
    transactions: recent.length,
    aov: recent.length ? revenue / recent.length : 0,
    lowStock,
    byDay,
    topProducts,
    recent: d.sales
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 5),
    insight: lowStock.length
      ? `${lowStock.length} ${lowStock.length === 1 ? "product needs" : "products need"} stock attention.`
      : null,
  });
});
app.get("/api/products", auth, (_q, res) => res.json(get().products));
app.get("/api/products/barcode/:barcode", auth, (req, res) => {
  const barcode = req.params.barcode.trim();
  if (!/^\d{6,18}$/.test(barcode))
    return res
      .status(400)
      .json({ message: "This barcode format is not supported." });
  const product = get().products.find(
    (p) => p.status === "active" && p.barcode === barcode,
  );
  if (!product)
    return res
      .status(404)
      .json({ message: "No product is assigned to this barcode." });
  res.json(product);
});
app.post("/api/products", auth, (req, res) => {
  try {
    const x = z
      .object({
        name: z.string().min(2),
        sku: z.string().min(2),
        barcode: z
          .string()
          .trim()
          .regex(/^\d{6,18}$/, "Barcode must contain 6 to 18 digits.")
          .optional()
          .or(z.literal("")),
        category: z.string().min(2),
        price: z.number().nonnegative(),
        cost: z.number().nonnegative(),
        stock: z.number().int().nonnegative(),
        threshold: z.number().int().nonnegative(),
      })
      .parse(req.body);
    if (get().products.some((p) => p.sku.toLowerCase() === x.sku.toLowerCase()))
      throw new Error("That SKU already exists.");
    if (x.barcode && get().products.some((p) => p.barcode === x.barcode))
      throw new Error("That barcode is already assigned to another product.");
    const p = { id: id(), ...x, status: "active" as const };
    get().products.unshift(p);
    if (p.stock > 0)
      get().stockMovements.unshift({
        id: id(),
        productId: p.id,
        productName: p.name,
        type: "initial",
        quantity: p.stock,
        previousStock: 0,
        newStock: p.stock,
        reason: "Opening stock",
        userId: (req as any).user.id,
        userName: (req as any).user.name,
        createdAt: new Date().toISOString(),
      });
    save();
    res.status(201).json(p);
  } catch (e) {
    fail(res, e);
  }
});
const importRow = z.object({
  name: z.string().min(2).max(160),
  sku: z.string().min(2).max(80),
  category: z.string().min(1).max(100),
  price: z.number().nonnegative(),
  cost: z.number().nonnegative(),
  quantity: z.number().int().nonnegative(),
  threshold: z.number().int().nonnegative(),
});
app.post("/api/products/import/preview", auth, (req: any, res) => {
  try {
    if (req.user.role === "seller")
      return res
        .status(403)
        .json({ message: "Only administrators can import stock." });
    const rows = z.array(z.unknown()).min(1).max(5000).parse(req.body.rows),
      existing = new Map(get().products.map((p) => [p.sku.toLowerCase(), p])),
      seen = new Set<string>();
    const preview = rows.map((raw, index) => {
      const parsed = importRow.safeParse(raw);
      const sku =
        typeof (raw as any)?.sku === "string" ? (raw as any).sku.trim() : "";
      const duplicateInFile = sku ? seen.has(sku.toLowerCase()) : false;
      if (sku) seen.add(sku.toLowerCase());
      const product = existing.get(sku.toLowerCase());
      return {
        row: index + 2,
        data: parsed.success ? parsed.data : raw,
        valid: parsed.success && !duplicateInFile,
        errors: [
          ...(parsed.success
            ? []
            : parsed.error.issues.map(
                (i) => `${i.path.join(".")}: ${i.message}`,
              )),
          ...(duplicateInFile ? ["Duplicate SKU in this file."] : []),
        ],
        conflict: product
          ? {
              productId: product.id,
              currentStock: product.stock,
              currentName: product.name,
            }
          : null,
      };
    });
    res.json({
      rows: preview,
      summary: {
        total: preview.length,
        valid: preview.filter((r) => r.valid).length,
        invalid: preview.filter((r) => !r.valid).length,
        conflicts: preview.filter((r) => r.conflict).length,
      },
    });
  } catch (e) {
    fail(res, e);
  }
});
app.post("/api/products/import/confirm", auth, (req: any, res) => {
  try {
    if (req.user.role === "seller")
      return res
        .status(403)
        .json({ message: "Only administrators can import stock." });
    const x = z
        .object({
          mode: z.enum(["add", "replace"]),
          rows: z.array(importRow).min(1).max(5000),
        })
        .parse(req.body),
      d = get(),
      seen = new Set<string>();
    for (const row of x.rows) {
      const key = row.sku.toLowerCase();
      if (seen.has(key))
        throw new Error(`Duplicate SKU ${row.sku} appears more than once.`);
      seen.add(key);
    }
    const now = new Date().toISOString(),
      results = { created: 0, updated: 0, movements: 0 };
    for (const row of x.rows) {
      let product = d.products.find(
        (p) => p.sku.toLowerCase() === row.sku.toLowerCase(),
      );
      if (!product) {
        product = {
          id: id(),
          name: row.name,
          sku: row.sku,
          category: row.category,
          price: row.price,
          cost: row.cost,
          stock: 0,
          threshold: row.threshold,
          status: "active",
        };
        d.products.push(product);
        results.created++;
      } else {
        product.name = row.name;
        product.category = row.category;
        product.price = row.price;
        product.cost = row.cost;
        product.threshold = row.threshold;
        results.updated++;
      }
      const previousStock = product.stock,
        newStock =
          x.mode === "add" ? previousStock + row.quantity : row.quantity,
        change = newStock - previousStock;
      product.stock = newStock;
      if (change !== 0) {
        d.stockMovements.unshift({
          id: id(),
          productId: product.id,
          productName: product.name,
          type: previousStock === 0 ? "initial" : "adjustment",
          quantity: change,
          previousStock,
          newStock,
          reason: `Stock import (${x.mode} quantity)`,
          userId: req.user.id,
          userName: req.user.name,
          createdAt: now,
        });
        results.movements++;
      }
    }
    save();
    res.status(201).json(results);
  } catch (e) {
    fail(res, e);
  }
});
app.patch("/api/products/:id", auth, (req, res) => {
  const p = get().products.find((x) => x.id === req.params.id);
  if (!p) return res.status(404).json({ message: "Product not found." });
  if (
    req.body.barcode &&
    get().products.some((x) => x.id !== p.id && x.barcode === req.body.barcode)
  )
    return res.status(400).json({
      message: "That barcode is already assigned to another product.",
    });
  Object.assign(p, req.body);
  save();
  res.json(p);
});
app.get("/api/stock-movements", auth, (req, res) => {
  const productId =
    typeof req.query.productId === "string" ? req.query.productId : undefined;
  const rows = get()
    .stockMovements.filter((m) => !productId || m.productId === productId)
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json(rows);
});
app.get("/api/inventory/anomalies", auth, (_req, res) => {
  const d = get(),
    start = Date.now() - 14 * 86400000,
    today = new Date().toISOString().slice(0, 10);
  const anomalies = d.products.flatMap((product) => {
    const saleMoves = d.stockMovements.filter(
      (m) =>
        m.productId === product.id &&
        m.type === "sale" &&
        +new Date(m.createdAt) >= start,
    );
    const historical = saleMoves
      .filter((m) => m.createdAt.slice(0, 10) !== today)
      .reduce((a, m) => a + Math.abs(m.quantity), 0);
    const activeDays = new Set(
      saleMoves
        .filter((m) => m.createdAt.slice(0, 10) !== today)
        .map((m) => m.createdAt.slice(0, 10)),
    ).size;
    const expected = activeDays ? historical / activeDays : 0;
    const actual = saleMoves
      .filter((m) => m.createdAt.slice(0, 10) === today)
      .reduce((a, m) => a + Math.abs(m.quantity), 0);
    const unexplained = d.stockMovements
      .filter(
        (m) =>
          m.productId === product.id &&
          m.createdAt.slice(0, 10) === today &&
          ["adjustment", "correction", "damaged", "expired"].includes(m.type),
      )
      .reduce((a, m) => a + Math.abs(m.quantity), 0);
    const result: any[] = [];
    if (expected >= 1 && actual > expected * 2)
      result.push({
        id: `velocity-${product.id}-${today}`,
        severity: "review",
        kind: "unusual_sales",
        productId: product.id,
        productName: product.name,
        expected: Math.round(expected * 10) / 10,
        actual,
        differencePercent: Math.round((actual / expected - 1) * 100),
        message: "Unusual sales movement detected.",
      });
    if (unexplained > 0)
      result.push({
        id: `reconciliation-${product.id}-${today}`,
        severity: "important",
        kind: "stock_reconciliation",
        productId: product.id,
        productName: product.name,
        expected: 0,
        actual: unexplained,
        message: "A stock adjustment requires review.",
      });
    return result;
  });
  res.json(anomalies);
});
app.post("/api/products/:id/adjust-stock", auth, (req: any, res) => {
  try {
    if (req.user.role === "seller")
      return res
        .status(403)
        .json({ message: "Only administrators can adjust stock." });
    const x = z
      .object({
        physicalCount: z.number().int().nonnegative(),
        reason: z.string().min(3),
        type: z
          .enum([
            "adjustment",
            "restock",
            "return",
            "damaged",
            "expired",
            "correction",
          ])
          .default("adjustment"),
      })
      .parse(req.body);
    const d = get(),
      product = d.products.find((p) => p.id === req.params.id);
    if (!product)
      return res.status(404).json({ message: "Product not found." });
    const previousStock = product.stock,
      quantity = x.physicalCount - previousStock;
    if (quantity === 0)
      return res.status(400).json({
        message:
          "The physical count matches the current stock. No adjustment is required.",
      });
    product.stock = x.physicalCount;
    const movement = {
      id: id(),
      productId: product.id,
      productName: product.name,
      type: x.type,
      quantity,
      previousStock,
      newStock: product.stock,
      reason: x.reason,
      userId: req.user.id,
      userName: req.user.name,
      createdAt: new Date().toISOString(),
    };
    d.stockMovements.unshift(movement);
    save();
    res.status(201).json({ product, movement });
  } catch (e) {
    fail(res, e);
  }
});
app.get("/api/sales", auth, (_q, res) =>
  res.json(
    get()
      .sales.slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  ),
);
app.post("/api/sales", auth, (req: any, res) => {
  try {
    const x = z
      .object({
        items: z
          .array(
            z.object({
              productId: z.string(),
              qty: z.number().int().positive(),
            }),
          )
          .min(1),
        payment: z.enum(["cash", "pos"]),
        customerId: z.string().optional(),
      })
      .parse(req.body);
    const d = get();
    let total = 0,
      profit = 0;
    const items = x.items.map((line) => {
      const p = d.products.find((v) => v.id === line.productId);
      if (!p) throw new Error("A product in this cart no longer exists.");
      if (p.stock < line.qty)
        throw new Error(`${p.name} only has ${p.stock} left in stock.`);
      total += p.price * line.qty;
      profit += (p.price - p.cost) * line.qty;
      return { productId: p.id, name: p.name, qty: line.qty, price: p.price };
    });
    const saleId = id(),
      createdAt = new Date().toISOString();
    items.forEach((line) => {
      const p = d.products.find((v) => v.id === line.productId)!;
      const previousStock = p.stock;
      p.stock -= line.qty;
      d.stockMovements.unshift({
        id: id(),
        productId: p.id,
        productName: p.name,
        type: "sale",
        quantity: -line.qty,
        previousStock,
        newStock: p.stock,
        reason: "Completed sale",
        userId: req.user.id,
        userName: req.user.name,
        referenceId: saleId,
        createdAt,
      });
    });
    const customer = d.customers.find((c) => c.id === x.customerId);
    const sale = {
      id: saleId,
      number: `SAL-${String(1001 + d.sales.length).padStart(4, "0")}`,
      createdAt,
      sellerId: req.user.id,
      sellerName: req.user.name,
      customerId: customer?.id,
      customerName: customer?.name,
      payment: x.payment,
      total,
      profit,
      items,
    };
    d.sales.unshift(sale);
    if (customer) {
      customer.totalSpent += total;
      customer.purchases++;
      customer.lastPurchase = sale.createdAt;
    }
    save();
    res.status(201).json(sale);
  } catch (e) {
    fail(res, e);
  }
});
app.get("/api/customers", auth, (_q, res) => res.json(get().customers));
app.post("/api/customers", auth, (req, res) => {
  try {
    const x = z
      .object({
        name: z.string().min(2),
        phone: z.string().min(7),
        email: z.string().email().or(z.literal("")),
      })
      .parse(req.body);
    const c = { id: id(), ...x, totalSpent: 0, purchases: 0 };
    get().customers.unshift(c);
    save();
    res.status(201).json(c);
  } catch (e) {
    fail(res, e);
  }
});
app.get("/api/expenses", auth, (_q, res) =>
  res.json(
    get()
      .expenses.slice()
      .sort((a, b) => b.date.localeCompare(a.date)),
  ),
);
app.post("/api/expenses", auth, (req, res) => {
  try {
    const x = z
      .object({
        description: z.string().min(2),
        category: z.string().min(2),
        amount: z.number().positive(),
        date: z.string(),
      })
      .parse(req.body);
    const e = { id: id(), ...x };
    get().expenses.unshift(e);
    save();
    res.status(201).json(e);
  } catch (e) {
    fail(res, e);
  }
});
app.use("/api", (_q, res) =>
  res.status(404).json({ message: "Endpoint not found." }),
);
app.use((error: any, _req: any, res: any, _next: any) => {
  console.error("API error", error);
  const constraint = error?.code === "23505";
  res.status(constraint ? 409 : 400).json({
    message: constraint
      ? "A record with this value already exists."
      : error?.issues?.[0]?.message ||
        error?.message ||
        "Something went wrong.",
  });
});
app.use(express.static(path.join(process.cwd(), "dist")));
app.get(/^(?!\/api).*/, (_req, res) =>
  res.sendFile(path.join(process.cwd(), "dist", "index.html")),
);
app.listen(Number(process.env.PORT) || 4000, () => {
  console.log(
    `OikonOS API running on port ${Number(process.env.PORT) || 4000}`,
  );
  if (persistentAuth) {
    startEmailWorker();
    startBriefingWorker();
  }
});
