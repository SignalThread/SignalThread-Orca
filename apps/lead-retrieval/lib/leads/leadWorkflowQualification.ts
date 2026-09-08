import { parseLeadTemperature } from "@/lib/leads/temperature";

export type LeadWorkflowQualificationSnapshot = {
  rating?: number | null;
  temperature?: string | null;
  status?: string | null;
  priority_score?: number | null;
};

export function leadHasWorkflowQualificationSignal(lead: LeadWorkflowQualificationSnapshot): boolean {
  const rating = Number(lead.rating ?? 0);
  if (Number.isFinite(rating) && rating > 0) return true;

  if (parseLeadTemperature(lead.temperature)) return true;

  const status = String(lead.status ?? "new").trim().toLowerCase();
  if (status && status !== "new") return true;

  const priorityScore = Number(lead.priority_score ?? 0);
  return Number.isFinite(priorityScore) && priorityScore > 0;
}
