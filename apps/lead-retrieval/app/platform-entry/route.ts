import type { NextRequest } from "next/server";
import { deniedResponse, handlePlatformEntryRequest } from "@/lib/platform/platform-entry-core";
import { buildPlatformEntryDeps } from "@/lib/platform/platform-entry-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * SignalThread Platform → Lead Retrieval entry point.
 *
 *   GET /platform-entry?handoff=<one-time token>&event_id=<canonical uuid>&state=<correlator>
 *
 * The single door Platform launches Lead Retrieval through. The decision order
 * and every rule live in lib/platform/platform-entry-core.ts; this file only
 * binds the real Platform claim client, LR mapping loaders, LR authorization and
 * LR Auth session establishment (see docs/PLATFORM_LEAD_RETRIEVAL_HANDOFF.md).
 */
export async function GET(request: NextRequest) {
  try {
    return await handlePlatformEntryRequest(request, buildPlatformEntryDeps(request));
  } catch {
    // Exception boundary: an unexpected failure anywhere must not become a
    // framework error page. Fail closed with a sanitized body, the same
    // security headers, and no cookies at all.
    return deniedResponse(500, "INTERNAL_ERROR", "Lead Retrieval could not complete this launch. Open Lead Retrieval from Platform again.");
  }
}
