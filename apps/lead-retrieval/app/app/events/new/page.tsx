import Link from "next/link";
import { redirect } from "next/navigation";
import { hasActivePlatformAdminAccountContext, requireAuth } from "@/lib/auth/session";
import { redirectExhibitorAdminFromAppEventsManagementRoutesIfBlocked } from "@/lib/server/exhibitor-app-events-management-redirect";
import { getCachedExhibitorAccessibleEventResolution } from "@/lib/server/exhibitor-app-access";
import { isExhibitorDirectPortfolioEventAccessResolution } from "@/lib/access/event-access-mode";
import { CreateExhibitorEventForm } from "./create-exhibitor-event-form";

export const dynamic = "force-dynamic";

export default async function NewEventPage() {
  const sessionUser = await requireAuth();

  if (sessionUser.role !== "exhibitor_admin" && !hasActivePlatformAdminAccountContext(sessionUser)) {
    if (sessionUser.role === "platform_admin") redirect("/admin/events/new");
    if (sessionUser.role === "organizer_admin") redirect("/app/organizer");
    redirect("/app");
  }

  await redirectExhibitorAdminFromAppEventsManagementRoutesIfBlocked(sessionUser);

  const access = await getCachedExhibitorAccessibleEventResolution(sessionUser.id);
  const allowContinuousCapture = isExhibitorDirectPortfolioEventAccessResolution(access.resolution);

  return (
    <section className="mx-auto w-full max-w-[560px] space-y-6 pb-12">
      <header className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
          <Link href="/app/events" className="hover:text-slate-600">
            ← Back to Manage
          </Link>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Create event</h1>
        <p className="max-w-[44ch] text-sm text-slate-500">Add an event to manage leads for your company.</p>
      </header>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <CreateExhibitorEventForm allowContinuousCapture={allowContinuousCapture} />
      </div>
    </section>
  );
}
