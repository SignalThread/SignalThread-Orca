import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminCreateEventForm } from "@/components/admin/admin-create-event-form";
import { requireAuth } from "@/lib/auth/session";
import { resolveAdminAppEventScopeForUser } from "@/lib/server/admin-app-event-scope";

export default async function AdminCreateEventPage() {
  const sessionUser = await requireAuth();
  if (sessionUser.role === "exhibitor_admin") {
    const scope = await resolveAdminAppEventScopeForUser(sessionUser);
    if (scope.kind !== "exhibitor" || !scope.multiEventLicensed) {
      notFound();
    }
  }

  return (
    <section className="mx-auto w-full max-w-4xl space-y-6">
      <Link href="/admin/events" className="inline-flex items-center gap-2 text-base font-semibold text-slate-600 hover:text-accent">
        <span aria-hidden="true">←</span>
        Back to Events
      </Link>

      <section className="rounded-3xl border border-border bg-card p-6 shadow-[0_1px_2px_rgba(15,23,42,0.06)] md:p-8">
        <h1 className="text-4xl font-bold text-slate-950">Create Event</h1>
        <AdminCreateEventForm />
      </section>
    </section>
  );
}
