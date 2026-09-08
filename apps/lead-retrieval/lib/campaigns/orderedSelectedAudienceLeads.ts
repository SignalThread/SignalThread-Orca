/**
 * Preserves campaign_recipients order while enriching from the company lead catalog when present.
 */

export type AudienceRecipientRow = {
  lead_id: string;
  name: string;
  company: string;
  role: string;
};

export type AudienceAvailableLead = {
  id: string;
  full_name: string;
  email: string | null;
  company: string;
  role: string;
};

export type OrderedSelectedAudienceEntry =
  | { kind: "lead"; leadId: string; lead: AudienceAvailableLead }
  | { kind: "fallback"; leadId: string; name: string; company: string; role: string };

export function orderedSelectedAudienceEntries(
  recipients: AudienceRecipientRow[],
  availableLeads: AudienceAvailableLead[]
): OrderedSelectedAudienceEntry[] {
  const byId = new Map(availableLeads.map((l) => [l.id, l]));
  return recipients.map((rec) => {
    const lead = byId.get(rec.lead_id);
    if (lead) {
      return { kind: "lead" as const, leadId: rec.lead_id, lead };
    }
    return {
      kind: "fallback" as const,
      leadId: rec.lead_id,
      name: rec.name,
      company: rec.company,
      role: rec.role
    };
  });
}
