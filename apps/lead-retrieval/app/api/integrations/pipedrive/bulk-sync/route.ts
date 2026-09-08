import { NextResponse, type NextRequest } from "next/server";
import { authorizeCompanyIntegrationAdmin } from "@/lib/integrations/company-integration-authorization";
import { createSupabaseRouteAuth } from "@/lib/supabase/route-auth";
import { enqueuePipedriveSync } from "@/lib/integrations/pipedrive/queue";

export const runtime = "nodejs";

const MAX_BULK_LEAD_IDS = 500;

/**
 * Enqueues selected leads for background Pipedrive sync — no Pipedrive HTTP
 * calls happen inside this request. The background tick (`pipedrive-sync-tick`)
 * processes the queue afterward, one lead at a time, so this never blocks the
 * browser and one lead's failure never affects another's.
 */
export async function POST(request: NextRequest) {
  const routeAuth = createSupabaseRouteAuth(request);
  const authorization = await authorizeCompanyIntegrationAdmin({ supabase: routeAuth.supabase });
  if (!authorization.ok) {
    return routeAuth.withAuthCookies(NextResponse.json({ error: authorization.error }, { status: authorization.status }));
  }

  const body = await request.json().catch(() => null);
  const leadIds = Array.isArray(body?.leadIds)
    ? Array.from(new Set(body.leadIds.map((id: unknown) => String(id ?? "").trim()).filter(Boolean)))
    : [];
  if (leadIds.length === 0) {
    return routeAuth.withAuthCookies(NextResponse.json({ error: "leadIds is required." }, { status: 400 }));
  }
  if (leadIds.length > MAX_BULK_LEAD_IDS) {
    return routeAuth.withAuthCookies(
      NextResponse.json({ error: `Select at most ${MAX_BULK_LEAD_IDS} leads at a time.` }, { status: 400 })
    );
  }

  const enqueued: string[] = [];
  const skipped: Array<{ leadId: string; reason: string }> = [];

  for (const leadId of leadIds as string[]) {
    try {
      const outcome = await enqueuePipedriveSync({
        companyId: authorization.context.companyId,
        leadId,
        source: "bulk",
        requestedByUserId: authorization.context.userId
      });
      if (outcome === "enqueued") enqueued.push(leadId);
      else skipped.push({ leadId, reason: outcome });
    } catch (error) {
      // One lead's enqueue failure must never stop the rest of the batch.
      skipped.push({ leadId, reason: error instanceof Error ? error.message : "enqueue_failed" });
    }
  }

  return routeAuth.withAuthCookies(NextResponse.json({ enqueued, skipped }));
}
