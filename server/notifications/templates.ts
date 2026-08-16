import type { NotificationEvent } from "./events.js";
const esc = (v: unknown) =>
  String(v ?? "").replace(
    /[&<>'"]/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        c
      ]!,
  );
const money = (n: unknown, currency = "NGN") =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(n) || 0);
export function renderEmail(event: NotificationEvent, p: any) {
  const business = esc(p.businessName || "your business");
  let subject = "",
    heading = "",
    body = "",
    action: string | undefined;
  switch (event) {
    case "auth.verify_email":
      subject = "Verify your OikonOS email";
      heading = "Verify your email address";
      body = "Confirm this email address to secure your OikonOS account.";
      action = p.url;
      break;
    case "auth.password_reset":
      subject = "Reset your OikonOS password";
      heading = "Password reset requested";
      body =
        "Use the secure link below to choose a new password. If you did not request this, no action is required.";
      action = p.url;
      break;
    case "auth.password_changed":
      subject = "Your OikonOS password was changed";
      heading = "Password changed";
      body =
        "Your password was changed successfully. If this was not you, contact your administrator immediately.";
      break;
    case "auth.new_login":
      subject = "New sign-in to OikonOS";
      heading = "New sign-in detected";
      body = `A new sign-in occurred at ${esc(p.time)} from ${esc(p.ip || "an unknown address")}.`;
      break;
    case "sale.completed":
      subject = `Sale ${esc(p.number)} completed`;
      heading = "Sale completed";
      body = `${esc(p.sellerName)} recorded a ${esc(p.payment).toUpperCase()} sale of ${money(p.total, p.currency)} for ${business}.`;
      action = p.url;
      break;
    case "inventory.adjusted":
      subject = `Stock adjusted: ${esc(p.productName)}`;
      heading = "Stock adjustment recorded";
      body = `${esc(p.actorName)} changed stock from ${esc(p.previousStock)} to ${esc(p.newStock)}. Reason: ${esc(p.reason)}.`;
      action = p.url;
      break;
    case "inventory.imported":
      subject = "Stock import completed";
      heading = "Stock import completed";
      body = `${esc(p.actorName)} imported ${esc(p.rows)} rows. ${esc(p.created)} products were created and ${esc(p.updated)} updated.`;
      action = p.url;
      break;
    case "inventory.low_stock":
    case "inventory.out_of_stock":
      subject = `Stock attention: ${esc(p.productName)}`;
      heading =
        event === "inventory.out_of_stock"
          ? "Product is out of stock"
          : "Product is running low";
      body = `${esc(p.productName)} now has ${esc(p.stock)} units available.`;
      action = p.url;
      break;
    case "inventory.anomaly":
      subject = `Unusual stock movement: ${esc(p.productName)}`;
      heading = "Unusual stock movement detected";
      body = esc(p.message);
      action = p.url;
      break;
    case "member.invited":
      subject = `You were invited to ${business} on OikonOS`;
      heading = "Set up your staff account";
      body = `${esc(p.inviterName)} invited you to join ${business} as ${esc(p.role)}. This secure setup link expires in 48 hours.`;
      action = p.url;
      break;
    case "owner.daily_briefing":
      subject = `${business}: yesterday's business briefing`;
      heading = "Your daily owner briefing";
      body = `Yesterday: ${money(p.revenue)} revenue, ${money(p.netProfit)} net profit, and ${esc(p.transactions)} completed transactions. ${esc(p.lowStock)} products need stock attention, ${esc(p.adjustments)} stock adjustments were recorded, and the top-selling product was ${esc(p.topProduct || "not yet available")}.`;
      action = p.url;
      break;
    default:
      subject = "OikonOS activity notification";
      heading = "Business activity recorded";
      body = esc(p.message || `Activity was recorded for ${business}.`);
      action = p.url;
  }
  const button = action
    ? `<a href="${esc(action)}" style="display:inline-block;background:#1E3A8A;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;margin-top:18px">Review in OikonOS</a>`
    : "";
  return {
    subject,
    text: `${heading}\n\n${body}${action ? `\n\n${action}` : ""}`,
    html: `<!doctype html><html><body style="margin:0;background:#F5F7FB;font-family:Inter,Arial,sans-serif;color:#141B2E"><div style="max-width:600px;margin:32px auto;background:#fff;border:1px solid #E3E9F3;border-radius:14px;overflow:hidden"><div style="background:#1E3A8A;color:#fff;padding:24px 30px;font-size:21px;font-weight:700">OikonOS</div><div style="padding:32px 30px"><div style="color:#7B9DD8;font-size:11px;letter-spacing:.12em">BUSINESS ACTIVITY</div><h1 style="font-size:25px;margin:10px 0 14px">${heading}</h1><p style="color:#596174;line-height:1.7">${body}</p>${button}</div><div style="border-top:1px solid #E3E9F3;padding:18px 30px;color:#8B92A3;font-size:11px">Sent securely by OikonOS.</div></div></body></html>`,
  };
}
