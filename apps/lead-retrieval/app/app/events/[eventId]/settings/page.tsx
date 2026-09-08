import Link from "next/link";
import { redirect } from "next/navigation";
import { hasActivePlatformAdminAccountContext, requireAuth } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { EventSettingsForm } from "@/components/exhibitor/event-settings-form";
import {
  assertEventIdAccessibleForUser,
  EventAccessDeniedError
} from "@/lib/server/company-event-access";
import { redirectExhibitorAdminFromAppEventsManagementRoutesIfBlocked } from "@/lib/server/exhibitor-app-events-management-redirect";
import { mayUpdateEventSettings } from "@/lib/events/event-settings-update-core";

export const dynamic = "force-dynamic";

type Params = { eventId: string };

type EventRow = {
  id: string;
  name: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string | null;
  city: string | null;
  state: string | null;
  location: string | null;
  timezone: string | null;
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default async function EventSettingsPage({
  params
}: {
  params: Promise<Params>;
}) {
  const sessionUser = await requireAuth();
  const { eventId } = await params;
  const normalizedEventId = String(eventId ?? "").trim();

  if (!normalizedEventId) {
    redirect("/app/events");
  }

  if (
    !mayUpdateEventSettings(sessionUser.role) ||
    (sessionUser.role === "platform_admin" && !hasActivePlatformAdminAccountContext(sessionUser))
  ) {
    if (sessionUser.role === "platform_admin") redirect("/admin");
    if (sessionUser.role === "organizer_admin") redirect("/app/organizer");
    redirect("/app");
  }

  await redirectExhibitorAdminFromAppEventsManagementRoutesIfBlocked(sessionUser);

  try {
    await assertEventIdAccessibleForUser(sessionUser.id, normalizedEventId);
  } catch (err) {
    if (err instanceof EventAccessDeniedError) {
      redirect("/app/events");
    }
    throw err;
  }

  const supabase = createAdminClient();
  const { data: eventResult, error: eventError } = await (supabase as any)
    .from("events")
    .select("id, name, start_date, end_date, status, city, state, location, timezone")
    .eq("id", normalizedEventId)
    .maybeSingle();

  if (eventError) {
    return (
      <section className="space-y-6 pb-12">
        <p className="text-sm text-rose-700">
          Failed to load event: {eventError.message ?? "Unknown error."}
        </p>
      </section>
    );
  }

  const event = (eventResult as EventRow | null) ?? null;
  if (!event) {
    redirect("/app/events");
  }
  const eventName = event.name ?? "Event";

  return (
    <section className="space-y-6 pb-12">
      <header className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
          <Link href="/app/events" className="hover:text-slate-600">
            ← Back to events
          </Link>
        </p>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-slate-600">{eventName}</p>
      </header>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight text-slate-900">Event details</h2>
        <EventSettingsForm
          event={{
            id: event.id,
            name: event.name,
            start_date: event.start_date,
            end_date: event.end_date,
            location: event.location,
            timezone: event.timezone
          }}
        />
        <div className="rounded-xl border bg-card p-6">
          <dl className="grid gap-6 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Event name</dt>
              <dd className="mt-1 text-sm font-medium text-slate-900">{eventName}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Status</dt>
              <dd className="mt-1 text-sm font-medium text-slate-900">{event.status ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Start date</dt>
              <dd className="mt-1 text-sm font-medium text-slate-900">{formatDate(event.start_date)}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">End date</dt>
              <dd className="mt-1 text-sm font-medium text-slate-900">{formatDate(event.end_date)}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Location</dt>
              <dd className="mt-1 text-sm font-medium text-slate-900">{event.location ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Timezone</dt>
              <dd className="mt-1 text-sm font-medium text-slate-900">{event.timezone ?? "Not configured"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">City</dt>
              <dd className="mt-1 text-sm font-medium text-slate-900">{event.city ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">State</dt>
              <dd className="mt-1 text-sm font-medium text-slate-900">{event.state ?? "—"}</dd>
            </div>
          </dl>
        </div>
      </section>
    </section>
  );
}
