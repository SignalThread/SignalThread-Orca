import "server-only";
import sgMail from "@sendgrid/mail";

export type SendCampaignMailResult = {
  providerMessageId: string | null;
  requestId: string | null;
};

/**
 * Single outbound campaign email via SendGrid (same stack as invites / document sends).
 */
export async function sendCampaignMailViaSendGrid(input: {
  to: string;
  subject: string;
  text: string;
}): Promise<SendCampaignMailResult> {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    throw new Error("Missing SENDGRID_API_KEY.");
  }

  const from = process.env.SENDGRID_FROM_EMAIL;
  if (!from) {
    throw new Error("Missing SENDGRID_FROM_EMAIL.");
  }

  const to = String(input.to ?? "").trim().toLowerCase();
  if (!to || !to.includes("@")) {
    throw new Error("Invalid recipient email.");
  }

  const subject = String(input.subject ?? "").trim();
  const text = String(input.text ?? "").trim();
  if (!subject) {
    throw new Error("Subject is required.");
  }
  if (!text) {
    throw new Error("Body is required.");
  }

  sgMail.setApiKey(apiKey);

  const [response] = await sgMail.send({
    to,
    from,
    subject,
    text
  });

  const headers = response?.headers ?? {};
  const providerMessageId =
    typeof headers["x-message-id"] === "string"
      ? headers["x-message-id"]
      : typeof headers["X-Message-Id"] === "string"
        ? (headers["X-Message-Id"] as string)
        : null;
  const requestId =
    typeof headers["x-request-id"] === "string"
      ? headers["x-request-id"]
      : typeof headers["X-Request-Id"] === "string"
        ? (headers["X-Request-Id"] as string)
        : null;

  return {
    providerMessageId,
    requestId
  };
}
