import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";
import { deleteWorkflowTemplateForScope } from "../../lib/exhibitor/workflows/delete-workflow-template";

/** Matches app `generateLicenseKey` format (unique per row). */
function generateE2ELicenseKey(): string {
  return "LIC-" + randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase();
}

function loadEnv(): Record<string, string> {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(envPath, "utf8")
      .split("\n")
      .filter((l) => l.includes("=") && !l.startsWith("#"))
      .map((l) => {
        const [key, ...rest] = l.split("=");
        let val = rest.join("=").trim();
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        return [key.trim(), val];
      })
  );
}

const env = loadEnv();

export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || env["NEXT_PUBLIC_SUPABASE_URL"] || "";
/** Browser (anon) key — matches `NEXT_PUBLIC_SUPABASE_ANON_KEY` for password grant seeding during E2E setup. */
export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env["NEXT_PUBLIC_SUPABASE_ANON_KEY"] || "";
export const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || env["SUPABASE_SERVICE_ROLE_KEY"] || "";

function restHeaders(): Record<string, string> {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
  };
}

// ── Generic Supabase REST helpers (service-role, bypasses RLS) ───────────

export async function supabaseGet<T = any>(
  table: string,
  query: string
): Promise<T[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: restHeaders(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GET ${table} failed: ${res.status} ${text}`);
  }
  return res.json();
}

export async function supabaseInsert<T = any>(
  table: string,
  data: Record<string, unknown>
): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...restHeaders(), Prefer: "return=representation" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`POST ${table} failed: ${res.status} ${text}`);
  }
  const rows = await res.json();
  return Array.isArray(rows) ? rows[0] : rows;
}

export async function supabasePatch<T = any>(
  table: string,
  query: string,
  data: Record<string, unknown>
): Promise<T[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: "PATCH",
    headers: { ...restHeaders(), Prefer: "return=representation" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`PATCH ${table} failed: ${res.status} ${text}`);
  }
  return res.json();
}

export async function supabaseDelete(
  table: string,
  query: string
): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: "DELETE",
    headers: restHeaders(),
  });
  if (!res.ok && res.status !== 404) {
    const text = await res.text().catch(() => "");
    throw new Error(`DELETE ${table} failed: ${res.status} ${text}`);
  }
}

function postgrestValue(value: string): string {
  return encodeURIComponent(value);
}

function postgrestIn(values: readonly string[]): string {
  return `(${values.map(postgrestValue).join(",")})`;
}

function createWorkflowDeleteRestClient() {
  return {
    from(table: string) {
      return {
        select(cols: string) {
          const filters: string[] = [];
          const builder = {
            eq(col: string, val: string) {
              filters.push(`${col}=eq.${postgrestValue(val)}`);
              return builder;
            },
            async maybeSingle() {
              const select = `select=${cols.replace(/\s+/g, "")}`;
              const rows = await supabaseGet<Record<string, unknown>>(
                table,
                [...filters, select].join("&")
              );
              return { data: rows[0] ?? null, error: null };
            },
            then<TResult>(
              onFulfilled: (value: { data: Record<string, unknown>[] | null; error: { message: string; code?: string } | null }) => TResult
            ) {
              const select = `select=${cols.replace(/\s+/g, "")}`;
              return supabaseGet<Record<string, unknown>>(
                table,
                [...filters, select].join("&")
              )
                .then((rows) => onFulfilled({ data: rows, error: null }))
                .catch((error) =>
                  onFulfilled({
                    data: null,
                    error: {
                      message: error instanceof Error ? error.message : String(error)
                    }
                  })
                );
            }
          };
          return builder;
        },
        delete() {
          const filters: string[] = [];
          const builder = {
            eq(col: string, val: string) {
              filters.push(`${col}=eq.${postgrestValue(val)}`);
              return builder;
            },
            in(col: string, vals: string[]) {
              filters.push(`${col}=in.${postgrestIn(vals)}`);
              return builder;
            },
            then<TResult>(
              onFulfilled: (value: { error: { message: string; code?: string } | null }) => TResult
            ) {
              return supabaseDelete(table, filters.join("&"))
                .then(() => onFulfilled({ error: null }))
                .catch((error) =>
                  onFulfilled({
                    error: {
                      message: error instanceof Error ? error.message : String(error)
                    }
                  })
                );
            }
          };
          return builder;
        }
      };
    }
  };
}

function isLocalUrl(raw: string | undefined): boolean {
  const value = String(raw ?? "").trim();
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1";
  } catch {
    return false;
  }
}

export function isE2EArtifactCleanupAllowed(baseUrl?: string | null): boolean {
  if (process.env.NODE_ENV === "test") return true;
  if (String(process.env.E2E_AUTH_BYPASS_ENABLED ?? "").trim().toLowerCase() === "true") return true;
  if (isLocalUrl(baseUrl ?? undefined)) return true;
  if (isLocalUrl(process.env.PLAYWRIGHT_TEST_BASE_URL)) return true;
  if (isLocalUrl(process.env.PLAYWRIGHT_BASE_URL)) return true;
  if (isLocalUrl(SUPABASE_URL)) return true;
  return false;
}

function assertE2EArtifactCleanupAllowed(baseUrl?: string | null) {
  if (isE2EArtifactCleanupAllowed(baseUrl)) return;
  throw new Error(
    "Refusing E2E workflow artifact cleanup: environment is not explicitly test/local."
  );
}

export function e2eWorkflowArtifactNamePrefix(testRunId: string): string {
  const normalized = String(testRunId ?? "").trim();
  if (!normalized) {
    throw new Error("E2E cleanup requires a non-empty testRunId.");
  }
  return `E2E PW ${normalized}`;
}

export function e2eWorkflowArtifactNameLikeQuery(testRunId: string): string {
  return `name=like.${postgrestValue(e2eWorkflowArtifactNamePrefix(testRunId))}*`;
}

type E2EWorkflowArtifactCleanupScope = {
  testRunId: string;
  companyId: string;
  eventId?: string | null;
  baseUrl?: string | null;
};

export type E2EWorkflowArtifactCleanupResult = {
  workflowIds: string[];
  signalIds: string[];
  campaignIds: string[];
};

export type PersistentTestArtifactCleanupScope = E2EWorkflowArtifactCleanupScope & {
  leadIds?: readonly string[];
  workflowIds?: readonly string[];
  signalIds?: readonly string[];
  campaignIds?: readonly string[];
  importBatchIds?: readonly string[];
};

export type PersistentTestArtifactCleanupResult = E2EWorkflowArtifactCleanupResult & {
  leadIds: string[];
  importBatchIds: string[];
};

function uniq(values: readonly string[]): string[] {
  return Array.from(new Set(values.map(String).map((value) => value.trim()).filter(Boolean)));
}

async function findWorkflowTemplateIdsForE2ERun(
  scope: E2EWorkflowArtifactCleanupScope
): Promise<string[]> {
  const rows = await supabaseGet<{ id: string }>(
    "workflow_templates",
    [
      e2eWorkflowArtifactNameLikeQuery(scope.testRunId),
      `company_id=eq.${postgrestValue(scope.companyId)}`,
      "select=id"
    ].join("&")
  );
  return rows.map((row) => row.id).filter(Boolean);
}

async function findLeadIdsForE2ERun(
  scope: E2EWorkflowArtifactCleanupScope
): Promise<string[]> {
  const eventId = String(scope.eventId ?? "").trim();
  const query = [
    `full_name=like.${postgrestValue(e2eWorkflowArtifactNamePrefix(scope.testRunId))}*`,
    `company_id=eq.${postgrestValue(scope.companyId)}`,
    eventId ? `event_id=eq.${postgrestValue(eventId)}` : "",
    "select=id"
  ]
    .filter(Boolean)
    .join("&");
  const rows = await supabaseGet<{ id: string }>("leads", query);
  return rows.map((row) => row.id).filter(Boolean);
}

async function findSignalIdsForE2ERun(
  scope: E2EWorkflowArtifactCleanupScope
): Promise<string[]> {
  const eventId = String(scope.eventId ?? "").trim();
  const query = [
    e2eWorkflowArtifactNameLikeQuery(scope.testRunId),
    `company_id=eq.${postgrestValue(scope.companyId)}`,
    eventId ? `event_id=eq.${postgrestValue(eventId)}` : "",
    "select=id"
  ]
    .filter(Boolean)
    .join("&");
  const rows = await supabaseGet<{ id: string }>("signals", query);
  return rows.map((row) => row.id).filter(Boolean);
}

async function findCampaignIdsForE2ERun(
  scope: E2EWorkflowArtifactCleanupScope
): Promise<string[]> {
  const rows = await supabaseGet<{ id: string }>(
    "campaigns",
    [
      e2eWorkflowArtifactNameLikeQuery(scope.testRunId),
      `company_id=eq.${postgrestValue(scope.companyId)}`,
      "select=id"
    ].join("&")
  );
  return rows.map((row) => row.id).filter(Boolean);
}

async function findImportBatchIdsForE2ERun(
  scope: E2EWorkflowArtifactCleanupScope
): Promise<string[]> {
  const rows = await supabaseGet<{ id: string }>(
    "import_batches",
    [
      `source_last_filename=like.${postgrestValue(e2eWorkflowArtifactNamePrefix(scope.testRunId))}*`,
      `company_id=eq.${postgrestValue(scope.companyId)}`,
      "select=id"
    ].join("&")
  ).catch(() => []);
  return rows.map((row) => row.id).filter(Boolean);
}

async function deleteWorkflowTemplatesById(
  workflowIds: readonly string[],
  scope: E2EWorkflowArtifactCleanupScope
) {
  if (workflowIds.length === 0) return;

  const deleteClient = createWorkflowDeleteRestClient();
  await Promise.all(
    uniq(workflowIds).map((workflowId) =>
      deleteWorkflowTemplateForScope(deleteClient, {
        workflowId,
        companyId: scope.companyId,
        eventIdForScope: scope.eventId ?? null
      })
    )
  );
}

async function deleteSignalsById(signalIds: readonly string[]) {
  if (signalIds.length === 0) return;
  await supabaseDelete("signals", `id=in.${postgrestIn(signalIds)}`);
}

export async function deleteCampaignsById(campaignIds: readonly string[]) {
  if (campaignIds.length === 0) return;
  const campaignIn = postgrestIn(campaignIds);
  const messageRows = await supabaseGet<{ id: string }>(
    "campaign_messages",
    `campaign_id=in.${campaignIn}&select=id`
  ).catch(() => []);
  const messageIds = messageRows.map((row) => row.id).filter(Boolean);

  if (messageIds.length > 0) {
    await supabaseDelete("email_events", `campaign_message_id=in.${postgrestIn(messageIds)}`);
  }

  await supabaseDelete("campaign_messages", `campaign_id=in.${campaignIn}`);
  await supabaseDelete("campaign_recipients", `campaign_id=in.${campaignIn}`);
  await supabaseDelete("campaigns", `id=in.${campaignIn}`);
}

export async function deleteImportBatchesById(importBatchIds: readonly string[]) {
  const ids = uniq(importBatchIds);
  if (ids.length === 0) return;
  const batchIn = postgrestIn(ids);

  await supabaseDelete("import_wizard_enrichment_runs", `batch_id=in.${batchIn}`).catch(() => {});
  await supabaseDelete("import_batch_row_briefings", `batch_id=in.${batchIn}`).catch(() => {});
  await supabaseDelete("import_batch_rows", `batch_id=in.${batchIn}`).catch(() => {});
  await supabaseDelete("import_batch_field_mapping_state", `batch_id=in.${batchIn}`).catch(() => {});
  await supabaseDelete("import_batches", `id=in.${batchIn}`);
}

export async function deleteLeadsById(leadIds: readonly string[]) {
  const ids = uniq(leadIds);
  if (ids.length === 0) return;
  const leadIn = postgrestIn(ids);

  const runRows = await supabaseGet<{ id: string }>(
    "workflow_runs",
    `lead_id=in.${leadIn}&select=id`
  ).catch(() => []);
  const runIds = uniq(runRows.map((row) => row.id));
  if (runIds.length > 0) {
    const runIn = postgrestIn(runIds);
    await supabaseDelete("generated_drafts", `run_id=in.${runIn}`).catch(() => {});
    await supabaseDelete("workflow_step_runs", `run_id=in.${runIn}`).catch(() => {});
    await supabaseDelete("workflow_runs", `id=in.${runIn}`).catch(() => {});
  }

  await supabaseDelete("generated_drafts", `lead_id=in.${leadIn}`).catch(() => {});
  await supabaseDelete("campaign_recipients", `lead_id=in.${leadIn}`).catch(() => {});
  await supabaseDelete("import_batch_row_briefings", `lead_id=in.${leadIn}`).catch(() => {});
  await supabaseDelete("lead_cumulative_insights", `lead_id=in.${leadIn}`).catch(() => {});
  await supabaseDelete("lead_voice_notes", `lead_id=in.${leadIn}`).catch(() => {});
  await supabaseDelete("lead_briefings", `lead_id=in.${leadIn}`).catch(() => {});
  await supabaseDelete("lead_enrichments", `lead_id=in.${leadIn}`).catch(() => {});
  await supabaseDelete("lead_conversations", `lead_id=in.${leadIn}`).catch(() => {});
  await supabaseDelete("leads", `id=in.${leadIn}`);
}

export async function findE2EWorkflowArtifactIdsForRun(
  scope: E2EWorkflowArtifactCleanupScope
): Promise<E2EWorkflowArtifactCleanupResult> {
  assertE2EArtifactCleanupAllowed(scope.baseUrl);
  const [workflowIds, signalIds, campaignIds] = await Promise.all([
    findWorkflowTemplateIdsForE2ERun(scope),
    findSignalIdsForE2ERun(scope),
    findCampaignIdsForE2ERun(scope)
  ]);
  return {
    workflowIds: Array.from(new Set(workflowIds)),
    signalIds: Array.from(new Set(signalIds)),
    campaignIds: Array.from(new Set(campaignIds))
  };
}

export async function findPersistentTestArtifactIdsForRun(
  scope: PersistentTestArtifactCleanupScope
): Promise<PersistentTestArtifactCleanupResult> {
  assertE2EArtifactCleanupAllowed(scope.baseUrl);
  const [prefixLeadIds, prefixWorkflowIds, prefixSignalIds, prefixCampaignIds, prefixImportBatchIds] =
    await Promise.all([
      findLeadIdsForE2ERun(scope),
      findWorkflowTemplateIdsForE2ERun(scope),
      findSignalIdsForE2ERun(scope),
      findCampaignIdsForE2ERun(scope),
      findImportBatchIdsForE2ERun(scope)
    ]);

  return {
    leadIds: uniq([...(scope.leadIds ?? []), ...prefixLeadIds]),
    workflowIds: uniq([...(scope.workflowIds ?? []), ...prefixWorkflowIds]),
    signalIds: uniq([...(scope.signalIds ?? []), ...prefixSignalIds]),
    campaignIds: uniq([...(scope.campaignIds ?? []), ...prefixCampaignIds]),
    importBatchIds: uniq([...(scope.importBatchIds ?? []), ...prefixImportBatchIds])
  };
}

export async function cleanupPersistentTestArtifactsForRun(
  scope: PersistentTestArtifactCleanupScope
): Promise<PersistentTestArtifactCleanupResult> {
  assertE2EArtifactCleanupAllowed(scope.baseUrl);
  const found = await findPersistentTestArtifactIdsForRun(scope);

  await Promise.allSettled([
    deleteWorkflowTemplatesById(found.workflowIds, scope),
    deleteCampaignsById(found.campaignIds),
    deleteImportBatchesById(found.importBatchIds),
    deleteSignalsById(found.signalIds),
    deleteLeadsById(found.leadIds)
  ]);

  return found;
}

export async function cleanupE2EWorkflowArtifactsForRun(
  scope: E2EWorkflowArtifactCleanupScope
): Promise<E2EWorkflowArtifactCleanupResult> {
  const found = await cleanupPersistentTestArtifactsForRun(scope);
  return {
    workflowIds: found.workflowIds,
    signalIds: found.signalIds,
    campaignIds: found.campaignIds
  };
}

// ── Supabase Auth Admin helpers ──────────────────────────────────────────

export async function createAuthUser(
  email: string,
  password: string
): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: restHeaders(),
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Create auth user failed: ${res.status} ${text}`);
  }
  const data = await res.json();
  return data.id;
}

export async function deleteAuthUser(userId: string): Promise<void> {
  const res = await fetch(
    `${SUPABASE_URL}/auth/v1/admin/users/${userId}`,
    { method: "DELETE", headers: restHeaders() }
  );
  if (!res.ok && res.status !== 404) {
    const text = await res.text().catch(() => "");
    throw new Error(`Delete auth user failed: ${res.status} ${text}`);
  }
}

// ── Test data helpers ────────────────────────────────────────────────────

/**
 * Remove a test user by email from auth, users, and event_users tables.
 * Silently ignores missing rows.
 */
export async function cleanupTestUser(email: string): Promise<void> {
  const users = await supabaseGet<{ id: string }>(
    "users",
    `email=eq.${email}&select=id`
  ).catch(() => []);
  for (const user of users) {
    await supabaseDelete("event_users", `user_id=eq.${user.id}`).catch(
      () => {}
    );
    await supabaseDelete("users", `id=eq.${user.id}`).catch(() => {});
    await deleteAuthUser(user.id).catch(() => {});
  }
}

/**
 * Count active event_users rows with permissions.app = true
 * for a given event + exhibitor scope.
 */
export async function countActiveAppUsers(
  eventId: string,
  exhibitorCompanyId: string
): Promise<number> {
  const rows = await supabaseGet<{
    id: string;
    permissions: Record<string, unknown>;
  }>(
    "event_users",
    `event_id=eq.${eventId}&exhibitor_company_id=eq.${exhibitorCompanyId}&status=eq.active&select=id,permissions`
  );
  return rows.filter((r) => r.permissions?.app === true).length;
}

// ── Test context ─────────────────────────────────────────────────────────

export type TestExhibitorContext = {
  userId: string;
  companyId: string;
  eventId: string;
  exhibitorCompanyId: string;
  licenseId: string | null;
};

/** Matches `e2e/auth.setup.ts` organizer_admin account (Supabase normalizes email casing in `users`). */
const PLAYWRIGHT_ORGANIZER_EMAIL = "playwright-oa@test.com";

export type OrganizerInviteTestContext = {
  organizerUserId: string;
  eventId: string;
  exhibitorCompanyId: string;
  licenseId: string;
};

/**
 * Idempotently seeds everything POST /api/organizer/invite needs for the **same**
 * event/exhibitor/license scope as `resolveTestExhibitorContext()` (self-owned, deterministic):
 * - organizer `event_users` for that event + exhibitor scope (getOrganizerScope)
 * - `exhibitors` row for (event_id, exhibitor company) when missing
 * - active `licenses` row for the resolved license id
 */
export async function ensureOrganizerInviteTestFixture(
  exhibitorCtx: Pick<TestExhibitorContext, "eventId" | "exhibitorCompanyId" | "licenseId">
): Promise<OrganizerInviteTestContext> {
  const users = await supabaseGet<{ id: string }>(
    "users",
    `email=eq.${PLAYWRIGHT_ORGANIZER_EMAIL}&select=id`
  );
  if (!users.length) {
    throw new Error(
      `E2E: organizer user ${PLAYWRIGHT_ORGANIZER_EMAIL} not found in public.users`
    );
  }
  const organizerUserId = users[0].id;

  const eventId = exhibitorCtx.eventId;
  const exhibitorCompanyId = exhibitorCtx.exhibitorCompanyId;
  const licenseId = exhibitorCtx.licenseId;
  if (!licenseId) {
    throw new Error(
      "E2E: resolveTestExhibitorContext() returned no licenseId; cannot seed organizer invite."
    );
  }

  const eventRows = await supabaseGet<{ company_id: string | null }>(
    "events",
    `id=eq.${eventId}&select=company_id`
  );
  const eventOwnerCompanyId = eventRows[0]?.company_id;
  if (!eventOwnerCompanyId) {
    throw new Error("E2E: event has no company_id.");
  }

  const exhibitorRows = await supabaseGet<{ id: string }>(
    "exhibitors",
    `event_id=eq.${eventId}&company_id=eq.${exhibitorCompanyId}&select=id&limit=1`
  );
  if (!exhibitorRows.length) {
    await supabaseInsert("exhibitors", {
      event_id: eventId,
      company_id: exhibitorCompanyId,
      status: "active",
    });
  }

  const licRows = await supabaseGet<{
    id: string;
    seats_total: number | null;
    status: string | null;
  }>(
    "licenses",
    `id=eq.${licenseId}&select=id,seats_total,status`
  );
  if (!licRows.length) {
    throw new Error(`E2E: license ${licenseId} not found.`);
  }

  const expires = new Date();
  expires.setUTCFullYear(expires.getUTCFullYear() + 1);
  const expiresDay = expires.toISOString().slice(0, 10);
  const row = licRows[0];
  const seats = Math.max(10, Number(row.seats_total ?? 0));
  await supabasePatch("licenses", `id=eq.${licenseId}`, {
    status: "active",
    expires_at: expiresDay,
    seats_total: seats,
  });

  const mem = await supabaseGet<{ id: string }>(
    "event_users",
    `user_id=eq.${organizerUserId}&event_id=eq.${eventId}&select=id`
  );
  if (mem.length) {
    await supabasePatch("event_users", `id=eq.${mem[0].id}`, {
      exhibitor_company_id: exhibitorCompanyId,
      status: "active",
      permissions: { admin: true, app: false },
    });
  } else {
    await supabaseInsert("event_users", {
      event_id: eventId,
      user_id: organizerUserId,
      exhibitor_company_id: exhibitorCompanyId,
      status: "active",
      permissions: { admin: true, app: false },
      created_at: new Date().toISOString(),
    });
  }

  return {
    organizerUserId,
    eventId,
    exhibitorCompanyId,
    licenseId,
  };
}

/**
 * Email used by `e2e/auth.setup.ts` for the exhibitor_admin Playwright account.
 */
export const PLAYWRIGHT_EXHIBITOR_EMAIL = "playwright-ea@test.com";

type LicenseRow = {
  id: string;
  event_id: string | null;
  exhibitor_company_id: string | null;
  status: string | null;
  expires_at: string | null;
};

function isLicenseUsableForSeatTests(row: LicenseRow): boolean {
  const st = String(row.status ?? "").toLowerCase();
  // Must match server `evaluateAppAccessGrant` / seat rules (active license only, not trial).
  if (st !== "active") return false;
  if (!row.expires_at) return true;
  const t = new Date(row.expires_at).getTime();
  return !Number.isNaN(t) && t > Date.now();
}

function pickBestLicense(rows: LicenseRow[]): LicenseRow | null {
  const usable = rows.filter(isLicenseUsableForSeatTests);
  return usable[0] ?? null;
}

async function fetchLicensesForExhibitorCompany(
  exhibitorCompanyId: string
): Promise<LicenseRow[]> {
  return supabaseGet<LicenseRow>(
    "licenses",
    `exhibitor_company_id=eq.${exhibitorCompanyId}&select=id,event_id,exhibitor_company_id,status,expires_at&order=created_at.desc`
  );
}

/**
 * Ensure there is an event_users row for (user, event) with exhibitor scope.
 * Uses unique (event_id, user_id); patches exhibitor_company_id if missing.
 */
async function ensureEventUserMembership(userId: string, eventId: string, exhibitorCompanyId: string) {
  const existing = await supabaseGet<{
    id: string;
    exhibitor_company_id: string | null;
    status: string | null;
    permissions: Record<string, unknown> | null;
  }>(
    "event_users",
    `user_id=eq.${userId}&event_id=eq.${eventId}&select=id,exhibitor_company_id,status,permissions`
  );
  if (existing.length) {
    const row = existing[0];
    const patch: Record<string, unknown> = {};
    if (!row.exhibitor_company_id && exhibitorCompanyId) {
      patch.exhibitor_company_id = exhibitorCompanyId;
    }
    if (row.status !== "active") {
      patch.status = "active";
    }
    if (row.permissions?.admin !== true || row.permissions?.app !== true) {
      patch.permissions = { admin: true, app: true };
    }
    if (Object.keys(patch).length > 0) {
      await supabasePatch("event_users", `id=eq.${row.id}`, {
        ...patch,
      });
    }
    return;
  }

  await supabaseInsert("event_users", {
    event_id: eventId,
    user_id: userId,
    exhibitor_company_id: exhibitorCompanyId,
    status: "active",
    permissions: { admin: true, app: true },
    created_at: new Date().toISOString(),
  });
}

/**
 * Bootstrap: first event in DB + exhibitor row + license + membership for the playwright user.
 * Deterministic enough for e2e: same DB state yields same event choice (order by id).
 */
async function bootstrapMinimalExhibitorFixture(user: {
  id: string;
  company_id: string;
}): Promise<{ eventId: string; exhibitorCompanyId: string; licenseId: string }> {
  const events = await supabaseGet<{ id: string; company_id: string }>(
    "events",
    "select=id,company_id&order=id.asc&limit=1"
  );
  if (!events.length) {
    throw new Error(
      "E2E bootstrap: no events in database. Add at least one event before running license e2e tests."
    );
  }

  const event = events[0];
  const organizerCompanyId = event.company_id;
  if (!organizerCompanyId) {
    throw new Error(
      "E2E bootstrap: selected event has no company_id (organizer). Fix events data or seed."
    );
  }

  const exhibitorCompanyId = user.company_id;

  const exhibitorRows = await supabaseGet<{ id: string }>(
    "exhibitors",
    `event_id=eq.${event.id}&company_id=eq.${exhibitorCompanyId}&select=id&limit=1`
  );
  if (!exhibitorRows.length) {
    await supabaseInsert("exhibitors", {
      event_id: event.id,
      company_id: exhibitorCompanyId,
      status: "active",
    });
  }

  const licRows = await fetchLicensesForExhibitorCompany(exhibitorCompanyId);
  const forEvent = licRows.filter((l) => l.event_id === event.id);
  if (!forEvent.length) {
    const expires = new Date();
    expires.setUTCFullYear(expires.getUTCFullYear() + 1);
    const inserted = await supabaseInsert<{ id: string }>("licenses", {
      event_id: event.id,
      company_id: organizerCompanyId,
      exhibitor_company_id: exhibitorCompanyId,
      license_key: generateE2ELicenseKey(),
      seats_total: 10,
      seats_used: 0,
      status: "active",
      expires_at: expires.toISOString().slice(0, 10),
      term_months: 12,
      price_cents: 0,
      currency: "USD",
    });
    await ensureEventUserMembership(user.id, event.id, exhibitorCompanyId);
    return {
      eventId: event.id,
      exhibitorCompanyId,
      licenseId: inserted.id,
    };
  }

  let best = pickBestLicense(forEvent);
  // Unique (event_id, exhibitor_company_id): revive an expired/inactive row instead of inserting.
  if (!best) {
    const revive = forEvent[0]!;
    const expires = new Date();
    expires.setUTCFullYear(expires.getUTCFullYear() + 1);
    await supabasePatch("licenses", `id=eq.${revive.id}`, {
      status: "active",
      expires_at: expires.toISOString().slice(0, 10),
      seats_total: 10,
    });
    best = {
      ...revive,
      status: "active",
      expires_at: expires.toISOString().slice(0, 10),
    };
  }

  await ensureEventUserMembership(user.id, event.id, exhibitorCompanyId);
  return { eventId: event.id, exhibitorCompanyId, licenseId: best.id };
}

/**
 * Resolve the Playwright exhibitor test account's event, company, and license.
 *
 * Does **not** require a pre-existing `event_users` row. Resolution order:
 * 1. Existing `event_users` (active or invited) for the user
 * 2. Active license for `users.company_id` (exhibitor company)
 * 3. License referenced by `users.license_id`
 * 4. `exhibitors` row for the exhibitor company → event
 * 5. Bootstrap minimal fixture (event + exhibitor + license + membership) when needed
 *
 * After resolving event + exhibitor scope, ensures an `event_users` membership exists so
 * invite/scope APIs behave like production.
 */
export async function resolveTestExhibitorContext(): Promise<TestExhibitorContext> {
  const users = await supabaseGet<{
    id: string;
    company_id: string | null;
    license_id: string | null;
  }>(
    "users",
    `email=eq.${PLAYWRIGHT_EXHIBITOR_EMAIL}&select=id,company_id,license_id`
  );
  if (!users.length) {
    throw new Error(
      `Test exhibitor user (${PLAYWRIGHT_EXHIBITOR_EMAIL}) not found in public.users`
    );
  }

  const user = users[0];
  if (!user.company_id) {
    throw new Error(
      `Test exhibitor (${PLAYWRIGHT_EXHIBITOR_EMAIL}) has no company_id; set company_id on the users row for e2e.`
    );
  }

  const exhibitorCompanyId = user.company_id;
  let eventId: string | null = null;
  let resolvedExhibitorCo = exhibitorCompanyId;
  let licenseId: string | null = null;

  // 1) Prefer existing membership (active or invited — matches invite flow)
  const memberships = await supabaseGet<{
    event_id: string;
    exhibitor_company_id: string | null;
  }>(
    "event_users",
    `user_id=eq.${user.id}&status=in.(active,invited)&select=event_id,exhibitor_company_id&order=created_at.desc`
  );
  if (memberships.length) {
    eventId = memberships[0].event_id;
    resolvedExhibitorCo =
      memberships[0].exhibitor_company_id ?? exhibitorCompanyId;
  }

  // 2) Any usable license for this exhibitor company
  if (!eventId) {
    const lic = pickBestLicense(await fetchLicensesForExhibitorCompany(exhibitorCompanyId));
    if (lic?.event_id) {
      eventId = lic.event_id;
      licenseId = lic.id;
      resolvedExhibitorCo = lic.exhibitor_company_id ?? exhibitorCompanyId;
    }
  }

  // 3) users.license_id → license row
  if (!eventId && user.license_id) {
    const byUserLic = await supabaseGet<LicenseRow>(
      "licenses",
      `id=eq.${user.license_id}&select=id,event_id,exhibitor_company_id,status,expires_at`
    );
    const picked = pickBestLicense(byUserLic);
    if (picked?.event_id) {
      eventId = picked.event_id;
      licenseId = picked.id;
      resolvedExhibitorCo = picked.exhibitor_company_id ?? exhibitorCompanyId;
    }
  }

  // 4) exhibitors registration for this company
  if (!eventId) {
    const ex = await supabaseGet<{ event_id: string }>(
      "exhibitors",
      `company_id=eq.${exhibitorCompanyId}&select=event_id&order=created_at.desc&limit=1`
    );
    if (ex.length) {
      eventId = ex[0].event_id;
      resolvedExhibitorCo = exhibitorCompanyId;
    }
  }

  // 5) Bootstrap minimal deterministic fixture
  if (!eventId) {
    const boot = await bootstrapMinimalExhibitorFixture({
      id: user.id,
      company_id: user.company_id,
    });
    eventId = boot.eventId;
    resolvedExhibitorCo = boot.exhibitorCompanyId;
    licenseId = boot.licenseId;
  } else {
    await ensureEventUserMembership(user.id, eventId, resolvedExhibitorCo);
    if (!licenseId) {
      const scoped = await supabaseGet<{ id: string }>(
        "licenses",
        `event_id=eq.${eventId}&exhibitor_company_id=eq.${resolvedExhibitorCo}&select=id&order=created_at.desc&limit=1`
      );
      licenseId = scoped[0]?.id ?? null;
    }
  }

  return {
    userId: user.id,
    companyId: user.company_id,
    eventId,
    exhibitorCompanyId: resolvedExhibitorCo,
    licenseId,
  };
}
