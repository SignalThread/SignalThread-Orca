import type { NextRequest } from "next/server";
import { buildPlatformLaunchUrl } from "@/lib/platform/platform-claim-client";
import { deniedResponse, handlePlatformEntryStartRequest } from "@/lib/platform/platform-entry-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Start (or restart) a Platform launch from this browser.
 *
 *   GET /platform-entry/start?event_id=<canonical uuid>          → set launch state, 303 …&armed=1
 *   GET /platform-entry/start?event_id=<canonical uuid>&armed=1  → 303 {PLATFORM_APP_URL}/api/launch/lead-retrieval?event_id=…&state=…
 */
export async function GET(request: NextRequest) {
  try {
    return await handlePlatformEntryStartRequest(request, {
      buildLaunchUrl: (eventId, correlator) => buildPlatformLaunchUrl(eventId, correlator)
    });
  } catch {
    return deniedResponse(500, "INTERNAL_ERROR", "Lead Retrieval could not start this launch. Open Lead Retrieval from Platform again.");
  }
}
