import { EventActivityAction, EventActivityModule } from "@prisma/client";
import { assertEventAccessForUser, type EventAccessUser } from "@/lib/event-access";
import { getPrisma } from "@/lib/prisma";
import { recordEventActivity } from "@/src/server/services/event-activity";
export { ORCA_CANONICAL_TERMS, normalizeOrcaTerminology, type OrcaTerminology } from "./orca-terminology-contract";
import {
  ORCA_CANONICAL_TERMS,
  normalizeEventTerminologyOverrides,
  type OrcaTerminology,
  type EventTerminologyEnvelope,
} from "./orca-terminology-contract";


function resolved(value: string | null): string { return value?.trim() || ""; }
export async function getOrcaTerminology(orgId: string): Promise<OrcaTerminology> {
  const organization = await getPrisma().organization.findUniqueOrThrow({ where: { id: orgId }, select: { agendaTerm: true, runOfShowTerm: true, matrixTerm: true, showFlowTerm: true } });
  return { agenda: resolved(organization.agendaTerm) || ORCA_CANONICAL_TERMS.agenda, runOfShow: resolved(organization.runOfShowTerm) || ORCA_CANONICAL_TERMS.runOfShow, matrix: resolved(organization.matrixTerm) || ORCA_CANONICAL_TERMS.matrix, showFlow: resolved(organization.showFlowTerm) || ORCA_CANONICAL_TERMS.showFlow };
}

export class EventTerminologyError extends Error {
  constructor(message: string, public readonly status = 400, public readonly code = "EVENT_TERMINOLOGY_ERROR") {
    super(message);
    this.name = "EventTerminologyError";
  }
}

function terminologyFromRecord(record: {
  agendaTerm: string | null;
  runOfShowTerm: string | null;
  matrixTerm: string | null;
  showFlowTerm: string | null;
}): OrcaTerminology {
  return {
    agenda: resolved(record.agendaTerm) || ORCA_CANONICAL_TERMS.agenda,
    runOfShow: resolved(record.runOfShowTerm) || ORCA_CANONICAL_TERMS.runOfShow,
    matrix: resolved(record.matrixTerm) || ORCA_CANONICAL_TERMS.matrix,
    showFlow: resolved(record.showFlowTerm) || ORCA_CANONICAL_TERMS.showFlow,
  };
}

const terminologySelect = {
  id: true,
  name: true,
  updatedAt: true,
  agendaTerm: true,
  runOfShowTerm: true,
  matrixTerm: true,
  showFlowTerm: true,
  organization: { select: { agendaTerm: true, runOfShowTerm: true, matrixTerm: true, showFlowTerm: true } },
} as const;

function eventEnvelope(event: Awaited<ReturnType<typeof readEventTerminology>>): EventTerminologyEnvelope {
  if (!event) throw new EventTerminologyError("Event not found", 404, "EVENT_NOT_FOUND");
  const organizationTerms = terminologyFromRecord(event.organization);
  const overrides = normalizeEventTerminologyOverrides({
    agenda: event.agendaTerm,
    runOfShow: event.runOfShowTerm,
    matrix: event.matrixTerm,
    showFlow: event.showFlowTerm,
  });
  return {
    terms: {
      agenda: overrides.agenda ?? organizationTerms.agenda,
      runOfShow: overrides.runOfShow ?? organizationTerms.runOfShow,
      matrix: overrides.matrix ?? organizationTerms.matrix,
      showFlow: overrides.showFlow ?? organizationTerms.showFlow,
    },
    overrides,
    organizationTerms,
    updatedAt: event.updatedAt.toISOString(),
  };
}

function readEventTerminology(eventId: string) {
  return getPrisma().event.findUnique({ where: { id: eventId }, select: terminologySelect });
}

export async function getEventTerminology(eventId: string): Promise<EventTerminologyEnvelope> {
  return eventEnvelope(await readEventTerminology(eventId));
}

export async function updateEventTerminology(
  eventId: string,
  user: EventAccessUser,
  input: Partial<Record<keyof OrcaTerminology, unknown>> & { expectedUpdatedAt?: unknown },
): Promise<EventTerminologyEnvelope> {
  await assertEventAccessForUser(eventId, user, "write");
  const expectedUpdatedAt = typeof input.expectedUpdatedAt === "string" ? new Date(input.expectedUpdatedAt) : null;
  if (!expectedUpdatedAt || Number.isNaN(expectedUpdatedAt.getTime())) {
    throw new EventTerminologyError("expectedUpdatedAt must be a valid date and time", 400, "INVALID_VERSION");
  }
  const overrides = normalizeEventTerminologyOverrides(input);
  return getPrisma().$transaction(async (tx) => {
    const current = await tx.event.findUnique({ where: { id: eventId }, select: terminologySelect });
    if (!current) throw new EventTerminologyError("Event not found", 404, "EVENT_NOT_FOUND");
    if (current.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
      throw new EventTerminologyError("Event terminology changed. Refresh and try again.", 409, "VERSION_CONFLICT");
    }
    const updatedCount = await tx.event.updateMany({
      where: { id: eventId, updatedAt: expectedUpdatedAt },
      data: {
        agendaTerm: overrides.agenda,
        runOfShowTerm: overrides.runOfShow,
        matrixTerm: overrides.matrix,
        showFlowTerm: overrides.showFlow,
      },
    });
    if (updatedCount.count !== 1) {
      throw new EventTerminologyError("Event terminology changed. Refresh and try again.", 409, "VERSION_CONFLICT");
    }
    const updated = await tx.event.findUniqueOrThrow({ where: { id: eventId }, select: terminologySelect });
    const fields = ["agenda", "runOfShow", "matrix", "showFlow"] as const;
    const previous = normalizeEventTerminologyOverrides({ agenda: current.agendaTerm, runOfShow: current.runOfShowTerm, matrix: current.matrixTerm, showFlow: current.showFlowTerm });
    await recordEventActivity(tx, {
      eventId,
      actor: { kind: "USER", userId: user.id },
      module: EventActivityModule.EVENT_SETTINGS,
      action: EventActivityAction.UPDATED,
      entityType: "EventTerminology",
      entityId: eventId,
      entityLabel: current.name,
      message: "Updated event display terminology",
      changes: fields.map((field) => ({ field, label: `${field} display label`, from: previous[field], to: overrides[field] })),
    });
    return eventEnvelope(updated);
  });
}
