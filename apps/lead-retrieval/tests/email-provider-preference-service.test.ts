import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import type { createAdminClient } from "../lib/supabase/admin";
import { encryptSecret } from "../lib/security/encrypted-secret";
import { GOOGLE_WORKSPACE_SCOPES } from "../lib/integrations/google/scopes";
import { MICROSOFT_365_SCOPES } from "../lib/integrations/microsoft/scopes";
import { microsoftSecretContext } from "../lib/integrations/microsoft/secret-context";
import { asAdminClient, createFakeSupabase } from "./helpers/fake-supabase";

process.env.INTEGRATION_SECRET_ACTIVE_KEY_ID = "email-health-test-v1";
process.env.INTEGRATION_SECRET_ENCRYPTION_KEYS = JSON.stringify({
  "email-health-test-v1": Buffer.alloc(32, 19).toString("base64")
});

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

const loadService = () => import("../lib/integrations/email/provider-preference");
const admin = (fake: ReturnType<typeof createFakeSupabase>) =>
  asAdminClient<ReturnType<typeof createAdminClient>>(fake);
const googleSecret = (connectionId: string) => ({
  connection_id: connectionId,
  refresh_token_encrypted: encryptSecret("google-refresh", `google_workspace:${connectionId}:refresh_token`)
});
const microsoftSecret = (connectionId: string) => ({
  connection_id: connectionId,
  refresh_token_encrypted: encryptSecret("microsoft-refresh", microsoftSecretContext(connectionId, "refresh_token"))
});

test("email preference lookup is isolated by user, company, and capability", async () => {
  const { getEmailProviderPreference } = await loadService();
  const fake = createFakeSupabase({
    integration_provider_preferences: [
      { user_id: "user-a", company_id: "company-a", capability: "email_send", provider: "google_workspace" },
      { user_id: "user-a", company_id: "company-b", capability: "email_send", provider: "microsoft_365" },
      { user_id: "user-b", company_id: "company-a", capability: "email_send", provider: "microsoft_365" }
    ]
  });
  assert.equal(await getEmailProviderPreference({ userId: "user-a", companyId: "company-a", supabase: admin(fake) }), "google_workspace");
  assert.equal(await getEmailProviderPreference({ userId: "user-a", companyId: "company-b", supabase: admin(fake) }), "microsoft_365");
  assert.equal(await getEmailProviderPreference({ userId: "user-b", companyId: "company-a", supabase: admin(fake) }), "microsoft_365");
  assert.equal(await getEmailProviderPreference({ userId: "user-b", companyId: "company-b", supabase: admin(fake) }), null);
});

test("resolved provider uses the preference only from the selected company", async () => {
  const { resolveEmailProviderForUser } = await loadService();
  const fake = createFakeSupabase({
    integration_provider_preferences: [
      { user_id: "platform-user", company_id: "company-a", capability: "email_send", provider: "google_workspace" },
      { user_id: "platform-user", company_id: "company-b", capability: "email_send", provider: "microsoft_365" }
    ],
    google_workspace_connections: [
      { id: "g-a", user_id: "platform-user", company_id: "company-a", google_email: "g-a@example.test", google_display_name: null, granted_scopes: [...GOOGLE_WORKSPACE_SCOPES], status: "connected" },
      { id: "g-b", user_id: "platform-user", company_id: "company-b", google_email: "g-b@example.test", google_display_name: null, granted_scopes: [...GOOGLE_WORKSPACE_SCOPES], status: "connected" }
    ],
    google_workspace_connection_secrets: [googleSecret("g-a"), googleSecret("g-b")],
    microsoft_365_connections: [
      { id: "m-a", user_id: "platform-user", company_id: "company-a", microsoft_email: "m-a@example.test", microsoft_display_name: null, granted_scopes: [...MICROSOFT_365_SCOPES], status: "connected" },
      { id: "m-b", user_id: "platform-user", company_id: "company-b", microsoft_email: "m-b@example.test", microsoft_display_name: null, granted_scopes: [...MICROSOFT_365_SCOPES], status: "connected" }
    ],
    microsoft_365_connection_secrets: [microsoftSecret("m-a"), microsoftSecret("m-b")]
  });
  const companyA = await resolveEmailProviderForUser({ userId: "platform-user", companyId: "company-a", supabase: admin(fake) });
  const companyB = await resolveEmailProviderForUser({ userId: "platform-user", companyId: "company-b", supabase: admin(fake) });
  assert.equal(companyA.ok && companyA.connection.provider, "google_workspace");
  assert.equal(companyB.ok && companyB.connection.provider, "microsoft_365");
});

test("Default write validates scope and atomically persists Microsoft for email and calendar", async () => {
  const { getCalendarProviderPreference, getEmailProviderPreference, setEmailProviderPreference } = await loadService();
  const fake = createFakeSupabase({
    integration_provider_preferences: [],
    google_workspace_connections: [],
    microsoft_365_connections: [
      { id: "m-a", user_id: "user-a", company_id: "company-a", microsoft_email: "m@example.test", microsoft_display_name: null, granted_scopes: [...MICROSOFT_365_SCOPES], status: "connected" }
    ],
    microsoft_365_connection_secrets: [microsoftSecret("m-a")]
  });
  assert.deepEqual(await setEmailProviderPreference({ userId: "user-a", companyId: "company-b", provider: "microsoft_365", supabase: admin(fake) }), { ok: false, outcome: "reconnect_required" });
  assert.equal(fake._tables.integration_provider_preferences.length, 0);
  assert.deepEqual(await setEmailProviderPreference({ userId: "user-a", companyId: "company-a", provider: "microsoft_365", supabase: admin(fake) }), { ok: true, provider: "microsoft_365" });
  assert.deepEqual(fake._tables.integration_provider_preferences.map(({ id: _id, ...row }) => row), [
    { user_id: "user-a", company_id: "company-a", capability: "email_send", provider: "microsoft_365" },
    { user_id: "user-a", company_id: "company-a", capability: "calendar", provider: "microsoft_365" }
  ]);
  assert.equal(await getEmailProviderPreference({ userId: "user-a", companyId: "company-a", supabase: admin(fake) }), "microsoft_365");
  assert.equal(await getCalendarProviderPreference({ userId: "user-a", companyId: "company-a", supabase: admin(fake) }), "microsoft_365");
  assert.equal(fake._calls.filter((call) => call.table === "integration_provider_preferences" && call.op === "upsert").length, 1);
});

test("Default write atomically persists Google for email and calendar", async () => {
  const { getCalendarProviderPreference, getEmailProviderPreference, setEmailProviderPreference } = await loadService();
  const fake = createFakeSupabase({
    integration_provider_preferences: [
      { user_id: "user-a", company_id: "company-a", capability: "email_send", provider: "microsoft_365" },
      { user_id: "user-a", company_id: "company-a", capability: "calendar", provider: "microsoft_365" }
    ],
    google_workspace_connections: [
      { id: "g-a", user_id: "user-a", company_id: "company-a", google_email: "g@example.test", google_display_name: null, granted_scopes: [...GOOGLE_WORKSPACE_SCOPES], status: "connected" }
    ],
    google_workspace_connection_secrets: [googleSecret("g-a")],
    microsoft_365_connections: []
  });
  const context = { userId: "user-a", companyId: "company-a", supabase: admin(fake) };
  assert.deepEqual(await setEmailProviderPreference({ ...context, provider: "google_workspace" }), { ok: true, provider: "google_workspace" });
  assert.equal(await getEmailProviderPreference(context), "google_workspace");
  assert.equal(await getCalendarProviderPreference(context), "google_workspace");
});

test("one-time overrides only resolve providers owned by the current user and company", async () => {
  const { resolveEmailProviderForUser } = await loadService();
  const fake = createFakeSupabase({
    google_workspace_connections: [
      { id: "g-company-a", user_id: "user-a", company_id: "company-a", google_email: "a@example.test", google_display_name: null, granted_scopes: [...GOOGLE_WORKSPACE_SCOPES], status: "connected" },
      { id: "g-other-user", user_id: "user-b", company_id: "company-b", google_email: "b@example.test", google_display_name: null, granted_scopes: [...GOOGLE_WORKSPACE_SCOPES], status: "connected" }
    ],
    google_workspace_connection_secrets: [googleSecret("g-company-a"), googleSecret("g-other-user")],
    microsoft_365_connections: [],
    integration_provider_preferences: []
  });
  assert.deepEqual(
    await resolveEmailProviderForUser({
      userId: "user-a",
      companyId: "company-b",
      providerOverride: "google_workspace",
      supabase: admin(fake)
    }),
    { ok: false, outcome: "missing_connection" }
  );
  assert.deepEqual(
    await resolveEmailProviderForUser({
      userId: "user-a",
      companyId: "company-a",
      providerOverride: "microsoft_365",
      supabase: admin(fake)
    }),
    { ok: false, outcome: "missing_connection" }
  );
});

test("one-time sender resolution leaves both persisted defaults unchanged", async () => {
  const { getCalendarProviderPreference, getEmailProviderPreference, resolveEmailProviderForUser } = await loadService();
  const fake = createFakeSupabase({
    integration_provider_preferences: [
      { user_id: "user-a", company_id: "company-a", capability: "email_send", provider: "google_workspace" },
      { user_id: "user-a", company_id: "company-a", capability: "calendar", provider: "google_workspace" }
    ],
    google_workspace_connections: [
      { id: "g-a", user_id: "user-a", company_id: "company-a", google_email: "g@example.test", google_display_name: null, granted_scopes: [...GOOGLE_WORKSPACE_SCOPES], status: "connected" }
    ],
    google_workspace_connection_secrets: [googleSecret("g-a")],
    microsoft_365_connections: [
      { id: "m-a", user_id: "user-a", company_id: "company-a", microsoft_email: "m@example.test", microsoft_display_name: null, granted_scopes: [...MICROSOFT_365_SCOPES], status: "connected" }
    ],
    microsoft_365_connection_secrets: [microsoftSecret("m-a")]
  });
  const context = { userId: "user-a", companyId: "company-a", supabase: admin(fake) };
  const result = await resolveEmailProviderForUser({ ...context, providerOverride: "microsoft_365" });
  assert.equal(result.ok && result.connection.provider, "microsoft_365");
  assert.equal(await getEmailProviderPreference(context), "google_workspace");
  assert.equal(await getCalendarProviderPreference(context), "google_workspace");
});

test("calendar preference resolution is scoped and one-time overrides do not mutate either default", async () => {
  const { getCalendarProviderPreference, getEmailProviderPreference } = await loadService();
  const { resolveCalendarProviderForUser } = await import("../lib/integrations/calendar/provider-resolver");
  const fake = createFakeSupabase({
    integration_provider_preferences: [
      { user_id: "user-a", company_id: "company-a", capability: "email_send", provider: "google_workspace" },
      { user_id: "user-a", company_id: "company-a", capability: "calendar", provider: "google_workspace" },
      { user_id: "user-a", company_id: "company-b", capability: "calendar", provider: "microsoft_365" },
      { user_id: "user-b", company_id: "company-a", capability: "calendar", provider: "microsoft_365" }
    ],
    google_workspace_connections: [
      { id: "g-a", user_id: "user-a", company_id: "company-a", google_email: "g@example.test", google_display_name: null, granted_scopes: [...GOOGLE_WORKSPACE_SCOPES], status: "connected" }
    ],
    google_workspace_connection_secrets: [googleSecret("g-a")],
    microsoft_365_connections: [
      { id: "m-a", user_id: "user-a", company_id: "company-a", microsoft_email: "m@example.test", microsoft_display_name: null, granted_scopes: [...MICROSOFT_365_SCOPES], status: "connected" }
    ],
    microsoft_365_connection_secrets: [microsoftSecret("m-a")]
  });
  const context = { userId: "user-a", companyId: "company-a", supabase: admin(fake) };
  const override = await resolveCalendarProviderForUser({ ...context, providerOverride: "microsoft_365" });
  assert.equal(override.ok && override.connection.provider, "microsoft_365");
  assert.equal(await getEmailProviderPreference(context), "google_workspace");
  assert.equal(await getCalendarProviderPreference(context), "google_workspace");
  assert.equal(await getCalendarProviderPreference({ userId: "user-a", companyId: "company-b", supabase: admin(fake) }), "microsoft_365");
  assert.equal(await getCalendarProviderPreference({ userId: "user-b", companyId: "company-a", supabase: admin(fake) }), "microsoft_365");
  assert.equal(await getCalendarProviderPreference({ userId: "user-b", companyId: "company-b", supabase: admin(fake) }), null);
});

test("calendar resolver and eligible status use either persisted default and ignore a stale preference when only one provider is healthy", async () => {
  const { listEligibleCalendars, resolveCalendarProviderForUser } = await import("../lib/integrations/calendar/provider-resolver");
  for (const preferredProvider of ["google_workspace", "microsoft_365"] as const) {
    const fake = createFakeSupabase({
      integration_provider_preferences: [
        { user_id: "user-a", company_id: "company-a", capability: "calendar", provider: preferredProvider }
      ],
      google_workspace_connections: [
        { id: "g-a", user_id: "user-a", company_id: "company-a", google_email: "g@example.test", google_display_name: null, granted_scopes: [...GOOGLE_WORKSPACE_SCOPES], status: "connected" }
      ],
      google_workspace_connection_secrets: [googleSecret("g-a")],
      microsoft_365_connections: [
        { id: "m-a", user_id: "user-a", company_id: "company-a", microsoft_email: "m@example.test", microsoft_display_name: null, granted_scopes: [...MICROSOFT_365_SCOPES], status: "connected" }
      ],
      microsoft_365_connection_secrets: [microsoftSecret("m-a")]
    });
    const context = { userId: "user-a", companyId: "company-a", supabase: admin(fake) };
    const result = await resolveCalendarProviderForUser(context);
    assert.equal(result.ok && result.connection.provider, preferredProvider);
    assert.equal(result.ok && result.source, "preference");
    assert.deepEqual(
      (await listEligibleCalendars(context)).map(({ provider, isDefault }) => ({ provider, isDefault })),
      [
        { provider: "google_workspace", isDefault: preferredProvider === "google_workspace" },
        { provider: "microsoft_365", isDefault: preferredProvider === "microsoft_365" }
      ]
    );
  }

  const stale = createFakeSupabase({
    integration_provider_preferences: [
      { user_id: "user-a", company_id: "company-a", capability: "calendar", provider: "microsoft_365" }
    ],
    google_workspace_connections: [
      { id: "g-a", user_id: "user-a", company_id: "company-a", google_email: "g@example.test", google_display_name: null, granted_scopes: [...GOOGLE_WORKSPACE_SCOPES], status: "connected" }
    ],
    google_workspace_connection_secrets: [googleSecret("g-a")],
    microsoft_365_connections: []
  });
  const onlyHealthy = await resolveCalendarProviderForUser({ userId: "user-a", companyId: "company-a", supabase: admin(stale) });
  assert.equal(onlyHealthy.ok && onlyHealthy.connection.provider, "google_workspace");
  assert.equal(onlyHealthy.ok && onlyHealthy.source, "only_healthy");
});

test("eligible senders expose only safe metadata for healthy scoped connections", async () => {
  const { listEligibleEmailSenders } = await loadService();
  const fake = createFakeSupabase({
    integration_provider_preferences: [
      { user_id: "user-a", company_id: "company-a", capability: "email_send", provider: "microsoft_365" }
    ],
    google_workspace_connections: [
      { id: "g-a", user_id: "user-a", company_id: "company-a", google_email: "g@example.test", google_display_name: "Google Sender", granted_scopes: [...GOOGLE_WORKSPACE_SCOPES], status: "connected" }
    ],
    google_workspace_connection_secrets: [googleSecret("g-a")],
    microsoft_365_connections: [
      { id: "m-a", user_id: "user-a", company_id: "company-a", microsoft_email: "m@example.test", microsoft_display_name: "Microsoft Sender", granted_scopes: [...MICROSOFT_365_SCOPES], status: "connected" }
    ],
    microsoft_365_connection_secrets: [microsoftSecret("m-a")]
  });
  const senders = await listEligibleEmailSenders({ userId: "user-a", companyId: "company-a", supabase: admin(fake) });
  assert.deepEqual(senders, [
    { provider: "google_workspace", accountEmail: "g@example.test", isDefault: false },
    { provider: "microsoft_365", accountEmail: "m@example.test", isDefault: true }
  ]);
  assert.doesNotMatch(JSON.stringify(senders), /refresh|token|secret|connectionId|displayName/i);
});
