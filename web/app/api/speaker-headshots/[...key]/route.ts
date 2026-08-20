import { NextResponse } from "next/server";
import { observeHandledRouteError, withApiRequestLogging } from "@/lib/observability/api-route";
import { getSpeakerHeadshotDownloadUrl } from "@/src/server/storage/speakers";

export const runtime = "nodejs";

function toErrorResponse(error: unknown, context: string): NextResponse {
  observeHandledRouteError(error);

  if (error instanceof Error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  console.error(`${context} failed`, error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

async function getHandler(
  _request: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const { key } = await params;
  const objectKey = key.join("/");

  if (!/^events\/[^/]+\/speakers\/[^/]+\/headshot\/[^/]+$/i.test(objectKey)) {
    return NextResponse.json({ error: "Invalid headshot path" }, { status: 400 });
  }

  try {
    const downloadUrl = await getSpeakerHeadshotDownloadUrl(objectKey);
    return NextResponse.redirect(downloadUrl, { status: 307 });
  } catch (error) {
    return toErrorResponse(error, "GET /api/speaker-headshots/[...key]");
  }
}

export const GET = withApiRequestLogging("GET /api/speaker-headshots/[...key]", getHandler);
