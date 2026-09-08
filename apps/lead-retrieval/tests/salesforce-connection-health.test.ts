import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  getValidSalesforceConnectionForCompanyWithDeps
} from "../lib/integrations/salesforce/connection-health-core";

const expired = new Date(Date.now() - 60_000).toISOString();
const future = new Date(Date.now() + 60 * 60_000).toISOString();

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "conn-1",
    account_id: "company-1",
    provider: "salesforce",
    access_token: "old-access",
    refresh_token: "refresh-ok",
    expires_at: future,
    scope: ["api", "refresh_token"],
    provider_account_id: "https://example.my.salesforce.com",
    updated_at: "2026-06-22T12:00:00Z",
    last_refresh_attempt_at: null,
    last_sync_error: null,
    ...overrides
  };
}

test("Salesforce expired access token with valid refresh token refreshes and becomes workflow-usable", async () => {
  const persisted: Record<string, unknown>[] = [];
  const result = await getValidSalesforceConnectionForCompanyWithDeps(
    {
      loadLatestConnection: async () => row({ expires_at: expired }),
      markRefreshAttempt: async (_connectionId, attemptedAt) => {
        persisted.push({ last_refresh_attempt_at: attemptedAt });
      },
      refreshToken: async (refreshToken) => {
        assert.equal(refreshToken, "refresh-ok");
        return {
          ok: true,
          payload: {
            access_token: "new-access",
            refresh_token: "refresh-rotated",
            instance_url: "https://new.my.salesforce.com/",
            expires_in: 3600
          }
        };
      },
      persistRefreshedConnection: async (_connectionId, patch) => {
        persisted.push(patch);
        return row({
          access_token: patch.access_token,
          refresh_token: patch.refresh_token,
          expires_at: patch.expires_at,
          provider_account_id: patch.provider_account_id,
          last_refresh_attempt_at: patch.last_refresh_attempt_at,
          last_sync_error: patch.last_sync_error
        });
      }
    },
    { accountId: "company-1" }
  );

  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("expected ok");
  assert.equal(result.refreshed, true);
  assert.equal(result.connection.access_token, "new-access");
  assert.equal(result.connection.refresh_token, "refresh-rotated");
  assert.equal(result.connection.provider_account_id, "https://new.my.salesforce.com");
  assert.equal(persisted.length, 2);
  assert.equal(persisted[1]?.last_sync_error, null);
});

test("Salesforce missing refresh token returns reconnect_required", async () => {
  const result = await getValidSalesforceConnectionForCompanyWithDeps(
    {
      loadLatestConnection: async () => row({ refresh_token: null }),
      markRefreshAttempt: async () => {
        throw new Error("should not refresh");
      },
      refreshToken: async () => {
        throw new Error("should not refresh");
      },
      persistRefreshedConnection: async () => {
        throw new Error("should not persist");
      }
    },
    { accountId: "company-1" }
  );

  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.reason, "reconnect_required");
  assert.match(!result.ok ? result.message : "", /refresh token is missing/i);
});

test("Salesforce invalid_grant returns reconnect_required without persisting new secrets", async () => {
  let persisted = false;
  const result = await getValidSalesforceConnectionForCompanyWithDeps(
    {
      loadLatestConnection: async () => row({ expires_at: expired }),
      markRefreshAttempt: async () => undefined,
      refreshToken: async () => ({
        ok: false,
        status: 400,
        payload: { error: "invalid_grant", error_description: "refresh token revoked" }
      }),
      persistRefreshedConnection: async () => {
        persisted = true;
        throw new Error("should not persist");
      }
    },
    { accountId: "company-1" }
  );

  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.reason, "reconnect_required");
  assert.equal(persisted, false);
});

test("Salesforce workflow/helper selects the latest scoped connection and settings use same health rules", () => {
  const clientSource = readFileSync("lib/integrations/salesforce/client.ts", "utf8");
  const settingsSource = readFileSync("app/admin/integrations/salesforce/setup/page.tsx", "utf8");
  const workflowSource = readFileSync("lib/workflows/step-handlers/crm-sync-salesforce.ts", "utf8");

  assert.match(clientSource, /\.eq\("account_id", normalizedAccountId\)/);
  assert.match(clientSource, /\.eq\("provider", "salesforce"\)/);
  assert.match(clientSource, /\.order\("updated_at", \{ ascending: false \}\)/);
  assert.match(settingsSource, /getValidSalesforceConnectionForCompany\(sessionUser\.company_id\)/);
  assert.match(settingsSource, /const connected = connectionHealth\.ok/);
  assert.match(workflowSource, /getSalesforceIntegration\(accountId\)/);
});
