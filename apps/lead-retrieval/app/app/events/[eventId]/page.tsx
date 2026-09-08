import { redirect } from "next/navigation";
import { hasActivePlatformAdminAccountContext, requireAuth } from "@/lib/auth/session";
import {
  assertEventIdAccessibleForUser,
  EventAccessDeniedError
} from "@/lib/server/company-event-access";

export const dynamic = "force-dynamic";

type Params = { eventId: string };

export default async function ExhibitorEventContextPage({
  params
}: {
  params: Promise<Params>;
}) {
  const sessionUser = await requireAuth();
  const { eventId } = await params;
  const normalized = String(eventId ?? "").trim();

  if (!normalized) {
    redirect("/app/events");
  }

  if (sessionUser.role !== "exhibitor_admin" && !hasActivePlatformAdminAccountContext(sessionUser)) {
    if (sessionUser.role === "platform_admin") redirect(`/admin/events/${encodeURIComponent(normalized)}`);
    if (sessionUser.role === "organizer_admin") redirect(`/app/organizer?eventId=${encodeURIComponent(normalized)}`);
    redirect("/app");
  }

  try {
    await assertEventIdAccessibleForUser(sessionUser.id, normalized);
  } catch (err) {
    if (err instanceof EventAccessDeniedError) {
      redirect("/app/events");
    }
    throw err;
  }

  redirect(`/exhibitor/dashboard?eventId=${encodeURIComponent(normalized)}`);
}
