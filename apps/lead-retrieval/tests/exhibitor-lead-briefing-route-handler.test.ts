import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NextResponse } from "next/server";
import { handleExhibitorLeadBriefingGet } from "@/lib/server/leads/exhibitorLeadBriefingGetHandler";
import type { LeadFields } from "@/lib/import-wizard/build-briefing-detail";

describe("handleExhibitorLeadBriefingGet", () => {
  const request = new Request("http://localhost/api/exhibitor/leads/lead-1/briefing");

  const lead: LeadFields = {
    id: "lead-1",
    full_name: "Sarah Chen",
    email: "sarah@example.com",
    job_title: "VP Marketing",
    company_text: "Zenith Solutions",
    enriched_job_title: "VP Marketing",
    enriched_company_size: "250-500",
    enriched_industry: "B2B SaaS",
    enriched_linkedin_url: "https://linkedin.com/in/sarah-chen",
    enriched_company_domain: "zenithsolutions.com",
    enriched_seniority: "Executive",
  };

  it("returns mobile-friendly briefing sections for a published lead briefing", async () => {
    const response = await handleExhibitorLeadBriefingGet(
      request,
      { leadId: "lead-1" },
      {
        resolveApiSession: async () => ({
          userId: "user-1",
          companyId: "company-1",
          role: "exhibitor_admin",
        }),
        fetchLeadForCompany: async () => ({ lead, error: null }),
        fetchLeadBriefingForLead: async () => ({
          briefing: {
            id: "briefing-1",
            content: {
              linkage: { published_lead_id: "lead-1" },
              companySnapshot: { name: "Zenith Solutions" },
              whyHere: ["Evaluating badge scan analytics"],
              talkingPoints: [{ title: "ROI", detail: "Show time-to-value" }],
              questionsToAsk: ["How does your team qualify event leads today?"],
              competitorContext: "Currently evaluating two alternatives.",
              signalsToWatch: ["Mentions 30-day deployment timeline"],
            },
            approval_status: "approved",
            updated_at: "2026-04-16T10:00:00.000Z",
          },
          error: null,
        }),
      }
    );

    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      briefing: {
        leadId: string;
        approvalStatus: string;
        sections: {
          companySnapshot: { name: string };
          whyTheyMightBeHere: string[];
          topTalkingPoints: Array<{ title: string; detail: string }>;
          questionsToAsk: string[];
          competitorContext: string;
          signalsToWatch: string[];
        };
      };
    };

    assert.equal(body.briefing.leadId, "lead-1");
    assert.equal(body.briefing.approvalStatus, "approved");
    assert.equal(body.briefing.sections.companySnapshot.name, "Zenith Solutions");
    assert.deepEqual(body.briefing.sections.whyTheyMightBeHere, ["Evaluating badge scan analytics"]);
    assert.deepEqual(body.briefing.sections.topTalkingPoints, [{ title: "ROI", detail: "Show time-to-value" }]);
    assert.deepEqual(body.briefing.sections.questionsToAsk, ["How does your team qualify event leads today?"]);
    assert.equal(body.briefing.sections.competitorContext, "Currently evaluating two alternatives.");
    assert.deepEqual(body.briefing.sections.signalsToWatch, ["Mentions 30-day deployment timeline"]);
  });

  it("returns clean 404 when no lead briefing exists", async () => {
    const response = await handleExhibitorLeadBriefingGet(
      request,
      { leadId: "lead-1" },
      {
        resolveApiSession: async () => ({
          userId: "user-1",
          companyId: "company-1",
          role: "exhibitor_admin",
        }),
        fetchLeadForCompany: async () => ({ lead, error: null }),
        fetchLeadBriefingForLead: async () => ({ briefing: null, error: null }),
      }
    );

    assert.equal(response.status, 404);
    const body = (await response.json()) as { briefing: null; error: string };
    assert.equal(body.briefing, null);
    assert.match(body.error, /no briefing/i);
  });

  it("propagates auth failures from centralized session resolver", async () => {
    const response = await handleExhibitorLeadBriefingGet(
      request,
      { leadId: "lead-1" },
      {
        resolveApiSession: async () => {
          throw NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        },
        fetchLeadForCompany: async () => ({ lead: null, error: null }),
        fetchLeadBriefingForLead: async () => ({ briefing: null, error: null }),
      }
    );

    assert.equal(response.status, 401);
    const body = (await response.json()) as { error: string };
    assert.equal(body.error, "Unauthorized");
  });
});
