import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

type SchemaCheck = {
  name: string;
  ok: boolean;
  error: string | null;
};

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function assertSelectable(
  supabase: any,
  name: string,
  table: string,
  columns: string
): Promise<SchemaCheck> {
  const { error } = await supabase.from(table).select(columns).limit(1);
  return {
    name,
    ok: !error,
    error: error?.message ?? null
  };
}

function checkLocalMigrations() {
  const migrationDir = join(process.cwd(), "supabase", "migrations");
  const files = existsSync(migrationDir) ? readdirSync(migrationDir) : [];
  const has0089 = files.some((file) => file.startsWith("0089_"));
  const has0090 = files.some((file) => file.startsWith("0090_"));
  return {
    name: "local_required_migrations_present",
    ok: has0089 && has0090,
    error: has0089 && has0090 ? null : "Required local migrations 0089 and 0090 are missing."
  };
}

export async function checkConversationLifecycleSchema() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || requiredEnv("SUPABASE_URL");
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false }
  });

  const checks: SchemaCheck[] = [
    checkLocalMigrations(),
    await assertSelectable(
      supabase,
      "lead_conversation_readiness_exists",
      "lead_conversation_readiness",
      "lead_id, latest_conversation_version, transcript_status, transcript_version, insights_status, insights_version"
    ),
    await assertSelectable(
      supabase,
      "lead_conversations_lifecycle_columns_exist",
      "lead_conversations",
      "id, lead_id, storage_path, content_type, conversation_version, transcription_status, transcription_error, transcript, transcribed_at, synthesis_status, synthesis_error, summary, synthesized_at"
    ),
    await assertSelectable(
      supabase,
      "workflow_step_runs_wait_columns_exist",
      "workflow_step_runs",
      "id, status, waiting_reason, required_conversation_version, current_transcript_version, current_insights_version, wait_started_at, wait_expires_at"
    ),
    await assertSelectable(
      supabase,
      "workflow_runs_wait_status_visible",
      "workflow_runs",
      "id, status, current_step_index"
    )
  ];

  return {
    ok: checks.every((check) => check.ok),
    checks
  };
}

if (require.main === module) {
  checkConversationLifecycleSchema()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      if (!result.ok) process.exit(1);
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
}
