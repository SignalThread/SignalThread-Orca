const EMAIL_PATTERN = /^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/;

function requireEmail(value: string, label: string) {
  const email = String(value ?? "").trim();
  if (!EMAIL_PATTERN.test(email)) throw new Error(`${label} email is invalid.`);
  return email;
}

function requireHeaderValue(value: string, label: string) {
  const normalized = String(value ?? "").trim();
  if (!normalized || /[\r\n]/.test(normalized)) throw new Error(`${label} is invalid.`);
  return normalized;
}

function wrapBase64(value: string) {
  return value.match(/.{1,76}/g)?.join("\r\n") ?? "";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function plainTextHtml(value: string) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1f2937;white-space:pre-wrap">${escapeHtml(value)}</div>`;
}

export function buildGmailMimeMessage(input: {
  senderEmail: string;
  recipientEmail: string;
  subject: string;
  body: string;
}) {
  const senderEmail = requireEmail(input.senderEmail, "Sender");
  const recipientEmail = requireEmail(input.recipientEmail, "Recipient");
  const subject = requireHeaderValue(input.subject, "Subject");
  const body = String(input.body ?? "").replace(/\r?\n/g, "\r\n");
  if (!body.trim()) throw new Error("Body is required.");

  const encodedSubject = Buffer.from(subject, "utf8").toString("base64");
  const boundary = `=_signal_thread_${Buffer.from(`${senderEmail}:${recipientEmail}:${subject}`).toString("base64url").slice(0, 32)}`;
  const encodedBody = wrapBase64(Buffer.from(body, "utf8").toString("base64"));
  const encodedHtml = wrapBase64(Buffer.from(plainTextHtml(body), "utf8").toString("base64"));
  const mime = [
    `From: <${senderEmail}>`,
    `To: <${recipientEmail}>`,
    `Subject: =?UTF-8?B?${encodedSubject}?=`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary=\"${boundary}\"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    encodedBody,
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    encodedHtml,
    `--${boundary}--`
  ].join("\r\n");

  return Buffer.from(mime, "utf8").toString("base64url");
}
