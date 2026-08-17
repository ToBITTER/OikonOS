import type { NotificationEvent } from "./events.js";

const esc = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>'"]/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      })[character]!,
  );

const money = (value: unknown, currency = "NGN") =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);

const detailRow = (label: string, value: unknown) => `
  <tr>
    <td style="padding:10px 0;color:#697386;font-size:13px;line-height:20px">${esc(label)}</td>
    <td align="right" style="padding:10px 0;color:#16224A;font-size:13px;line-height:20px;font-weight:700">${esc(value)}</td>
  </tr>`;

const metric = (label: string, value: unknown, color = "#1E3A8A") => `
  <td width="50%" style="padding:6px">
    <div style="background:#F7F9FD;border:1px solid #E4EAF5;border-radius:12px;padding:16px">
      <div style="color:#697386;font-size:11px;line-height:16px;text-transform:uppercase;letter-spacing:.08em">${esc(label)}</div>
      <div style="color:${color};font-size:20px;line-height:28px;font-weight:800;margin-top:4px">${esc(value)}</div>
    </div>
  </td>`;

export function renderEmail(event: NotificationEvent, p: any) {
  const businessName = String(p.businessName || "Your business")
    .replace(/[\r\n]+/g, " ")
    .trim();
  const business = esc(businessName);
  let subject = "";
  let heading = "";
  let body = "";
  let label = "Business activity";
  let symbol = "O";
  let accent = "#F9C321";
  let action: string | undefined;
  let actionLabel = "Review in OikonOS";
  let details = "";

  switch (event) {
    case "auth.verify_email":
      subject = `${businessName}: verify your OikonOS email`;
      heading = "Verify your email address";
      body = `Confirm this email address to securely access ${business}.`;
      label = "Account security";
      symbol = "✓";
      action = p.url;
      actionLabel = "Verify email address";
      break;
    case "auth.password_reset":
      subject = `${businessName}: reset your OikonOS password`;
      heading = "Reset your password";
      body = "We received a request to choose a new password. This secure link is intended only for you.";
      label = "Account security";
      symbol = "↗";
      action = p.url;
      actionLabel = "Choose a new password";
      details = `<div style="margin-top:18px;padding:14px 16px;background:#FFF8E0;border-left:3px solid #F9C321;border-radius:8px;color:#5E4B0B;font-size:13px;line-height:20px">Didn’t request this? You can safely ignore this email.</div>`;
      break;
    case "auth.password_changed":
      subject = `${businessName}: your OikonOS password was changed`;
      heading = "Password changed successfully";
      body = `The password protecting your ${business} account has just been updated.`;
      label = "Account security";
      symbol = "✓";
      details = `<div style="margin-top:18px;padding:14px 16px;background:#FFF0F0;border-left:3px solid #D64545;border-radius:8px;color:#812626;font-size:13px;line-height:20px">If this wasn’t you, contact your administrator immediately.</div>`;
      break;
    case "auth.new_login":
      subject = `${businessName}: new sign-in to OikonOS`;
      heading = "New sign-in detected";
      body = `A user signed in to the OikonOS workspace for ${business}.`;
      label = "Security alert";
      symbol = "↗";
      details = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:20px;border-top:1px solid #E4EAF5;border-bottom:1px solid #E4EAF5">${detailRow("Time", p.time || "Not available")}${detailRow("IP address", p.ip || "Unknown")}</table>`;
      break;
    case "sale.completed":
      subject = `${businessName}: sale ${String(p.number || "")} completed`;
      heading = "A sale was completed";
      body = `${esc(p.sellerName || "A staff member")} recorded a new sale for ${business}.`;
      label = "Sales update";
      symbol = "₦";
      action = p.url;
      actionLabel = "View sale details";
      details = `<div style="margin-top:20px;background:#EEF3FC;border-radius:14px;padding:20px;text-align:center"><div style="color:#64718B;font-size:11px;text-transform:uppercase;letter-spacing:.1em">Sale total</div><div style="color:#1E3A8A;font-size:30px;line-height:40px;font-weight:800;margin-top:3px">${esc(money(p.total, p.currency))}</div></div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:12px">${detailRow("Receipt", p.number || "—")}${detailRow("Payment", String(p.payment || "Not recorded").toUpperCase())}${detailRow("Seller", p.sellerName || "Not recorded")}</table>`;
      break;
    case "inventory.adjusted":
      subject = `${businessName}: stock adjusted for ${String(p.productName || "a product")}`;
      heading = "Stock adjustment recorded";
      body = `${esc(p.actorName || "A staff member")} updated the recorded quantity of ${esc(p.productName || "a product")}.`;
      label = "Inventory update";
      symbol = "↕";
      action = p.url;
      details = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:20px;border-top:1px solid #E4EAF5;border-bottom:1px solid #E4EAF5">${detailRow("Previous stock", p.previousStock)}${detailRow("New stock", p.newStock)}${detailRow("Reason", p.reason || "Not provided")}</table>`;
      break;
    case "inventory.imported":
      subject = `${businessName}: stock import completed`;
      heading = "Your stock import is complete";
      body = `${esc(p.actorName || "A staff member")} completed a product import for ${business}.`;
      label = "Inventory update";
      symbol = "↓";
      action = p.url;
      details = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:20px"><tr>${metric("Rows processed", p.rows)}${metric("Products created", p.created)}</tr><tr>${metric("Products updated", p.updated)}${metric("Status", "Complete", "#247A52")}</tr></table>`;
      break;
    case "inventory.low_stock":
    case "inventory.out_of_stock": {
      const outOfStock = event === "inventory.out_of_stock";
      subject = `${businessName}: ${String(p.productName || "Product")} ${outOfStock ? "is out of stock" : "is running low"}`;
      heading = outOfStock ? "A product is out of stock" : "A product is running low";
      body = `${esc(p.productName || "This product")} needs your attention at ${business}.`;
      label = "Stock attention";
      symbol = "!";
      accent = outOfStock ? "#EE6969" : "#F9C321";
      action = p.url;
      actionLabel = "Review inventory";
      details = `<div style="margin-top:20px;background:#FFF8E0;border-radius:14px;padding:20px;text-align:center"><div style="color:#6C5A19;font-size:11px;text-transform:uppercase;letter-spacing:.1em">Units available</div><div style="color:#5E4B0B;font-size:30px;line-height:40px;font-weight:800;margin-top:3px">${esc(p.stock)}</div></div>`;
      break;
    }
    case "inventory.anomaly":
      subject = `${businessName}: unusual stock movement for ${String(p.productName || "a product")}`;
      heading = "Unusual stock movement detected";
      body = esc(p.message || "OikonOS detected inventory activity that may require review.");
      label = "Inventory alert";
      symbol = "!";
      accent = "#EE6969";
      action = p.url;
      actionLabel = "Inspect activity";
      break;
    case "member.invited":
      subject = `You’re invited to join ${businessName} on OikonOS`;
      heading = `Welcome to ${business}`;
      body = `${esc(p.inviterName || "An administrator")} invited you to work with ${business} on OikonOS.`;
      label = "Staff invitation";
      symbol = "+";
      action = p.url;
      actionLabel = "Set up my account";
      details = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:20px;border-top:1px solid #E4EAF5;border-bottom:1px solid #E4EAF5">${detailRow("Business", businessName)}${detailRow("Your role", p.role || "Staff")}${detailRow("Invite expires", "In 48 hours")}</table>`;
      break;
    case "owner.daily_briefing":
      subject = `${businessName}: yesterday’s business briefing`;
      heading = `Good morning from ${business}`;
      body = "Here’s a clear snapshot of yesterday’s performance and what may need your attention today.";
      label = "Daily owner briefing";
      symbol = "☀";
      action = p.url;
      actionLabel = "Open full overview";
      details = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:20px"><tr>${metric("Revenue", money(p.revenue))}${metric("Net profit", money(p.netProfit), "#247A52")}</tr><tr>${metric("Transactions", p.transactions)}${metric("Stock attention", p.lowStock, Number(p.lowStock) > 0 ? "#B46A16" : "#247A52")}</tr></table><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:12px;border-top:1px solid #E4EAF5">${detailRow("Top-selling product", p.topProduct || "Not yet available")}${detailRow("Stock adjustments", p.adjustments || 0)}</table>`;
      break;
    default:
      subject = `${businessName}: OikonOS activity notification`;
      heading = "Business activity recorded";
      body = esc(p.message || `Activity was recorded for ${businessName}.`);
      action = p.url;
  }

  const button = action
    ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin-top:26px"><tr><td bgcolor="#1E3A8A" style="border-radius:9px"><a href="${esc(action)}" style="display:inline-block;padding:13px 20px;color:#FFFFFF;text-decoration:none;font-size:14px;line-height:20px;font-weight:700">${esc(actionLabel)} &nbsp;→</a></td></tr></table>`
    : "";
  const preheader = `${heading} — ${businessName}`;

  return {
    subject,
    text: `${businessName} · ${label}\n\n${heading}\n\n${body.replace(/<[^>]*>/g, "")}${action ? `\n\n${actionLabel}: ${action}` : ""}\n\nSent securely by OikonOS.`,
    html: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <title>${esc(subject)}</title>
  <style>@media only screen and (max-width:620px){.email-shell{width:100%!important;border-radius:0!important}.email-pad{padding-left:22px!important;padding-right:22px!important}.brand-cell{display:block!important;width:100%!important}.business-cell{display:block!important;width:100%!important;text-align:left!important;padding-top:16px!important}.metric-cell{display:block!important;width:100%!important}}</style>
</head>
<body style="margin:0;padding:0;background:#F1F4F9;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#16224A">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F1F4F9">
    <tr><td align="center" style="padding:28px 12px">
      <table role="presentation" width="620" cellspacing="0" cellpadding="0" class="email-shell" style="width:620px;max-width:620px;background:#FFFFFF;border:1px solid #DFE6F1;border-radius:18px;overflow:hidden;box-shadow:0 8px 30px rgba(30,58,138,.08)">
        <tr><td class="email-pad" style="padding:26px 32px;background:#172F72;border-bottom:4px solid ${accent}">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
            <td class="brand-cell" style="vertical-align:middle">
              <table role="presentation" cellspacing="0" cellpadding="0"><tr>
                <td align="center" valign="middle" style="width:40px;height:40px;background:#F9C321;border-radius:11px;color:#172F72;font-size:21px;font-weight:900">O</td>
                <td style="padding-left:12px;color:#FFFFFF"><div style="font-size:20px;line-height:24px;font-weight:800;letter-spacing:-.02em">OikonOS</div><div style="font-size:10px;line-height:15px;color:#BFCDF0;text-transform:uppercase;letter-spacing:.12em">Business control</div></td>
              </tr></table>
            </td>
            <td align="right" class="business-cell" style="vertical-align:middle"><span style="display:inline-block;max-width:240px;padding:7px 11px;border:1px solid rgba(255,255,255,.22);border-radius:999px;color:#FFFFFF;font-size:11px;line-height:16px;font-weight:700">${business}</span></td>
          </tr></table>
        </td></tr>
        <tr><td class="email-pad" style="padding:38px 36px 34px">
          <table role="presentation" cellspacing="0" cellpadding="0"><tr>
            <td align="center" valign="middle" style="width:38px;height:38px;background:${accent};border-radius:10px;color:#172F72;font-size:18px;line-height:38px;font-weight:900">${symbol}</td>
            <td style="padding-left:12px;color:#63708A;font-size:11px;line-height:16px;font-weight:800;text-transform:uppercase;letter-spacing:.12em">${esc(label)}</td>
          </tr></table>
          <h1 style="margin:20px 0 10px;color:#16224A;font-size:28px;line-height:36px;font-weight:800;letter-spacing:-.025em">${heading}</h1>
          <p style="margin:0;color:#59657A;font-size:15px;line-height:25px">${body}</p>
          ${details}
          ${button}
        </td></tr>
        <tr><td class="email-pad" style="padding:22px 36px;background:#F8FAFD;border-top:1px solid #E4EAF5">
          <p style="margin:0 0 5px;color:#4F5C73;font-size:12px;line-height:18px;font-weight:700">Built to keep ${business} in control.</p>
          <p style="margin:0;color:#8A94A7;font-size:11px;line-height:17px">This is an automated activity message sent securely by OikonOS.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  };
}
