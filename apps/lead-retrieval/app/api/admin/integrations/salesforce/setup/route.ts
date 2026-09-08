import { NextResponse } from "next/server";
import { getCurrentSessionUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

const REDIRECT_BASE = "/admin/integrations/salesforce/setup";

function redirectTo(request: Request, params: Record<string, string>) {
  const url = new URL(REDIRECT_BASE, request.url);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  return NextResponse.redirect(url);
}

export async function POST(request: Request) {
  const sessionUser = await getCurrentSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (sessionUser.role !== "platform_admin" && sessionUser.role !== "exhibitor_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!sessionUser.company_id) {
    return redirectTo(request, { error: "missing_account" });
  }

  const formData = await request.formData();
  const syncTargetObject = String(formData.get("syncTargetObject") ?? "").trim();
  const syncBehavior = String(formData.get("syncBehavior") ?? "").trim();
  const campaignNameRaw = String(formData.get("campaignName") ?? "").trim();
  const campaignName = campaignNameRaw.length > 0 ? campaignNameRaw : null;

  const validTargets = new Set(["lead", "contact", "campaign_member"]);
  const validBehaviors = new Set(["create_only", "update_existing", "upsert_by_email"]);

  if (!validTargets.has(syncTargetObject) || !validBehaviors.has(syncBehavior)) {
    return redirectTo(request, { error: "invalid_setup" });
  }

  const isConfigured = Boolean(syncTargetObject && syncBehavior);
  const supabase = createAdminClient();
  const upsertPayload = {
    account_id: sessionUser.company_id,
    provider: "salesforce",
    sync_target_object: syncTargetObject,
    sync_behavior: syncBehavior,
    campaign_name: campaignName,
    is_configured: isConfigured
  };

  console.info("[salesforce-setup] attempting config upsert", {
    account_id: upsertPayload.account_id,
    provider: upsertPayload.provider,
    payload: {
      sync_target_object: upsertPayload.sync_target_object,
      sync_behavior: upsertPayload.sync_behavior,
      campaign_name: upsertPayload.campaign_name,
      is_configured: upsertPayload.is_configured
    }
  });

  const { error } = await (supabase as any)
    .from("integration_sync_configs")
    .upsert(upsertPayload, { onConflict: "account_id,provider" });

  if (error) {
    console.error("[salesforce-setup] config upsert failed", {
      account_id: upsertPayload.account_id,
      provider: upsertPayload.provider,
      payload: {
        sync_target_object: upsertPayload.sync_target_object,
        sync_behavior: upsertPayload.sync_behavior,
        campaign_name: upsertPayload.campaign_name,
        is_configured: upsertPayload.is_configured
      },
      error: {
        message: error.message,
        code: (error as any).code ?? null,
        details: (error as any).details ?? null,
        hint: (error as any).hint ?? null
      }
    });

    if (process.env.NODE_ENV !== "production") {
      return redirectTo(request, {
        error: "save_failed",
        reason: error.message ?? "Unknown DB error"
      });
    }

    return redirectTo(request, { error: "save_failed" });
  }

  return redirectTo(request, { saved: "1" });
}
