import assert from "node:assert/strict";
import test from "node:test";
import { StubEmailProvider, type MarketingBatchSend } from "@/src/server/email/provider";
import {
  getMarketingEmailProvider,
  readSendGridConfig,
  SendGridEmailProvider,
} from "@/src/server/email/sendgrid-provider";

const batch: MarketingBatchSend = {
  eventId: "11111111-1111-4111-8111-111111111111",
  emailSendId: "22222222-2222-4222-8222-222222222222",
  subject: "Hello",
  fromEmail: "from@example.com",
  replyTo: "reply@example.com",
  html: "<p>Hi</p>",
  text: "Hi",
  recipients: [
    { emailSendRecipientId: "aaaa1111-1111-4111-8111-111111111111", to: "a@example.com" },
    { emailSendRecipientId: "bbbb2222-2222-4222-8222-222222222222", to: "b@example.com" },
  ],
};

function fakeResponse(ok: boolean, status: number, messageId?: string): Response {
  return {
    ok,
    status,
    headers: { get: (key: string) => (key.toLowerCase() === "x-message-id" ? messageId ?? null : null) },
  } as unknown as Response;
}

test("stub provider marks every marketing recipient as skipped (no fake success)", async () => {
  const provider = new StubEmailProvider();
  const result = await provider.sendMarketingBatch(batch);
  assert.equal(result.sentCount, 0);
  assert.equal(result.skippedCount, 2);
  assert.ok(result.results.every((r) => r.status === "SKIPPED_NO_PROVIDER"));
});

test("SendGrid provider sends one request with recipient-scoped custom args and marks SENT on success", async () => {
  const captured: { url: string; body: { personalizations: Array<{ custom_args: Record<string, string> }>; reply_to: { email: string } } }[] = [];
  const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
    captured.push({
      url: String(url),
      body: JSON.parse(String(init?.body)) as { personalizations: Array<{ custom_args: Record<string, string> }>; reply_to: { email: string } },
    });
    return fakeResponse(true, 202, "sg-batch-123");
  }) as unknown as typeof fetch;

  const provider = new SendGridEmailProvider({ apiKey: "key", fromEmail: "from@example.com" }, fakeFetch);
  const result = await provider.sendMarketingBatch(batch);

  assert.equal(captured.length, 1, "fetch was called once");
  assert.equal(captured[0].body.personalizations.length, 2);
  assert.equal(captured[0].body.reply_to.email, batch.replyTo);
  assert.deepEqual(captured[0].body.personalizations[0].custom_args, {
    eventId: batch.eventId,
    emailSendId: batch.emailSendId,
    emailSendRecipientId: batch.recipients[0].emailSendRecipientId,
  });
  assert.equal(result.batchId, "sg-batch-123");
  assert.equal(result.sentCount, 2);
  assert.ok(result.results.every((r) => r.status === "SENT" && r.providerMessageId === "sg-batch-123"));
});

test("SendGrid provider marks FAILED when the API rejects the request", async () => {
  const fakeFetch = (async () => fakeResponse(false, 401)) as unknown as typeof fetch;
  const provider = new SendGridEmailProvider({ apiKey: "key", fromEmail: "from@example.com" }, fakeFetch);
  const result = await provider.sendMarketingBatch(batch);
  assert.equal(result.failedCount, 2);
  assert.equal(result.sentCount, 0);
  assert.ok(result.results.every((r) => r.status === "FAILED"));
});

test("config + resolver fall back to the stub when SENDGRID_API_KEY is absent", () => {
  const prevKey = process.env.SENDGRID_API_KEY;
  const prevFrom = process.env.EMAIL_FROM;
  delete process.env.SENDGRID_API_KEY;
  delete process.env.EMAIL_FROM;
  try {
    assert.equal(readSendGridConfig(), null);
    assert.equal(getMarketingEmailProvider().name, "stub");
  } finally {
    if (prevKey !== undefined) process.env.SENDGRID_API_KEY = prevKey;
    if (prevFrom !== undefined) process.env.EMAIL_FROM = prevFrom;
  }
});
