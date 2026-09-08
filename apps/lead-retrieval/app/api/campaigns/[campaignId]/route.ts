import { NextResponse } from "next/server";
import { getCurrentSessionUser } from "@/lib/auth/session";
import { resolveApiSession } from "@/lib/auth/resolveApiSession";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type CampaignRow = {
  id: string;
  company_id: string;
  name: string;
  mode: "single" | "group";
  status: "draft" | "scheduled" | "sending" | "sent" | "failed";
  selected_signals: string[];
  subject_line: string | null;
  draft_subject: string | null;
  draft_body_text: string | null;
  draft_body_html: string | null;
  draft_updated_at: string | null;
  created_at: string;
};

type CampaignPatchPayload = {
  name?: string;
  selectedSignalIds?: string[];
  subjectLine?: string;
  draftSubject?: string | null;
  draftBodyText?: string | null;
  draftBodyHtml?: string | null;
};

function normalizeSelectedSignals(signals?: string[]) {
  return [...new Set((signals ?? []).map((signal) => signal.trim()).filter(Boolean))];
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  try {
    const sessionUser = await getCurrentSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!sessionUser.company_id) {
      return NextResponse.json({ error: "No company assigned" }, { status: 400 });
    }

    const { campaignId: rawCampaignId } = await params;
    const campaignId = rawCampaignId.trim();
    if (!campaignId) {
      return NextResponse.json({ error: "Missing campaign id in route" }, { status: 400 });
    }

    let payload: CampaignPatchPayload = {};
    try {
      payload = (await request.json()) as CampaignPatchPayload;
    } catch {
      payload = {};
    }

    const supabase = await createSupabaseServerClient();
    const { data: existing, error: readError } = (await supabase
      .from("campaigns")
      .select("id, company_id, status")
      .eq("id", campaignId)
      .eq("company_id", sessionUser.company_id)
      .maybeSingle()) as {
      data: { id: string; company_id: string; status: CampaignRow["status"] } | null;
      error: { message: string; code?: string } | null;
    };

    if (readError) {
      return NextResponse.json(
        { error: `${readError.message} (${readError.code ?? "no_code"})` },
        { status: 500 }
      );
    }

    if (!existing) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    if (existing.status !== "draft") {
      return NextResponse.json({ error: "Only draft campaigns can be edited" }, { status: 400 });
    }

    const updatePatch: {
      name?: string;
      selected_signals?: string[];
      subject_line?: string | null;
      draft_subject?: string | null;
      draft_body_text?: string | null;
      draft_body_html?: string | null;
      draft_updated_at?: string;
    } = {};

    if (payload.name !== undefined) {
      const nextName = payload.name.trim();
      if (!nextName) {
        return NextResponse.json({ error: "Campaign name is required" }, { status: 400 });
      }
      updatePatch.name = nextName;
    }

    if (
      "selectedSignals" in (payload as Record<string, unknown>) ||
      "selectedSignalDefinitions" in (payload as Record<string, unknown>)
    ) {
      return NextResponse.json(
        { error: "Only selectedSignalIds is supported for Campaign Agent selection." },
        { status: 400 }
      );
    }

    if (payload.selectedSignalIds !== undefined) {
      updatePatch.selected_signals = normalizeSelectedSignals(payload.selectedSignalIds);
    }

    if (payload.subjectLine !== undefined) {
      const subjectLine = payload.subjectLine.trim();
      updatePatch.subject_line = subjectLine.length > 0 ? subjectLine : null;
    }

    let hasDraftFieldUpdate = false;
    if (payload.draftSubject !== undefined) {
      const draftSubject = payload.draftSubject?.trim() ?? "";
      updatePatch.draft_subject = draftSubject.length > 0 ? draftSubject : null;
      hasDraftFieldUpdate = true;
    }

    if (payload.draftBodyText !== undefined) {
      const draftBodyText = payload.draftBodyText?.trim() ?? "";
      updatePatch.draft_body_text = draftBodyText.length > 0 ? draftBodyText : null;
      hasDraftFieldUpdate = true;
    }

    if (payload.draftBodyHtml !== undefined) {
      const draftBodyHtml = payload.draftBodyHtml?.trim() ?? "";
      updatePatch.draft_body_html = draftBodyHtml.length > 0 ? draftBodyHtml : null;
      hasDraftFieldUpdate = true;
    }

    if (hasDraftFieldUpdate) {
      updatePatch.draft_updated_at = new Date().toISOString();
    }

    if (Object.keys(updatePatch).length === 0) {
      return NextResponse.json({ error: "No campaign fields supplied for update" }, { status: 400 });
    }

    const { data, error } = (await supabase
      .from("campaigns")
      .update(updatePatch as never)
      .eq("id", campaignId)
      .eq("company_id", sessionUser.company_id)
      .select(
        "id, name, mode, status, selected_signals, subject_line, draft_subject, draft_body_text, draft_body_html, draft_updated_at, created_at"
      )
      .single()) as {
      data: Omit<CampaignRow, "company_id"> | null;
      error: { message: string; code?: string } | null;
    };

    if (error || !data) {
      return NextResponse.json(
        { error: `${error?.message ?? "Failed to update campaign"} (${error?.code ?? "no_code"})` },
        { status: 500 }
      );
    }

    return NextResponse.json({ campaign: data });
  } catch (error) {
    console.error("[api/campaigns/[campaignId] PATCH]", error);
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  try {
    const sessionUser = await resolveApiSession(request);
    const role = String(sessionUser.role ?? "").trim().toLowerCase();
    const companyId = String(sessionUser.companyId ?? "").trim();

    if (role !== "exhibitor_admin" && role !== "platform_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!companyId) {
      return NextResponse.json({ error: "No company assigned" }, { status: 400 });
    }

    const { campaignId: rawCampaignId } = await params;
    const campaignId = rawCampaignId.trim();
    if (!campaignId) {
      return NextResponse.json({ error: "Missing campaign id in route" }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: existing, error: readError } = (await supabase
      .from("campaigns")
      .select("id, company_id, status")
      .eq("id", campaignId)
      .eq("company_id", companyId)
      .maybeSingle()) as {
      data: { id: string; company_id: string; status: CampaignRow["status"] } | null;
      error: { message: string; code?: string } | null;
    };

    if (readError) {
      return NextResponse.json(
        { error: `${readError.message} (${readError.code ?? "no_code"})` },
        { status: 500 }
      );
    }

    if (!existing) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    if (existing.status !== "draft") {
      return NextResponse.json(
        { error: "Only draft campaigns can be deleted" },
        { status: 409 }
      );
    }

    const { data: messageRows, error: messageLookupError } = (await supabase
      .from("campaign_messages")
      .select("id")
      .eq("campaign_id", campaignId)) as {
      data: Array<{ id: string }> | null;
      error: { message: string; code?: string } | null;
    };

    if (messageLookupError) {
      return NextResponse.json(
        { error: `${messageLookupError.message} (${messageLookupError.code ?? "no_code"})` },
        { status: 500 }
      );
    }

    const messageIds = (messageRows ?? []).map((row) => row.id).filter(Boolean);
    if (messageIds.length > 0) {
      const { error: eventsError } = await supabase
        .from("email_events")
        .delete()
        .in("campaign_message_id", messageIds);
      if (eventsError) {
        return NextResponse.json(
          { error: `${eventsError.message} (${eventsError.code ?? "no_code"})` },
          { status: 500 }
        );
      }
    }

    const { error: messagesError } = await supabase
      .from("campaign_messages")
      .delete()
      .eq("campaign_id", campaignId);
    if (messagesError) {
      return NextResponse.json(
        { error: `${messagesError.message} (${messagesError.code ?? "no_code"})` },
        { status: 500 }
      );
    }

    const { error: recipientsError } = await supabase
      .from("campaign_recipients")
      .delete()
      .eq("campaign_id", campaignId);
    if (recipientsError) {
      return NextResponse.json(
        { error: `${recipientsError.message} (${recipientsError.code ?? "no_code"})` },
        { status: 500 }
      );
    }

    const { error: deleteError } = await supabase
      .from("campaigns")
      .delete()
      .eq("id", campaignId)
      .eq("company_id", companyId);
    if (deleteError) {
      return NextResponse.json(
        { error: `${deleteError.message} (${deleteError.code ?? "no_code"})` },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, campaignId });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error("[api/campaigns/[campaignId] DELETE]", error);
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
