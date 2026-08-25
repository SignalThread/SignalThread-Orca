import { NextResponse } from "next/server";
import { withApiRequestLogging } from "@/lib/observability/api-route";

export const runtime = "nodejs";

async function putHandler() {
  return NextResponse.json(
    { error: "Local uploads are disabled. Use /api/events/:eventId/documents/presign with R2." },
    { status: 410 },
  );
}

export const PUT = withApiRequestLogging("PUT /api/events/:eventId/documents/upload-local", putHandler);
