import type { BriefingDetailView } from "@/lib/import-wizard/briefing-detail-model";

export type LeadBriefingApprovalStatus = "pending" | "approved";

export function toLeadBriefingApprovalStatus(
  value: string | null | undefined
): LeadBriefingApprovalStatus {
  return String(value ?? "").trim().toLowerCase() === "approved"
    ? "approved"
    : "pending";
}

export type MobileLeadBriefingSections = {
  companySnapshot: BriefingDetailView["companySnapshot"];
  whyTheyMightBeHere: BriefingDetailView["whyHere"];
  topTalkingPoints: BriefingDetailView["talkingPoints"];
  questionsToAsk: BriefingDetailView["questionsToAsk"];
  competitorContext: BriefingDetailView["competitorContext"];
  signalsToWatch: BriefingDetailView["signalsToWatch"];
};

export function toMobileLeadBriefingSections(
  detail: Pick<
    BriefingDetailView,
    | "companySnapshot"
    | "whyHere"
    | "talkingPoints"
    | "questionsToAsk"
    | "competitorContext"
    | "signalsToWatch"
  >
): MobileLeadBriefingSections {
  return {
    companySnapshot: detail.companySnapshot,
    whyTheyMightBeHere: detail.whyHere,
    topTalkingPoints: detail.talkingPoints,
    questionsToAsk: detail.questionsToAsk,
    competitorContext: detail.competitorContext,
    signalsToWatch: detail.signalsToWatch,
  };
}
