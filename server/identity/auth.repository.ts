import bcrypt from "bcryptjs";
import { transaction, query } from "../platform/database.js";
export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: "owner" | "manager" | "seller";
  status: "active" | "inactive";
  organizationId: string;
  businessName: string;
  createdAt: string;
};
const map = (r: any): AuthUser => ({
  id: r.id,
  name: `${r.first_name} ${r.last_name || ""}`.trim(),
  email: r.email,
  role: r.role,
  status:
    r.membership_status === "active" && r.user_status === "active"
      ? "active"
      : "inactive",
  organizationId: r.organization_id,
  businessName: r.business_name,
  createdAt: r.created_at,
});
const select = `SELECT u.id,u.email,u.password_hash,u.first_name,u.last_name,u.status user_status,u.created_at,m.organization_id,m.role,m.status membership_status,o.name business_name FROM users u JOIN organization_memberships m ON m.user_id=u.id JOIN organizations o ON o.id=m.organization_id`;
export async function findByEmail(email: string) {
  const r = await query(
    `${select} WHERE lower(u.email)=lower($1) AND o.status='active' ORDER BY m.joined_at LIMIT 1`,
    [email],
  );
  return r.rowCount
    ? { user: map(r.rows[0]), passwordHash: r.rows[0].password_hash }
    : null;
}
export async function findById(id: string, organizationId: string) {
  const r = await query(
    `${select} WHERE u.id=$1 AND m.organization_id=$2 LIMIT 1`,
    [id, organizationId],
  );
  return r.rowCount ? map(r.rows[0]) : null;
}
const slugify = (name: string) =>
  `${
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 42) || "business"
  }-${Math.random().toString(36).slice(2, 8)}`;
export async function registerOwner(input: {
  name: string;
  businessName: string;
  email: string;
  password: string;
}) {
  return transaction(async (c) => {
    const duplicate = await c.query(
      "SELECT 1 FROM users WHERE lower(email)=lower($1)",
      [input.email],
    );
    if (duplicate.rowCount)
      throw new Error("An account with this email already exists.");
    const parts = input.name.trim().split(/\s+/),
      firstName = parts.shift()!,
      lastName = parts.join(" ") || null;
    const user = await c.query(
      `INSERT INTO users(email,password_hash,first_name,last_name,email_verified_at) VALUES($1,$2,$3,$4,NULL) RETURNING id,email,first_name,last_name,status,created_at`,
      [input.email, await bcrypt.hash(input.password, 12), firstName, lastName],
    );
    const org = await c.query(
      `INSERT INTO organizations(name,slug) VALUES($1,$2) RETURNING id,name`,
      [input.businessName, slugify(input.businessName)],
    );
    const membership = await c.query(
      `INSERT INTO organization_memberships(organization_id,user_id,role) VALUES($1,$2,'owner') RETURNING id,role,status,joined_at`,
      [org.rows[0].id, user.rows[0].id],
    );
    await c.query(
      `INSERT INTO locations(organization_id,name,is_default) VALUES($1,'Main location',true)`,
      [org.rows[0].id],
    );
    return map({
      ...user.rows[0],
      organization_id: org.rows[0].id,
      business_name: org.rows[0].name,
      role: membership.rows[0].role,
      membership_status: membership.rows[0].status,
      user_status: user.rows[0].status,
    });
  });
}
export async function listStaff(organizationId: string) {
  const r = await query(
    `${select} WHERE m.organization_id=$1 ORDER BY u.first_name,u.last_name`,
    [organizationId],
  );
  return r.rows.map(map);
}
export async function createStaff(
  organizationId: string,
  input: {
    name: string;
    email: string;
    password: string;
    role: "manager" | "seller";
  },
) {
  return transaction(async (c) => {
    let existing = await c.query(
      "SELECT id FROM users WHERE lower(email)=lower($1)",
      [input.email],
    );
    let userId: string;
    if (existing.rowCount) {
      userId = existing.rows[0].id;
      const already = await c.query(
        "SELECT 1 FROM organization_memberships WHERE organization_id=$1 AND user_id=$2",
        [organizationId, userId],
      );
      if (already.rowCount)
        throw new Error("A staff account with this email already exists.");
    } else {
      const parts = input.name.trim().split(/\s+/),
        firstName = parts.shift()!,
        lastName = parts.join(" ") || null;
      const created = await c.query(
        `INSERT INTO users(email,password_hash,first_name,last_name) VALUES($1,$2,$3,$4) RETURNING id`,
        [
          input.email,
          await bcrypt.hash(input.password, 12),
          firstName,
          lastName,
        ],
      );
      userId = created.rows[0].id;
    }
    await c.query(
      `INSERT INTO organization_memberships(organization_id,user_id,role) VALUES($1,$2,$3)`,
      [organizationId, userId, input.role],
    );
    const result = await c.query(
      `${select} WHERE u.id=$1 AND m.organization_id=$2`,
      [userId, organizationId],
    );
    return map(result.rows[0]);
  });
}
export async function updateStaff(
  organizationId: string,
  userId: string,
  changes: { role?: "manager" | "seller"; status?: "active" | "inactive" },
) {
  if (changes.role)
    await query(
      `UPDATE organization_memberships SET role=$3 WHERE organization_id=$1 AND user_id=$2 AND role<>'owner'`,
      [organizationId, userId, changes.role],
    );
  if (changes.status)
    await query(
      `UPDATE organization_memberships SET status=$3 WHERE organization_id=$1 AND user_id=$2 AND role<>'owner'`,
      [organizationId, userId, changes.status],
    );
  return findById(userId, organizationId);
}
