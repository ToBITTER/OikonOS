export const notificationEvents = {
  "auth.verify_email": { severity: "critical", audience: "actor" },
  "auth.password_reset": { severity: "critical", audience: "actor" },
  "auth.password_changed": { severity: "critical", audience: "actor" },
  "auth.new_login": { severity: "warning", audience: "actor" },
  "sale.completed": { severity: "info", audience: "admins" },
  "sale.refunded": { severity: "warning", audience: "admins" },
  "inventory.low_stock": { severity: "warning", audience: "admins" },
  "inventory.out_of_stock": { severity: "critical", audience: "admins" },
  "inventory.adjusted": { severity: "warning", audience: "admins" },
  "inventory.anomaly": { severity: "critical", audience: "admins" },
  "inventory.imported": { severity: "info", audience: "admins" },
  "member.invited": { severity: "info", audience: "actor" },
  "member.role_changed": { severity: "warning", audience: "actor" },
  "settings.changed": { severity: "warning", audience: "admins" },
} as const;
export type NotificationEvent = keyof typeof notificationEvents;
