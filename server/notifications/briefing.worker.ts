import { transaction } from "../platform/database.js";
import { queueEmail } from "./notification.service.js";

let timer: NodeJS.Timeout | undefined;

export async function queueDailyOwnerBriefings() {
  const lagosHour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Lagos",
      hour: "2-digit",
      hour12: false,
    }).format(new Date()),
  );
  if (lagosHour < 7) return;
  const briefingDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  await transaction(async (client) => {
    const owners = await client.query(
      `SELECT o.id organization_id,o.name business_name,u.id user_id,u.email FROM organizations o JOIN organization_memberships m ON m.organization_id=o.id AND m.role='owner' AND m.status='active' JOIN users u ON u.id=m.user_id AND u.status='active' LEFT JOIN notification_preferences p ON p.organization_id=o.id AND p.user_id=u.id AND p.event_type='owner.daily_briefing' WHERE o.status='active' AND COALESCE(p.email_enabled,true)=true`,
    );
    for (const owner of owners.rows) {
      const bounds = `s.completed_at >= (date_trunc('day',now() AT TIME ZONE 'Africa/Lagos')-interval '1 day') AT TIME ZONE 'Africa/Lagos' AND s.completed_at < date_trunc('day',now() AT TIME ZONE 'Africa/Lagos') AT TIME ZONE 'Africa/Lagos'`;
      const [sales, expenses, stock, adjustments, top] = await Promise.all([
        client.query(
          `SELECT COALESCE(sum(s.total),0)::float8 revenue,COALESCE(sum(s.total-s.cost_total),0)::float8 gross_profit,count(*)::int transactions FROM sales s WHERE s.organization_id=$1 AND s.status='completed' AND ${bounds}`,
          [owner.organization_id],
        ),
        client.query(
          `SELECT COALESCE(sum(amount),0)::float8 total FROM expenses WHERE organization_id=$1 AND status='active' AND expense_date=(now() AT TIME ZONE 'Africa/Lagos')::date-1`,
          [owner.organization_id],
        ),
        client.query(
          `SELECT count(*)::int total FROM products p LEFT JOIN locations l ON l.organization_id=p.organization_id AND l.is_default=true LEFT JOIN inventory_levels i ON i.product_id=p.id AND i.location_id=l.id WHERE p.organization_id=$1 AND p.status='active' AND COALESCE(i.quantity,0)<=COALESCE(i.reorder_level,0)`,
          [owner.organization_id],
        ),
        client.query(
          `SELECT count(*)::int total FROM stock_movements WHERE organization_id=$1 AND type='adjustment' AND occurred_at >= (date_trunc('day',now() AT TIME ZONE 'Africa/Lagos')-interval '1 day') AT TIME ZONE 'Africa/Lagos' AND occurred_at < date_trunc('day',now() AT TIME ZONE 'Africa/Lagos') AT TIME ZONE 'Africa/Lagos'`,
          [owner.organization_id],
        ),
        client.query(
          `SELECT si.product_name FROM sale_items si JOIN sales s ON s.id=si.sale_id WHERE s.organization_id=$1 AND s.status='completed' AND ${bounds} GROUP BY si.product_name ORDER BY sum(si.quantity) DESC LIMIT 1`,
          [owner.organization_id],
        ),
      ]);
      const metric = sales.rows[0],
        expenseTotal = Number(expenses.rows[0].total);
      await queueEmail(client, {
        organizationId: owner.organization_id,
        recipientUserId: owner.user_id,
        recipientEmail: owner.email,
        event: "owner.daily_briefing",
        payload: {
          businessName: owner.business_name,
          revenue: metric.revenue,
          netProfit: Number(metric.gross_profit) - expenseTotal,
          transactions: metric.transactions,
          lowStock: stock.rows[0].total,
          adjustments: adjustments.rows[0].total,
          topProduct: top.rows[0]?.product_name,
          url: `${process.env.APP_URL || "https://oikonos.onrender.com"}/reports`,
        },
        deduplicationKey: `owner.daily_briefing:${owner.organization_id}:${briefingDate}`,
      });
    }
  });
}

export function startBriefingWorker() {
  if (timer) return;
  timer = setInterval(() => void queueDailyOwnerBriefings(), 60 * 60_000);
  timer.unref();
  void queueDailyOwnerBriefings();
}
