import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve("server-only");
(require.cache as Record<string, NodeJS.Module | undefined>)[serverOnlyPath] = {
  id: serverOnlyPath,
  path: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  children: [],
  paths: [],
  exports: {},
  isPreloading: false,
  require,
  parent: null
} as unknown as NodeJS.Module;

const loadMailClient = () => import("../lib/integrations/microsoft/mail-client");
const loadAdapters = () => import("../lib/integrations/email/provider-adapters");

const adapterInput = {
  connection: { id: "ms-1", provider: "microsoft_365" as const, senderEmail: "sender@contoso.test", senderName: "Sender" },
  userId: "user-1",
  companyId: "company-1",
  recipientEmail: "lead@example.test",
  subject: "Following up",
  body: "Hello from SignalThread."
};

test("Google adapter preserves canonical MIME, token-manager use, and provider IDs", async () => {
  const { sendWithGoogleAdapterWithDependencies } = await loadAdapters();
  let tokenInput: Record<string, unknown> | null = null;
  let rawMessage = "";
  const result = await sendWithGoogleAdapterWithDependencies({
    ...adapterInput,
    connection: {
      id: "google-1",
      provider: "google_workspace",
      senderEmail: "sender@example.test",
      senderName: "Sender"
    }
  }, {
    getAccessToken: async (input) => {
      tokenInput = input;
      return { ok: true, accessToken: "google-secret", expiresAt: null, refreshed: false, refreshAttempted: false };
    },
    sendRaw: async (input) => {
      assert.equal(input.accessToken, "google-secret");
      rawMessage = input.rawMessage;
      return { ok: true, messageId: "gmail-message", threadId: "gmail-thread" };
    }
  });
  assert.deepEqual(tokenInput, { userId: "user-1", companyId: "company-1" });
  assert.match(Buffer.from(rawMessage, "base64url").toString("utf8"), /To: <lead@example\.test>/);
  assert.deepEqual(result, {
    ok: true,
    providerMessageId: "gmail-message",
    providerThreadId: "gmail-thread",
    status: 200
  });
  assert.doesNotMatch(JSON.stringify(result), /google-secret/);
});

test("Graph sendMail uses POST /me/sendMail with the canonical message mapping", async () => {
  const { sendMicrosoftMail, MICROSOFT_SEND_MAIL_ENDPOINT } = await loadMailClient();
  let url = "";
  let init: RequestInit | undefined;
  const result = await sendMicrosoftMail({
    accessToken: "secret-access-token",
    recipientEmail: "lead@example.test",
    subject: "Following up",
    body: "Plain text body",
    fetchImpl: async (input, requestInit) => {
      url = String(input);
      init = requestInit;
      return new Response(null, { status: 202 });
    }
  });
  assert.equal(url, MICROSOFT_SEND_MAIL_ENDPOINT);
  assert.equal(init?.method, "POST");
  assert.equal(new Headers(init?.headers).get("authorization"), "Bearer secret-access-token");
  assert.equal(new Headers(init?.headers).get("content-type"), "application/json");
  assert.deepEqual(JSON.parse(String(init?.body)), {
    message: {
      subject: "Following up",
      body: { contentType: "Text", content: "Plain text body" },
      toRecipients: [{ emailAddress: { address: "lead@example.test" } }]
    },
    saveToSentItems: true
  });
  assert.deepEqual(result, { ok: true, providerMessageId: null, providerThreadId: null, status: 202 });
  assert.doesNotMatch(JSON.stringify(result), /secret-access-token/);
});

test("Graph errors are normalized without raw bodies or tokens", async () => {
  const { sendMicrosoftMail } = await loadMailClient();
  const cases = [
    [401, "failed", "provider_unauthorized"],
    [403, "failed", "provider_permission_denied"],
    [429, "failed", "provider_throttled"],
    [500, "unknown", "provider_unavailable"]
  ] as const;
  for (const [status, outcome, category] of cases) {
    const result = await sendMicrosoftMail({
      accessToken: "must-not-escape",
      recipientEmail: "lead@example.test",
      subject: "Subject",
      body: "Body",
      fetchImpl: async () => new Response(JSON.stringify({ error: { message: "sensitive provider text" } }), {
        status,
        headers: status === 429 ? { "Retry-After": "17" } : undefined
      })
    });
    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.outcome, outcome);
    assert.equal(!result.ok && result.category, category);
    assert.doesNotMatch(JSON.stringify(result), /must-not-escape|sensitive provider text/);
    if (status === 429) assert.equal(!result.ok && result.retryAfterSeconds, 17);
  }
});

test("network failure is unknown and never exposes the token", async () => {
  const { sendMicrosoftMail } = await loadMailClient();
  const result = await sendMicrosoftMail({
    accessToken: "secret",
    recipientEmail: "lead@example.test",
    subject: "Subject",
    body: "Body",
    fetchImpl: async () => { throw new Error("network failed with secret"); }
  });
  assert.deepEqual(result, { ok: false, outcome: "unknown", category: "unknown_outcome", status: null });
});

test("Microsoft adapter obtains tokens canonically and retries only a definitive 401 after refresh", async () => {
  const { sendWithMicrosoftAdapterWithDependencies } = await loadAdapters();
  const tokenCalls: Array<boolean | undefined> = [];
  const sentTokens: string[] = [];
  const result = await sendWithMicrosoftAdapterWithDependencies(adapterInput, {
    getAccessToken: async ({ forceRefresh }) => {
      tokenCalls.push(forceRefresh);
      return { ok: true, accessToken: forceRefresh ? "refreshed" : "initial", expiresAt: null, refreshed: Boolean(forceRefresh), refreshAttempted: Boolean(forceRefresh) };
    },
    sendMail: async ({ accessToken }) => {
      sentTokens.push(accessToken);
      return accessToken === "initial"
        ? { ok: false, outcome: "failed", category: "provider_unauthorized", status: 401 }
        : { ok: true, providerMessageId: null, providerThreadId: null, status: 202 };
    }
  });
  assert.deepEqual(tokenCalls, [undefined, true]);
  assert.deepEqual(sentTokens, ["initial", "refreshed"]);
  assert.equal(result.ok, true);
});

test("invalid_grant/reconnect result never calls Graph", async () => {
  const { sendWithMicrosoftAdapterWithDependencies } = await loadAdapters();
  let sends = 0;
  const result = await sendWithMicrosoftAdapterWithDependencies(adapterInput, {
    getAccessToken: async () => ({ ok: false, reason: "reconnect_required", stage: "provider_refresh_request", category: "reconnect_required", refreshAttempted: true }),
    sendMail: async () => { sends += 1; return { ok: true, providerMessageId: null, providerThreadId: null, status: 202 }; }
  });
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.reconnectRequired, true);
  assert.equal(sends, 0);
});

test("403, 429, 5xx, and network outcomes are not automatically retried", async () => {
  const { sendWithMicrosoftAdapterWithDependencies } = await loadAdapters();
  for (const providerResult of [
    { ok: false as const, outcome: "failed" as const, category: "provider_permission_denied" as const, status: 403 },
    { ok: false as const, outcome: "failed" as const, category: "provider_throttled" as const, status: 429 },
    { ok: false as const, outcome: "unknown" as const, category: "provider_unavailable" as const, status: 503 },
    { ok: false as const, outcome: "unknown" as const, category: "unknown_outcome" as const, status: null }
  ]) {
    let tokenCalls = 0;
    let sends = 0;
    const result = await sendWithMicrosoftAdapterWithDependencies(adapterInput, {
      getAccessToken: async () => { tokenCalls += 1; return { ok: true, accessToken: "token", expiresAt: null, refreshed: false, refreshAttempted: false }; },
      sendMail: async () => { sends += 1; return providerResult; }
    });
    assert.equal(result.ok, false);
    assert.equal(tokenCalls, 1);
    assert.equal(sends, 1);
  }
});
