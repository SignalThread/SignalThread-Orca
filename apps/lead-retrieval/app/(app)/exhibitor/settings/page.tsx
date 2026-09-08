import Link from "next/link";
import { redirect } from "next/navigation";
import { SignOutForm } from "@/components/auth/sign-out-form";
import { EventSettingsForm } from "@/components/exhibitor/event-settings-form";
import { isExhibitorEventLevelTenantUiResolution } from "@/lib/access/event-access-mode";
import { normalizeSessionRole, requireAuth } from "@/lib/auth/session";
import { getExhibitorSettingsSnapshot } from "@/lib/data/settings";
import { EXHIBITOR_ACCOUNT_HREF } from "@/lib/exhibitor/exhibitor-app-nav";
import { getCachedExhibitorAccessibleEventSummaries } from "@/lib/server/exhibitor-app-access";
import { resolveExhibitorAppActiveEventId } from "@/lib/server/exhibitor-app-active-event";
import { loadEditableEventSettingsForUser } from "@/lib/server/events/update-event-settings";

export const dynamic = "force-dynamic";

function eventAccessSummary(resolution: string): string {
  if (resolution === "company_assigned_only") {
    return "You have access only to events explicitly assigned to you.";
  }
  if (resolution === "legacy_event_scoped") {
    return "You have access to events your company has linked to your account.";
  }
  return "—";
}

export default async function ExhibitorEventLevelSettingsPage() {
  const sessionUser = await requireAuth();
  const role = normalizeSessionRole(sessionUser.role);

  if (role !== "exhibitor_admin") {
    redirect("/app");
  }

  const { resolution: accessResolution, events } = await getCachedExhibitorAccessibleEventSummaries(
    sessionUser.id
  );
  if (!isExhibitorEventLevelTenantUiResolution(accessResolution.resolution)) {
    redirect(EXHIBITOR_ACCOUNT_HREF);
  }

  const [snapshot, activeEventId] = await Promise.all([
    getExhibitorSettingsSnapshot(),
    resolveExhibitorAppActiveEventId(sessionUser.id, null)
  ]);

  const pickId = activeEventId ?? (events.length === 1 ? events[0].id : null);
  const currentEvent = pickId != null ? events.find((e) => e.id === pickId) ?? null : null;
  const editableEvent = pickId != null ? await loadEditableEventSettingsForUser(sessionUser.id, pickId) : null;

  const dashboardHref =
    pickId != null ? `/exhibitor/dashboard?eventId=${encodeURIComponent(pickId)}` : "/exhibitor/dashboard";

  return (
    <section className="mx-auto w-full max-w-[560px] space-y-8 pb-12">
      <header className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
          <Link href={dashboardHref} className="hover:text-slate-600">
            ← Back to app
          </Link>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Account</h1>
        <p className="max-w-[52ch] text-sm leading-relaxed text-slate-600">
          Summary for your workspace access. Company team management is not available on this license type.
        </p>
      </header>

      <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Your account</h2>
        <dl className="mt-3 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Name</dt>
            <dd className="mt-1 text-sm font-medium text-slate-900">{snapshot.sessionUser?.fullName ?? "—"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Email</dt>
            <dd className="mt-1 text-sm font-medium text-slate-900">{snapshot.sessionUser?.email ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Role</dt>
            <dd className="mt-1 text-sm font-medium text-slate-900">{snapshot.sessionUser?.roleLabel ?? "—"}</dd>
          </div>
          {snapshot.company?.name ? (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Company</dt>
              <dd className="mt-1 text-sm font-medium text-slate-900">{snapshot.company.name}</dd>
            </div>
          ) : null}
        </dl>
      </div>

      <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Current event</h2>
        <p className="mt-2 text-sm text-slate-700">
          {currentEvent ? (
            <>
              <span className="font-medium text-slate-900">{currentEvent.name}</span>
              <span className="text-slate-500"> · selected for this session</span>
            </>
          ) : events.length === 0 ? (
            <span className="text-slate-600">No events are available yet.</span>
          ) : (
            <span className="text-slate-600">
              Multiple events are assigned to you. Use an event-specific link from your organizer to open a different event.
            </span>
          )}
        </p>
      </div>

      {editableEvent ? <EventSettingsForm event={editableEvent} /> : null}

      <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Event access</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">{eventAccessSummary(accessResolution.resolution)}</p>
        {events.length > 0 ? (
          <ul className="mt-3 space-y-1.5 text-sm text-slate-800">
            {events.map((e) => (
              <li key={e.id} className="rounded-md border border-slate-100 bg-slate-50/80 px-3 py-2">
                {e.name}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SignOutForm buttonClassName="inline-flex h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50" />
      </div>
    </section>
  );
}
