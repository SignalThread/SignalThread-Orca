import { createAdminClient } from "@/lib/supabase/admin";
import { adminRouteDebugLog } from "@/lib/data/admin-events";
import { buildSelectedEventExhibitorRows } from "@/lib/data/admin-exhibitors-event-scope";

export type AdminExhibitorEventOption = {
  id: string;
  name: string;
};

export type AdminExhibitorRow = {
  id: string;
  /** Null for direct-buyer event owners, which intentionally have no `exhibitors` link row. */
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

export type AdminHostCompanyOption = {
  id: string;
  name: string;
};

export type AdminExhibitorsIndexData = {
  events: AdminExhibitorEventOption[];
  exhibitors: AdminExhibitorRow[];
  defaultEventId: string;
  /** Distinct event host companies — used when creating an exhibitor company without an event (platform). */
  hostCompanies: AdminHostCompanyOption[];
};

type LicenseAggregate = {
  id?: string;
  event_id: string | null;
  exhibitor_company_id: string | null;
  company_id: string | null;
  seats_total: number | null;
  seats_used: number | null;
  status: string | null;
  price_cents: number | null;
  scope?: string | null;
  currency?: string | null;
  starts_at?: string | null;
  expires_at?: string | null;
  created_at?: string | null;
};

type ExhibitorRecord = {
  id: string;
  event_id: string;
  company_id: string;
  status: string | null;
  created_at: string;
};

export type ExhibitorSeatMetrics = {
  seatsPurchased: number;
  seatsUsed: number;
  revenue: number;
  licenseCount: number;
  hasActiveLicense: boolean;
};

const EMPTY_EXHIBITOR_SEAT_METRICS: ExhibitorSeatMetrics = {
  seatsPurchased: 0,
  seatsUsed: 0,
  revenue: 0,
  licenseCount: 0,
  hasActiveLicense: false
};

export function getExhibitorScopeKey(eventId: string, exhibitorCompanyId: string) {
  return `${eventId}:${exhibitorCompanyId}`;
}

// Licenses are the commercial and seat source of truth for exhibitor seat counts.
export function aggregateExhibitorSeatMetricsByScope(
  licenseRows: LicenseAggregate[]
): Map<string, ExhibitorSeatMetrics> {
  const metricsByScope = new Map<string, ExhibitorSeatMetrics>();

  for (const row of licenseRows) {
    const eventId = String(row.event_id ?? "").trim();
    const exhibitorCompanyId = String(row.exhibitor_company_id ?? "").trim();
    if (!eventId || !exhibitorCompanyId) {
      continue;
    }

    const key = getExhibitorScopeKey(eventId, exhibitorCompanyId);
    const current = metricsByScope.get(key) ?? { ...EMPTY_EXHIBITOR_SEAT_METRICS };
    const status = String(row.status ?? "").trim().toLowerCase();

    current.seatsPurchased += Math.max(0, Number(row.seats_total ?? 0));
    current.seatsUsed += Math.max(0, Number(row.seats_used ?? 0));
    current.revenue += Math.max(0, Number(row.price_cents ?? 0)) / 100;
    current.licenseCount += 1;
    current.hasActiveLicense = current.hasActiveLicense || status === "active";

    metricsByScope.set(key, current);
  }

  return metricsByScope;
}

export async function getExhibitorSeatMetricsBulk(params: {
  supabase: ReturnType<typeof createAdminClient>;
  eventIds: string[];
  exhibitorCompanyIds: string[];
}) {
  const { supabase, eventIds, exhibitorCompanyIds } = params;
  if (!eventIds.length || !exhibitorCompanyIds.length) {
    return new Map<string, ExhibitorSeatMetrics>();
  }

  const { data, error } = await (supabase as any)
    .from("licenses")
    .select("id, event_id, exhibitor_company_id, company_id, seats_total, seats_used, status, price_cents")
    .in("event_id", eventIds)
    .in("exhibitor_company_id", exhibitorCompanyIds);

  if (error) {
    throw new Error(`Failed loading exhibitor licenses: ${toErrorMessage(error)}`);
  }

  return aggregateExhibitorSeatMetricsByScope((data ?? []) as LicenseAggregate[]);
}

export function getExhibitorSeatMetricsByEventAndCompany(params: {
  metricsByScope: Map<string, ExhibitorSeatMetrics>;
  eventId: string;
  exhibitorCompanyId: string;
}) {
  const { metricsByScope, eventId, exhibitorCompanyId } = params;
  return metricsByScope.get(getExhibitorScopeKey(eventId, exhibitorCompanyId)) ?? EMPTY_EXHIBITOR_SEAT_METRICS;
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  if (error && typeof error === "object") {
    const maybe = error as { message?: string; details?: string; hint?: string; code?: string };
    return [
      maybe.message ? `message=${maybe.message}` : null,
      maybe.details ? `details=${maybe.details}` : null,
      maybe.hint ? `hint=${maybe.hint}` : null,
      maybe.code ? `code=${maybe.code}` : null
    ]
      .filter(Boolean)
      .join(" | ");
  }
  return String(error);
}

export async function getAdminExhibitorsIndexData(options?: {
  /** When provided, the database queries and returned rows are restricted to this event. */
  selectedEventId?: string;
}): Promise<AdminExhibitorsIndexData> {
  const supabase = createAdminClient();

  const { data: events, error: eventsError } = await supabase
    .from("events")
    .select("id, name, company_id")
    .order("start_date", { ascending: false });

  if (eventsError) {
    throw new Error(`Failed loading events: ${toErrorMessage(eventsError)}`);
  }

  const eventRows = (events ?? []) as Array<{ id: string; name: string; company_id: string | null }>;
  const eventOptions = eventRows.map((row) => ({ id: row.id, name: row.name }));
  const requestedEventId = String(options?.selectedEventId ?? "").trim();
  const selectedEvent =
    eventRows.find((event) => event.id === requestedEventId) ?? eventRows[0] ?? null;
  const defaultEventId = selectedEvent?.id ?? "";

  const hostCompanyIds = Array.from(
    new Set(
      ((events ?? []) as Array<{ company_id?: string | null }>)
        .map((row) => String(row.company_id ?? "").trim())
        .filter(Boolean)
    )
  );

  const { data: hostCompanyRows, error: hostCompaniesError } =
    hostCompanyIds.length > 0
      ? await supabase.from("companies").select("id, name").in("id", hostCompanyIds).order("name", { ascending: true })
      : { data: [], error: null };

  if (hostCompaniesError) {
    throw new Error(`Failed loading host companies: ${toErrorMessage(hostCompaniesError)}`);
  }

  const hostCompanies = ((hostCompanyRows ?? []) as AdminHostCompanyOption[]).map((row) => ({
    id: row.id,
    name: row.name
  }));

  if (options) {
    if (!selectedEvent) {
      return { events: eventOptions, exhibitors: [], defaultEventId: "", hostCompanies };
    }

    const { data: participationData, error: participationError } = await (supabase as any)
      .from("exhibitors")
      .select("id, event_id, company_id, status, created_at")
      .eq("event_id", selectedEvent.id)
      .order("created_at", { ascending: false });

    if (participationError) {
      throw new Error(`Failed loading exhibitors: ${toErrorMessage(participationError)}`);
    }

    const participationRows = (participationData ?? []) as ExhibitorRecord[];
    const candidateCompanyIds = Array.from(
      new Set([
        ...participationRows.map((row) => String(row.company_id ?? "").trim()),
        String(selectedEvent.company_id ?? "").trim()
      ].filter(Boolean))
    );

    const licensesResponse = candidateCompanyIds.length
      ? await (supabase as any)
          .from("licenses")
          .select(
            "id, event_id, exhibitor_company_id, company_id, seats_total, seats_used, status, price_cents, scope, created_at"
          )
          .in("exhibitor_company_id", candidateCompanyIds)
          .or(`event_id.eq.${selectedEvent.id},and(scope.eq.company,event_id.is.null)`)
      : { data: [], error: null };

    if (licensesResponse.error) {
      throw new Error(`Failed loading exhibitor licenses: ${toErrorMessage(licensesResponse.error)}`);
    }

    const licenseRows = (licensesResponse.data ?? []) as LicenseAggregate[];
    const eventOwnerHasCompanyLicense = licenseRows.some(
      (row) =>
        row.event_id == null &&
        row.exhibitor_company_id === selectedEvent.company_id &&
        String(row.scope ?? "").toLowerCase() === "company"
    );
    const participantCompanyIds = Array.from(
      new Set([
        ...participationRows.map((row) => row.company_id),
        ...(eventOwnerHasCompanyLicense && selectedEvent.company_id ? [selectedEvent.company_id] : [])
      ])
    );

    const [companiesResponse, usersResponse, leadsResponse] = await Promise.all([
      participantCompanyIds.length
        ? supabase.from("companies").select("id, name").in("id", participantCompanyIds)
        : Promise.resolve({ data: [], error: null }),
      participantCompanyIds.length
        ? supabase
            .from("event_users")
            .select("event_id, exhibitor_company_id, status")
            .eq("event_id", selectedEvent.id)
            .in("exhibitor_company_id", participantCompanyIds)
        : Promise.resolve({ data: [], error: null }),
      participantCompanyIds.length
        ? supabase
            .from("leads")
            .select("company_id, event_id")
            .eq("event_id", selectedEvent.id)
            .in("company_id", participantCompanyIds)
        : Promise.resolve({ data: [], error: null })
    ]);

    if (companiesResponse.error) throw new Error(`Failed loading companies: ${toErrorMessage(companiesResponse.error)}`);
    if (usersResponse.error) throw new Error(`Failed loading exhibitor users: ${toErrorMessage(usersResponse.error)}`);
    if (leadsResponse.error) throw new Error(`Failed loading exhibitor leads: ${toErrorMessage(leadsResponse.error)}`);

    const exhibitors = buildSelectedEventExhibitorRows({
      event: selectedEvent,
      participationRows,
      licenseRows,
      companyRows: (companiesResponse.data ?? []) as Array<{ id: string; name: string }>,
      eventUserRows: (usersResponse.data ?? []) as Array<{
        event_id: string;
        exhibitor_company_id: string | null;
        status: string;
      }>,
      leadRows: (leadsResponse.data ?? []) as Array<{ event_id: string | null; company_id: string | null }>
    });

    adminRouteDebugLog("admin.exhibitors.index", {
      selectedEventId: selectedEvent.id,
      exhibitors: exhibitors.length
    });

    return { events: eventOptions, exhibitors, defaultEventId, hostCompanies };
  }

  const { data: exhibitorRows, error: exhibitorsError } = await (supabase as any)
    .from("exhibitors")
    .select("id, event_id, company_id, status, created_at")
    .order("created_at", { ascending: false });

  if (exhibitorsError) {
    throw new Error(`Failed loading exhibitors: ${toErrorMessage(exhibitorsError)}`);
  }

  const scopedExhibitors = ((exhibitorRows ?? []) as ExhibitorRecord[]).filter(
    (row) => Boolean(row.id) && Boolean(row.company_id) && Boolean(row.event_id)
  );

  const companyIds = Array.from(new Set(scopedExhibitors.map((row) => row.company_id)));
  const eventIds = Array.from(new Set(scopedExhibitors.map((row) => row.event_id)));

  const [seatMetricsByScope, companiesResponse, usersResponse, leadsResponse] = await Promise.all([
    getExhibitorSeatMetricsBulk({
      supabase,
      eventIds,
      exhibitorCompanyIds: companyIds
    }),
    companyIds.length > 0
      ? supabase.from("companies").select("id, name").in("id", companyIds)
      : Promise.resolve({ data: [], error: null }),
    companyIds.length > 0 && eventIds.length > 0
      ? supabase
          .from("event_users")
          .select("event_id, exhibitor_company_id, status")
          .in("event_id", eventIds)
          .in("exhibitor_company_id", companyIds)
      : Promise.resolve({ data: [], error: null }),
    companyIds.length > 0 && eventIds.length > 0
      ? supabase
          .from("leads")
          .select("id, company_id, event_id")
          .in("company_id", companyIds)
          .in("event_id", eventIds)
      : Promise.resolve({ data: [], error: null })
  ]);

  if (companiesResponse.error) {
    throw new Error(`Failed loading companies: ${toErrorMessage(companiesResponse.error)}`);
  }
  if (usersResponse.error) {
    throw new Error(`Failed loading exhibitor users: ${toErrorMessage(usersResponse.error)}`);
  }
  if (leadsResponse.error) {
    throw new Error(`Failed loading exhibitor leads: ${toErrorMessage(leadsResponse.error)}`);
  }

  const companyNames = new Map<string, string>(
    ((companiesResponse.data ?? []) as Array<{ id: string; name: string }>).map((row) => [row.id, row.name])
  );
  const usersByEventCompany = new Map<string, number>();
  for (const row of (usersResponse.data ?? []) as Array<{
    event_id: string;
    exhibitor_company_id: string | null;
    status: string;
  }>) {
    if (!row.exhibitor_company_id) continue;
    const normalizedStatus = String(row.status ?? "").toLowerCase();
    if (normalizedStatus !== "active" && normalizedStatus !== "invited") continue;
    const key = `${row.event_id}:${row.exhibitor_company_id}`;
    usersByEventCompany.set(key, (usersByEventCompany.get(key) ?? 0) + 1);
  }
  const leadsByEventCompany = new Map<string, number>();
  for (const row of (leadsResponse.data ?? []) as Array<{ company_id: string | null; event_id: string | null }>) {
    if (!row.company_id || !row.event_id) continue;
    const key = `${row.event_id}:${row.company_id}`;
    leadsByEventCompany.set(key, (leadsByEventCompany.get(key) ?? 0) + 1);
  }

  const exhibitors = scopedExhibitors
    .map((row) => {
      const key = `${row.event_id}:${row.company_id}`;
      const licenseMetrics = getExhibitorSeatMetricsByEventAndCompany({
        metricsByScope: seatMetricsByScope,
        eventId: row.event_id,
        exhibitorCompanyId: row.company_id
      });
      const licenseStatus: AdminExhibitorRow["licenseStatus"] = licenseMetrics
        ? licenseMetrics.hasActiveLicense
          ? "active"
          : licenseMetrics.licenseCount > 0
            ? "expired"
            : "none"
        : "none";

      return {
        id: row.id,
        participationId: row.id,
        eventId: row.event_id,
        companyId: row.company_id,
        createdAt: row.created_at,
        name: companyNames.get(row.company_id) ?? "Unknown Exhibitor",
        seatsPurchased: licenseMetrics.seatsPurchased,
        seatsUsed: licenseMetrics.seatsUsed,
        licenseStatus,
        revenue: licenseMetrics.revenue,
        leadCount: leadsByEventCompany.get(key) ?? 0,
        userCount: usersByEventCompany.get(key) ?? 0,
        licenseCount: licenseMetrics.licenseCount
      };
    })
    .sort((a, b) => {
      if (a.eventId !== b.eventId) {
        return a.eventId.localeCompare(b.eventId);
      }
      const createdAtDiff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (createdAtDiff !== 0) return createdAtDiff;
      return a.name.localeCompare(b.name);
    });

  adminRouteDebugLog("admin.exhibitors.index", {
    events: eventOptions.length,
    exhibitors: exhibitors.length
  });

  return {
    events: eventOptions,
    exhibitors,
    defaultEventId,
    hostCompanies
  };
}
