import { NextRequest, NextResponse } from "next/server";
import { withApiRequestLogging } from "@/lib/observability/api-route";
import {
  audienceRecipientSchema,
  parseJsonBody,
  requireRouteUser,
  toMarketingRouteErrorResponse,
  uuidSchema,
} from "@/app/api/events/[eventId]/marketing/_lib/route-helpers";
import { deleteRecipient, updateRecipient } from "@/src/server/services/marketing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function patchHandler(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string; audienceId: string; recipientId: string }> },
) {
  const { audienceId: rawAudienceId, recipientId: rawRecipientId } = await params;
  const auth = await requireRouteUser(request);
  if ("response" in auth) return auth.response;

  try {
    const audienceId = uuidSchema.parse(rawAudienceId);
    const recipientId = uuidSchema.parse(rawRecipientId);
    const input = audienceRecipientSchema.parse(await parseJsonBody(request));
    const recipient = await updateRecipient(auth.user, audienceId, recipientId, input);
    return NextResponse.json(recipient);
  } catch (error) {
    return toMarketingRouteErrorResponse(
      error,
      "PATCH /api/events/:eventId/marketing/audiences/:audienceId/recipients/:recipientId",
    );
  }
}

async function deleteHandler(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string; audienceId: string; recipientId: string }> },
) {
  const { audienceId: rawAudienceId, recipientId: rawRecipientId } = await params;
  const auth = await requireRouteUser(request);
  if ("response" in auth) return auth.response;

  try {
    const audienceId = uuidSchema.parse(rawAudienceId);
    const recipientId = uuidSchema.parse(rawRecipientId);
    const result = await deleteRecipient(auth.user, audienceId, recipientId);
    return NextResponse.json(result);
  } catch (error) {
    return toMarketingRouteErrorResponse(
      error,
      "DELETE /api/events/:eventId/marketing/audiences/:audienceId/recipients/:recipientId",
    );
  }
}

export const PATCH = withApiRequestLogging(
  "PATCH /api/events/:eventId/marketing/audiences/:audienceId/recipients/:recipientId",
  patchHandler,
);

export const DELETE = withApiRequestLogging(
  "DELETE /api/events/:eventId/marketing/audiences/:audienceId/recipients/:recipientId",
  deleteHandler,
);
