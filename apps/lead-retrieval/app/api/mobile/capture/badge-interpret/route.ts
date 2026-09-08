import { NextResponse } from "next/server";

import { resolveApiSession } from "@/lib/auth/resolveApiSession";
import { createConfiguredBadgeInterpreter } from "@/lib/capture/badge-interpreter";
import {
  executeBadgeInterpretation,
  parseBadgeInterpreterRequest,
} from "@/lib/capture/badge-interpreter-core";
import {
  assertEventIdAccessibleForUser,
  EventAccessDeniedError,
} from "@/lib/server/company-event-access";

export async function POST(request: Request) {
  const requestStartedAt = Date.now();
  let outcome = "failed";
  console.info("[badge-ai-backend] request_received");
  try {
    if (!/^Bearer\s+\S+/i.test(request.headers.get("authorization") ?? "")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const session = await resolveApiSession(request);
    console.info(`[badge-ai-backend] auth_complete elapsedMs=${Date.now() - requestStartedAt}`);
    const parsed = parseBadgeInterpreterRequest(await request.json().catch(() => null));
    if (!parsed) {
      return NextResponse.json({ error: "Invalid badge interpretation request." }, { status: 400 });
    }
    const interpreter = createConfiguredBadgeInterpreter();
    const result = await executeBadgeInterpretation({
      principal: { userId: session.userId, companyId: session.companyId },
      request: parsed,
      assertEventAccess: async (userId, eventId) => {
        await assertEventIdAccessibleForUser(userId, eventId);
      },
      interpret: (input) => interpreter.interpret(input),
    });
    outcome = "success";
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof EventAccessDeniedError || (error instanceof Error && error.message === "BADGE_INTERPRETER_SCOPE_REQUIRED")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (error instanceof Error && error.message === "BADGE_INTERPRETER_NOT_CONFIGURED") {
      return NextResponse.json({ error: "Enhanced interpretation is unavailable." }, { status: 503 });
    }
    return NextResponse.json({ error: "Enhanced interpretation is unavailable." }, { status: 502 });
  } finally {
    console.info(`[badge-ai-backend] request_complete totalMs=${Date.now() - requestStartedAt} outcome=${outcome}`);
  }
}
