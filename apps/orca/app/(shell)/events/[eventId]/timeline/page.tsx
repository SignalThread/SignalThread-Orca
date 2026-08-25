import { ensureProvisionedUserAndContext } from "@/lib/request-user";
import { resolveEventAccessForUser } from "@/lib/event-access";
import TimelinePage from "@/app/(shell)/timeline/page";

type EventTimelinePageProps = {
  params: Promise<{ eventId: string }>;
};

export default async function EventTimelinePage({ params }: EventTimelinePageProps) {
  const { eventId } = await params;

  let canEdit = false;
  try {
    const ctx = await ensureProvisionedUserAndContext();
    if (ctx.status === "OK" && ctx.appUserId && ctx.role) {
      const decision = await resolveEventAccessForUser(eventId, {
        id: ctx.appUserId,
        orgId: ctx.activeOrgId,
        role: ctx.role,
      });
      canEdit = decision.canEdit;
    }
  } catch {
    // default to canEdit = false; server enforces write access on every PATCH
  }

  return <TimelinePage eventIdOverride={eventId} hideEventSelector canEdit={canEdit} />;
}
