export type ExhibitorLeadPatchRow = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  company_text?: string | null;
  temperature?: "hot" | "warm" | "cold" | null;
  priority_score: number;
  rating: number | null;
  follow_up_date: string | null;
  updated_at: string;
  created_at: string;
};

export async function patchExhibitorLead(
  leadId: string,
  patch: Record<string, unknown>
): Promise<{ ok: true; lead: ExhibitorLeadPatchRow } | { ok: false; error: string }> {
  const response = await fetch(`/api/exhibitor/leads/${encodeURIComponent(leadId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch)
  });

  const payload = (await response.json().catch(() => ({}))) as {
    lead?: ExhibitorLeadPatchRow;
    error?: string;
  };

  if (!response.ok || !payload.lead) {
    return { ok: false, error: payload.error ?? "Failed to save lead." };
  }

  return { ok: true, lead: payload.lead };
}
