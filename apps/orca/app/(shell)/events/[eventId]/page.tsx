import { notFound } from "next/navigation";
import { ensureProvisionedUserAndContext } from "@/lib/request-user";
import { EventCommandCenterServiceError, getEventCommandCenter } from "@/src/server/services/event-command-center";
import type { EventCommandCenterPayload } from "@/src/server/services/event-command-center";
import { EventCommandCenter } from "./_components/event-command-center";

type EventDetailPageProps = {
  params: Promise<{ eventId: string }>;
};

export default async function EventDetailPage({ params }: EventDetailPageProps) {
  const { eventId } = await params;
  const authContext = await ensureProvisionedUserAndContext();
  if (authContext.status !== "OK" || !authContext.appUserId || !authContext.role) {
    notFound();
  }

  let data: EventCommandCenterPayload;

  try {
    data = await getEventCommandCenter(eventId, {
      id: authContext.appUserId,
      orgId: authContext.activeOrgId,
      role: authContext.role,
    });
  } catch (error) {
    if (error instanceof EventCommandCenterServiceError && (error.status === 403 || error.status === 404)) {
      notFound();
    }
    throw error;
  }

  return <EventCommandCenter data={data} />;
}
