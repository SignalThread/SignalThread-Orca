import { EventSettingsHub } from "./_components/event-settings-hub";
import { notFound } from "next/navigation";
import { ensureProvisionedUserAndContext } from "@/lib/request-user";
import { resolveEventAccessForUser } from "@/lib/event-access";
import { getEventSettingsById, listClientsForEventOrganization } from "@/lib/events";
import { serializeEventDateOnly } from "@/lib/event-date-only";
import { getEventTerminology } from "@/lib/orca-terminology";

type EventSettingsPageProps = {
  params: Promise<{ eventId: string }>;
};

export default async function EventSettingsPage({ params }: EventSettingsPageProps) {
  const { eventId } = await params;
  let canEdit = false;
  let clients: Array<{ id: string; name: string }> = [];
  let event: Awaited<ReturnType<typeof getEventSettingsById>> = null;
  let terminology: Awaited<ReturnType<typeof getEventTerminology>> | null = null;
  try {
    const ctx = await ensureProvisionedUserAndContext();
    if (ctx.status === "OK" && ctx.appUserId && ctx.role) {
      const decision = await resolveEventAccessForUser(eventId, {
        id: ctx.appUserId,
        orgId: ctx.activeOrgId,
        role: ctx.role,
      });
      if (!decision.canView) notFound();
      canEdit = decision.canEdit;
      [event, terminology] = await Promise.all([getEventSettingsById(eventId), getEventTerminology(eventId)]);
      if (event) clients = await listClientsForEventOrganization(event.orgId);
    }
  } catch {
    notFound();
  }
  if (!event || !terminology) notFound();

  return (
    <EventSettingsHub
      eventId={eventId}
      canEdit={canEdit}
      clients={clients}
      initialEvent={{
        name: event.name,
        startDate: serializeEventDateOnly(event.startDate) ?? "",
        endDate: serializeEventDateOnly(event.endDate) ?? "",
        timezone: event.timezone,
        venueName: event.venueName ?? "",
        clientId: event.clientId ?? "",
        status: event.status,
      }}
      initialApprovalWorkflows={{
        budgetApprovalsEnabled: event.budgetApprovalsEnabled,
        documentApprovalsEnabled: event.documentApprovalsEnabled,
      }}
      initialTerminology={terminology}
    />
  );
}
