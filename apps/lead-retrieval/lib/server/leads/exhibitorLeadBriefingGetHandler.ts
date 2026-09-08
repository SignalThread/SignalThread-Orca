import { NextResponse } from "next/server";
import { parseBriefingContent } from "@/lib/import-wizard/briefing-content-json";
import {
  buildBriefingDetailView,
  type LeadFields,
} from "@/lib/import-wizard/build-briefing-detail";
import {
  toLeadBriefingApprovalStatus,
  toMobileLeadBriefingSections,
} from "@/lib/server/briefings/lead-briefings";
import type { Json } from "@/types/database";

export type SessionUser = {
  userId: string;
  companyId: string;
  role: string;
};

type LeadBriefingRow = {
  id: string;
  content: Json;
  approval_status: string | null;
  updated_at: string;
};

type HandlerDeps = {
  resolveApiSession: (request: Request) => Promise<SessionUser>;
  fetchLeadForCompany: (
    leadId: string,
    companyId: string
  ) => Promise<{ lead: LeadFields | null; error: string | null }>;
  fetchLeadBriefingForLead: (
    leadId: string,
    companyId: string
  ) => Promise<{ briefing: LeadBriefingRow | null; error: string | null }>;
};

export async function handleExhibitorLeadBriefingGet(
  request: Request,
  params: { leadId?: string | null },
  deps: HandlerDeps
) {
  try {
    const sessionUser = await deps.resolveApiSession(request);
    const role = String(sessionUser.role ?? "").trim().toLowerCase();
    if (role !== "exhibitor_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const companyId = String(sessionUser.companyId ?? "").trim();
    if (!companyId) {
      return NextResponse.json({ error: "Missing exhibitor scope." }, { status: 400 });
    }

    const leadId = String(params.leadId ?? "").trim();
    if (!leadId) {
      return NextResponse.json({ error: "Missing lead id." }, { status: 400 });
    }

    const leadResult = await deps.fetchLeadForCompany(leadId, companyId);
    if (leadResult.error) {
      return NextResponse.json({ error: leadResult.error }, { status: 500 });
    }
    if (!leadResult.lead) {
      return NextResponse.json({ error: "Lead not found for this exhibitor scope." }, { status: 404 });
    }

    const briefingResult = await deps.fetchLeadBriefingForLead(leadId, companyId);
    if (briefingResult.error) {
      return NextResponse.json({ error: briefingResult.error }, { status: 500 });
    }
    if (!briefingResult.briefing) {
      return NextResponse.json(
        { briefing: null, error: "No briefing found for this lead." },
        { status: 404 }
      );
    }

    const stored = parseBriefingContent(briefingResult.briefing.content);
    const detail = buildBriefingDetailView(
      briefingResult.briefing.id,
      leadResult.lead,
      stored,
      toLeadBriefingApprovalStatus(briefingResult.briefing.approval_status)
    );

    return NextResponse.json({
      briefing: {
        briefingRecordId: detail.briefingRecordId,
        leadId: detail.leadId,
        approvalStatus: detail.approvalStatus,
        headline: detail.headline,
        sections: toMobileLeadBriefingSections(detail),
        manualContext: stored.manualContext ?? null,
        gaps: Array.isArray(stored.gaps) ? stored.gaps : null,
        updatedAt: briefingResult.briefing.updated_at,
      },
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected error" },
      { status: 500 }
    );
  }
}
