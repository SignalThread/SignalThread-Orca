import { NextResponse } from "next/server";
import { getCurrentSessionUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

const REDIRECT_BASE = "/admin/integrations/streampoint";
const STREAMPPOINT_BASE_URL_BY_ENV = {
  staging: "https://apireststaging.streampoint.com/v1/personal.svc",
  production: "https://apirest.streampoint.com/v1/personal.svc"
} as const;

function redirectTo(request: Request, params: Record<string, string>) {
  const url = new URL(REDIRECT_BASE, request.url);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  return NextResponse.redirect(url);
}

function isValidHttpUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeEnvironment(value: string): keyof typeof STREAMPPOINT_BASE_URL_BY_ENV | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "staging") return "staging";
  if (normalized === "production") return "production";
  return null;
}

export async function POST(request: Request) {
  const sessionUser = await getCurrentSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isPlatformAdmin = sessionUser.role === "platform_admin";
  if (!isPlatformAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await request.formData();
  const apiTokenRaw = String(formData.get("apiToken") ?? "").trim();
  const environmentRaw = String(formData.get("environment") ?? "").trim();
  const isEnabled = String(formData.get("isEnabled") ?? "") === "on";
  const eventIdRaw = String(formData.get("eventId") ?? "").trim();
  const environment = normalizeEnvironment(environmentRaw);

  if (!environment) {
    return redirectTo(request, {
      error: "invalid_environment",
      ...(eventIdRaw ? { eventId: eventIdRaw } : {})
    });
  }

  const baseUrlRaw = STREAMPPOINT_BASE_URL_BY_ENV[environment];

  if (isEnabled && !apiTokenRaw) {
    return redirectTo(request, {
      error: "invalid_setup",
      ...(eventIdRaw ? { eventId: eventIdRaw } : {})
    });
  }

  if (baseUrlRaw && !isValidHttpUrl(baseUrlRaw)) {
    return redirectTo(request, {
      error: "invalid_base_url",
      ...(eventIdRaw ? { eventId: eventIdRaw } : {})
    });
  }

  const supabase = createAdminClient();
  let scopedAccountId = sessionUser.company_id ?? null;

  if (!scopedAccountId) {
    if (!eventIdRaw) {
      return redirectTo(request, { error: "missing_event_scope" });
    }

    const { data: eventData, error: eventError } = await (supabase as any)
      .from("events")
      .select("id, company_id")
      .eq("id", eventIdRaw)
      .maybeSingle();

    if (eventError) {
      if (process.env.NODE_ENV !== "production") {
        return redirectTo(request, {
          error: "save_failed",
          reason: eventError.message ?? "Failed loading event scope",
          eventId: eventIdRaw
        });
      }
      return redirectTo(request, { error: "save_failed", eventId: eventIdRaw });
    }

    scopedAccountId = String(eventData?.company_id ?? "").trim() || null;
  }

  if (!scopedAccountId) {
    return redirectTo(request, {
      error: "missing_account",
      ...(eventIdRaw ? { eventId: eventIdRaw } : {})
    });
  }

  const upsertPayload = {
    account_id: scopedAccountId,
    provider: "streampoint",
    api_token: apiTokenRaw || null,
    api_base_url: baseUrlRaw || null,
    environment,
    is_enabled: isEnabled
  };

  const { error } = await (supabase as any)
    .from("registration_provider_configs")
    .upsert(upsertPayload, { onConflict: "account_id,provider" });

  if (error) {
    if (process.env.NODE_ENV !== "production") {
      return redirectTo(request, {
        error: "save_failed",
        reason: error.message ?? "Unknown DB error",
        ...(eventIdRaw ? { eventId: eventIdRaw } : {})
      });
    }
    return redirectTo(request, { error: "save_failed", ...(eventIdRaw ? { eventId: eventIdRaw } : {}) });
  }

  return redirectTo(request, { saved: "1", ...(eventIdRaw ? { eventId: eventIdRaw } : {}) });
}
