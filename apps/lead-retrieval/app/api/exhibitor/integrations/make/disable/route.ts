import { NextResponse } from "next/server";
import { getCurrentSessionUser, isCompanyAccountAdminSession } from "@/lib/auth/session";
import { disableIntegration } from "@/lib/integrations/outbound-webhook-config";

const REDIRECT_BASE = "/exhibitor/integrations/make";

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

  const { error } = await disableIntegration(sessionUser.company_id, "make");

  if (error) {
    if (process.env.NODE_ENV !== "production") {
      return redirectTo(request, { error: "disable_failed", reason: error.message ?? "Unknown DB error" });
    }
    return redirectTo(request, { error: "disable_failed" });
  }

  return redirectTo(request, { disabled: "1" });
}
