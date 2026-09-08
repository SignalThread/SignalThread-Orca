import "server-only";

const GMAIL_SEND_ENDPOINT = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

export type GmailSendResult =
  | { ok: true; messageId: string; threadId: string | null }
  | {
      ok: false;
      outcome: "failed" | "unknown";
      category: "provider_rejected" | "provider_unavailable" | "unknown_outcome";
      status: number | null;
    };

export async function sendGmailRawMessage(input: {
  accessToken: string;
  rawMessage: string;
  fetchImpl?: typeof fetch;
}): Promise<GmailSendResult> {
  let response: Response;
  try {
    response = await (input.fetchImpl ?? fetch)(GMAIL_SEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ raw: input.rawMessage }),
      cache: "no-store"
    });
  } catch {
    return { ok: false, outcome: "unknown", category: "unknown_outcome", status: null };
  }

  if (!response.ok) {
    return {
      ok: false,
      outcome: "failed",
      category: response.status >= 500 ? "provider_unavailable" : "provider_rejected",
      status: response.status
    };
  }

  const payload = (await response.json().catch(() => null)) as
    | { id?: unknown; threadId?: unknown }
    | null;
  const messageId = typeof payload?.id === "string" ? payload.id.trim() : "";
  if (!messageId) {
    return { ok: false, outcome: "unknown", category: "unknown_outcome", status: response.status };
  }
  const threadId = typeof payload?.threadId === "string" && payload.threadId.trim()
    ? payload.threadId.trim()
    : null;
  return { ok: true, messageId, threadId };
}
