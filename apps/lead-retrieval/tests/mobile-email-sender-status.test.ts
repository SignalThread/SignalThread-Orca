import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  eligibleEmailSendersFromCandidates,
  resolveEmailProvider,
  type EmailProviderCandidate
} from "../lib/integrations/email/provider-resolver-core";
import { toMobileEmailSenderStatus } from "../lib/integrations/mobile-oauth/status-core";
import type { EmailProvider } from "../lib/integrations/email/types";

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

const google = (overrides: Partial<EmailProviderCandidate> = {}): EmailProviderCandidate => ({
  id: "google-1",
  provider: "google_workspace",
  senderEmail: "google@example.test",
  senderName: "Google Sender",
  healthy: true,
  reconnectRequired: false,
  ...overrides
});

const microsoft = (
  overrides: Partial<EmailProviderCandidate> = {}
): EmailProviderCandidate => ({
  id: "microsoft-1",
  provider: "microsoft_365",
  senderEmail: "microsoft@example.test",
  senderName: "Microsoft Sender",
  healthy: true,
  reconnectRequired: false,
  ...overrides
});

function emailSender(
  candidates: EmailProviderCandidate[],
  preferredProvider: EmailProvider | null
) {
  const resolution = resolveEmailProvider({ candidates, preferredProvider });
  const eligibleSenders = eligibleEmailSendersFromCandidates({
    candidates,
    preferredProvider
  });
  return toMobileEmailSenderStatus(resolution, eligibleSenders);
}

test("Google healthy only returns one eligible sender", () => {
  const result = emailSender([google()], null);
  assert.equal(result.state, "ready");
  assert.equal(result.provider, "google_workspace");
  assert.deepEqual(result.eligibleSenders, [
    {
      provider: "google_workspace",
      accountEmail: "google@example.test",
      isDefault: false
    }
  ]);
});

test("Microsoft healthy only returns one eligible sender", () => {
  const result = emailSender([microsoft()], null);
  assert.equal(result.state, "ready");
  assert.equal(result.provider, "microsoft_365");
  assert.deepEqual(result.eligibleSenders.map((sender) => sender.provider), ["microsoft_365"]);
});

test("both healthy with Google default returns both eligible senders", () => {
  const result = emailSender([google(), microsoft()], "google_workspace");
  assert.equal(result.state, "ready");
  assert.equal(result.provider, "google_workspace");
  assert.deepEqual(result.eligibleSenders.map((sender) => sender.provider), [
    "google_workspace",
    "microsoft_365"
  ]);
  assert.deepEqual(result.eligibleSenders.map((sender) => sender.isDefault), [true, false]);
});

test("both healthy with Microsoft default returns both eligible senders", () => {
  const result = emailSender([google(), microsoft()], "microsoft_365");
  assert.equal(result.state, "ready");
  assert.equal(result.provider, "microsoft_365");
  assert.deepEqual(result.eligibleSenders.map((sender) => sender.provider), [
    "google_workspace",
    "microsoft_365"
  ]);
  assert.deepEqual(result.eligibleSenders.map((sender) => sender.isDefault), [false, true]);
});

test("both healthy with no default returns both plus provider_selection_required", () => {
  const result = emailSender([google(), microsoft()], null);
  assert.equal(result.state, "provider_selection_required");
  assert.equal(result.provider, null);
  assert.deepEqual(result.eligibleSenders.map((sender) => sender.provider), [
    "google_workspace",
    "microsoft_365"
  ]);
  assert.deepEqual(result.eligibleSenders.map((sender) => sender.isDefault), [false, false]);
});

test("reconnect_required provider is excluded from eligible senders", () => {
  const result = emailSender(
    [google(), microsoft({ healthy: false, reconnectRequired: true })],
    "microsoft_365"
  );
  assert.equal(result.state, "ready");
  assert.equal(result.provider, "google_workspace");
  assert.deepEqual(result.eligibleSenders.map((sender) => sender.provider), ["google_workspace"]);
});

test("connected provider missing email-send capability is excluded", async () => {
  const { googleHealthToEmailProviderCandidate } = await import(
    "../lib/integrations/email/provider-preference"
  );
  const noSendCapability = googleHealthToEmailProviderCandidate({
    connectionId: "google-1",
    status: {
      connected: true,
      status: "connected",
      identity: { email: "google@example.test", displayName: "Google Sender" },
      grantedScopes: [],
      capabilities: {
        gmailSend: false,
        calendarEventsOwned: true,
        calendarFreeBusy: true
      },
      isPartialGrant: true,
      expiresAt: null,
      connectedAt: "2026-08-20T00:00:00.000Z",
      lastRefreshAt: null,
      lastErrorCode: null
    }
  });
  assert.ok(noSendCapability);
  const result = emailSender([noSendCapability, microsoft()], null);
  assert.equal(noSendCapability.healthy, false);
  assert.deepEqual(result.eligibleSenders.map((sender) => sender.provider), ["microsoft_365"]);
});

test("provider candidate ordering does not affect eligible sender result", () => {
  const forward = emailSender([google(), microsoft()], "google_workspace");
  const reverse = emailSender([microsoft(), google()], "google_workspace");
  assert.deepEqual(reverse, forward);
});

test("mobile route nests eligible senders inside emailSender", () => {
  const source = readFileSync("app/api/mobile/integrations/connections/route.ts", "utf8");
  assert.match(source, /emailSender: toMobileEmailSenderStatus\(emailResolution, eligibleSenders\)/);
  assert.doesNotMatch(source, /^\s*eligibleSenders:\s/m);
});
