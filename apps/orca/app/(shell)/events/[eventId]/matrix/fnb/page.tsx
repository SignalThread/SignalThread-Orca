import { notFound } from "next/navigation";

import { assertEventAccessForUser, EventAccessError } from "@/lib/event-access";
import { getEventHeaderById } from "@/lib/event-loaders";
import { getFnbCatalogPayload } from "@/lib/fnb-catalog";
import { getEventFnbPlanner } from "@/lib/fnb-event-planner";
import { getEventFnbRequirements } from "@/lib/fnb-event-requirements";
import { getPrisma } from "@/lib/prisma";
import { ensureProvisionedUserAndContext } from "@/lib/request-user";

import { FnbPlannerWorkspace } from "./_components/fnb-planner-workspace";

type EventFnbPlannerPageProps = {
  params: Promise<{ eventId: string }>;
};

/**
 * Event-level F&B Planner, the default F&B experience for an event. Menu catalog and
 * source-menu management live here rather than in a standalone left-nav destination; the legacy
 * `/fnb-catalog` route redirects in.
 *
 * The `events/[eventId]` layout already asserts read access; this page additionally resolves
 * write access so the create-function affordance matches what the server will accept.
 */
export default async function EventFnbPlannerPage({ params }: EventFnbPlannerPageProps) {
  const { eventId } = await params;
  const event = await getEventHeaderById(eventId);

  if (!event) {
    notFound();
  }

  const authContext = await ensureProvisionedUserAndContext();
  let canWrite = false;
  if (authContext.status === "OK" && authContext.appUserId && authContext.role) {
    try {
      await assertEventAccessForUser(
        eventId,
        { id: authContext.appUserId, orgId: authContext.activeOrgId, role: authContext.role },
        "write",
      );
      canWrite = true;
    } catch (error) {
      if (!(error instanceof EventAccessError)) throw error;
      canWrite = false;
    }
  }

  const [planner, requirements, catalog, linkableSessionRows] = await Promise.all([
    getEventFnbPlanner(eventId),
    getEventFnbRequirements(eventId),
    getFnbCatalogPayload(eventId),
    getPrisma().matrixRow.findMany({
      where: { eventId, archivedAt: null },
      orderBy: [{ dayDate: "asc" }, { startTime: "asc" }, { sortOrder: "asc" }, { id: "asc" }],
      select: { id: true, sessionName: true, dayDate: true, startTime: true },
    }),
  ]);

  const plannedFunctionIds = new Set(planner.functions.map((entry) => entry.sessionId));

  return (
    <FnbPlannerWorkspace
      eventId={eventId}
      eventName={event.name}
      initialPlanner={planner}
      initialRequirements={requirements}
      canWrite={canWrite}
      // Only sessions that are not already F&B functions can be turned into one.
      linkableSessions={linkableSessionRows
        .filter((row) => !plannedFunctionIds.has(row.id))
        .map((row) => ({
          id: row.id,
          name: row.sessionName?.trim() || "Untitled session",
          date: row.dayDate.toISOString().slice(0, 10),
          startTime: row.startTime ? row.startTime.toISOString().slice(11, 16) : null,
        }))}
      catalogItems={catalog.items}
      sourceMenus={catalog.sourceMenus}
    />
  );
}
