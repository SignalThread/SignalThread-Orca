import { NextResponse } from "next/server";
import { getCurrentSessionUser, isCompanyAccountAdminSession } from "@/lib/auth/session";
import { upsertEnrichmentApiKey } from "@/lib/integrations/enrichment-provider-config";

const REDIRECT_BASE = "/exhibitor/integrations/apollo";

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

  if (!isCompanyAccountAdminSession(sessionUser)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!sessionUser.company_id) {
    return redirectTo(request, { error: "missing_account" });
  }

  const formData = await request.formData();
  const apiKey = String(formData.get("apiKey") ?? "").trim();

  if (!apiKey) {
    return redirectTo(request, { error: "missing_api_key" });
  }

  const { error } = await upsertEnrichmentApiKey({
    accountId: sessionUser.company_id,
    provider: "apollo",
    apiKey,
  });

  if (error) {
    if (process.env.NODE_ENV !== "production") {
      return redirectTo(request, { error: "save_failed", reason: error.message ?? "" });
    }
    return redirectTo(request, { error: "save_failed" });
  }

  return redirectTo(request, { saved: "1" });
}
