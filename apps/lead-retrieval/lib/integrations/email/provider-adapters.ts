import "server-only";

import { buildGmailMimeMessage } from "@/lib/integrations/google/gmail-mime";
import { sendGmailRawMessage } from "@/lib/integrations/google/gmail-client";
import { getValidGoogleAccessTokenForUser } from "@/lib/integrations/google/token-manager";
import { sendMicrosoftMail } from "@/lib/integrations/microsoft/mail-client";
import { getValidMicrosoftAccessTokenForUser } from "@/lib/integrations/microsoft/token-manager";
import type {
  EmailProviderConnection,
  EmailProviderSendResult
} from "@/lib/integrations/email/types";

export type EmailAdapterInput = {
  connection: EmailProviderConnection;
  userId: string;
  companyId: string;
  recipientEmail: string;
  subject: string;
  body: string;
};

type AccessTokenResult = Awaited<ReturnType<typeof getValidMicrosoftAccessTokenForUser>>;
type GoogleAccessTokenResult = Awaited<ReturnType<typeof getValidGoogleAccessTokenForUser>>;

export type GoogleEmailAdapterDependencies = {
  getAccessToken(input: { userId: string; companyId: string }): Promise<GoogleAccessTokenResult>;
  sendRaw(input: { accessToken: string; rawMessage: string }): Promise<Awaited<ReturnType<typeof sendGmailRawMessage>>>;
};

export type MicrosoftEmailAdapterDependencies = {
  getAccessToken(input: {
    userId: string;
    companyId: string;
    forceRefresh?: boolean;
  }): Promise<AccessTokenResult>;
  sendMail(input: {
    accessToken: string;
    recipientEmail: string;
    subject: string;
    body: string;
  }): Promise<EmailProviderSendResult>;
};

function tokenFailure(reason: string): EmailProviderSendResult {
  const reconnectRequired = reason === "missing_connection" || reason === "reconnect_required";
  return {
    ok: false,
    outcome: "failed",
    category: reconnectRequired ? "reconnect_required" : "provider_unavailable",
    status: null,
    reconnectRequired
  };
}

export async function sendWithGoogleAdapterWithDependencies(
  input: EmailAdapterInput,
  dependencies: GoogleEmailAdapterDependencies
): Promise<EmailProviderSendResult> {
  let rawMessage: string;
  try {
    rawMessage = buildGmailMimeMessage({
      senderEmail: input.connection.senderEmail,
      recipientEmail: input.recipientEmail,
      subject: input.subject,
      body: input.body
    });
  } catch {
    return { ok: false, outcome: "failed", category: "provider_rejected", status: null };
  }
  const token = await dependencies.getAccessToken({
    userId: input.userId,
    companyId: input.companyId
  });
  if (!token.ok) return tokenFailure(token.reason);
  const result = await dependencies.sendRaw({ accessToken: token.accessToken, rawMessage });
  return result.ok
    ? {
        ok: true,
        providerMessageId: result.messageId,
        providerThreadId: result.threadId,
        status: 200
      }
    : result;
}

export function sendWithGoogleAdapter(input: EmailAdapterInput) {
  return sendWithGoogleAdapterWithDependencies(input, {
    getAccessToken: getValidGoogleAccessTokenForUser,
    sendRaw: sendGmailRawMessage
  });
}

export async function sendWithMicrosoftAdapterWithDependencies(
  input: EmailAdapterInput,
  dependencies: MicrosoftEmailAdapterDependencies
): Promise<EmailProviderSendResult> {
  const firstToken = await dependencies.getAccessToken({
    userId: input.userId,
    companyId: input.companyId
  });
  if (!firstToken.ok) return tokenFailure(firstToken.reason);

  const first = await dependencies.sendMail({
    accessToken: firstToken.accessToken,
    recipientEmail: input.recipientEmail,
    subject: input.subject,
    body: input.body
  });
  if (first.ok || first.status !== 401) return first;

  // A 401 is a definitive provider rejection, so refreshing and retrying once
  // cannot duplicate an accepted message. No other send failure is retried.
  const refreshed = await dependencies.getAccessToken({
    userId: input.userId,
    companyId: input.companyId,
    forceRefresh: true
  });
  if (!refreshed.ok) return tokenFailure(refreshed.reason);
  return dependencies.sendMail({
    accessToken: refreshed.accessToken,
    recipientEmail: input.recipientEmail,
    subject: input.subject,
    body: input.body
  });
}

export function sendWithMicrosoftAdapter(input: EmailAdapterInput) {
  return sendWithMicrosoftAdapterWithDependencies(input, {
    getAccessToken: getValidMicrosoftAccessTokenForUser,
    sendMail: sendMicrosoftMail
  });
}

export function sendWithSelectedEmailProvider(input: EmailAdapterInput) {
  return input.connection.provider === "google_workspace"
    ? sendWithGoogleAdapter(input)
    : sendWithMicrosoftAdapter(input);
}
