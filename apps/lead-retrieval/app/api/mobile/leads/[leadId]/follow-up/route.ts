import { NextResponse } from "next/server";
import { resolveApiSession } from "@/lib/auth/resolveApiSession";
import { manageLeadFollowUp } from "@/lib/follow-ups/lead-follow-up-service";
import type { FollowUpCommand } from "@/lib/follow-ups/lead-follow-up-core";

export const runtime = "nodejs";

function statusFor(outcome: string) {
  if (outcome === "invalid_input") return 400;
  if (outcome === "unauthorized") return 403;
  if (outcome === "not_found") return 404;
  if (outcome === "conflict") return 409;
  return 200;
}

async function execute(
  request: Request,
  params: Promise<{ leadId: string }>,
  command: Omit<FollowUpCommand, "idempotencyKey">
) {
  try {
    if (!/^Bearer\s+\S+/i.test(request.headers.get("authorization") ?? "")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const idempotencyKey = String(request.headers.get("idempotency-key") ?? "").trim();
    const session = await resolveApiSession(request);
    const leadId = String((await params).leadId ?? "").trim();
    const result = await manageLeadFollowUp({
      userId: session.userId,
      companyId: session.companyId,
      role: session.role,
      isBearer: true,
      leadId,
      command: { ...command, idempotencyKey }
    });
    return NextResponse.json(result, {
      status: result.ok ? 200 : statusFor(result.outcome),
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json(
      { error: "Unable to update follow-up." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ leadId: string }> }
) {
  const body = (await request.json().catch(() => null)) as {
    followUpAt?: unknown;
    timezone?: unknown;
    note?: unknown;
    reminder?: { enabled?: unknown; provider?: unknown };
  } | null;
  return execute(request, params, {
    action: "save",
    followUpAt: typeof body?.followUpAt === "string" ? body.followUpAt : "",
    timezone: typeof body?.timezone === "string" ? body.timezone : "",
    note: body?.note === null || typeof body?.note === "string" ? body.note : null,
    ...(body?.reminder
      ? {
          reminder: {
            enabled: body.reminder.enabled as boolean,
            provider:
              typeof body.reminder.provider === "string"
                ? (body.reminder.provider as "google_workspace")
                : undefined
          }
        }
      : {})
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ leadId: string }> }
) {
  return execute(request, params, { action: "complete" });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ leadId: string }> }
) {
  return execute(request, params, { action: "clear" });
}

