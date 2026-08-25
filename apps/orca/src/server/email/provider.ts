/**
 * Swappable outbound email provider interface.
 *
 * No email provider is configured for this app today, so the only
 * implementation is a stub that never sends anything. Reminder sends are
 * still recorded in SpeakerEmailLog with an explicit SKIPPED_NO_PROVIDER
 * status so planners can see exactly what was (not) delivered and why.
 *
 * To wire a real provider later, implement EmailProvider and return it from
 * getEmailProvider() based on configuration. Never log message bodies,
 * secrets, or tokens from inside a provider.
 */

export type OutboundEmail = {
  to: string;
  subject: string;
  body: string;
};

export type EmailSendStatus = "SENT" | "FAILED" | "SKIPPED_NO_PROVIDER";

export type EmailSendResult = {
  status: EmailSendStatus;
  detail?: string;
};

/**
 * One recipient inside a marketing batch send. `emailSendRecipientId` is the
 * frozen MarketingEmailSendRecipient row id and is echoed back in each result
 * (and passed to the provider as a custom arg) so later webhook events can map
 * provider events to the exact recipient row.
 */
export type MarketingOutboundRecipient = {
  emailSendRecipientId: string;
  to: string;
};

export type MarketingBatchSend = {
  eventId: string;
  emailSendId: string;
  subject: string;
  fromEmail: string;
  replyTo?: string | null;
  html?: string | null;
  text?: string | null;
  recipients: MarketingOutboundRecipient[];
};

export type MarketingPerRecipientResult = {
  emailSendRecipientId: string;
  status: EmailSendStatus;
  /** Provider-agnostic message id; the service maps it onto the schema column. */
  providerMessageId?: string;
  detail?: string;
};

export type MarketingBatchResult = {
  batchId?: string;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  results: MarketingPerRecipientResult[];
};

export interface EmailProvider {
  readonly name: string;
  send(message: OutboundEmail): Promise<EmailSendResult>;
  /**
   * Optional marketing batch send. The send service calls this; providers that
   * do not support marketing batches simply omit it and the service falls back
   * to the stub-equivalent skipped result.
   */
  sendMarketingBatch?(batch: MarketingBatchSend): Promise<MarketingBatchResult>;
}

class StubEmailProvider implements EmailProvider {
  readonly name = "stub";

  async send(): Promise<EmailSendResult> {
    return {
      status: "SKIPPED_NO_PROVIDER",
      detail: "No email provider configured; reminder recorded but not delivered",
    };
  }

  async sendMarketingBatch(batch: MarketingBatchSend): Promise<MarketingBatchResult> {
    return {
      sentCount: 0,
      failedCount: 0,
      skippedCount: batch.recipients.length,
      results: batch.recipients.map((recipient) => ({
        emailSendRecipientId: recipient.emailSendRecipientId,
        status: "SKIPPED_NO_PROVIDER" as const,
        detail: "No email provider configured; send recorded but not delivered",
      })),
    };
  }
}

export { StubEmailProvider };

const stubProvider = new StubEmailProvider();

export function getEmailProvider(): EmailProvider {
  // Swap point: inspect configuration here once a real provider exists.
  return stubProvider;
}
