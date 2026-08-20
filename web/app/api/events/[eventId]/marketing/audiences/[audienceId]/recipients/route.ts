import { NextRequest, NextResponse } from "next/server";
import { withApiRequestLogging } from "@/lib/observability/api-route";
import {
  audienceRecipientSchema,
  importRecipientsSchema,
  parseJsonBody,
  requireRouteUser,
  toMarketingRouteErrorResponse,
  uuidSchema,
} from "@/app/api/events/[eventId]/marketing/_lib/route-helpers";
import { addRecipient, importRecipients } from "@/src/server/services/marketing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function postHandler(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string; audienceId: string }> },
) {
  const { audienceId: rawAudienceId } = await params;
  const auth = await requireRouteUser(request);
  if ("response" in auth) return auth.response;

  try {
    const audienceId = uuidSchema.parse(rawAudienceId);
    const body = await parseJsonBody(request);
    if (typeof body === "object" && body !== null && "rows" in body) {
      const { rows } = importRecipientsSchema.parse(body);
      const summary = await importRecipients(auth.user, audienceId, rows);
      return NextResponse.json(summary);
    }
    const recipientInput = audienceRecipientSchema.parse(body);
    const recipient = await addRecipient(auth.user, audienceId, recipientInput);
    return NextResponse.json(recipient);
  } catch (error) {
    return toMarketingRouteErrorResponse(
      error,
      "POST /api/events/:eventId/marketing/audiences/:audienceId/recipients",
    );
  }
}

export const POST = withApiRequestLogging(
  "POST /api/events/:eventId/marketing/audiences/:audienceId/recipients",
  postHandler,
);
