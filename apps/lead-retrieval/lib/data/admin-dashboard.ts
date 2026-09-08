import { createAdminClient } from "@/lib/supabase/admin";

export type AdminDashboardMetric = {
  label: string;
  value: string;
  shortValue?: string;
  hint?: string;
  tone?: "neutral" | "positive";
  icon: "events" | "exhibitors" | "licenses" | "active" | "revenue";
  href: string;
};

export type AdminDashboardRevenueRow = {
  eventId: string;
  eventName: string;
  revenue: number;
};

export type AdminDashboardLicenseDistributionRow = {
  eventId: string;
  eventName: string;
  active: number;
  trial: number;
  expired: number;
};

export type AdminDashboardSeatUtilizationRow = {
  eventId: string;
  eventName: string;
  seatsPurchased: number;
  seatsUsed: number;
  utilizationRate: number;
};

export type AdminDashboardData = {
  metrics: AdminDashboardMetric[];
  revenueByEvent: AdminDashboardRevenueRow[];
  licenseDistributionByEvent: AdminDashboardLicenseDistributionRow[];
  seatUtilization: AdminDashboardSeatUtilizationRow[];
};

type LicenseAggregateRow = {
  event_id: string | null;
  status: string | null;
  seats_total: number | null;
  seats_used: number | null;
  price_cents: number | null;
};

type EventRow = {
  id: string;
  name: string | null;
};

function toCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}

function toCompactCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1
  }).format(value);
}

function isRevenueRelevantStatus(status: string | null | undefined) {
  const normalized = String(status ?? "").trim().toLowerCase();
  if (!normalized) return true;
  return !["cancelled", "canceled", "deleted", "void", "trash"].includes(normalized);
}

function toDistributionBucket(status: string | null | undefined): "active" | "trial" | "expired" {
  const normalized = String(status ?? "").trim().toLowerCase();
  if (normalized === "active") return "active";
  if (normalized === "trial") return "trial";
  return "expired";
}

function settledCount(result: PromiseSettledResult<{ count: number | null }>) {
  if (result.status !== "fulfilled") return 0;
  return Number(result.value.count ?? 0);
}

export async function getAdminDashboardData(): Promise<AdminDashboardData> {
  const supabase = createAdminClient();

  const [eventsCountResult, exhibitorsCountResult, licensesCountResult, activeLicensesCountResult] =
    await Promise.allSettled([
      supabase.from("events").select("id", { count: "exact", head: true }),
      supabase.from("exhibitors").select("id", { count: "exact", head: true }),
      supabase.from("licenses").select("id", { count: "exact", head: true }),
      supabase.from("licenses").select("id", { count: "exact", head: true }).eq("status", "active")
    ]);

  const [licenseRowsResult, eventRowsResult] = await Promise.allSettled([
    (supabase as any)
      .from("licenses")
      .select("event_id, status, seats_total, seats_used, price_cents"),
    supabase.from("events").select("id, name")
  ]);

  const totalEvents = settledCount(eventsCountResult);
  const totalExhibitors = settledCount(exhibitorsCountResult);
  const totalLicenses = settledCount(licensesCountResult);
  const activeLicenses = settledCount(activeLicensesCountResult);
  const activeRate = totalLicenses > 0 ? Math.round((activeLicenses / totalLicenses) * 100) : 0;

  const licenseRows =
    licenseRowsResult.status === "fulfilled" && !licenseRowsResult.value.error
      ? ((licenseRowsResult.value.data ?? []) as LicenseAggregateRow[])
      : [];
  const eventRows =
    eventRowsResult.status === "fulfilled" && !eventRowsResult.value.error
      ? ((eventRowsResult.value.data ?? []) as EventRow[])
      : [];
  const eventNameById = new Map(eventRows.map((row) => [row.id, String(row.name ?? "Unknown Event")]));

  const totalRevenue = licenseRows.reduce((sum, row) => {
    if (!isRevenueRelevantStatus(row.status)) return sum;
    return sum + Math.max(0, Number(row.price_cents ?? 0)) / 100;
  }, 0);

  const byEvent = new Map<
    string,
    {
      eventName: string;
      revenue: number;
      active: number;
      trial: number;
      expired: number;
      seatsPurchased: number;
      seatsUsed: number;
    }
  >();

  for (const row of licenseRows) {
    const eventId = String(row.event_id ?? "").trim();
    if (!eventId) continue;

    const existing = byEvent.get(eventId) ?? {
      eventName: eventNameById.get(eventId) ?? "Unknown Event",
      revenue: 0,
      active: 0,
      trial: 0,
      expired: 0,
      seatsPurchased: 0,
      seatsUsed: 0
    };

    if (isRevenueRelevantStatus(row.status)) {
      existing.revenue += Math.max(0, Number(row.price_cents ?? 0)) / 100;
    }

    const bucket = toDistributionBucket(row.status);
    existing[bucket] += 1;
    existing.seatsPurchased += Math.max(0, Number(row.seats_total ?? 0));
    existing.seatsUsed += Math.max(0, Number(row.seats_used ?? 0));
    byEvent.set(eventId, existing);
  }

  const sortedByRevenue = [...byEvent.entries()]
    .sort((a, b) => b[1].revenue - a[1].revenue);

  const revenueByEvent: AdminDashboardRevenueRow[] = sortedByRevenue.map(([eventId, row]) => ({
    eventId,
    eventName: row.eventName,
    revenue: row.revenue
  }));

  const licenseDistributionByEvent: AdminDashboardLicenseDistributionRow[] = [...byEvent.entries()]
    .sort((a, b) => a[1].eventName.localeCompare(b[1].eventName))
    .map(([eventId, row]) => ({
      eventId,
      eventName: row.eventName,
      active: row.active,
      trial: row.trial,
      expired: row.expired
    }));

  const seatUtilization: AdminDashboardSeatUtilizationRow[] = [...byEvent.entries()]
    .sort((a, b) => a[1].eventName.localeCompare(b[1].eventName))
    .map(([eventId, row]) => ({
      eventId,
      eventName: row.eventName,
      seatsPurchased: row.seatsPurchased,
      seatsUsed: row.seatsUsed,
      utilizationRate:
        row.seatsPurchased > 0 ? Math.max(0, Math.min(100, Math.round((row.seatsUsed / row.seatsPurchased) * 100))) : 0
    }));

  const metrics: AdminDashboardMetric[] = [
    {
      label: "Total Events",
      value: totalEvents.toLocaleString("en-US"),
      hint: "Across all events",
      icon: "events",
      href: "/admin/events"
    },
    {
      label: "Total Exhibitors",
      value: totalExhibitors.toLocaleString("en-US"),
      hint: "Across all events",
      icon: "exhibitors",
      href: "/admin/exhibitors"
    },
    {
      label: "Total Licenses Issued",
      value: totalLicenses.toLocaleString("en-US"),
      hint: "All license records",
      tone: "positive",
      icon: "licenses",
      href: "/admin/licenses"
    },
    {
      label: "Active Licenses",
      value: activeLicenses.toLocaleString("en-US"),
      hint: `${activeRate}% active rate`,
      tone: "positive",
      icon: "active",
      href: "/admin/licenses?status=active"
    },
    {
      label: "Total Revenue",
      value: toCurrency(totalRevenue),
      shortValue: toCompactCurrency(totalRevenue),
      hint: "Revenue from license sales",
      tone: "positive",
      icon: "revenue",
      href: "/admin/licenses"
    }
  ];

  return {
    metrics,
    revenueByEvent,
    licenseDistributionByEvent,
    seatUtilization
  };
}
