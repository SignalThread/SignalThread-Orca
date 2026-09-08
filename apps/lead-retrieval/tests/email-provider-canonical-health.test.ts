import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { resolveEmailProvider } from "../lib/integrations/email/provider-resolver-core";
import { GOOGLE_WORKSPACE_SCOPES } from "../lib/integrations/google/scopes";
import { MICROSOFT_365_SCOPES } from "../lib/integrations/microsoft/scopes";

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

const googleRow = {
  id: "google-1",
  google_email: "google@example.test",
  google_display_name: "Google User",
  granted_scopes: [...GOOGLE_WORKSPACE_SCOPES],
  status: "connected" as const,
  token_expires_at: null,
  connected_at: "2026-08-20T00:00:00.000Z",
  last_refresh_at: null,
  last_error_code: null
};

const microsoftRow = {
  id: "microsoft-1",
  microsoft_email: "microsoft@example.test",
  microsoft_display_name: "Microsoft User",
  granted_scopes: [...MICROSOFT_365_SCOPES],
  status: "connected" as const,
  token_expires_at: null,
  connected_at: "2026-08-20T00:00:00.000Z",
  last_refresh_at: null,
  last_error_code: null
};

async function canonicalCandidates(input: {
  googleCredential: "usable" | "missing" | "unreadable";
  microsoftCredential: "usable" | "missing" | "unreadable";
}) {
  const [{ toGoogleWorkspaceConnectionStatus }, { toMicrosoft365ConnectionStatus }, availability] = await Promise.all([
    import("../lib/integrations/google/connection-status"),
    import("../lib/integrations/microsoft/connection-status"),
    import("../lib/integrations/email/provider-preference")
  ]);
  const googleStatus = toGoogleWorkspaceConnectionStatus(googleRow, input.googleCredential);
  const microsoftStatus = toMicrosoft365ConnectionStatus(microsoftRow, input.microsoftCredential);
  const google = availability.googleHealthToEmailProviderCandidate({
    connectionId: googleRow.id,
    status: googleStatus
  });
  const microsoft = availability.microsoftHealthToEmailProviderCandidate({
    connectionId: microsoftRow.id,
    status: microsoftStatus
  });
  assert.ok(google);
  assert.ok(microsoft);
  return { googleStatus, microsoftStatus, google, microsoft };
}

test("Google healthy plus Microsoft reconnect_required auto-selects Google", async () => {
  const { google, microsoft } = await canonicalCandidates({
    googleCredential: "usable",
    microsoftCredential: "unreadable"
  });
  const result = resolveEmailProvider({
    candidates: [google, microsoft],
    preferredProvider: "microsoft_365"
  });
  assert.equal(result.ok && result.connection.provider, "google_workspace");
  assert.equal(result.ok && result.source, "only_healthy");
});

test("Microsoft healthy plus Google reconnect_required auto-selects Microsoft", async () => {
  const { google, microsoft } = await canonicalCandidates({
    googleCredential: "missing",
    microsoftCredential: "usable"
  });
  const result = resolveEmailProvider({
    candidates: [google, microsoft],
    preferredProvider: "google_workspace"
  });
  assert.equal(result.ok && result.connection.provider, "microsoft_365");
  assert.equal(result.ok && result.source, "only_healthy");
});

test("persisted connected rows with unusable credentials are not healthy", async () => {
  const { googleStatus, microsoftStatus, google, microsoft } = await canonicalCandidates({
    googleCredential: "unreadable",
    microsoftCredential: "missing"
  });
  assert.equal(googleStatus.status, "reconnect_required");
  assert.equal(microsoftStatus.status, "reconnect_required");
  assert.equal(google.healthy, false);
  assert.equal(microsoft.healthy, false);
  assert.deepEqual(resolveEmailProvider({ candidates: [google, microsoft], preferredProvider: null }), {
    ok: false,
    outcome: "reconnect_required"
  });
});

test("Google read health and send availability agree", async () => {
  for (const credential of ["usable", "missing", "unreadable"] as const) {
    const { googleStatus, google } = await canonicalCandidates({
      googleCredential: credential,
      microsoftCredential: "missing"
    });
    assert.equal(google.healthy, googleStatus.connected && googleStatus.capabilities.gmailSend);
  }
});

test("Microsoft read health and send availability agree", async () => {
  for (const credential of ["usable", "missing", "unreadable"] as const) {
    const { microsoftStatus, microsoft } = await canonicalCandidates({
      googleCredential: "missing",
      microsoftCredential: credential
    });
    assert.equal(
      microsoft.healthy,
      microsoftStatus.connected && microsoftStatus.capabilities.mailSend
    );
  }
});

test("both genuinely healthy still require a preference", async () => {
  const { google, microsoft } = await canonicalCandidates({
    googleCredential: "usable",
    microsoftCredential: "usable"
  });
  assert.deepEqual(resolveEmailProvider({ candidates: [google, microsoft], preferredProvider: null }), {
    ok: false,
    outcome: "provider_selection_required"
  });
});

test("provider ordering does not affect canonical selection", async () => {
  const { google, microsoft } = await canonicalCandidates({
    googleCredential: "usable",
    microsoftCredential: "unreadable"
  });
  for (const candidates of [[google, microsoft], [microsoft, google]]) {
    const result = resolveEmailProvider({ candidates, preferredProvider: null });
    assert.equal(result.ok && result.connection.provider, "google_workspace");
  }
});
