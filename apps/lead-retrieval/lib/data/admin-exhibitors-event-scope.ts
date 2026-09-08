export type SelectedEventParticipationRow = {
  id: string;
  event_id: string;
  company_id: string;
  status: string | null;
  created_at: string;
};

export type SelectedEventLicenseRow = {
  event_id: string | null;
  exhibitor_company_id: string | null;
  seats_total: number | null;
  seats_used: number | null;
  status: string | null;
  price_cents: number | null;
  scope?: string | null;
  created_at?: string | null;
};

export type SelectedEventExhibitorRow = {
  id: string;
  participationId: string | null;
  eventId: string;
  companyId: string;
  createdAt: string;
  name: string;
  seatsPurchased: number;
  seatsUsed: number;
  licenseStatus: "active" | "expired" | "none";
  revenue: number;
  leadCount: number;
  userCount: number;
  licenseCount: number;
};

export type BuildSelectedEventExhibitorsInput = {
  event: { id: string; company_id: string | null };
  participationRows: SelectedEventParticipationRow[];
  licenseRows: SelectedEventLicenseRow[];
  companyRows: Array<{ id: string; name: string }>;
  eventUserRows?: Array<{ event_id: string; exhibitor_company_id: string | null; status: string }>;
  leadRows?: Array<{ event_id: string | null; company_id: string | null }>;
};

/**
 * Canonical selected-event projection for the Platform Admin exhibitors surface.
 *
 * Participation is an explicit `exhibitors(event_id, company_id)` link. The one
 * established exception is a direct-buyer company that owns the event and has a
 * company-scoped license: that architecture intentionally has no `exhibitors` row.
 * Event users and leads are metrics only and never manufacture participation.
 */
export function buildSelectedEventExhibitorRows(
  input: BuildSelectedEventExhibitorsInput
): SelectedEventExhibitorRow[] {
  const eventId = input.event.id;
  const eventOwnerCompanyId = String(input.event.company_id ?? "").trim();
  const participationByCompany = new Map<string, SelectedEventParticipationRow>();

  for (const row of input.participationRows) {
    if (row.event_id !== eventId || !row.company_id) continue;
    if (!participationByCompany.has(row.company_id)) participationByCompany.set(row.company_id, row);
  }

  const directBuyerLicense = input.licenseRows.find((row) => {
    const targetCompanyId = String(row.exhibitor_company_id ?? "").trim();
    return (
      Boolean(eventOwnerCompanyId) &&
      targetCompanyId === eventOwnerCompanyId &&
      row.event_id == null &&
      String(row.scope ?? "").toLowerCase() === "company"
    );
  });

  const participantCompanyIds = new Set(participationByCompany.keys());
  if (directBuyerLicense && eventOwnerCompanyId) participantCompanyIds.add(eventOwnerCompanyId);

  const companyNames = new Map(input.companyRows.map((row) => [row.id, row.name]));
  const usersByCompany = new Map<string, number>();
  for (const row of input.eventUserRows ?? []) {
    if (row.event_id !== eventId || !row.exhibitor_company_id) continue;
    const status = String(row.status ?? "").toLowerCase();
    if (status !== "active" && status !== "invited") continue;
    usersByCompany.set(row.exhibitor_company_id, (usersByCompany.get(row.exhibitor_company_id) ?? 0) + 1);
  }

  const leadsByCompany = new Map<string, number>();
  for (const row of input.leadRows ?? []) {
    if (row.event_id !== eventId || !row.company_id) continue;
    leadsByCompany.set(row.company_id, (leadsByCompany.get(row.company_id) ?? 0) + 1);
  }

  return Array.from(participantCompanyIds)
    .map((companyId) => {
      const participation = participationByCompany.get(companyId) ?? null;
      const scopedLicenses = input.licenseRows.filter((license) => {
        if (String(license.exhibitor_company_id ?? "").trim() !== companyId) return false;
        if (license.event_id === eventId) return true;
        return license.event_id == null && String(license.scope ?? "").toLowerCase() === "company";
      });
      const seatsPurchased = scopedLicenses.reduce(
        (sum, row) => sum + Math.max(0, Number(row.seats_total ?? 0)),
        0
      );
      const seatsUsed = scopedLicenses.reduce(
        (sum, row) => sum + Math.max(0, Number(row.seats_used ?? 0)),
        0
      );
      const revenue = scopedLicenses.reduce(
        (sum, row) => sum + Math.max(0, Number(row.price_cents ?? 0)) / 100,
        0
      );
      const hasActiveLicense = scopedLicenses.some(
        (row) => String(row.status ?? "").toLowerCase() === "active"
      );

      return {
        id: participation?.id ?? `direct:${eventId}:${companyId}`,
        participationId: participation?.id ?? null,
        eventId,
        companyId,
        createdAt: participation?.created_at ?? directBuyerLicense?.created_at ?? "",
        name: companyNames.get(companyId) ?? "Unknown Exhibitor",
        seatsPurchased,
        seatsUsed,
        licenseStatus: hasActiveLicense ? "active" : scopedLicenses.length ? "expired" : "none",
        revenue,
        leadCount: leadsByCompany.get(companyId) ?? 0,
        userCount: usersByCompany.get(companyId) ?? 0,
        licenseCount: scopedLicenses.length
      } satisfies SelectedEventExhibitorRow;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
