import { NextResponse } from "next/server";
import { resolveApiSession } from "@/lib/auth/resolveApiSession";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  canMutateExhibitorLeadsInContext,
  canReadExhibitorLeadsInContext
} from "@/lib/server/exhibitor-permission-aggregates";
import { dispatchOutboundLeadWebhooks } from "@/lib/integrations/make";
import { deleteExhibitorLeadForCompany } from "@/lib/server/exhibitorLeadDelete";
import {
  parseLeadTemperature,
  type LeadTemperature
} from "@/lib/leads/temperature";
import { normalizeExhibitorLeadPatch } from "@/lib/leads/exhibitorLeadPatch";
import { leadQualificationChanged } from "@/lib/leads/leadQualificationChange";
import { attemptLeadCapturedWorkflowEmit } from "@/lib/workflows/emit/non-fatal-lead-captured-emit";
import {
  EventAccessDeniedError,
  assertEventIdAccessibleForUser
} from "@/lib/server/company-event-access";

type LeadRow = {
  id: string;
  company_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  company_text: string | null;
  linkedin_url: string | null;
  company_domain: string | null;
  industry: string | null;
  company_size: string | null;
  seniority: string | null;
  intent_signals: unknown;
  metadata: unknown;
  rating: number | null;
  temperature: LeadTemperature | null;
  priority_score: number;
  status: "new" | "follow_up" | "closed";
  follow_up_date: string | null;
  follow_up_at?: string | null;
  follow_up_note?: string | null;
  follow_up_completed_at?: string | null;
  follow_up_calendar_event_id?: string | null;
  event_id: string | null;
  created_at: string;
  updated_at: string;
};

type ExistingLeadForPatch = {
  id: string;
  event_id: string | null;
  rating: number | null;
  temperature: string | null;
  status: string | null;
};


export async function GET(
  _request: Request,
  { params }: { params: Promise<{ leadId: string }> }
) {
  try {
    const sessionUser = await resolveApiSession(_request);
    const role = String(sessionUser.role ?? "").trim().toLowerCase();
    const userId = String(sessionUser.userId ?? "").trim();
    const accountId = String(sessionUser.companyId ?? "").trim();
    if (!userId || !accountId) {
      return NextResponse.json({ error: "Missing exhibitor scope." }, { status: 400 });
    }
    const isBearer = /^Bearer\s/i.test(_request.headers.get("authorization") ?? "");
    const { leadId: rawLeadId } = await params;
    const leadId = String(rawLeadId ?? "").trim();
    if (!leadId) {
      return NextResponse.json({ error: "Missing lead id." }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: lead, error } = await (supabase as any)
      .from("leads")
      .select(
        "id, full_name, email, phone, job_title, company_text, linkedin_url, company_domain, industry, company_size, seniority, intent_signals, metadata, rating, temperature, priority_score, status, follow_up_date, follow_up_at, follow_up_note, follow_up_completed_at, follow_up_calendar_event_id, event_id, created_at, updated_at"
      )
      .eq("id", leadId)
      .eq("company_id", accountId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: "Failed loading lead." }, { status: 500 });
    }
    if (!lead) {
      return NextResponse.json({ error: "Lead not found for this exhibitor scope." }, { status: 404 });
    }

    if (role === "exhibitor_viewer") {
      const eid = lead.event_id ? String(lead.event_id).trim() : "";
      if (!eid) {
        return NextResponse.json({ error: "Lead not found for this exhibitor scope." }, { status: 404 });
      }
      await assertEventIdAccessibleForUser(userId, eid);
    }

    let event: {
      id: string;
      name: string;
      city: string | null;
      state: string | null;
      location: string | null;
    } | null = null;

    if (lead.event_id) {
      const { data: ev } = await (supabase as any)
        .from("events")
        .select("id, name, city, state, location")
        .eq("id", lead.event_id)
        .maybeSingle();
      event = ev ?? null;
    }

    return NextResponse.json({
      lead: {
        ...lead,
        temperature: parseLeadTemperature(lead.temperature),
      },
      event
    });
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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ leadId: string }> }
) {
  try {
    const sessionUser = await resolveApiSession(request);
    const role = String(sessionUser.role ?? "").trim().toLowerCase();
    const userId = String(sessionUser.userId ?? "").trim();
    const accountId = String(sessionUser.companyId ?? "").trim();
    if (!userId || !accountId) {
      return NextResponse.json({ error: "Missing exhibitor scope." }, { status: 400 });
    }
    const isBearer = /^Bearer\s/i.test(request.headers.get("authorization") ?? "");

    const { leadId: rawLeadId } = await params;
    const leadId = String(rawLeadId ?? "").trim();
    if (!leadId) {
      return NextResponse.json({ error: "Missing lead id." }, { status: 400 });
    }

    const jsonPayload = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!jsonPayload || typeof jsonPayload !== "object") {
      return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
    }

    const { patch, error: patchError } = normalizeExhibitorLeadPatch(jsonPayload);
    if (!patch || patchError) {
      return NextResponse.json({ error: patchError ?? "Invalid request payload." }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: existingLead, error: loadError } = await (supabase as any)
      .from("leads")
      .select("id, event_id, rating, temperature, status")
      .eq("id", leadId)
      .eq("company_id", accountId)
      .maybeSingle();

    if (loadError) {
      return NextResponse.json({ error: "Failed loading lead." }, { status: 500 });
    }
    if (!existingLead) {
      return NextResponse.json({ error: "Lead not found for this exhibitor scope." }, { status: 404 });
    }

    if (
      !(await canMutateExhibitorLeadsInContext({
        userId,
        companyId: accountId,
        role,
        isBearer,
        leadEventId: existingLead.event_id,
        activePlatformAdminCompanyId: sessionUser.activeCompanyId
      }))
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: updatedLead, error: updateError } = await (supabase as any)
      .from("leads")
      .update(patch)
      .eq("id", leadId)
      .eq("company_id", accountId)
      .select(
        "id, company_id, full_name, email, phone, job_title, company_text, linkedin_url, company_domain, industry, company_size, seniority, intent_signals, metadata, rating, temperature, priority_score, status, follow_up_date, follow_up_at, follow_up_note, follow_up_completed_at, follow_up_calendar_event_id, event_id, created_at, updated_at"
      )
      .maybeSingle();

    if (updateError) {
      console.error("[exhibitor/leads][PATCH] lead update failed", {
        accountId,
        leadId,
        error: updateError.message ?? "Unknown DB error.",
      });
      return NextResponse.json({ error: "Failed updating lead." }, { status: 500 });
    }

    if (!updatedLead) {
      return NextResponse.json({ error: "Lead not found for this exhibitor scope." }, { status: 404 });
    }

    const qualificationChanged = leadQualificationChanged(
      patch,
      existingLead as ExistingLeadForPatch,
      updatedLead as LeadRow
    );
    const workflowEmitResult = qualificationChanged
      ? await attemptLeadCapturedWorkflowEmit({
          leadId: String(updatedLead.id),
          companyId: accountId,
          eventId: updatedLead.event_id ? String(updatedLead.event_id) : null,
          source: "qualification_save",
          logContext: "app/api/exhibitor/leads/[leadId]:qualification_patch"
        })
      : null;
    console.info("[lead-update] workflow re-evaluation completed", {
      route: "app/api/exhibitor/leads/[leadId]",
      leadId: String(updatedLead.id),
      accountId,
      eventId: updatedLead.event_id ? String(updatedLead.event_id) : null,
      qualificationChanged,
      workflowEmitStatus: qualificationChanged
        ? workflowEmitResult?.status ?? null
        : "skipped_non_qualification_patch"
    });

    try {
      const webhookResults = await dispatchOutboundLeadWebhooks({
        accountId,
        trigger: "lead_updated",
        leadId,
        lead: updatedLead as LeadRow,
      });

      webhookResults.forEach(({ provider, result }) => {
        console.info("[outbound-webhook] lead update dispatch result", {
          accountId,
          leadId,
          provider,
          attempted: result.attempted,
          delivered: result.delivered,
          status: result.status ?? null,
          reason: result.reason ?? null,
          error: result.error ?? null,
        });
      });
    } catch (dispatchError) {
      console.error("[outbound-webhook] unexpected lead update dispatch failure", {
        accountId,
        leadId,
        error: dispatchError instanceof Error ? dispatchError.message : "Unknown dispatch error.",
      });
    }

    return NextResponse.json({
      lead: {
        ...updatedLead,
        temperature: parseLeadTemperature(updatedLead.temperature),
      }
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ leadId: string }> }
) {
  try {
    const sessionUser = await resolveApiSession(_request);
    const role = String(sessionUser.role ?? "").trim().toLowerCase();
    const userId = String(sessionUser.userId ?? "").trim();
    const accountId = String(sessionUser.companyId ?? "").trim();
    if (!userId || !accountId) {
      return NextResponse.json({ error: "Missing exhibitor scope." }, { status: 400 });
    }
    const isBearer = /^Bearer\s/i.test(_request.headers.get("authorization") ?? "");
    if (
      !(await canReadExhibitorLeadsInContext({
        userId,
        companyId: accountId,
        role,
        isBearer,
        activePlatformAdminCompanyId: sessionUser.activeCompanyId
      }))
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { leadId: rawLeadId } = await params;
    const leadId = String(rawLeadId ?? "").trim();
    if (!leadId) {
      return NextResponse.json({ error: "Missing lead id." }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: scopedLead, error: scopedLeadError } = await (supabase as any)
      .from("leads")
      .select("id, event_id")
      .eq("id", leadId)
      .eq("company_id", accountId)
      .maybeSingle();

    if (scopedLeadError) {
      return NextResponse.json({ error: "Failed loading lead." }, { status: 500 });
    }
    if (!scopedLead) {
      return NextResponse.json(
        {
          outcome: "missing" as const,
          leadId,
          error: "Lead not found."
        },
        { status: 404 }
      );
    }

    if (
      !(await canMutateExhibitorLeadsInContext({
        userId,
        companyId: accountId,
        role,
        isBearer,
        leadEventId: scopedLead.event_id,
        activePlatformAdminCompanyId: sessionUser.activeCompanyId
      }))
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (role === "exhibitor_viewer") {
      const eventId = String(scopedLead.event_id ?? "").trim();
      if (!eventId) {
        return NextResponse.json({ error: "Lead not found for this exhibitor scope." }, { status: 404 });
      }
      await assertEventIdAccessibleForUser(userId, eventId);
    }

    const result = await deleteExhibitorLeadForCompany({ leadId, companyId: accountId });

    if (result.outcome === "deleted") {
      return NextResponse.json({ outcome: "deleted" as const, leadId: result.leadId });
    }
    if (result.outcome === "missing") {
      return NextResponse.json(
        {
          outcome: "missing" as const,
          leadId: result.leadId,
          error: "Lead not found."
        },
        { status: 404 }
      );
    }
    if (result.outcome === "forbidden") {
      return NextResponse.json(
        {
          outcome: "forbidden" as const,
          leadId: result.leadId,
          reason: result.reason,
          error: result.reason
        },
        { status: 403 }
      );
    }

    console.error("[exhibitor/leads][DELETE] lead delete failed", {
      accountId,
      leadId,
      error: result.message
    });
    return NextResponse.json(
      { outcome: "error" as const, message: result.message, error: result.message },
      { status: 500 }
    );
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
