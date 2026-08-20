import { createVerify } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { withApiRequestLogging } from "@/lib/observability/api-route";
import {
  MarketingServiceError,
  ingestSendGridWebhookEvents,
  type SendGridWebhookEventInput,
} from "@/src/server/services/marketing";
import { toMarketingRouteErrorResponse } from "@/app/api/events/[eventId]/marketing/_lib/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function configuredPublicKey(): string | null {
  const key = process.env.SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY?.trim() || process.env.SENDGRID_WEBHOOK_PUBLIC_KEY?.trim();
  return key ? key.replace(/\\n/g, "\n") : null;
}

function verifySendGridSignature(request: NextRequest, rawBody: string): boolean {
  const publicKey = configuredPublicKey();
  if (!publicKey) return false;
  const signature = request.headers.get("x-twilio-email-event-webhook-signature")?.trim();
  const timestamp = request.headers.get("x-twilio-email-event-webhook-timestamp")?.trim();
  if (!signature || !timestamp) return false;

  try {
    const verifier = createVerify("sha256");
    verifier.update(timestamp + rawBody);
    verifier.end();
    return verifier.verify(publicKey, signature, "base64");
  } catch {
    return false;
  }
}

function verifySecretToken(request: NextRequest): boolean {
  const secret = process.env.SENDGRID_WEBHOOK_SECRET?.trim();
  if (!secret) return false;
  const headerSecret = request.headers.get("x-sendgrid-webhook-secret")?.trim();
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  return headerSecret === secret || bearer === secret;
}

function isAuthorizedWebhookRequest(request: NextRequest, rawBody: string): boolean {
  return verifySendGridSignature(request, rawBody) || verifySecretToken(request);
}

function parseSendGridWebhookBody(rawBody: string): SendGridWebhookEventInput[] {
  try {
    const parsed = rawBody.trim() ? JSON.parse(rawBody) : null;
    if (!Array.isArray(parsed)) {
      throw new MarketingServiceError("SendGrid webhook payload must be an event array", 400);
    }
    if (!parsed.every((item) => typeof item === "object" && item !== null && !Array.isArray(item))) {
      throw new MarketingServiceError("SendGrid webhook events must be objects", 400);
    }
    return parsed as SendGridWebhookEventInput[];
  } catch (error) {
    if (error instanceof MarketingServiceError) throw error;
    throw new MarketingServiceError("Invalid JSON body", 400);
  }
}

async function postHandler(request: NextRequest) {
  try {
    const rawBody = await request.text();
    if (!isAuthorizedWebhookRequest(request, rawBody)) {
      throw new MarketingServiceError("Forbidden", 403, "SENDGRID_WEBHOOK_FORBIDDEN");
    }
    const events = parseSendGridWebhookBody(rawBody);
    const result = await ingestSendGridWebhookEvents(events);
    return NextResponse.json(result);
  } catch (error) {
    return toMarketingRouteErrorResponse(error, "POST /api/marketing/sendgrid/webhook");
  }
}

const postWithLogging = withApiRequestLogging("POST /api/marketing/sendgrid/webhook", postHandler);

export async function POST(request: NextRequest) {
  return postWithLogging(request, undefined);
}
