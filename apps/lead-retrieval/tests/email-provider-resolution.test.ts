import assert from "node:assert/strict";
import test from "node:test";
import { resolveEmailProvider, type EmailProviderCandidate } from "../lib/integrations/email/provider-resolver-core";
import { parseEmailProviderOverride } from "../lib/integrations/email/types";

const google = (overrides: Partial<EmailProviderCandidate> = {}): EmailProviderCandidate => ({
  id: "google-1",
  provider: "google_workspace",
  senderEmail: "google@example.test",
  senderName: "Google User",
  healthy: true,
  reconnectRequired: false,
  ...overrides
});
const microsoft = (overrides: Partial<EmailProviderCandidate> = {}): EmailProviderCandidate => ({
  id: "microsoft-1",
  provider: "microsoft_365",
  senderEmail: "microsoft@example.test",
  senderName: "Microsoft User",
  healthy: true,
  reconnectRequired: false,
  ...overrides
});

test("only Google healthy selects Google", () => {
  const result = resolveEmailProvider({ candidates: [google()], preferredProvider: null });
  assert.equal(result.ok && result.connection.provider, "google_workspace");
});

test("only Microsoft healthy selects Microsoft", () => {
  const result = resolveEmailProvider({ candidates: [microsoft()], preferredProvider: null });
  assert.equal(result.ok && result.connection.provider, "microsoft_365");
});

test("both healthy use the exact persisted preference", () => {
  for (const preferredProvider of ["google_workspace", "microsoft_365"] as const) {
    const result = resolveEmailProvider({ candidates: [google(), microsoft()], preferredProvider });
    assert.equal(result.ok && result.connection.provider, preferredProvider);
    assert.equal(result.ok && result.source, "preference");
  }
});

test("both healthy without preference require selection and send nothing", () => {
  assert.deepEqual(resolveEmailProvider({ candidates: [google(), microsoft()], preferredProvider: null }), {
    ok: false,
    outcome: "provider_selection_required"
  });
});

test("a valid one-time override selects the requested healthy provider instead of the default", () => {
  for (const providerOverride of ["google_workspace", "microsoft_365"] as const) {
    const result = resolveEmailProvider({
      candidates: [google(), microsoft()],
      preferredProvider: providerOverride === "google_workspace" ? "microsoft_365" : "google_workspace",
      providerOverride
    });
    assert.equal(result.ok && result.connection.provider, providerOverride);
    assert.equal(result.ok && result.source, "override");
  }
});

test("an unavailable one-time override fails closed without selecting the other provider", () => {
  assert.deepEqual(
    resolveEmailProvider({
      candidates: [google(), microsoft({ healthy: false, reconnectRequired: true })],
      preferredProvider: "google_workspace",
      providerOverride: "microsoft_365"
    }),
    { ok: false, outcome: "reconnect_required" }
  );
  assert.deepEqual(
    resolveEmailProvider({
      candidates: [google()],
      preferredProvider: "google_workspace",
      providerOverride: "microsoft_365"
    }),
    { ok: false, outcome: "missing_connection" }
  );
});

test("only supported provider overrides are accepted at the request boundary", () => {
  assert.deepEqual(parseEmailProviderOverride(undefined), { valid: true });
  assert.deepEqual(parseEmailProviderOverride("google_workspace"), {
    valid: true,
    provider: "google_workspace"
  });
  for (const value of [null, "google", "microsoft", "smtp", 42]) {
    assert.deepEqual(parseEmailProviderOverride(value), { valid: false });
  }
});

test("with exactly one healthy provider, a stale preference is ignored before any send begins", () => {
  const unhealthyMicrosoft = resolveEmailProvider({
    candidates: [google(), microsoft({ healthy: false, reconnectRequired: true })],
    preferredProvider: "microsoft_365"
  });
  assert.equal(unhealthyMicrosoft.ok && unhealthyMicrosoft.connection.provider, "google_workspace");
  assert.equal(unhealthyMicrosoft.ok && unhealthyMicrosoft.source, "only_healthy");
  const missingMicrosoft = resolveEmailProvider({
    candidates: [google()],
    preferredProvider: "microsoft_365"
  });
  assert.equal(missingMicrosoft.ok && missingMicrosoft.connection.provider, "google_workspace");
});

test("no connection and unhealthy connection fail closed distinctly", () => {
  assert.deepEqual(resolveEmailProvider({ candidates: [], preferredProvider: null }), { ok: false, outcome: "missing_connection" });
  assert.deepEqual(resolveEmailProvider({ candidates: [google({ healthy: false, reconnectRequired: true })], preferredProvider: null }), { ok: false, outcome: "reconnect_required" });
});

test("preference scope is part of the repository business key", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) => readFile("test-fixtures/legacy-lr-migrations/0104_provider_neutral_email_send.sql", "utf8"));
  const sharedDefault = await import("node:fs/promises").then(({ readFile }) => readFile("test-fixtures/legacy-lr-migrations/0106_shared_email_calendar_provider_default.sql", "utf8"));
  assert.match(source, /PRIMARY KEY \(user_id, company_id, capability\)/);
  assert.match(source, /capability IN \('email_send'\)/);
  assert.match(source, /provider IN \('google_workspace', 'microsoft_365'\)/);
  assert.match(source, /REVOKE ALL ON TABLE public\.integration_provider_preferences FROM anon, authenticated/);
  assert.match(sharedDefault, /capability IN \('email_send', 'calendar'\)/);
  assert.match(sharedDefault, /WHERE capability = 'email_send'/);
  assert.match(sharedDefault, /ON CONFLICT \(user_id, company_id, capability\)/);
});
