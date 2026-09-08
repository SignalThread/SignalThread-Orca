import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("migration extends the canonical company integration row and isolates encrypted secrets", () => {
  const migration = readFileSync("test-fixtures/legacy-lr-migrations/0100_pipedrive_oauth_connection.sql", "utf8");
  const baseIntegration = readFileSync("test-fixtures/legacy-lr-migrations/0014_integrations.sql", "utf8");
  assert.match(baseIntegration, /integrations_account_provider_unique/);
  assert.match(migration, /integration_connection_secrets/);
  assert.match(migration, /access_token_encrypted text NOT NULL/);
  assert.match(migration, /refresh_token_encrypted text NOT NULL/);
  assert.match(migration, /provider <> 'pipedrive' OR \(access_token IS NULL AND refresh_token IS NULL\)/);
  assert.match(migration, /REVOKE ALL ON TABLE public\.integration_connection_secrets FROM anon, authenticated/);
  assert.match(migration, /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.integration_connection_secrets TO service_role/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.persist_integration_oauth_refresh/);
  assert.match(migration, /credential_version = credential_version \+ 1/);
  assert.match(migration, /refresh_lease_token = p_lease_token/);
});

test("single-use state is digest-only, expiring, and atomically consumed", () => {
  const launch = readFileSync("lib/integrations/pipedrive/oauth-launch-service.ts", "utf8");
  const connection = readFileSync("lib/integrations/pipedrive/connection-service.ts", "utf8");
  assert.match(launch, /state_digest: created\.stateDigest/);
  assert.doesNotMatch(launch, /\.insert\(\{\s*state:\s*created\.state/s);
  assert.match(connection, /\.is\("consumed_at", null\)/);
  assert.match(connection, /\.gt\("expires_at", now\.toISOString\(\)\)/);
  assert.match(connection, /\.eq\("provider", "pipedrive"\)/);
});

test("connection persistence is company scoped and Pipedrive tokens never use legacy plaintext columns", () => {
  const connection = readFileSync("lib/integrations/pipedrive/connection-service.ts", "utf8");
  assert.match(connection, /account_id: input\.companyId/);
  assert.match(connection, /access_token: null/);
  assert.match(connection, /refresh_token: null/);
  assert.match(connection, /encryptPipedriveCredentials/);
  assert.match(connection, /\.eq\("account_id", companyId\)/);
  assert.match(connection, /revokePipedriveRefreshToken/);
  assert.match(connection, /\.delete\(\)/);
});

test("disconnect is idempotent and removes the only usable local credential path", () => {
  const connection = readFileSync("lib/integrations/pipedrive/connection-service.ts", "utf8");
  const route = readFileSync("app/api/integrations/pipedrive/disconnect/route.ts", "utf8");
  assert.match(connection, /if \(!connection\.data\) return \{ disconnected: false, revocationConfirmed: true \}/);
  assert.match(connection, /status: "revocation_pending"/);
  assert.match(connection, /Pipedrive credential revocation failed/);
  assert.match(connection, /from\("integrations"\)\s*\.delete\(\)/s);
  assert.match(route, /const routeAuth = createSupabaseRouteAuth\(request\)/);
  assert.match(
    route,
    /authorizeCompanyIntegrationAdmin\(\{ supabase: routeAuth\.supabase \}\)/
  );
  assert.match(route, /routeAuth\.withAuthCookies\(NextResponse\.redirect\(redirect, \{ status: 303 \}\)\)/);
  assert.match(route, /buildBrowserFacingUrl\(request, "\/exhibitor\/integrations"\)/);
  assert.doesNotMatch(route, /\/login|\/exhibitor\/dashboard|exhibitor-web-entry/);
});

test("Integrations UI exposes disconnected, connected, configure, disconnect, and safe error states", () => {
  const catalog = readFileSync("lib/config/integration-catalog.ts", "utf8");
  const page = readFileSync("app/(app)/exhibitor/integrations/page.tsx", "utf8");
  const client = readFileSync("components/exhibitor/integrations-catalog-client.tsx", "utf8");
  assert.match(catalog, /name: "Pipedrive"/);
  assert.match(catalog, /connectLabel: "Connect Pipedrive"/);
  assert.match(catalog, /manageRoute: "\/exhibitor\/integrations\/pipedrive"/);
  assert.match(catalog, /manageLabel: "Configure"/);
  assert.match(catalog, /disconnectRoute: "\/api\/integrations\/pipedrive\/disconnect"/);
  assert.match(page, /getPipedriveConnectionStatus\(accountId\)/);
  assert.match(page, /Pipedrive connected and verified/);
  assert.match(page, /Pipedrive disconnected\./);
  assert.match(page, /authorization session was invalid or expired/);
  assert.match(client, /Disconnecting…/);
  assert.match(client, /showPipedriveConfigure/);
  assert.match(client, /Configure/);
  assert.match(client, /useFormStatus/);
});

test("provider verification is read-only and no Phase 2 lead sync exists", () => {
  const client = readFileSync("lib/integrations/pipedrive/oauth-client.ts", "utf8");
  assert.match(client, /\/api\/v1\/users\/me/);
  assert.match(client, /method: "GET"/);
  assert.doesNotMatch(client, /\/persons|\/deals|\/activities|\/leads/);
});
