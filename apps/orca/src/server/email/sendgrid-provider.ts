/**
 * SendGrid email provider wrapper.
 *
 * This is the single place that talks to SendGrid. Business logic must never
 * call SendGrid directly; it goes through the EmailProvider abstraction. The
 * call is made with the global `fetch` against the SendGrid v3 Mail Send API so
 * no extra runtime dependency is required.
 *
 * Configuration comes from existing env conventions:
 *   - SENDGRID_API_KEY  (required to actually send)
 *   - EMAIL_FROM        (default From address)
 *   - EMAIL_REPLY_TO    (optional default Reply-To)
 *
 * When SENDGRID_API_KEY is absent we fall back to the StubEmailProvider so
 * local development and tests never make a real network call and never report a
 * fake success. Tests should inject their own provider rather than relying on
 * this resolver.
 */

import {
  StubEmailProvider,
  type EmailProvider,
  type EmailSendResult,
  type MarketingBatchResult,
  type MarketingBatchSend,
  type OutboundEmail,
} from "@/src/server/email/provider";

const SENDGRID_MAIL_SEND_URL = "https://api.sendgrid.com/v3/mail/send";

export type SendGridConfig = {
  apiKey: string;
  fromEmail: string;
  replyTo?: string | null;
};

export function readSendGridConfig(): SendGridConfig | null {
  const apiKey = process.env.SENDGRID_API_KEY?.trim();
  const fromEmail = process.env.EMAIL_FROM?.trim();
  if (!apiKey || !fromEmail) {
    return null;
  }
  const replyTo = process.env.EMAIL_REPLY_TO?.trim() || null;
  return { apiKey, fromEmail, replyTo };
}

type FetchLike = typeof fetch;

export class SendGridEmailProvider implements EmailProvider {
  readonly name = "sendgrid";

  private readonly config: SendGridConfig;
  private readonly fetchImpl: FetchLike;

  constructor(config: SendGridConfig, fetchImpl?: FetchLike) {
    this.config = config;
    this.fetchImpl = fetchImpl ?? fetch;
  }

  async send(message: OutboundEmail): Promise<EmailSendResult> {
    const result = await this.post({
      personalizations: [{ to: [{ email: message.to }] }],
      from: { email: this.config.fromEmail },
      ...(this.config.replyTo ? { reply_to: { email: this.config.replyTo } } : {}),
      subject: message.subject,
      content: [{ type: "text/plain", value: message.body }],
    });

    if (!result.ok) {
      return { status: "FAILED", detail: result.detail };
    }
    return { status: "SENT", detail: result.messageId };
  }

  async sendMarketingBatch(batch: MarketingBatchSend): Promise<MarketingBatchResult> {
    const content: Array<{ type: string; value: string }> = [];
    if (batch.text) content.push({ type: "text/plain", value: batch.text });
    if (batch.html) content.push({ type: "text/html", value: batch.html });
    if (content.length === 0) {
      // SendGrid requires at least one content part.
      content.push({ type: "text/plain", value: "" });
    }

    const result = await this.post({
      // One personalization per recipient keeps custom_args recipient-scoped so
      // webhook events can be mapped back to the exact frozen recipient row.
      personalizations: batch.recipients.map((recipient) => ({
        to: [{ email: recipient.to }],
        custom_args: {
          eventId: batch.eventId,
          emailSendId: batch.emailSendId,
          emailSendRecipientId: recipient.emailSendRecipientId,
        },
      })),
      from: { email: this.config.fromEmail },
      ...(batch.replyTo ? { reply_to: { email: batch.replyTo } } : {}),
      subject: batch.subject,
      content,
    });

    if (!result.ok) {
      return {
        sentCount: 0,
        failedCount: batch.recipients.length,
        skippedCount: 0,
        results: batch.recipients.map((recipient) => ({
          emailSendRecipientId: recipient.emailSendRecipientId,
          status: "FAILED" as const,
          detail: result.detail,
        })),
      };
    }

    return {
      batchId: result.messageId,
      sentCount: batch.recipients.length,
      failedCount: 0,
      skippedCount: 0,
      results: batch.recipients.map((recipient) => ({
        emailSendRecipientId: recipient.emailSendRecipientId,
        status: "SENT" as const,
        providerMessageId: result.messageId,
      })),
    };
  }

  private async post(
    body: Record<string, unknown>,
  ): Promise<{ ok: true; messageId?: string } | { ok: false; detail: string }> {
    try {
      const response = await this.fetchImpl(SENDGRID_MAIL_SEND_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        return { ok: false, detail: `SendGrid responded with status ${response.status}` };
      }

      const messageId = response.headers.get("x-message-id") ?? undefined;
      return { ok: true, messageId };
    } catch (error) {
      const detail = error instanceof Error ? error.message : "SendGrid request failed";
      return { ok: false, detail };
    }
  }
}

/**
 * Resolve the marketing email provider. Returns a real SendGrid provider when
 * configured, otherwise the stub. This is the production swap point; tests
 * inject a provider directly into the marketing service instead.
 */
export function getMarketingEmailProvider(): EmailProvider {
  const config = readSendGridConfig();
  if (!config) {
    return new StubEmailProvider();
  }
  return new SendGridEmailProvider(config);
}
