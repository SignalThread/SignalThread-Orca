import { NextResponse } from "next/server";
import { getCurrentSessionUser, isCompanyAccountAdminSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { INTEGRATION_CONNECTION_ERROR_MARKER } from "@/lib/integrations/apollo/constants";
import { testApolloConnection } from "@/lib/integrations/apollo/test-connection";

const REDIRECT_BASE = "/exhibitor/integrations/apollo";

function redirectTo(request: Request, params: Record<string, string>) {
  const url = new URL(REDIRECT_BASE, request.url);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  return NextResponse.redirect(url);
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

/** URL-safe codes for the Apollo settings page. */
function enrichQueryValue(status: string): string {
  switch (status) {
    case "available":
      return "ok";
    case "invalid_key":
      return "invalid";
    case "no_access":
      return "denied";
    case "error":
      return "error";
    default:
      return "error";
  }
}

function searchQueryValue(search: { status: string }): string {
  if (search.status === "skipped") return "skipped";
  switch (search.status) {
    case "available":
      return "ok";
    case "invalid_key":
      return "invalid";
    case "requires_master_key":
      return "master";
    case "no_access":
      return "denied";
    case "error":
      return "error";
    default:
      return "error";
  }
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

  const supabase = createAdminClient();
  const { data: row } = await (supabase as any)
    .from("integrations")
    .select("access_token")
    .eq("account_id", sessionUser.company_id)
    .eq("provider", "apollo")
    .maybeSingle();

  const apiKey =
    normalizeText((row as { access_token?: string } | null)?.access_token) ||
    normalizeText(process.env["APOLLO_API_KEY"]);

  if (!apiKey) {
    return redirectTo(request, { error: "missing_api_key" });
  }

  const result = await testApolloConnection(apiKey);

  const enrichmentOk = result.enrichment.status === "available";

  if (row) {
    const { error: updateError } = await (supabase as any)
      .from("integrations")
      .update({
        provider_account_id: enrichmentOk ? null : INTEGRATION_CONNECTION_ERROR_MARKER,
        updated_at: new Date().toISOString(),
      })
      .eq("account_id", sessionUser.company_id)
      .eq("provider", "apollo");

    if (updateError) {
      if (process.env.NODE_ENV !== "production") {
        return redirectTo(request, { error: "test_failed", reason: updateError.message ?? "" });
      }
      return redirectTo(request, { error: "test_failed" });
    }
  }

  const params: Record<string, string> = {
    test: "1",
    enrich: enrichQueryValue(result.enrichment.status),
    search: searchQueryValue(result.search),
  };

  if (process.env.NODE_ENV !== "production") {
    if (result.enrichment.detail) {
      params.enrich_detail = result.enrichment.detail.slice(0, 200);
    }
    if (result.search.detail) {
      params.search_detail = result.search.detail.slice(0, 200);
    }
  }

  return redirectTo(request, params);
}
