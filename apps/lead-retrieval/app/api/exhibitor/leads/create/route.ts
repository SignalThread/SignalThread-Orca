import { NextResponse } from "next/server";
import { resolveApiSession } from "@/lib/auth/resolveApiSession";
import { createAdminClient } from "@/lib/supabase/admin";
import { canMutateExhibitorLeadsInContext } from "@/lib/server/exhibitor-permission-aggregates";
import {
  EventAccessDeniedError,
  assertEventIdAccessibleForUser
} from "@/lib/server/company-event-access";
import { attemptLeadCapturedWorkflowEmit } from "@/lib/workflows/emit/non-fatal-lead-captured-emit";
import { leadHasWorkflowQualificationSignal } from "@/lib/leads/leadWorkflowQualification";
import {
  leadTemperatureToLegacyPriorityScore,
  legacyPriorityScoreToLeadTemperature,
  parseLeadTemperature,
  type LeadTemperature
} from "@/lib/leads/temperature";

type LeadStatus = "new" | "follow_up" | "closed";

function isUuidV4(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}

function isSimpleValidEmail(value: string) {
  const at = value.indexOf("@");
  if (at <= 0) return false;
  const dot = value.indexOf(".", at + 2);
  return dot > at + 1 && dot < value.length - 1;
}

function isLeadStatus(value: string): value is LeadStatus {
  return value === "new" || value === "follow_up" || value === "closed";
}

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * Idempotent lead create for offline-first mobile clients.
 * When `id` is a client-generated UUID v4, retries after network failure replay the same
 * insert without creating a duplicate (PK conflict → return existing row for this company).
 */
export async function POST(request: Request) {
  try {
    const sessionUser = await resolveApiSession(request);
    const role = String(sessionUser.role ?? "").trim().toLowerCase();
    const userId = String(sessionUser.userId ?? "").trim();
    const companyId = String(sessionUser.companyId ?? "").trim();
    if (!userId || !companyId) {
      return NextResponse.json({ error: "Missing exhibitor scope." }, { status: 400 });
    }
    const isBearer = /^Bearer\s/i.test(request.headers.get("authorization") ?? "");

    const jsonPayload = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!jsonPayload || typeof jsonPayload !== "object") {
      return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
    }

    const eventIdRaw = jsonPayload.event_id;
    const eventId =
      eventIdRaw === null || eventIdRaw === undefined
        ? null
        : String(eventIdRaw).trim() || null;

    if (role === "exhibitor_viewer" && isBearer && !eventId) {
      return NextResponse.json(
        { error: "event_id is required for mobile lead capture." },
        { status: 400 }
      );
    }

    const platformAdminBrowserCreate = role === "platform_admin" && !isBearer;
    const canMutate =
      platformAdminBrowserCreate ||
      (await canMutateExhibitorLeadsInContext({
        userId,
        companyId,
        role,
        isBearer,
        leadEventId: eventId,
        activePlatformAdminCompanyId: sessionUser.activeCompanyId
      }));

    if (!canMutate) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const fullName = String(jsonPayload.full_name ?? "").trim();
    if (!fullName) {
      return NextResponse.json({ error: "full_name is required." }, { status: 400 });
    }

    const rawId = jsonPayload.id != null ? String(jsonPayload.id).trim() : "";
    const clientId = rawId && isUuidV4(rawId) ? rawId : null;
    if (rawId && !clientId) {
      return NextResponse.json({ error: "id must be a UUID v4 when provided." }, { status: 400 });
    }

    if (eventId) {
      if (process.env.NODE_ENV === "development") {
        console.log("[event-access-check]", { userId: sessionUser.userId, eventId });
      }
      await assertEventIdAccessibleForUser(sessionUser.userId, eventId);
    }

    const emailRaw = jsonPayload.email;
    const email = emailRaw === null ? null : String(emailRaw ?? "").trim();
    if (email && !isSimpleValidEmail(email)) {
      return NextResponse.json({ error: "Invalid email format." }, { status: 400 });
    }

    const phone =
      jsonPayload.phone === null || jsonPayload.phone === undefined
        ? null
        : String(jsonPayload.phone ?? "").trim() || null;

    const jobTitle =
      jsonPayload.job_title === null || jsonPayload.job_title === undefined
        ? null
        : String(jsonPayload.job_title ?? "").trim() || null;

    const companyText =
      jsonPayload.company_text === null || jsonPayload.company_text === undefined
        ? null
        : String(jsonPayload.company_text ?? "").trim() || null;

    let legacyPriorityScoreInput: number | null = null;
    if ("priority_score" in jsonPayload) {
      const parsed = Number(jsonPayload.priority_score);
      if (!Number.isFinite(parsed)) {
        return NextResponse.json({ error: "priority_score must be numeric." }, { status: 400 });
      }
      legacyPriorityScoreInput = Math.max(0, Math.min(99, Math.round(parsed)));
    }

    let temperature: LeadTemperature | null = null;
    if ("temperature" in jsonPayload) {
      const parsed = parseLeadTemperature(jsonPayload.temperature);
      if (!parsed) {
        return NextResponse.json({ error: "temperature must be one of: hot, warm, cold." }, { status: 400 });
      }
      temperature = parsed;
    } else if (legacyPriorityScoreInput != null) {
      temperature = legacyPriorityScoreToLeadTemperature(legacyPriorityScoreInput);
    }
    const priorityScore =
      legacyPriorityScoreInput != null
        ? legacyPriorityScoreInput
        : temperature
          ? leadTemperatureToLegacyPriorityScore(temperature)
          : 0;

    let rating = 0;
    if ("rating" in jsonPayload) {
      const parsed = Number(jsonPayload.rating);
      if (!Number.isFinite(parsed)) {
        return NextResponse.json({ error: "rating must be numeric." }, { status: 400 });
      }
      rating = Math.max(0, Math.min(5, Math.round(parsed)));
    }

    let status: LeadStatus = "new";
    if ("status" in jsonPayload) {
      const s = String(jsonPayload.status ?? "").trim();
      if (!isLeadStatus(s)) {
        return NextResponse.json({ error: "Invalid status value." }, { status: 400 });
      }
      status = s;
    }

    let followUpDate: string | null = null;
    if ("follow_up_date" in jsonPayload) {
      const raw = jsonPayload.follow_up_date;
      const f = raw === null ? null : String(raw ?? "").trim();
      if (f && !isIsoDate(f)) {
        return NextResponse.json({ error: "follow_up_date must be YYYY-MM-DD." }, { status: 400 });
      }
      followUpDate = f || null;
    }

    const supabase = createAdminClient();
    const insertRow: Record<string, unknown> = {
      company_id: companyId,
      full_name: fullName,
      email: email || null,
      phone,
      job_title: jobTitle,
      company_text: companyText,
      temperature,
      priority_score: priorityScore,
      rating,
      status,
      follow_up_date: followUpDate,
      event_id: eventId,
      owner_user_id: sessionUser.userId
    };

    if (clientId) {
      insertRow.id = clientId;
    }

    const { data: inserted, error: insertError } = await (supabase as any)
      .from("leads")
      .insert(insertRow)
      .select(
        "id, company_id, full_name, email, phone, job_title, company_text, rating, temperature, priority_score, status, follow_up_date, event_id, created_at, updated_at"
      )
      .maybeSingle();

    if (!insertError && inserted?.id) {
      const workflowSource = isBearer ? "mobile_capture" : "manual_create";
      if (isBearer) {
        const hasQualification = leadHasWorkflowQualificationSignal(inserted);
        if (hasQualification) {
          const workflowEmitResult = await attemptLeadCapturedWorkflowEmit({
            leadId: String(inserted.id),
            companyId,
            eventId: inserted.event_id ? String(inserted.event_id) : null,
            source: "mobile_capture_qualified_create",
            logContext: "app/api/exhibitor/leads/create:mobile_capture_qualified_create"
          });

          console.info("[lead-create] inserted qualified mobile lead row", {
            route: "app/api/exhibitor/leads/create",
            leadId: String(inserted.id),
            companyId,
            eventId: inserted.event_id ? String(inserted.event_id) : null,
            source: "mobile_capture_qualified_create",
            workflowEmitAttempted: true,
            workflowEmitStatus: workflowEmitResult?.status ?? null
          });
          return NextResponse.json(
            {
              lead: inserted,
              idempotentReplay: false,
              workflowEmitAttempted: true,
              workflowEmitStatus: workflowEmitResult?.status ?? null
            },
            { status: 201 }
          );
        }

        console.info("[lead-create] inserted raw mobile lead row; workflow emit deferred until qualification save", {
          route: "app/api/exhibitor/leads/create",
          leadId: String(inserted.id),
          companyId,
          eventId: inserted.event_id ? String(inserted.event_id) : null,
          source: workflowSource,
          workflowEmitAttempted: false,
          workflowEmitStatus: "deferred_until_qualification_save"
        });
        return NextResponse.json(
          {
            lead: inserted,
            idempotentReplay: false,
            workflowEmitAttempted: false,
            workflowEmitStatus: "deferred_until_qualification_save"
          },
          { status: 201 }
        );
      }

      const workflowEmitResult = await attemptLeadCapturedWorkflowEmit({
        leadId: String(inserted.id),
        companyId,
        eventId: inserted.event_id ? String(inserted.event_id) : null,
        source: workflowSource,
        logContext: `app/api/exhibitor/leads/create:${workflowSource}`
      });

      console.info("[lead-create] inserted lead row", {
        route: "app/api/exhibitor/leads/create",
        leadId: String(inserted.id),
        companyId,
        eventId: inserted.event_id ? String(inserted.event_id) : null,
        source: workflowSource,
        workflowEmitAttempted: true,
        workflowEmitStatus: workflowEmitResult?.status ?? null
      });
      return NextResponse.json(
        { lead: inserted, idempotentReplay: false, workflowEmitAttempted: true },
        { status: 201 }
      );
    }

    const code = String((insertError as { code?: string })?.code ?? "");
    if (code === "23505" && clientId) {
      const { data: existing, error: fetchError } = await (supabase as any)
        .from("leads")
        .select(
          "id, company_id, full_name, email, phone, job_title, company_text, rating, temperature, priority_score, status, follow_up_date, event_id, created_at, updated_at"
        )
        .eq("id", clientId)
        .maybeSingle();

      if (fetchError || !existing) {
        return NextResponse.json({ error: "Failed resolving idempotent lead." }, { status: 500 });
      }

      if (String(existing.company_id ?? "").trim() !== companyId) {
        return NextResponse.json({ error: "Lead id conflicts with another account." }, { status: 409 });
      }

      if (isBearer && leadHasWorkflowQualificationSignal(existing)) {
        const workflowEmitResult = await attemptLeadCapturedWorkflowEmit({
          leadId: String(existing.id),
          companyId,
          eventId: existing.event_id ? String(existing.event_id) : null,
          source: "mobile_capture_idempotent_replay",
          logContext: "app/api/exhibitor/leads/create:mobile_capture_idempotent_replay"
        });
        return NextResponse.json(
          {
            lead: existing,
            idempotentReplay: true,
            workflowEmitAttempted: true,
            workflowEmitStatus: workflowEmitResult?.status ?? null
          },
          { status: 200 }
        );
      }

      return NextResponse.json(
        {
          lead: existing,
          idempotentReplay: true,
          workflowEmitAttempted: false,
          workflowEmitStatus: isBearer ? "deferred_until_qualification_save" : null
        },
        { status: 200 }
      );
    }

    console.warn("[lead-create] lead insert failed before workflow emit", {
      route: "app/api/exhibitor/leads/create",
      companyId,
      eventId,
      source: isBearer ? "mobile_capture" : "admin_create",
      code,
      message: insertError?.message ?? "Failed creating lead.",
      workflowEmitAttempted: false
    });

    return NextResponse.json(
      { error: insertError?.message ?? "Failed creating lead." },
      { status: 400 }
    );
  } catch (error) {
    if (error instanceof EventAccessDeniedError) {
      return NextResponse.json({ error: "Event access denied" }, { status: 403 });
    }
    if (error instanceof Response) {
      return error;
    }
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
