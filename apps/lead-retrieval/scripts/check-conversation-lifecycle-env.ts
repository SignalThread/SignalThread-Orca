type EnvCheck = {
  name: string;
  description: string;
  required: boolean;
};

const CHECKS: EnvCheck[] = [
  {
    name: "WORKFLOW_TICK_SECRET",
    description: "internal workflow/conversation reconciler tick bearer",
    required: true
  },
  {
    name: "CRON_SECRET",
    description: "Vercel Cron bearer for /api/internal/workflow-tick",
    required: true
  },
  {
    name: "OPENAI_API_KEY",
    description: "transcription and conversation synthesis provider key",
    required: true
  },
  {
    name: "R2_ENDPOINT",
    description: "audio object storage endpoint",
    required: true
  },
  {
    name: "R2_ACCESS_KEY_ID",
    description: "audio object storage access key id",
    required: true
  },
  {
    name: "R2_SECRET_ACCESS_KEY",
    description: "audio object storage secret",
    required: true
  },
  {
    name: "R2_BUCKET",
    description: "audio object storage bucket",
    required: true
  },
  {
    name: "SUPABASE_SERVICE_ROLE_KEY",
    description: "deploy verification service role",
    required: true
  },
  {
    name: "NEXT_PUBLIC_SUPABASE_URL",
    description: "Supabase project URL",
    required: false
  },
  {
    name: "SUPABASE_URL",
    description: "Supabase project URL fallback",
    required: false
  }
];

export function checkConversationLifecycleEnv(
  env: Record<string, string | undefined> = process.env
) {
  const results = CHECKS.map((check) => {
    const present = Boolean(String(env[check.name] ?? "").trim());
    return {
      name: check.name,
      description: check.description,
      required: check.required,
      present
    };
  });

  const hasSupabaseUrl = Boolean(
    String(env.NEXT_PUBLIC_SUPABASE_URL ?? env.SUPABASE_URL ?? "").trim()
  );
  const missing = results.filter((result) => result.required && !result.present);
  if (!hasSupabaseUrl) {
    missing.push({
      name: "NEXT_PUBLIC_SUPABASE_URL_OR_SUPABASE_URL",
      description: "Supabase project URL",
      required: true,
      present: false
    });
  }

  return {
    ok: missing.length === 0,
    results,
    missing
  };
}

if (require.main === module) {
  const result = checkConversationLifecycleEnv();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) {
    process.exit(1);
  }
}
