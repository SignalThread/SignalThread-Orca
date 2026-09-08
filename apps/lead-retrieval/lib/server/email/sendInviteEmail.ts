import "server-only";
import sgMail from "@sendgrid/mail";

type SendInviteEmailInput = {
  to: string;
  code: string;
  eventName?: string;
};

export async function sendInviteEmail({ to, code, eventName }: SendInviteEmailInput) {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    throw new Error("Missing SENDGRID_API_KEY.");
  }

  const from = process.env.SENDGRID_FROM_EMAIL;
  if (!from) {
    throw new Error("Missing SENDGRID_FROM_EMAIL.");
  }

  const normalizedTo = String(to ?? "").trim().toLowerCase();
  if (!normalizedTo) {
    throw new Error("Invite recipient email is required.");
  }

  const normalizedCode = String(code ?? "").trim();
  if (!/^\d{6}$/.test(normalizedCode)) {
    throw new Error("Invite code must be a 6-digit numeric code.");
  }

  sgMail.setApiKey(apiKey);

  const scopeText = eventName?.trim()
    ? `for ${eventName.trim()}`
    : "for SignalThread Scan";

  await sgMail.send({
    to: normalizedTo,
    from,
    subject: "Your SignalThread Scan invite code",
    text:
      `You have been invited ${scopeText}.\n\n` +
      `Your 6-digit invite code: ${normalizedCode}\n\n` +
      "Log into the app with your email, then enter this code.",
    html:
      `<p>You have been invited ${scopeText}.</p>` +
      `<p><strong>Your 6-digit invite code: ${normalizedCode}</strong></p>` +
      "<p>Log into the app with your email, then enter this code.</p>"
  });
}

export type CompanyAppUserInviteEmailItem = {
  eventName: string;
  code: string;
};

/**
 * One email listing every 6-digit booth/app invite code (one row per event).
 * Matches {@link sendInviteEmail} transport and copy tone for the mobile redeem flow.
 */
export async function sendCompanyTeamAppUserInviteEmail(input: {
  to: string;
  items: ReadonlyArray<CompanyAppUserInviteEmailItem>;
}) {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    throw new Error("Missing SENDGRID_API_KEY.");
  }

  const from = process.env.SENDGRID_FROM_EMAIL;
  if (!from) {
    throw new Error("Missing SENDGRID_FROM_EMAIL.");
  }

  const normalizedTo = String(input.to ?? "").trim().toLowerCase();
  if (!normalizedTo) {
    throw new Error("Invite recipient email is required.");
  }

  const items = [...input.items];
  if (items.length === 0) {
    throw new Error("At least one invite code is required.");
  }

  for (const it of items) {
    const c = String(it.code ?? "").trim();
    if (!/^\d{6}$/.test(c)) {
      throw new Error("Invite code must be a 6-digit numeric code.");
    }
  }

  sgMail.setApiKey(apiKey);

  const textLines = items.map((it) => {
    const name = String(it.eventName ?? "").trim() || "Event";
    return `${name}: ${String(it.code).trim()}`;
  });
  const htmlRows = items
    .map((it) => {
      const name = String(it.eventName ?? "").trim() || "Event";
      return `<tr><td style="padding:6px 12px;border:1px solid #e2e8f0">${escapeHtml(name)}</td><td style="padding:6px 12px;border:1px solid #e2e8f0;font-weight:700;font-family:monospace">${escapeHtml(String(it.code).trim())}</td></tr>`;
    })
    .join("");

  const recoveryText =
    "If you already created an account, sign in with this email. " +
    "If you forgot your password, use Reset password.";
  const recoveryHtml =
    "<p style=\"color:#334155;font-size:13px\">If you already created an account, sign in with this email. " +
    "If you forgot your password, use <strong>Reset password</strong>.</p>";

  await sgMail.send({
    to: normalizedTo,
    from,
    subject: "Your SignalThread Scan invite code(s)",
    text:
      "You have been invited as booth/app staff. Log into the mobile app with this email, then enter the code for each event.\n\n" +
      textLines.join("\n") +
      "\n\nEach code is valid for one event. Codes expire in 7 days.\n\n" +
      recoveryText,
    html:
      "<p>You have been invited as booth/app staff. Log into the <strong>mobile app</strong> with this email, then enter the code for each event.</p>" +
      "<table cellpadding=\"0\" cellspacing=\"0\" style=\"border-collapse:collapse;margin:12px 0\">" +
      "<thead><tr><th style=\"text-align:left;padding:6px 12px;border:1px solid #e2e8f0\">Event</th><th style=\"text-align:left;padding:6px 12px;border:1px solid #e2e8f0\">6-digit code</th></tr></thead>" +
      "<tbody>" +
      htmlRows +
      "</tbody></table>" +
      "<p style=\"color:#64748b;font-size:13px\">Each code is valid for one event. Codes expire in 7 days.</p>" +
      recoveryHtml
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
