import { requireAuth } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { PLATFORM_REGISTRATION_INTEGRATIONS } from "@/lib/config/platform-registration-catalog";
import { PlatformRegistrationIntegrationsClient } from "@/components/admin/platform-registration-integrations-client";

type RegistrationConfigRow = {
  provider: string | null;
  api_base_url: string | null;
  api_token: string | null;
  environment: string | null;
  is_enabled: boolean | null;
};

export default async function AdminIntegrationsPage() {
  const sessionUser = await requireAuth();
  if (sessionUser.role !== "platform_admin") {
    return (
      <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700">
        Forbidden
      </p>
    );
  }
  let lookupError: string | null = null;
  let streampointConfigured = false;
  let streampointEnabled = false;

  const supabase = createAdminClient();
  const { data, error } = await (supabase as any)
    .from("registration_provider_configs")
    .select("provider, api_base_url, api_token, environment, is_enabled")
    .eq("provider", "streampoint");

  if (error) {
    lookupError = error.message ?? "Failed to load integration status.";
  } else {
    const rows = (data as RegistrationConfigRow[] | null) ?? [];
    streampointConfigured = rows.some((row) => {
      return (
        row.provider === "streampoint" &&
        Boolean(String(row.api_base_url ?? "").trim()) &&
        Boolean(String(row.api_token ?? "").trim()) &&
        Boolean(String(row.environment ?? "").trim())
      );
    });
    streampointEnabled = rows.some((row) => {
      return (
        row.provider === "streampoint" &&
        Boolean(String(row.api_base_url ?? "").trim()) &&
        Boolean(String(row.api_token ?? "").trim()) &&
        Boolean(String(row.environment ?? "").trim()) &&
        row.is_enabled === true
      );
    });
  }

  const cards = PLATFORM_REGISTRATION_INTEGRATIONS.map((integration) => {
    const isStreampoint = integration.provider === "streampoint";
    return {
      ...integration,
      status: isStreampoint
        ? (streampointEnabled
            ? ("connected" as const)
            : streampointConfigured
              ? ("configured" as const)
              : ("not_connected" as const))
        : integration.status
    };
  });

  return (
    <div className="space-y-4">
      {lookupError ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700">
          {lookupError}
        </p>
      ) : null}
      <PlatformRegistrationIntegrationsClient integrations={cards} />
    </div>
  );
}
