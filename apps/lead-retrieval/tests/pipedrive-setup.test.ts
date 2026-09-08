import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  DEFAULT_PIPEDRIVE_SETUP_SETTINGS,
  parsePipedriveSetupSettings,
  toPipedriveSetupPersistenceRow,
  validatePipedriveSetupSelection
} from "../lib/integrations/pipedrive/setup-core";
import { listPipedriveSetupOptionsWithToken } from "../lib/integrations/pipedrive/setup-options-core";
import {
  getPipedriveSetupPageDataCore,
  savePipedriveSetupSettingsCore
} from "../lib/integrations/pipedrive/setup-service-core";

test("Pipedrive setup defaults to Leads and persists only company-scoped delivery settings", () => {
  assert.equal(DEFAULT_PIPEDRIVE_SETUP_SETTINGS.destinationType, "lead");
  const parsed = parsePipedriveSetupSettings({
    destinationType: "lead",
    createPerson: "on",
    createOrganization: "on",
    ownerMode: "connected_user",
    createFollowUpActivity: "on",
    matchPersonByEmail: "on",
    matchOrganizationByNameOrDomain: "on",
    sendConversationSynopsis: "on",
    sendGeneratedEmailDraft: "on"
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.deepEqual(parsed.value, DEFAULT_PIPEDRIVE_SETUP_SETTINGS);
  const row = toPipedriveSetupPersistenceRow("company-a", parsed.value);
  assert.equal(row.company_id, "company-a");
  assert.equal(row.provider, "pipedrive");
  assert.equal(row.destination_type, "lead");
  assert.equal(row.pipeline_id, null);
  assert.equal(row.stage_id, null);
  assert.equal("access_token" in row, false);
  assert.equal("refresh_token" in row, false);
});

test("note-content settings (synopsis + email draft) default to true and round-trip through parse/persist", () => {
  assert.equal(DEFAULT_PIPEDRIVE_SETUP_SETTINGS.sendConversationSynopsis, true);
  assert.equal(DEFAULT_PIPEDRIVE_SETUP_SETTINGS.sendGeneratedEmailDraft, true);

  const bothOff = parsePipedriveSetupSettings({
    destinationType: "lead",
    createPerson: "on",
    createOrganization: "on",
    ownerMode: "connected_user",
    createFollowUpActivity: "on",
    matchPersonByEmail: "on",
    matchOrganizationByNameOrDomain: "on"
    // sendConversationSynopsis / sendGeneratedEmailDraft omitted entirely (unchecked checkboxes)
  });
  assert.equal(bothOff.ok, true);
  if (!bothOff.ok) return;
  assert.equal(bothOff.value.sendConversationSynopsis, false);
  assert.equal(bothOff.value.sendGeneratedEmailDraft, false);

  const row = toPipedriveSetupPersistenceRow("company-a", bothOff.value);
  assert.equal(row.send_conversation_synopsis, false);
  assert.equal(row.send_generated_email_draft, false);
});

test("Deals require a valid pipeline/stage pair and selected owner", () => {
  assert.deepEqual(
    parsePipedriveSetupSettings({ destinationType: "deal", ownerMode: "connected_user" }),
    { ok: false, error: "missing_deal_destination" }
  );
  const parsed = parsePipedriveSetupSettings({
    destinationType: "deal",
    createPerson: "on",
    createOrganization: "on",
    pipelineId: "pipeline-a",
    stageId: "stage-a",
    ownerMode: "selected_user",
    ownerUserId: "user-a",
    createFollowUpActivity: "on",
    matchPersonByEmail: "on",
    matchOrganizationByNameOrDomain: "on"
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(
    validatePipedriveSetupSelection({
      settings: parsed.value,
      pipelines: [{ id: "pipeline-a", name: "Sales" }],
      stages: [{ id: "stage-a", name: "New", pipelineId: "pipeline-a" }],
      users: [{ id: "user-a", name: "Owner" }]
    }),
    null
  );
  assert.equal(
    validatePipedriveSetupSelection({
      settings: parsed.value,
      pipelines: [{ id: "pipeline-a", name: "Sales" }],
      stages: [{ id: "stage-a", name: "New", pipelineId: "pipeline-other" }],
      users: [{ id: "user-a", name: "Owner" }]
    }),
    "invalid_stage"
  );
});

test("Pipedrive setup reads pipelines, stages, and users with only a server-held company token", async () => {
  const requests: Array<{ url: string; authorization: string | null }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    requests.push({ url, authorization: new Headers(init?.headers).get("authorization") });
    const data = url.includes("pipelines")
      ? [{ id: 1, name: "Sales" }]
      : url.includes("stages")
        ? [{ id: 2, name: "New", pipeline_id: 1 }]
        : [{ id: 3, name: "Ali", active_flag: true }];
    return new Response(JSON.stringify({ success: true, data }), { status: 200 });
  };

  const options = await listPipedriveSetupOptionsWithToken({
    apiDomain: "https://sandbox.pipedrive.com",
    accessToken: "server-only-token",
    fetchImpl
  });
  assert.deepEqual(options, {
    pipelines: [{ id: "1", name: "Sales" }],
    stages: [{ id: "2", name: "New", pipelineId: "1" }],
    users: [{ id: "3", name: "Ali" }]
  });
  assert.deepEqual(requests.map((request) => request.url.replace("https://sandbox.pipedrive.com", "")), [
    "/api/v2/pipelines?limit=500",
    "/api/v2/stages?limit=500&sort_by=order_nr&sort_direction=asc",
    "/api/v1/users"
  ]);
  assert.ok(requests.every((request) => request.authorization === "Bearer server-only-token"));
  assert.equal(JSON.stringify(options).includes("server-only-token"), false);
});

test("a disconnected company cannot load or persist stale Pipedrive setup", async () => {
  let optionReads = 0;
  let writes = 0;
  const getOptions = async () => {
    optionReads += 1;
    return { pipelines: [], stages: [], users: [] };
  };
  const getSettings = async () => DEFAULT_PIPEDRIVE_SETUP_SETTINGS;
  const page = await getPipedriveSetupPageDataCore({
    companyId: "company-a",
    getConnection: async () => ({ connected: false }),
    getSettings,
    getOptions
  });
  assert.equal(page.connection.connected, false);
  assert.equal(page.options, null);
  assert.equal(optionReads, 0);

  const saved = await savePipedriveSetupSettingsCore({
    companyId: "company-a",
    settings: DEFAULT_PIPEDRIVE_SETUP_SETTINGS,
    getConnection: async () => ({ connected: false }),
    getOptions,
    persist: async () => { writes += 1; }
  });
  assert.deepEqual(saved, { ok: false, error: "not_connected" });
  assert.equal(optionReads, 0);
  assert.equal(writes, 0);
});

test("setup save uses the authorized company token scope and persists only that company's settings", async () => {
  const calls: string[] = [];
  const saved = await savePipedriveSetupSettingsCore({
    companyId: "company-a",
    settings: DEFAULT_PIPEDRIVE_SETUP_SETTINGS,
    getConnection: async (companyId) => {
      calls.push(`connection:${companyId}`);
      return { connected: true };
    },
    getOptions: async (companyId) => {
      calls.push(`options:${companyId}`);
      return { pipelines: [], stages: [], users: [] };
    },
    persist: async (companyId, settings) => {
      calls.push(`persist:${companyId}:${settings.destinationType}`);
    }
  });
  assert.deepEqual(saved, { ok: true });
  assert.deepEqual(calls, [
    "connection:company-a",
    "options:company-a",
    "persist:company-a:lead"
  ]);
});

test("Pipedrive setup is server-authorized, company-scoped, and never returns credentials to the browser", () => {
  const route = readFileSync("app/api/integrations/pipedrive/setup/route.ts", "utf8");
  const page = readFileSync("app/(app)/exhibitor/integrations/pipedrive/page.tsx", "utf8");
  const service = readFileSync("lib/integrations/pipedrive/setup-service.ts", "utf8");
  const migration = readFileSync("supabase/migrations/0101_pipedrive_integration_settings.sql", "utf8");
  assert.match(route, /authorizeCompanyIntegrationAdmin\(\{ supabase: routeAuth\.supabase \}\)/);
  assert.match(route, /companyId: authorization\.context\.companyId/);
  assert.match(service, /\.eq\("company_id", companyId\)/);
  assert.match(service, /onConflict: "company_id"/);
  assert.match(migration, /company_id uuid PRIMARY KEY/);
  assert.match(migration, /provider = 'pipedrive'/);
  assert.match(migration, /REVOKE ALL ON TABLE public\.pipedrive_integration_settings FROM anon, authenticated/);
  assert.match(page, /requireRole\("exhibitor_admin"\)/);
  assert.doesNotMatch(page, /accessToken|refreshToken|clientSecret/);
});

test("connected Pipedrive card exposes Configure and callback lands on setup without login/dashboard fallback", () => {
  const callback = readFileSync("app/api/integrations/pipedrive/callback/route.ts", "utf8");
  const state = readFileSync("lib/integrations/pipedrive/oauth-state.ts", "utf8");
  const catalog = readFileSync("lib/config/integration-catalog.ts", "utf8");
  const client = readFileSync("components/exhibitor/integrations-catalog-client.tsx", "utf8");
  assert.match(state, /PIPEDRIVE_OAUTH_RETURN_TO = "\/exhibitor\/integrations\/pipedrive"/);
  assert.match(callback, /NextResponse\.redirect\(url, \{ status: 303 \}\)/);
  assert.match(callback, /routeAuth\.withAuthCookies/);
  assert.doesNotMatch(callback, /\/login|\/exhibitor\/dashboard/);
  assert.match(catalog, /manageRoute: "\/exhibitor\/integrations\/pipedrive"/);
  assert.match(client, /showPipedriveConfigure/);
  assert.match(client, />\s*Configure\s*</);
});
