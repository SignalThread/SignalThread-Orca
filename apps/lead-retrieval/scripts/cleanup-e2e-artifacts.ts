import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

type Row = { id: string };

function loadDotEnvLocal() {
  const envPath = join(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
  const contents = readFileSync(envPath, "utf8");
  for (const line of contents.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...rest] = trimmed.split("=");
    if (!key || process.env[key]) continue;
    let value = rest.join("=").trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function isLocalSupabaseUrl(raw: string) {
  try {
    const url = new URL(raw);
    return ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  } catch {
    return false;
  }
}

function requireCleanupConfirmation(supabaseUrl: string) {
  const args = new Set(process.argv.slice(2));
  const confirmed =
    args.has("--confirm-local") ||
    String(process.env.E2E_ARTIFACT_CLEANUP_CONFIRM ?? "").trim().toLowerCase() === "local";

  if (!confirmed) {
    return false;
  }

  if (
    String(process.env.NODE_ENV ?? "").trim().toLowerCase() === "production" ||
    String(process.env.VERCEL_ENV ?? "").trim().toLowerCase() === "production"
  ) {
    throw new Error("Refusing cleanup in a production environment.");
  }

  const localUrl = isLocalSupabaseUrl(supabaseUrl);
  const allowRemoteTest =
    String(process.env.E2E_ARTIFACT_CLEANUP_ALLOW_REMOTE_TEST ?? "").trim().toLowerCase() === "true";
  if (!localUrl && !allowRemoteTest) {
    throw new Error(
      "Refusing cleanup against a non-local Supabase URL. Set E2E_ARTIFACT_CLEANUP_ALLOW_REMOTE_TEST=true only for a known test/dev project."
    );
  }

  return true;
}

function postgrestValue(value: string) {
  return encodeURIComponent(value);
}

function postgrestIn(ids: readonly string[]) {
  return `(${ids.map(postgrestValue).join(",")})`;
}

async function request<T>(
  table: string,
  query: string,
  init: RequestInit,
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<T> {
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}?${query}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json"
    }
  });
  if (!response.ok && response.status !== 404) {
    const text = await response.text().catch(() => "");
    throw new Error(`${init.method ?? "GET"} ${table} failed: ${response.status} ${text}`);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json().catch(() => undefined)) as T;
}

async function getRows(table: string, query: string, supabaseUrl: string, serviceRoleKey: string) {
  return request<Row[]>(table, query, { method: "GET" }, supabaseUrl, serviceRoleKey);
}

async function deleteRows(table: string, query: string, supabaseUrl: string, serviceRoleKey: string) {
  await request<void>(table, query, { method: "DELETE" }, supabaseUrl, serviceRoleKey);
}

async function main() {
  loadDotEnvLocal();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }

  const shouldDelete = requireCleanupConfirmation(supabaseUrl);
  const nameQuery = `name=like.${postgrestValue("E2E PW")}*&select=id,name`;
  const leadQuery = `full_name=like.${postgrestValue("E2E PW")}*&select=id,full_name`;
  const importBatchQuery = `source_last_filename=like.${postgrestValue("E2E PW")}*&select=id,source_last_filename`;

  const [workflows, signals, campaigns, leads, importBatches] = await Promise.all([
    getRows("workflow_templates", nameQuery, supabaseUrl, serviceRoleKey),
    getRows("signals", nameQuery, supabaseUrl, serviceRoleKey),
    getRows("campaigns", nameQuery, supabaseUrl, serviceRoleKey),
    getRows("leads", leadQuery, supabaseUrl, serviceRoleKey),
    getRows("import_batches", importBatchQuery, supabaseUrl, serviceRoleKey).catch(() => [])
  ]);

  console.log(
    `${shouldDelete ? "Cleaning" : "Dry run"} E2E PW artifacts: leads=${leads.length}, workflows=${workflows.length}, signals=${signals.length}, campaigns=${campaigns.length}, importBatches=${importBatches.length}`
  );

  if (!shouldDelete) {
    console.log("Pass --confirm-local to delete. Non-local Supabase URLs also require E2E_ARTIFACT_CLEANUP_ALLOW_REMOTE_TEST=true.");
    return;
  }

  const workflowIds = workflows.map((row) => row.id).filter(Boolean);
  if (workflowIds.length > 0) {
    const workflowIn = postgrestIn(workflowIds);
    const runRows = await getRows(
      "workflow_runs",
      `template_id=in.${workflowIn}&select=id`,
      supabaseUrl,
      serviceRoleKey
    ).catch(() => []);
    const runIds = runRows.map((row) => row.id).filter(Boolean);
    if (runIds.length > 0) {
      const runIn = postgrestIn(runIds);
      await deleteRows("generated_drafts", `run_id=in.${runIn}`, supabaseUrl, serviceRoleKey).catch(() => {});
      await deleteRows("workflow_step_runs", `run_id=in.${runIn}`, supabaseUrl, serviceRoleKey).catch(() => {});
      await deleteRows("workflow_runs", `id=in.${runIn}`, supabaseUrl, serviceRoleKey).catch(() => {});
    }
    await deleteRows("workflow_steps", `template_id=in.${workflowIn}`, supabaseUrl, serviceRoleKey).catch(() => {});
    await deleteRows("workflow_templates", `id=in.${workflowIn}`, supabaseUrl, serviceRoleKey);
  }

  const campaignIds = campaigns.map((row) => row.id).filter(Boolean);
  if (campaignIds.length > 0) {
    const campaignIn = postgrestIn(campaignIds);
    const messages = await getRows(
      "campaign_messages",
      `campaign_id=in.${campaignIn}&select=id`,
      supabaseUrl,
      serviceRoleKey
    );
    const messageIds = messages.map((row) => row.id).filter(Boolean);
    if (messageIds.length > 0) {
      await deleteRows("email_events", `campaign_message_id=in.${postgrestIn(messageIds)}`, supabaseUrl, serviceRoleKey);
    }
    await deleteRows("campaign_messages", `campaign_id=in.${campaignIn}`, supabaseUrl, serviceRoleKey);
    await deleteRows("campaign_recipients", `campaign_id=in.${campaignIn}`, supabaseUrl, serviceRoleKey);
    await deleteRows("campaigns", `id=in.${campaignIn}`, supabaseUrl, serviceRoleKey);
  }

  const importBatchIds = importBatches.map((row) => row.id).filter(Boolean);
  if (importBatchIds.length > 0) {
    const batchIn = postgrestIn(importBatchIds);
    await deleteRows("import_wizard_enrichment_runs", `batch_id=in.${batchIn}`, supabaseUrl, serviceRoleKey).catch(() => {});
    await deleteRows("import_batch_row_briefings", `batch_id=in.${batchIn}`, supabaseUrl, serviceRoleKey).catch(() => {});
    await deleteRows("import_batch_rows", `batch_id=in.${batchIn}`, supabaseUrl, serviceRoleKey).catch(() => {});
    await deleteRows("import_batch_field_mapping_state", `batch_id=in.${batchIn}`, supabaseUrl, serviceRoleKey).catch(() => {});
    await deleteRows("import_batches", `id=in.${batchIn}`, supabaseUrl, serviceRoleKey);
  }

  const leadIds = leads.map((row) => row.id).filter(Boolean);
  if (leadIds.length > 0) {
    const leadIn = postgrestIn(leadIds);
    const runs = await getRows(
      "workflow_runs",
      `lead_id=in.${leadIn}&select=id`,
      supabaseUrl,
      serviceRoleKey
    ).catch(() => []);
    const runIds = runs.map((row) => row.id).filter(Boolean);
    if (runIds.length > 0) {
      const runIn = postgrestIn(runIds);
      await deleteRows("generated_drafts", `run_id=in.${runIn}`, supabaseUrl, serviceRoleKey).catch(() => {});
      await deleteRows("workflow_step_runs", `run_id=in.${runIn}`, supabaseUrl, serviceRoleKey).catch(() => {});
      await deleteRows("workflow_runs", `id=in.${runIn}`, supabaseUrl, serviceRoleKey).catch(() => {});
    }
    await deleteRows("generated_drafts", `lead_id=in.${leadIn}`, supabaseUrl, serviceRoleKey).catch(() => {});
    await deleteRows("campaign_recipients", `lead_id=in.${leadIn}`, supabaseUrl, serviceRoleKey).catch(() => {});
    await deleteRows("import_batch_row_briefings", `lead_id=in.${leadIn}`, supabaseUrl, serviceRoleKey).catch(() => {});
    await deleteRows("lead_cumulative_insights", `lead_id=in.${leadIn}`, supabaseUrl, serviceRoleKey).catch(() => {});
    await deleteRows("lead_voice_notes", `lead_id=in.${leadIn}`, supabaseUrl, serviceRoleKey).catch(() => {});
    await deleteRows("lead_briefings", `lead_id=in.${leadIn}`, supabaseUrl, serviceRoleKey).catch(() => {});
    await deleteRows("lead_enrichments", `lead_id=in.${leadIn}`, supabaseUrl, serviceRoleKey).catch(() => {});
    await deleteRows("lead_conversations", `lead_id=in.${leadIn}`, supabaseUrl, serviceRoleKey).catch(() => {});
    await deleteRows("leads", `id=in.${leadIn}`, supabaseUrl, serviceRoleKey);
  }

  const signalIds = signals.map((row) => row.id).filter(Boolean);
  if (signalIds.length > 0) {
    await deleteRows("signals", `id=in.${postgrestIn(signalIds)}`, supabaseUrl, serviceRoleKey);
  }

  console.log("Cleanup complete.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
