import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Database } from "@/types/database";
import { resolveEventLocation } from "@/lib/events/event-location";

export { resolveEventLocation } from "@/lib/events/event-location";

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type PostgrestErrorLike = {
  message?: string | null;
  details?: string | null;
  hint?: string | null;
  code?: string | null;
};

export type AdminEventStatus = Database["public"]["Tables"]["events"]["Row"]["status"];
export type AdminEventRow = Database["public"]["Tables"]["events"]["Row"];

export type AdminEventMetrics = {
  exhibitors: number;
  users: number;
  licenses: number;
  leads: number;
  revenue: number;
};

export type AdminEventSummary = AdminEventRow & {
  metrics: AdminEventMetrics;
};

const EVENT_SELECT_COLUMNS = "id, company_id, name, city, state, location, start_date, end_date, status, created_at, updated_at";

export function isAdminRouteDebugEnabled() {
  return process.env.ADMIN_ROUTE_DEBUG === "1";
}

export function adminRouteDebugLog(
  label: string,
  payload: Record<string, unknown>
) {
  if (!isAdminRouteDebugEnabled()) {
    return;
  }

  console.info("ADMIN_ROUTE_DEBUG", {
    label,
    ...payload
  });
}

export function formatEventStatus(status: AdminEventStatus) {
  if (status === "ACTIVE") return "Active";
  if (status === "UPCOMING") return "Upcoming";
  return "Completed";
}

/** Date-only DB values (`YYYY-MM-DD`), as stored in `events.start_date` / `end_date`. */
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function formatEventDateRange(
  startDate: string | null | undefined,
  endDate: string | null | undefined
) {
  const start = startDate ?? null;
  const end = endDate ?? null;
  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
  // Date-only strings parse as UTC midnight; format them in UTC so the
  // calendar day never shifts with the server/viewer timezone (2026-07-18
  // must render as Jul 18 in both Eastern and Pacific). Real timestamps keep
  // instant-based local formatting.
  const utcFormatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  });
  const formatDate = (value: string) => {
    const trimmed = value.trim();
    const isDateOnly = DATE_ONLY_PATTERN.test(trimmed);
    return (isDateOnly ? utcFormatter : formatter).format(new Date(trimmed));
  };

  if (start === null && end === null) {
    return "Dates TBD";
  }
  if (start !== null && end === null) {
    return `${formatDate(start)} (end TBD)`;
  }
  if (start === null && end !== null) {
    return `Starts TBD – ${formatDate(end)}`;
  }

  if (start !== null && end !== null) {
    return `${formatDate(start)} – ${formatDate(end)}`;
  }

  return "Dates TBD";
}

export function formatEventLocation(city: string | null, state: string | null, location?: string | null) {
  const resolved = resolveEventLocation(city, state, location);
  if (resolved) return resolved;
  return "Location not set";
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}

function isMissingEventScope(error: PostgrestErrorLike) {
  const message = String(error.message ?? "").toLowerCase();
  return (
    error.code === "42703" ||
    message.includes("event_id") ||
    message.includes("column") ||
    message.includes("does not exist")
  );
}

function isPostgrestError(error: unknown): error is PostgrestErrorLike {
  return Boolean(error && typeof error === "object");
}

function extractErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  if (isPostgrestError(error)) {
    const structuredMessage = [
      error.message ? `message=${error.message}` : null,
      error.details ? `details=${error.details}` : null,
      error.hint ? `hint=${error.hint}` : null,
      error.code ? `code=${error.code}` : null
    ]
      .filter(Boolean);

    if (structuredMessage.length > 0) {
      return structuredMessage.join(" | ");
    }

    const rawError = JSON.stringify(error);
    if (rawError && rawError !== "{}") {
      return rawError;
    }

    return "Unknown Postgrest error";
  }
  return String(error);
}

function logError(label: string, error: unknown) {
  adminRouteDebugLog(label, {
    error: extractErrorMessage(error)
  });
}

async function getCountByEvent(
  supabase: SupabaseClient,
  table: "licenses" | "leads",
  eventId: string
) {
  try {
    const { count, error } = await supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId);

    if (error) {
      if (isMissingEventScope(error)) {
        adminRouteDebugLog("events.metrics.count_fallback", {
          table,
          eventId,
          reason: error.message
        });
        return 0;
      }
      throw error;
    }

    return count ?? 0;
  } catch (err) {
    logError("getCountByEvent error", err);
    return 0;
  }
}

async function getExhibitorCountByEvent(
  supabase: SupabaseClient,
  eventId: string
) {
  try {
    const { data, error } = await (supabase as any)
      .from("licenses")
      .select("company_id")
      .eq("event_id", eventId);

    if (error) {
      if (isMissingEventScope(error)) {
        adminRouteDebugLog("events.metrics.exhibitors_fallback", {
          eventId,
          reason: error.message
        });
        return 0;
      }
      throw error;
    }

    const distinctCompanyIds = new Set(
      ((data ?? []) as Array<{ company_id: string | null }>)
        .map((row) => row.company_id)
        .filter((companyId): companyId is string => Boolean(companyId))
    );

    return distinctCompanyIds.size;
  } catch (err) {
    logError("getExhibitorCountByEvent error", err);
    return 0;
  }
}

async function getUserCountByEvent(
  supabase: SupabaseClient,
  eventId: string
) {
  try {
    const { count, error } = await (supabase as any)
      .from("event_users")
      .select("user_id", { count: "exact", head: true })
      .eq("event_id", eventId);

    if (error) {
      throw error;
    }

    return count ?? 0;
  } catch (err) {
    logError("getUserCountByEvent error", err);
    return 0;
  }
}

async function getRevenueByEvent(supabase: SupabaseClient, eventId: string) {
  try {
    const { data, error } = await supabase
      .from("licenses")
      .select("*")
      .eq("event_id", eventId);

    if (error) {
      if (isMissingEventScope(error)) {
        adminRouteDebugLog("events.metrics.revenue_fallback", {
          eventId,
          reason: error.message
        });
        return 0;
      }
      throw error;
    }

    const rows = (data ?? []) as Array<Record<string, unknown>>;
    return rows.reduce((sum, row) => {
      const revenue = Number(row.revenue ?? row.price ?? row.amount ?? 0);
      return Number.isFinite(revenue) ? sum + revenue : sum;
    }, 0);
  } catch (err) {
    logError("getRevenueByEvent error", err);
    return 0;
  }
}

async function getEventMetrics(
  supabase: SupabaseClient,
  eventId: string
): Promise<AdminEventMetrics> {
  const [exhibitors, users, licenses, leads, revenue] = await Promise.all([
    getExhibitorCountByEvent(supabase, eventId),
    getUserCountByEvent(supabase, eventId),
    getCountByEvent(supabase, "licenses", eventId),
    getCountByEvent(supabase, "leads", eventId),
    getRevenueByEvent(supabase, eventId)
  ]);

  return {
    exhibitors,
    users,
    licenses,
    leads,
    revenue
  };
}

export async function getAdminEventSummariesForEventIds(
  eventIds: string[]
): Promise<AdminEventSummary[]> {
  const normalized = Array.from(new Set(eventIds.filter(Boolean)));
  if (!normalized.length) {
    return [];
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("events")
      .select(EVENT_SELECT_COLUMNS)
      .in("id", normalized)
      .order("start_date", { ascending: false });

    if (error) {
      throw error;
    }

    const rows = (data ?? []) as AdminEventRow[];
    const eventsWithMetrics = await Promise.all(
      rows.map(async (event) => {
        try {
          return {
            ...event,
            metrics: await getEventMetrics(supabase, event.id)
          };
        } catch (metricsError) {
          logError("getAdminEventSummariesForEventIds metrics error", metricsError);
          return {
            ...event,
            metrics: {
              exhibitors: 0,
              users: 0,
              licenses: 0,
              leads: 0,
              revenue: 0
            }
          };
        }
      })
    );

    adminRouteDebugLog("events.index.scoped", {
      count: eventsWithMetrics.length,
      eventIds: eventsWithMetrics.map((event) => event.id)
    });

    return eventsWithMetrics;
  } catch (err) {
    logError("getAdminEventSummariesForEventIds error", err);
    throw new Error(`Failed loading events: ${extractErrorMessage(err)}`);
  }
}

export async function getAdminEventsSummaries(): Promise<AdminEventSummary[]> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("events")
      .select(EVENT_SELECT_COLUMNS)
      .order("start_date", { ascending: false });

    if (error) {
      throw error;
    }

    const rows = (data ?? []) as AdminEventRow[];
    const eventsWithMetrics = await Promise.all(
      rows.map(async (event) => {
        try {
          return {
            ...event,
            metrics: await getEventMetrics(supabase, event.id)
          };
        } catch (metricsError) {
          logError("getAdminEventsSummaries metrics error", metricsError);
          return {
            ...event,
            metrics: {
              exhibitors: 0,
              users: 0,
              licenses: 0,
              leads: 0,
              revenue: 0
            }
          };
        }
      })
    );

    adminRouteDebugLog("events.index", {
      count: eventsWithMetrics.length,
      eventIds: eventsWithMetrics.map((event) => event.id)
    });

    return eventsWithMetrics;
  } catch (err) {
    logError("getAdminEventsSummaries error", err);
    throw new Error(`Failed loading events: ${extractErrorMessage(err)}`);
  }
}

/** Platform-admin account-context slice. Rows still originate exclusively from `events`. */
export async function getAdminEventSummariesForCompanyId(companyId: string): Promise<AdminEventSummary[]> {
  const normalizedCompanyId = String(companyId ?? "").trim();
  if (!normalizedCompanyId) return [];
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("events")
      .select(EVENT_SELECT_COLUMNS)
      .eq("company_id", normalizedCompanyId)
      .order("start_date", { ascending: false });
    if (error) throw error;
    const rows = (data ?? []) as AdminEventRow[];
    return Promise.all(rows.map(async (event) => ({ ...event, metrics: await getEventMetrics(supabase, event.id) })));
  } catch (err) {
    logError("getAdminEventSummariesForCompanyId error", err);
    throw new Error(`Failed loading events: ${extractErrorMessage(err)}`);
  }
}

export async function getAdminEventDetail(
  eventId: string
): Promise<AdminEventSummary | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("events")
      .select(EVENT_SELECT_COLUMNS)
      .eq("id", eventId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return null;
    }

    let metrics: AdminEventMetrics = {
      exhibitors: 0,
      users: 0,
      licenses: 0,
      leads: 0,
      revenue: 0
    };

    try {
      metrics = await getEventMetrics(supabase, eventId);
    } catch (metricsError) {
      logError("getAdminEventDetail metrics error", metricsError);
    }
    const detail = {
      ...(data as AdminEventRow),
      metrics
    };

    adminRouteDebugLog("events.detail", {
      eventId,
      status: detail.status,
      metrics
    });

    return detail;
  } catch (err) {
    logError("getAdminEventDetail error", err);
    throw new Error(`Failed loading event detail: ${extractErrorMessage(err)}`);
  }
}
