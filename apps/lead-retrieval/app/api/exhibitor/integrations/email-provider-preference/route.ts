import { NextResponse } from "next/server";
import {
  getCurrentSessionUser,
  isCompanyAccountAdminSession
} from "@/lib/auth/session";
import {
  getEmailProviderPreference,
  setEmailProviderPreference
} from "@/lib/integrations/email/provider-preference";
import { isEmailProvider } from "@/lib/integrations/email/types";

export const runtime = "nodejs";

async function authorizedContext() {
  const user = await getCurrentSessionUser();
  if (!user) return { ok: false as const, status: 401, error: "Unauthorized" };
  if (!isCompanyAccountAdminSession(user)) {
    return { ok: false as const, status: 403, error: "Forbidden" };
  }
  const companyId = String(user.company_id ?? "").trim();
  if (!companyId) return { ok: false as const, status: 400, error: "Missing exhibitor scope." };
  return { ok: true as const, userId: user.id, companyId };
}

export async function GET() {
  const context = await authorizedContext();
  if (!context.ok) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }
  try {
    const provider = await getEmailProviderPreference(context);
    return NextResponse.json({ capability: "email_send", provider });
  } catch {
    return NextResponse.json({ error: "Unable to load email sender preference." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const context = await authorizedContext();
  if (!context.ok) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }
  const payload = (await request.json().catch(() => null)) as { provider?: unknown } | null;
  if (!isEmailProvider(payload?.provider)) {
    return NextResponse.json({ error: "Invalid email provider." }, { status: 400 });
  }
  try {
    const result = await setEmailProviderPreference({ ...context, provider: payload.provider });
    if (!result.ok) {
      return NextResponse.json(result, { status: 409 });
    }
    return NextResponse.json({ ok: true, capability: "email_send", provider: result.provider });
  } catch {
    return NextResponse.json({ error: "Unable to save email sender preference." }, { status: 500 });
  }
}
