import { NextResponse } from "next/server";
import OpenAI from "openai";
import { resolveApiSession } from "@/lib/auth/resolveApiSession";
import { createAdminClient } from "@/lib/supabase/admin";
import { canReadExhibitorLeadsInContext } from "@/lib/server/exhibitor-permission-aggregates";
import {
  EventAccessDeniedError,
  assertEventIdAccessibleForUser
} from "@/lib/server/company-event-access";
import { buildLeadInsightRegenerationPrompt } from "@/lib/voice-notes/server/buildLeadInsightRegenerationPrompt";
import {
  CONVERSATION_INSIGHT_JSON_SCHEMA,
  CONVERSATION_INSIGHT_SCHEMA_NAME,
  parseConversationInsightJson
} from "@/lib/conversations/conversation-insight-contract";
import { getLeadInsightsOpenAIModel } from "@/lib/server/lead-insights/modelConfig";
import { resolveEventLocation } from "@/lib/data/admin-events";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ leadId: string }> }
) {
  let scopedLeadId = "";
  let scopedCompanyId = "";
  try {
    const sessionUser = await resolveApiSession(request);
    const role = String(sessionUser.role ?? "").trim().toLowerCase();
    const userId = String(sessionUser.userId ?? "").trim();
    const companyId = String(sessionUser.companyId ?? "").trim();
    scopedCompanyId = companyId;
    const isBearer = /^Bearer\s/i.test(request.headers.get("authorization") ?? "");

    if (!userId || !companyId) {
      return NextResponse.json({ error: "Missing exhibitor scope." }, { status: 400 });
    }

    if (
      !(await canReadExhibitorLeadsInContext({
        userId,
        companyId,
        role,
        isBearer,
        activePlatformAdminCompanyId: sessionUser.activeCompanyId
      }))
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { leadId: rawLeadId } = await params;
    const leadId = String(rawLeadId ?? "").trim();
    scopedLeadId = leadId;
    if (!leadId) {
      return NextResponse.json({ error: "Missing lead id." }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: leadRow, error: leadError } = await (admin as any)
      .from("leads")
      .select(
        "id, company_id, event_id, full_name, email, job_title, company_text, company_domain, industry, company_size, seniority, status, temperature, priority_score"
      )
      .eq("id", leadId)
      .eq("company_id", companyId)
      .maybeSingle();

    if (leadError) {
      return NextResponse.json({ error: "Failed loading lead." }, { status: 500 });
    }
    if (!leadRow?.id) {
      return NextResponse.json({ error: "Lead not found for this exhibitor scope." }, { status: 404 });
    }

    if (role === "exhibitor_viewer") {
      const eventId = String(leadRow.event_id ?? "").trim();
      if (!eventId) {
        return NextResponse.json({ error: "Lead not found for this exhibitor scope." }, { status: 404 });
      }
      await assertEventIdAccessibleForUser(userId, eventId);
    }

    const nowIso = new Date().toISOString();
    const { error: markProcessingError } = await (admin as any)
      .from("lead_cumulative_insights")
      .upsert(
        {
          lead_id: leadId,
          company_id: companyId,
          status: "processing",
          requested_at: nowIso,
          updated_at: nowIso
        },
        { onConflict: "lead_id" }
      );

    if (markProcessingError) {
      return NextResponse.json(
        { error: markProcessingError.message ?? "Failed preparing insight regeneration." },
        { status: 500 }
      );
    }

    const { data: eventRow } = leadRow.event_id
      ? await (admin as any)
          .from("events")
          .select("name, location, city, state")
          .eq("id", leadRow.event_id)
          .maybeSingle()
      : { data: null };

    const { data: noteRows, error: notesError } = await (admin as any)
      .from("lead_voice_notes")
      .select("id, recorded_at, duration_ms, transcript")
      .eq("lead_id", leadId)
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("recorded_at", { ascending: true });

    if (notesError) {
      return NextResponse.json({ error: notesError.message ?? "Failed loading voice notes." }, { status: 500 });
    }

    const voiceNotes = ((noteRows ?? []) as Array<{
      id: string;
      recorded_at: string | null;
      duration_ms: number | null;
      transcript: string | null;
    }>)
      .map((row) => ({
        id: String(row.id),
        recordedAt: row.recorded_at,
        durationMs: row.duration_ms,
        transcript: String(row.transcript ?? "").trim()
      }))
      .filter((row) => row.transcript.length > 0);

    if (voiceNotes.length === 0) {
      const { error: completeEmptyError } = await (admin as any)
        .from("lead_cumulative_insights")
        .upsert(
          {
            lead_id: leadId,
            company_id: companyId,
            status: "completed",
            insights_json: null,
            source_note_count: 0,
            last_regenerated_at: nowIso,
            requested_at: nowIso,
            updated_at: nowIso
          },
          { onConflict: "lead_id" }
        );

      if (completeEmptyError) {
        return NextResponse.json(
          { error: completeEmptyError.message ?? "Failed updating empty insight state." },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true, leadId, status: "completed" as const });
    }

    const eventLocation = resolveEventLocation(
      eventRow?.city ?? null,
      eventRow?.state ?? null,
      eventRow?.location ?? null
    );

    const prompt = buildLeadInsightRegenerationPrompt({
      lead: {
        id: String(leadRow.id),
        fullName: leadRow.full_name,
        email: leadRow.email,
        jobTitle: leadRow.job_title,
        companyText: leadRow.company_text,
        companyDomain: leadRow.company_domain,
        industry: leadRow.industry,
        companySize: leadRow.company_size,
        seniority: leadRow.seniority,
        status: leadRow.status,
        temperature: leadRow.temperature,
        priorityScore: Number(leadRow.priority_score ?? 0),
        eventName: String(eventRow?.name ?? "").trim() || null,
        eventLocation: eventLocation || null
      },
      voiceNotes
    });

    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is missing");
    }

    const client = new OpenAI({ apiKey });
    const completion = await client.chat.completions.create({
      model: getLeadInsightsOpenAIModel(),
      temperature: 0.1,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: CONVERSATION_INSIGHT_SCHEMA_NAME,
          strict: true,
          schema: CONVERSATION_INSIGHT_JSON_SCHEMA
        }
      },
      messages: [
        {
          role: "system",
          content: "You are an enterprise sales intelligence analyst for RevOps and sales engineering. Output strict JSON only."
        },
        {
          role: "user",
          content: prompt
        }
      ]
    });

    const insights = parseConversationInsightJson(String(completion.choices[0]?.message?.content ?? ""));

    const { error: persistError } = await (admin as any)
      .from("lead_cumulative_insights")
      .upsert(
        {
          lead_id: leadId,
          company_id: companyId,
          status: "completed",
          insights_json: insights,
          source_note_count: voiceNotes.length,
          last_regenerated_at: nowIso,
          requested_at: nowIso,
          updated_at: nowIso
        },
        { onConflict: "lead_id" }
      );

    if (persistError) {
      return NextResponse.json(
        { error: persistError.message ?? "Failed saving regenerated insights." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, leadId, status: "completed" as const });
  } catch (error) {
    if (error instanceof EventAccessDeniedError) {
      return NextResponse.json({ error: "Event access denied" }, { status: 403 });
    }
    if (error instanceof Response) {
      return error;
    }
    const message = error instanceof Error ? error.message : "Unexpected error";
    if (scopedLeadId && scopedCompanyId) {
      const admin = createAdminClient();
      const nowIso = new Date().toISOString();
      await (admin as any)
        .from("lead_cumulative_insights")
        .upsert(
          {
            lead_id: scopedLeadId,
            company_id: scopedCompanyId,
            status: "failed",
            requested_at: nowIso,
            updated_at: nowIso
          },
          { onConflict: "lead_id" }
        );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
