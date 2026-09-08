import "server-only";

import type { EmailProviderSendResult } from "@/lib/integrations/email/types";

export const MICROSOFT_SEND_MAIL_ENDPOINT = "https://graph.microsoft.com/v1.0/me/sendMail";
const MICROSOFT_MAIL_TIMEOUT_MS = 15_000;

function retryAfterSeconds(response: Response) {
  const raw = response.headers.get("retry-after");
  if (!raw || !/^\d+$/.test(raw.trim())) return null;
  return Math.min(Number(raw), 86_400);
}

export async function sendMicrosoftMail(input: {
  accessToken: string;
  recipientEmail: string;
  subject: string;
  body: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}): Promise<EmailProviderSendResult> {
  let response: Response;
  try {
    response = await (input.fetchImpl ?? fetch)(MICROSOFT_SEND_MAIL_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: {
          subject: input.subject,
          body: { contentType: "Text", content: input.body },
          toRecipients: [{ emailAddress: { address: input.recipientEmail } }]
        },
        saveToSentItems: true
      }),
      cache: "no-store",
      signal: input.signal ?? AbortSignal.timeout(MICROSOFT_MAIL_TIMEOUT_MS)
    });
  } catch {
    return { ok: false, outcome: "unknown", category: "unknown_outcome", status: null };
  }

  if (response.status === 202) {
    return {
      ok: true,
      providerMessageId: null,
      providerThreadId: null,
      status: response.status
    };
  }
  if (response.status === 401) {
    return { ok: false, outcome: "failed", category: "provider_unauthorized", status: 401 };
  }
  if (response.status === 403) {
    return { ok: false, outcome: "failed", category: "provider_permission_denied", status: 403 };
  }
  if (response.status === 429) {
    return {
      ok: false,
      outcome: "failed",
      category: "provider_throttled",
      status: 429,
      retryAfterSeconds: retryAfterSeconds(response)
    };
  }
  if (response.status >= 500) {
    return { ok: false, outcome: "unknown", category: "provider_unavailable", status: response.status };
  }
  if (!response.ok) {
    return { ok: false, outcome: "failed", category: "provider_rejected", status: response.status };
  }
  return { ok: false, outcome: "unknown", category: "unknown_outcome", status: response.status };
}
