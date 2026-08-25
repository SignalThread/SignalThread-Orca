import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { assertEventAccessForUser, EventAccessError } from "@/lib/event-access";
import { getEventHeaderById } from "@/lib/event-loaders";
import { ensureProvisionedUserAndContext } from "@/lib/request-user";
import { EventWorkspaceShell } from "./_components/event-workspace-shell";
import { getEventTerminology } from "@/lib/orca-terminology";

type EventLayoutProps = {
  children: ReactNode;
  params: Promise<{ eventId: string }>;
};

export default async function EventLayout({ children, params }: EventLayoutProps) {
  const { eventId } = await params;

  const authContext = await ensureProvisionedUserAndContext();
  if (authContext.status !== "OK" || !authContext.appUserId || !authContext.role) {
    notFound();
  }

  try {
    await assertEventAccessForUser(eventId, {
      id: authContext.appUserId,
      orgId: authContext.activeOrgId,
      role: authContext.role,
    }, "read");
  } catch (error) {
    if (error instanceof EventAccessError) {
      notFound();
    }
    throw error;
  }

  const [event, terminology] = await Promise.all([getEventHeaderById(eventId), getEventTerminology(eventId)]);

  if (!event) {
    notFound();
  }

  return (
    <EventWorkspaceShell
      currentEvent={{
        id: event.id,
        name: event.name,
        startDate: event.startDate.toISOString(),
        endDate: event.endDate?.toISOString() ?? null,
        timezone: event.timezone,
        status: event.status,
        venueName: event.venueName,
        city: event.city,
        state: event.state,
        terms: terminology.terms,
      }}
    >
      {children}
    </EventWorkspaceShell>
  );
}
