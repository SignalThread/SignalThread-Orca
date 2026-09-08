import { NextResponse, type NextRequest } from "next/server";
import { buildBrowserFacingUrl } from "@/lib/http/browser-facing-url";
import { authorizeCompanyIntegrationAdmin } from "@/lib/integrations/company-integration-authorization";
import { parsePipedriveSetupSettings } from "@/lib/integrations/pipedrive/setup-core";
import { savePipedriveSetupSettings } from "@/lib/integrations/pipedrive/setup-service";
import { createSupabaseRouteAuth } from "@/lib/supabase/route-auth";

export const runtime = "nodejs";

function redirectToSetup(request: NextRequest, params: Record<string, string>) {
  const url = buildBrowserFacingUrl(request, "/exhibitor/integrations/pipedrive");
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return NextResponse.redirect(url, { status: 303 });
}

export async function POST(request: NextRequest) {
  const routeAuth = createSupabaseRouteAuth(request);
  const authorization = await authorizeCompanyIntegrationAdmin({ supabase: routeAuth.supabase });
  if (!authorization.ok) {
    return routeAuth.withAuthCookies(
      NextResponse.json({ error: authorization.error }, { status: authorization.status })
    );
  }

  const formData = await request.formData();
  const parsed = parsePipedriveSetupSettings({
    destinationType: formData.get("destinationType"),
    createPerson: formData.get("createPerson"),
    createOrganization: formData.get("createOrganization"),
    pipelineId: formData.get("pipelineId"),
    stageId: formData.get("stageId"),
    ownerMode: formData.get("ownerMode"),
    ownerUserId: formData.get("ownerUserId"),
    createFollowUpActivity: formData.get("createFollowUpActivity"),
    matchPersonByEmail: formData.get("matchPersonByEmail"),
    matchOrganizationByNameOrDomain: formData.get("matchOrganizationByNameOrDomain"),
    sendConversationSynopsis: formData.get("sendConversationSynopsis"),
    sendGeneratedEmailDraft: formData.get("sendGeneratedEmailDraft")
  });
  if (!parsed.ok) return routeAuth.withAuthCookies(redirectToSetup(request, { error: parsed.error }));

  try {
    const saved = await savePipedriveSetupSettings({
      companyId: authorization.context.companyId,
      settings: parsed.value
    });
    return routeAuth.withAuthCookies(
      redirectToSetup(request, saved.ok ? { saved: "1" } : { error: saved.error })
    );
  } catch {
    return routeAuth.withAuthCookies(redirectToSetup(request, { error: "save_failed" }));
  }
}
