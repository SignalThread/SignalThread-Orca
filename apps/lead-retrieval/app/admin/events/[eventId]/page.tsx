import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { EventStatusBadge } from "@/components/admin/admin-ui";
import { requireAuth } from "@/lib/auth/session";
import {
  formatCurrency,
  formatEventDateRange,
  formatEventLocation,
  getAdminEventDetail
} from "@/lib/data/admin-events";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveAdminAppEventScopeForUser } from "@/lib/server/admin-app-event-scope";
import { DeleteEventButton } from "./delete-event-button";
import { RegistrationIntegrationCard } from "./registration-integration-card";

type AdminEventDetailPageProps = {
  params: Promise<{
    eventId: string;
  }>;
};

export default async function AdminEventDetailPage({
  params
}: AdminEventDetailPageProps) {
  const resolvedParams = await params;
  const eventId = resolvedParams.eventId;
  const sessionUser = await requireAuth();

  if (sessionUser.role === "exhibitor_admin") {
    const scope = await resolveAdminAppEventScopeForUser(sessionUser);
    if (scope.kind !== "exhibitor" || !scope.multiEventLicensed) {
      notFound();
    }
    if (!scope.accessibleEvents.some((e) => e.id === eventId)) {
      notFound();
    }
  }

  const canDeleteEvent = sessionUser.role === "platform_admin";
  const canManageRegistrationIntegration = sessionUser.role === "platform_admin";

  async function deleteEventAction(
    _previousState: string | null,
    formData: FormData
  ): Promise<string | null> {
    "use server";

    const session = await requireAuth();
    if (session.role !== "platform_admin") {
      return "Unauthorized.";
    }

    const targetEventId = String(formData.get("eventId") ?? "").trim();
    if (!targetEventId) {
      return "Missing event id.";
    }

    const supabase = await createSupabaseServerClient();
    const { error } = await (supabase as any)
      .from("events")
      .delete()
      .eq("id", targetEventId);

    if (error) {
      return error.message ?? "Failed deleting event.";
    }

    redirect("/admin/events");
  }

  async function saveRegistrationIntegrationAction(
    _previousState: string | null,
    formData: FormData
  ): Promise<string | null> {
    "use server";

    const session = await requireAuth();
    if (session.role !== "platform_admin") {
      return "Unauthorized.";
    }

    const targetEventId = String(formData.get("eventId") ?? "").trim();
    const provider = String(formData.get("registrationProvider") ?? "none")
      .trim()
      .toLowerCase();
    const baseUrlInput = String(formData.get("registrationBaseUrl") ?? "").trim();
    const apiTokenInput = String(formData.get("registrationApiToken") ?? "").trim();
    const registrationEventIdInput = String(formData.get("registrationEventId") ?? "").trim();

    if (!targetEventId || targetEventId !== eventId) {
      return "Invalid event id.";
    }

    if (provider !== "none" && provider !== "streampoint") {
      return "Invalid provider selected.";
    }

    let payload: Record<string, string | null> = {
      registration_provider: null,
      registration_base_url: null,
      registration_api_token: null,
      registration_event_id: null
    };

    if (provider === "streampoint") {
      if (!baseUrlInput || !apiTokenInput || !registrationEventIdInput) {
        return "Base URL, API token, and Streampoint Event ID are required.";
      }

      let normalizedBaseUrl: string;
      try {
        normalizedBaseUrl = new URL(baseUrlInput).toString().replace(/\/+$/, "");
      } catch {
        return "Invalid Base URL.";
      }

      payload = {
        registration_provider: "streampoint",
        registration_base_url: normalizedBaseUrl,
        registration_api_token: apiTokenInput,
        registration_event_id: registrationEventIdInput
      };
    }

    const supabase = await createSupabaseServerClient();
    const { error } = await (supabase as any)
      .from("events")
      .update(payload)
      .eq("id", targetEventId);

    if (error) {
      return error.message ?? "Failed to save integration settings.";
    }

    return "Saved integration settings.";
  }

  let detail = null as Awaited<ReturnType<typeof getAdminEventDetail>>;
  let loadError: string | null = null;

  try {
    detail = await getAdminEventDetail(eventId);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Failed loading event details";
  }

  if (loadError) {
    return (
      <section className="space-y-7">
        <Link href="/admin/events" className="inline-flex items-center gap-2 text-base font-semibold text-slate-600 hover:text-accent">
          <span aria-hidden="true">←</span>
          Back to Events
        </Link>

        <section className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm font-medium text-rose-700 md:p-6">
          {loadError}
        </section>
      </section>
    );
  }

  if (!detail) {
    notFound();
  }

  const supabase = await createSupabaseServerClient();
  let registrationIntegration: {
    registration_provider: string | null;
    registration_base_url: string | null;
    registration_api_token: string | null;
    registration_event_id: string | null;
  } = {
    registration_provider: null,
    registration_base_url: null,
    registration_api_token: null,
    registration_event_id: null
  };

  try {
    const { data, error } = await (supabase as any)
      .from("events")
      .select(
        "registration_provider, registration_base_url, registration_api_token, registration_event_id"
      )
      .eq("id", eventId)
      .maybeSingle();

    if (!error && data) {
      registrationIntegration = {
        registration_provider: data.registration_provider ?? null,
        registration_base_url: data.registration_base_url ?? null,
        registration_api_token: data.registration_api_token ?? null,
        registration_event_id: data.registration_event_id ?? null
      };
    }
  } catch {
    // Keep defaults if registration fields are not available yet.
  }

  return (
    <section className="space-y-7">
      <Link href="/admin/events" className="inline-flex items-center gap-2 text-base font-semibold text-slate-600 hover:text-accent">
        <span aria-hidden="true">←</span>
        Back to Events
      </Link>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-[0_1px_2px_rgba(15,23,42,0.06)] md:p-6">
        <div className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-4xl font-bold tracking-tight text-slate-950 md:text-5xl">{detail.name}</h1>
              <EventStatusBadge
                status={String(detail.status ?? "UPCOMING").toLowerCase() as "active" | "upcoming" | "completed"}
              />
            </div>
            {canDeleteEvent ? <DeleteEventButton action={deleteEventAction} eventId={eventId} /> : null}
          </div>
          <div className="flex flex-wrap items-center gap-5 text-base font-medium text-slate-600 md:text-lg">
            <span>{formatEventLocation(detail.city, detail.state, detail.location)}</span>
            <span>{formatEventDateRange(detail.start_date, detail.end_date)}</span>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricTile label="Exhibitors" value={detail.metrics.exhibitors.toString()} />
        <MetricTile label="Users" value={detail.metrics.users.toString()} />
        <MetricTile label="Licenses" value={detail.metrics.licenses.toString()} />
        <MetricTile label="Leads" value={detail.metrics.leads.toLocaleString("en-US")} />
        <MetricTile label="Revenue" value={formatCurrency(detail.metrics.revenue)} />
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-[0_1px_2px_rgba(15,23,42,0.06)] md:p-6">
        <h2 className="text-2xl font-semibold text-slate-950 md:text-3xl">Event Details</h2>
        <div className="mt-5 grid gap-3 text-sm text-slate-700 md:grid-cols-2">
          <p>
            <span className="font-semibold text-slate-900">Event ID:</span> {detail.id}
          </p>
          <p>
            <span className="font-semibold text-slate-900">Status:</span> {detail.status}
          </p>
          <p>
            <span className="font-semibold text-slate-900">Start Date:</span> {detail.start_date}
          </p>
          <p>
            <span className="font-semibold text-slate-900">End Date:</span> {detail.end_date}
          </p>
          <p>
            <span className="font-semibold text-slate-900">Created:</span>{" "}
            {detail.created_at ? new Date(detail.created_at).toLocaleString() : "TBD"}
          </p>
          <p>
            <span className="font-semibold text-slate-900">Updated:</span>{" "}
            {detail.updated_at ? new Date(detail.updated_at).toLocaleString() : "TBD"}
          </p>
        </div>
      </section>

      {canManageRegistrationIntegration ? (
        <RegistrationIntegrationCard
          eventId={eventId}
          initialProvider={registrationIntegration.registration_provider}
          initialBaseUrl={registrationIntegration.registration_base_url}
          initialApiToken={registrationIntegration.registration_api_token}
          initialRegistrationEventId={registrationIntegration.registration_event_id}
          action={saveRegistrationIntegrationAction}
        />
      ) : null}
    </section>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-2xl border border-border bg-card p-5 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
      <p className="text-3xl font-bold tracking-tight text-slate-950 md:text-4xl">{value}</p>
      <p className="mt-1 text-sm font-semibold text-slate-600 md:text-base">{label}</p>
    </article>
  );
}
