import { redirect } from "next/navigation";
import { createPlatformServerClient } from "@/lib/supabase/server";
import { loadEventOverview } from "@/lib/server/event-overview";
import { isPlatformAdmin } from "@/lib/server/registry";
import { PlatformShell } from "@/app/_components/platform-shell";

export const dynamic = "force-dynamic";

/**
 * The authenticated shell for one event.
 *
 * Same chrome as the rest of the app — one `PlatformShell` — but the
 * organization in the header is the *event's* organization, which only this
 * segment knows. `loadEventOverview` is request-memoised, so the page below
 * reuses this read rather than repeating it. The auth check repeats
 * middleware's gate on purpose; see `app/(app)/layout.tsx`.
 */
export default async function EventLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ eventId: string }>;
}) {
  const supabase = await createPlatformServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const { eventId } = await params;
  const admin = await isPlatformAdmin(user.id);
  const model = await loadEventOverview(user.id, eventId, admin);

  return (
    <PlatformShell
      email={user.email ?? null}
      admin={admin}
      organization={model ? { name: model.organization.name, role: model.organization.role } : null}
    >
      {children}
    </PlatformShell>
  );
}
