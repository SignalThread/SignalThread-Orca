import { NextRequest, NextResponse } from "next/server";
import { observeHandledRouteError, withApiRequestLogging } from "@/lib/observability/api-route";
import { MarketingServiceError, unsubscribeMarketingRecipient } from "@/src/server/services/marketing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function redirectToResult(request: NextRequest, token: string, status: "unsubscribed" | "invalid"): NextResponse {
  return NextResponse.redirect(
    new URL(`/marketing/unsubscribe/${encodeURIComponent(token)}?status=${status}`, request.nextUrl.origin),
    { status: 303 },
  );
}

async function postHandler(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  try {
    await unsubscribeMarketingRecipient(token);
    return redirectToResult(request, token, "unsubscribed");
  } catch (error) {
    observeHandledRouteError(error);
    if (error instanceof MarketingServiceError && error.status === 401) {
      return redirectToResult(request, token, "invalid");
    }
    if (error instanceof MarketingServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("POST /api/public/marketing/unsubscribe/:token failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export const POST = withApiRequestLogging("POST /api/public/marketing/unsubscribe/:token", postHandler);
