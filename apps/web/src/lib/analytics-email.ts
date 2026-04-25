import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM = "AccessAudit <noreply@accessaudit.com>";

interface DailyAnalytics {
  date: string;
  totalViews: number;
  uniqueVisitors: number;
  topPages: { path: string; views: number }[];
  topReferrers: { referrer: string; count: number }[];
  previousDayViews: number;
  previousDayUnique: number;
}

function formatChange(current: number, previous: number): string {
  if (previous === 0) return current > 0 ? "New!" : "—";
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct > 0) return `↑ ${pct}%`;
  if (pct < 0) return `↓ ${Math.abs(pct)}%`;
  return "→ 0%";
}

export async function sendAnalyticsDigest(
  to: string,
  data: DailyAnalytics
) {
  const viewsChange = formatChange(data.totalViews, data.previousDayViews);
  const uniqueChange = formatChange(
    data.uniqueVisitors,
    data.previousDayUnique
  );

  const topPagesHtml = data.topPages
    .map(
      (p) =>
        `<tr><td style="padding:6px 12px;border-bottom:1px solid #eee;">${p.path}</td><td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:right;">${p.views}</td></tr>`
    )
    .join("");

  const topReferrersHtml = data.topReferrers
    .map(
      (r) =>
        `<tr><td style="padding:6px 12px;border-bottom:1px solid #eee;">${r.referrer}</td><td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:right;">${r.count}</td></tr>`
    )
    .join("");

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:linear-gradient(135deg,#3b82f6,#8b5cf6);padding:24px;border-radius:12px 12px 0 0;">
        <h1 style="color:white;margin:0;font-size:20px;">AccessAudit Daily Analytics</h1>
        <p style="color:rgba(255,255,255,0.8);margin:4px 0 0;font-size:14px;">${data.date}</p>
      </div>
      <div style="background:#fff;padding:24px;border:1px solid #e5e7eb;border-top:0;">
        <div style="display:flex;gap:24px;margin-bottom:24px;">
          <div style="flex:1;background:#f9fafb;padding:16px;border-radius:8px;text-align:center;">
            <div style="font-size:28px;font-weight:700;color:#111827;">${data.totalViews}</div>
            <div style="font-size:12px;color:#6b7280;">Page Views</div>
            <div style="font-size:12px;color:${viewsChange.startsWith("↑") ? "#059669" : viewsChange.startsWith("↓") ? "#dc2626" : "#6b7280"};margin-top:4px;">${viewsChange} vs yesterday</div>
          </div>
          <div style="flex:1;background:#f9fafb;padding:16px;border-radius:8px;text-align:center;">
            <div style="font-size:28px;font-weight:700;color:#111827;">${data.uniqueVisitors}</div>
            <div style="font-size:12px;color:#6b7280;">Unique Visitors</div>
            <div style="font-size:12px;color:${uniqueChange.startsWith("↑") ? "#059669" : uniqueChange.startsWith("↓") ? "#dc2626" : "#6b7280"};margin-top:4px;">${uniqueChange} vs yesterday</div>
          </div>
        </div>

        ${
          data.topPages.length > 0
            ? `<h3 style="font-size:14px;color:#374151;margin:0 0 8px;">Top Pages</h3>
        <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px;">
          <thead><tr><th style="padding:6px 12px;text-align:left;border-bottom:2px solid #e5e7eb;">Page</th><th style="padding:6px 12px;text-align:right;border-bottom:2px solid #e5e7eb;">Views</th></tr></thead>
          <tbody>${topPagesHtml}</tbody>
        </table>`
            : ""
        }

        ${
          data.topReferrers.length > 0
            ? `<h3 style="font-size:14px;color:#374151;margin:0 0 8px;">Top Referrers</h3>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead><tr><th style="padding:6px 12px;text-align:left;border-bottom:2px solid #e5e7eb;">Source</th><th style="padding:6px 12px;text-align:right;border-bottom:2px solid #e5e7eb;">Visits</th></tr></thead>
          <tbody>${topReferrersHtml}</tbody>
        </table>`
            : ""
        }
      </div>
      <div style="background:#f9fafb;padding:16px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;border-top:0;text-align:center;">
        <p style="margin:0;font-size:12px;color:#9ca3af;">Sent by AccessAudit Analytics</p>
      </div>
    </div>
  `;

  const subject = `AccessAudit Daily Analytics — ${data.date}`;

  if (!resend) {
    console.log(`[DEV] Analytics digest to ${to}: ${subject}`);
    console.log(
      `Views: ${data.totalViews}, Unique: ${data.uniqueVisitors}`
    );
    return;
  }

  await resend.emails.send({ from: FROM, to, subject, html });
}
