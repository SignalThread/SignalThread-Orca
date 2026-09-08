import { NextResponse } from "next/server";
import { authorizeLeadRetrievalInternalHealthRequest } from "@/lib/internal-health/lead-retrieval/route-auth";
import { getLeadRetrievalCaptureRecordingIngestionHealth } from "@/lib/internal-health/lead-retrieval/capture-recording-ingestion";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authResult = authorizeLeadRetrievalInternalHealthRequest(request);
  if (!authResult.ok) {
    return authResult.response;
  }

  try {
    const supabase = createAdminClient();
    const health = await getLeadRetrievalCaptureRecordingIngestionHealth({ supabase });
    return NextResponse.json(health);
  } catch (error) {
    console.error("[internal-health] lead retrieval capture recording ingestion failed", error);
    return NextResponse.json(
      { error: "Capture recording ingestion health check failed." },
      { status: 500 }
    );
  }
}
