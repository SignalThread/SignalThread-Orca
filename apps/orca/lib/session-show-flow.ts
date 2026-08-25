import { Prisma, SessionShowFlowCueType, SessionShowFlowStatus, SessionShowFlowTimingMode, SessionShowFlowVisibility } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import {
  detectShowFlowTimingConflicts,
  projectPublicShowFlowCue,
  type ShowFlowConflict,
  type ShowFlowTimingCue,
} from "@/lib/session-show-flow-domain";
import { recordEventActivity } from "@/src/server/services/event-activity";

export class SessionShowFlowError extends Error {
  constructor(message: string, public readonly status = 400, public readonly code = "SHOW_FLOW_ERROR") {
    super(message);
    this.name = "SessionShowFlowError";
  }
}

type ItemInput = Record<string, unknown>;
type DbClient = Prisma.TransactionClient;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const SESSION_SHOW_FLOW_TEMPLATES = {
  GENERAL_SESSION: [
    { cueType: "PRE_FUNCTION", timingMode: "OFFSET", offsetMin: 0, durationMin: 10, label: "Room and stage final check", owner: "Show caller" },
    { cueType: "DOORS_OPEN", timingMode: "OFFSET", offsetMin: 10, durationMin: 10, label: "Open doors", owner: "Front of house" },
    { cueType: "CONTENT_PRESENTATION", timingMode: "OFFSET", offsetMin: 20, durationMin: 30, label: "General session program", owner: "Show caller" },
    { cueType: "CLOSE_STRIKE", timingMode: "OFFSET", offsetMin: 50, durationMin: 10, label: "Close and room turnover", owner: "Venue lead" },
  ],
  BREAKOUT: [
    { cueType: "PRE_FUNCTION", timingMode: "OFFSET", offsetMin: 0, durationMin: 5, label: "Breakout room check", owner: "Room monitor" },
    { cueType: "DOORS_OPEN", timingMode: "OFFSET", offsetMin: 5, durationMin: 5, label: "Admit attendees", owner: "Room monitor" },
    { cueType: "CONTENT_PRESENTATION", timingMode: "OFFSET", offsetMin: 10, durationMin: 40, label: "Breakout presentation", owner: "Session lead" },
    { cueType: "TRANSITION_TURNOVER", timingMode: "OFFSET", offsetMin: 50, durationMin: 10, label: "Q&A and turnover", owner: "Session lead" },
  ],
  MEAL: [
    { cueType: "PRE_FUNCTION", timingMode: "OFFSET", offsetMin: 0, durationMin: 10, label: "Meal room and service check", owner: "Banquet captain" },
    { cueType: "GUEST_ARRIVAL", timingMode: "OFFSET", offsetMin: 10, durationMin: 15, label: "Guest arrival and seating", owner: "Front of house" },
    { cueType: "FNB_SERVICE", timingMode: "OFFSET", offsetMin: 25, durationMin: 30, label: "Meal service", owner: "Banquet captain" },
    { cueType: "CLOSE_STRIKE", timingMode: "OFFSET", offsetMin: 55, durationMin: 5, label: "Service close", owner: "Banquet captain" },
  ],
  RECEPTION: [
    { cueType: "PRE_FUNCTION", timingMode: "OFFSET", offsetMin: 0, durationMin: 10, label: "Reception readiness check", owner: "Event lead" },
    { cueType: "DOORS_OPEN", timingMode: "OFFSET", offsetMin: 10, durationMin: 10, label: "Open reception", owner: "Front of house" },
    { cueType: "FNB_SERVICE", timingMode: "OFFSET", offsetMin: 20, durationMin: 35, label: "Reception service", owner: "Banquet captain" },
    { cueType: "CLOSE_STRIKE", timingMode: "OFFSET", offsetMin: 55, durationMin: 5, label: "Last call and close", owner: "Event lead" },
  ],
} as const;
export type SessionShowFlowTemplate = keyof typeof SESSION_SHOW_FLOW_TEMPLATES;

function hasOwn(input: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(input, key);
}

function optionalText(value: unknown, field: string): string | null {
  if (typeof value === "undefined" || value === null || value === "") return null;
  if (typeof value !== "string") throw new SessionShowFlowError(`${field} must be text`);
  const text = value.trim();
  return text || null;
}

function requiredText(value: unknown, field: string): string {
  const text = optionalText(value, field);
  if (!text) throw new SessionShowFlowError(`${field} is required`);
  return text;
}

function clockDate(value: unknown, field = "startTime"): Date | null {
  if (typeof value === "undefined" || value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) {
    throw new SessionShowFlowError(`${field} must be HH:mm in the event timezone`);
  }
  const [hour, minute] = value.split(":").map(Number);
  if (hour > 23 || minute > 59) throw new SessionShowFlowError(`${field} must be HH:mm in the event timezone`);
  return new Date(Date.UTC(1970, 0, 1, hour, minute));
}

function clockString(value: Date | null): string | null {
  return value ? value.toISOString().slice(11, 16) : null;
}

function positiveDuration(value: unknown): number | null {
  if (typeof value === "undefined" || value === null || value === "") return null;
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    throw new SessionShowFlowError("durationMin must be a positive whole number");
  }
  return numberValue;
}

function nonNegativeOffset(value: unknown): number | null {
  if (typeof value === "undefined" || value === null || value === "") return null;
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue < 0) {
    throw new SessionShowFlowError("offsetMin must be a non-negative whole number");
  }
  return numberValue;
}

function visibility(value: unknown): SessionShowFlowVisibility {
  if (value === "PUBLIC") return SessionShowFlowVisibility.PUBLIC;
  if (typeof value === "undefined" || value === "INTERNAL") return SessionShowFlowVisibility.INTERNAL;
  throw new SessionShowFlowError("visibility must be INTERNAL or PUBLIC");
}

function timingMode(value: unknown): SessionShowFlowTimingMode {
  if (value === "OFFSET") return SessionShowFlowTimingMode.OFFSET;
  if (typeof value === "undefined" || value === "ABSOLUTE") return SessionShowFlowTimingMode.ABSOLUTE;
  throw new SessionShowFlowError("timingMode must be ABSOLUTE or OFFSET");
}

function cueType(value: unknown): SessionShowFlowCueType {
  if (typeof value === "undefined") return SessionShowFlowCueType.CUSTOM;
  if (typeof value === "string" && Object.values(SessionShowFlowCueType).includes(value as SessionShowFlowCueType)) {
    return value as SessionShowFlowCueType;
  }
  throw new SessionShowFlowError("cueType must be a supported Show Flow cue type");
}

function expectedRevision(value: unknown): number | undefined {
  if (typeof value === "undefined") return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new SessionShowFlowError("expectedRevision must be a non-negative whole number");
  return parsed;
}

function normalizedItem(raw: unknown, index: number, strictTiming: boolean) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new SessionShowFlowError(`items[${index}] must be an object`);
  }
  const item = raw as ItemInput;
  const mode = timingMode(item.timingMode);
  const parsedStart = clockDate(item.startTime);
  const parsedOffset = nonNegativeOffset(item.offsetMin);
  const parsedDuration = positiveDuration(item.durationMin);
  if (strictTiming && mode === SessionShowFlowTimingMode.ABSOLUTE && !parsedStart) {
    throw new SessionShowFlowError(`items[${index}].startTime is required for absolute timing`);
  }
  if (strictTiming && mode === SessionShowFlowTimingMode.OFFSET && parsedOffset === null) {
    throw new SessionShowFlowError(`items[${index}].offsetMin is required for offset timing`);
  }
  if (strictTiming && parsedDuration === null) {
    throw new SessionShowFlowError(`items[${index}].durationMin is required`);
  }
  const candidateId = optionalText(item.id, "id");
  return {
    requestedId: candidateId && UUID_PATTERN.test(candidateId) ? candidateId : null,
    sortOrder: index * 1000,
    cueType: cueType(item.cueType),
    timingMode: mode,
    startTime: mode === SessionShowFlowTimingMode.ABSOLUTE ? parsedStart : null,
    offsetMin: mode === SessionShowFlowTimingMode.OFFSET ? parsedOffset : null,
    durationMin: parsedDuration,
    label: requiredText(item.label, "label"),
    action: optionalText(item.action, "action"),
    owner: optionalText(item.owner, "owner"),
    ownerPersonId: optionalText(item.ownerPersonId, "ownerPersonId"),
    department: optionalText(item.department, "department"),
    speakerId: optionalText(item.speakerId, "speakerId"),
    talentName: optionalText(item.talentName, "talentName"),
    avNotes: optionalText(item.avNotes, "avNotes"),
    audioNotes: optionalText(item.audioNotes, "audioNotes"),
    lightingNotes: optionalText(item.lightingNotes, "lightingNotes"),
    notes: optionalText(item.notes, "notes"),
    internalNotes: optionalText(item.internalNotes, "internalNotes"),
    publicDescription: optionalText(item.publicDescription, "publicDescription"),
    visibility: visibility(item.visibility),
  };
}

async function sessionForEvent(eventId: string, sessionId: string, db = getPrisma()) {
  const session = await db.matrixRow.findFirst({
    where: { id: sessionId, eventId, archivedAt: null },
    select: {
      id: true,
      eventId: true,
      dayDate: true,
      startTime: true,
      endTime: true,
      roomId: true,
      roomName: true,
      sessionName: true,
      attendance: true,
      attendanceSource: true,
      publicDescription: true,
      updatedAt: true,
      sessionSpeakerAssignments: { select: { speakerId: true } },
      sessionStaffAssignments: { select: { personId: true } },
    },
  });
  if (!session) throw new SessionShowFlowError("Session not found for this event", 404, "SESSION_NOT_FOUND");
  return session;
}

function serializeItem(item: {
  id: string;
  sortOrder: number;
  cueType: SessionShowFlowCueType;
  timingMode: SessionShowFlowTimingMode;
  startTime: Date | null;
  offsetMin: number | null;
  durationMin: number | null;
  label: string;
  action: string | null;
  owner: string | null;
  ownerPersonId: string | null;
  department: string | null;
  speakerId: string | null;
  talentName: string | null;
  avNotes: string | null;
  audioNotes: string | null;
  lightingNotes: string | null;
  notes: string | null;
  internalNotes: string | null;
  publicDescription: string | null;
  visibility: SessionShowFlowVisibility;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  speaker: { name: string } | null;
  ownerPerson: { name: string; role: string } | null;
}) {
  return {
    id: item.id,
    sortOrder: item.sortOrder,
    cueType: item.cueType,
    timingMode: item.timingMode as "ABSOLUTE" | "OFFSET",
    startTime: clockString(item.startTime),
    offsetMin: item.offsetMin,
    durationMin: item.durationMin,
    label: item.label,
    action: item.action,
    owner: item.owner,
    ownerPersonId: item.ownerPersonId,
    ownerPerson: item.ownerPerson,
    department: item.department,
    speakerId: item.speakerId,
    speaker: item.speaker,
    talentName: item.talentName,
    avNotes: item.avNotes,
    audioNotes: item.audioNotes,
    lightingNotes: item.lightingNotes,
    notes: item.notes,
    internalNotes: item.internalNotes,
    publicDescription: item.publicDescription,
    visibility: item.visibility as "INTERNAL" | "PUBLIC",
    version: item.version,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

async function resourceConflicts(
  eventId: string,
  session: Awaited<ReturnType<typeof sessionForEvent>>,
  cueSpeakerIds: string[],
): Promise<ShowFlowConflict[]> {
  if (!session.startTime || !session.endTime) return [];
  const overlapping = await getPrisma().matrixRow.findMany({
    where: {
      eventId,
      id: { not: session.id },
      archivedAt: null,
      dayDate: session.dayDate,
      startTime: { lt: session.endTime },
      endTime: { gt: session.startTime },
    },
    select: {
      id: true,
      sessionName: true,
      roomId: true,
      roomName: true,
      sessionSpeakerAssignments: { select: { speakerId: true } },
      sessionStaffAssignments: { select: { personId: true } },
    },
  });
  const speakerIds = new Set([
    ...session.sessionSpeakerAssignments.map((entry) => entry.speakerId),
    ...cueSpeakerIds,
  ]);
  const staffIds = new Set(session.sessionStaffAssignments.map((entry) => entry.personId));
  const conflicts: ShowFlowConflict[] = [];
  for (const other of overlapping) {
    const otherLabel = other.sessionName?.trim() || "another session";
    const sameRoom = session.roomId && other.roomId
      ? session.roomId === other.roomId
      : Boolean(session.roomName && other.roomName && session.roomName.trim().toLowerCase() === other.roomName.trim().toLowerCase());
    if (sameRoom) conflicts.push({ code: "ROOM_CONFLICT", severity: "BLOCKING", message: `Room overlaps ${otherLabel}.`, itemIds: [], otherSessionId: other.id });
    if (other.sessionSpeakerAssignments.some((entry) => speakerIds.has(entry.speakerId))) {
      conflicts.push({ code: "SPEAKER_CONFLICT", severity: "BLOCKING", message: `Speaker overlaps ${otherLabel}.`, itemIds: [], otherSessionId: other.id });
    }
    if (other.sessionStaffAssignments.some((entry) => staffIds.has(entry.personId))) {
      conflicts.push({ code: "STAFF_CONFLICT", severity: "BLOCKING", message: `Staff assignment overlaps ${otherLabel}.`, itemIds: [], otherSessionId: other.id });
    }
  }
  return conflicts;
}

async function showFlowRows(eventId: string, sessionId: string) {
  return getPrisma().sessionShowFlowItem.findMany({
    where: { eventId, sessionId },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    select: {
      id: true,
      sortOrder: true,
      cueType: true,
      timingMode: true,
      startTime: true,
      offsetMin: true,
      durationMin: true,
      label: true,
      action: true,
      owner: true,
      ownerPersonId: true,
      department: true,
      speakerId: true,
      talentName: true,
      avNotes: true,
      audioNotes: true,
      lightingNotes: true,
      notes: true,
      internalNotes: true,
      publicDescription: true,
      visibility: true,
      version: true,
      createdAt: true,
      updatedAt: true,
      speaker: { select: { name: true } },
      ownerPerson: { select: { name: true, role: true } },
    },
  });
}

export async function listSessionShowFlow(
  eventId: string,
  sessionId: string,
  audience: "internal" | "public" = "internal",
) {
  await sessionForEvent(eventId, sessionId);
  const rows = await showFlowRows(eventId, sessionId);
  return rows
    .filter((row) => audience === "internal" || row.visibility === SessionShowFlowVisibility.PUBLIC)
    .map(serializeItem);
}

export async function getSessionShowFlowWorkspace(eventId: string, sessionId: string) {
  const [session, rows, state, people, speakers, copySources, latestPublication] = await Promise.all([
    sessionForEvent(eventId, sessionId),
    showFlowRows(eventId, sessionId),
    getPrisma().sessionShowFlowState.findUnique({
      where: { sessionId },
      select: { revision: true, status: true, approvedAt: true, approvedByUserId: true, updatedAt: true },
    }),
    getPrisma().eventPerson.findMany({ where: { eventId }, orderBy: { name: "asc" }, select: { id: true, name: true, role: true } }),
    getPrisma().speaker.findMany({
      where: { eventId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    getPrisma().matrixRow.findMany({
      where: { eventId, id: { not: sessionId }, archivedAt: null, showFlowItems: { some: {} } },
      orderBy: [{ dayDate: "asc" }, { startTime: "asc" }],
      select: { id: true, sessionName: true, dayDate: true, _count: { select: { showFlowItems: true } } },
    }),
    getPrisma().sessionAgendaPublication.findFirst({
      where: { eventId, sessionId },
      orderBy: { version: "desc" },
      select: {
        version: true,
        publishedAt: true,
        publishedByUserId: true,
        showFlowRevision: true,
        sessionUpdatedAt: true,
      },
    }),
  ]);
  const serialized = rows.map(serializeItem);
  const timing = detectShowFlowTimingConflicts(
    { startTime: clockString(session.startTime), endTime: clockString(session.endTime) },
    serialized as ShowFlowTimingCue[],
  );
  const cuesById = new Map(timing.cues.map((cue) => [cue.id, cue]));
  const items = serialized.map((item) => {
    const cueTiming = cuesById.get(item.id);
    if (!cueTiming) throw new SessionShowFlowError("Unable to derive cue timing", 500, "TIMING_DERIVATION_FAILED");
    return { ...item, ...cueTiming };
  });
  const revision = state?.revision ?? 0;
  const conflicts = [
    ...timing.conflicts,
    ...await resourceConflicts(
      eventId,
      session,
      rows.map((row) => row.speakerId).filter((id): id is string => Boolean(id)),
    ),
  ];
  return {
    revision,
    status: state?.status ?? SessionShowFlowStatus.DRAFT,
    approvedAt: state?.approvedAt?.toISOString() ?? null,
    approvedByUserId: state?.approvedByUserId ?? null,
    lastUpdatedAt: state?.updatedAt.toISOString() ?? null,
    people,
    speakers,
    copySources: copySources.map((entry) => ({
      id: entry.id,
      title: entry.sessionName?.trim() || "Untitled Session",
      date: entry.dayDate.toISOString().slice(0, 10),
      cueCount: entry._count.showFlowItems,
    })),
    session: {
      id: session.id,
      title: session.sessionName?.trim() || "Untitled Session",
      date: session.dayDate.toISOString().slice(0, 10),
      startTime: clockString(session.startTime),
      endTime: clockString(session.endTime),
      roomName: session.roomName,
      expectedAttendance: session.attendance,
      expectedAttendanceSource: session.attendanceSource,
      publicDescription: session.publicDescription,
      updatedAt: session.updatedAt.toISOString(),
    },
    items,
    conflicts,
    publication: latestPublication
      ? {
          version: latestPublication.version,
          publishedAt: latestPublication.publishedAt.toISOString(),
          publishedByUserId: latestPublication.publishedByUserId,
          showFlowRevision: latestPublication.showFlowRevision,
          hasUnpublishedChanges: latestPublication.showFlowRevision !== revision
            || latestPublication.sessionUpdatedAt.getTime() !== session.updatedAt.getTime(),
        }
      : {
          version: null,
          publishedAt: null,
          publishedByUserId: null,
          showFlowRevision: null,
          hasUnpublishedChanges: rows.length > 0 || Boolean(session.publicDescription),
        },
  };
}

export async function replaceSessionShowFlow(
  eventId: string,
  sessionId: string,
  rawItems: unknown,
  options: { expectedRevision?: unknown; publicDescription?: unknown; actorUserId?: string } = {},
) {
  if (!Array.isArray(rawItems)) throw new SessionShowFlowError("items must be an array");
  await sessionForEvent(eventId, sessionId);
  const requestedRevision = expectedRevision(options.expectedRevision);
  const items = rawItems.map((raw, index) => normalizedItem(raw, index, typeof requestedRevision !== "undefined"));
  const publicDescription = hasOwn(options, "publicDescription")
    ? optionalText(options.publicDescription, "publicDescription")
    : undefined;

  const speakerIds = Array.from(new Set(items.map((item) => item.speakerId).filter((id): id is string => Boolean(id))));
  if (speakerIds.some((id) => !UUID_PATTERN.test(id))) throw new SessionShowFlowError("speakerId must be a valid speaker identifier");
  if (speakerIds.length > 0) {
    const speakers = await getPrisma().speaker.findMany({ where: { eventId, id: { in: speakerIds } }, select: { id: true } });
    if (speakers.length !== speakerIds.length) throw new SessionShowFlowError("Selected speaker is not available for this event", 400, "CROSS_EVENT_SPEAKER");
  }

  const ownerPersonIds = Array.from(new Set(items.map((item) => item.ownerPersonId).filter((id): id is string => Boolean(id))));
  if (ownerPersonIds.some((id) => !UUID_PATTERN.test(id))) {
    throw new SessionShowFlowError("ownerPersonId must be a valid Event Directory person identifier");
  }
  if (ownerPersonIds.length > 0) {
    const people = await getPrisma().eventPerson.findMany({ where: { eventId, id: { in: ownerPersonIds } }, select: { id: true } });
    if (people.length !== ownerPersonIds.length) {
      throw new SessionShowFlowError("Selected owner is not available for this event", 400, "CROSS_EVENT_OWNER");
    }
  }

  await getPrisma().sessionShowFlowState.upsert({
    where: { sessionId },
    create: { sessionId, eventId, revision: 0, createdByUserId: options.actorUserId, updatedByUserId: options.actorUserId },
    update: {},
  });

  let nextRevision = 0;
  try {
    await getPrisma().$transaction(async (tx) => {
      const state = await tx.sessionShowFlowState.findUnique({ where: { sessionId } });
      if (!state || state.eventId !== eventId) throw new SessionShowFlowError("Show flow state not found", 404);
      if (typeof requestedRevision !== "undefined" && state.revision !== requestedRevision) {
        throw new SessionShowFlowError("Show flow changed in another window. Reload before saving.", 409, "STALE_SHOW_FLOW_REVISION");
      }
      const advanced = await tx.sessionShowFlowState.updateMany({
        where: { sessionId, eventId, revision: state.revision },
        data: {
          revision: { increment: 1 },
          status: SessionShowFlowStatus.DRAFT,
          approvedAt: null,
          approvedByUserId: null,
          updatedByUserId: options.actorUserId,
        },
      });
      if (advanced.count !== 1) {
        throw new SessionShowFlowError("Show flow changed in another window. Reload before saving.", 409, "STALE_SHOW_FLOW_REVISION");
      }
      nextRevision = state.revision + 1;

      const existing = await tx.sessionShowFlowItem.findMany({ where: { eventId, sessionId }, select: { id: true, version: true } });
      const existingVersions = new Map(existing.map((entry) => [entry.id, entry.version]));
      await tx.sessionShowFlowItem.deleteMany({ where: { eventId, sessionId } });
      for (const item of items) {
        const preservedVersion = item.requestedId ? existingVersions.get(item.requestedId) : undefined;
        await tx.sessionShowFlowItem.create({
          data: {
            ...(preservedVersion ? { id: item.requestedId!, version: preservedVersion + 1 } : {}),
            eventId,
            sessionId,
            sortOrder: item.sortOrder,
            cueType: item.cueType,
            timingMode: item.timingMode,
            startTime: item.startTime,
            offsetMin: item.offsetMin,
            durationMin: item.durationMin,
            label: item.label,
            action: item.action,
            owner: item.owner,
            ownerPersonId: item.ownerPersonId,
            department: item.department,
            speakerId: item.speakerId,
            talentName: item.talentName,
            avNotes: item.avNotes,
            audioNotes: item.audioNotes,
            lightingNotes: item.lightingNotes,
            notes: item.notes,
            internalNotes: item.internalNotes,
            publicDescription: item.publicDescription,
            visibility: item.visibility,
          },
        });
      }
      if (typeof publicDescription !== "undefined") {
        await tx.matrixRow.update({ where: { id: sessionId }, data: { publicDescription } });
      }
      if (options.actorUserId) {
        await recordEventActivity(tx as DbClient, {
          eventId,
          actor: { kind: "USER", userId: options.actorUserId },
          module: "RUN_OF_SHOW",
          action: "UPDATED",
          entityType: "SessionShowFlow",
          entityId: sessionId,
          entityLabel: "Session show flow",
          message: `Show flow saved with ${items.length} cue${items.length === 1 ? "" : "s"}`,
          changes: [{ field: "revision", label: "Revision", from: state.revision, to: nextRevision }],
          source: { type: "SessionShowFlowRevision", id: `${sessionId}:${nextRevision}` },
        });
      }
    });
  } catch (error) {
    if (error instanceof SessionShowFlowError) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new SessionShowFlowError("Show flow changed in another window. Reload before saving.", 409, "STALE_SHOW_FLOW_REVISION");
    }
    throw error;
  }
  return getSessionShowFlowWorkspace(eventId, sessionId);
}

export async function setSessionShowFlowApproval(
  eventId: string,
  sessionId: string,
  input: { status: unknown; expectedRevision?: unknown; actorUserId: string },
) {
  const workspace = await getSessionShowFlowWorkspace(eventId, sessionId);
  const requestedRevision = expectedRevision(input.expectedRevision);
  if (requestedRevision !== undefined && requestedRevision !== workspace.revision) {
    throw new SessionShowFlowError("Show flow changed in another window. Reload before approving.", 409, "STALE_SHOW_FLOW_REVISION");
  }
  if (input.status !== SessionShowFlowStatus.DRAFT && input.status !== SessionShowFlowStatus.APPROVED) {
    throw new SessionShowFlowError("status must be DRAFT or APPROVED");
  }
  const nextStatus = input.status;
  if (nextStatus === SessionShowFlowStatus.APPROVED) {
    if (workspace.items.length === 0) throw new SessionShowFlowError("Add at least one cue before approving.", 409, "EMPTY_SHOW_FLOW");
    if (workspace.conflicts.some((conflict) => conflict.severity === "BLOCKING")) {
      throw new SessionShowFlowError("Resolve blocking Show Flow issues before approving.", 409, "SHOW_FLOW_CONFLICTS");
    }
  }

  await getPrisma().$transaction(async (tx) => {
    const state = await tx.sessionShowFlowState.upsert({
      where: { sessionId },
      create: {
        sessionId,
        eventId,
        revision: workspace.revision,
        status: nextStatus,
        createdByUserId: input.actorUserId,
        updatedByUserId: input.actorUserId,
        approvedByUserId: nextStatus === SessionShowFlowStatus.APPROVED ? input.actorUserId : null,
        approvedAt: nextStatus === SessionShowFlowStatus.APPROVED ? new Date() : null,
      },
      update: {
        status: nextStatus,
        updatedByUserId: input.actorUserId,
        approvedByUserId: nextStatus === SessionShowFlowStatus.APPROVED ? input.actorUserId : null,
        approvedAt: nextStatus === SessionShowFlowStatus.APPROVED ? new Date() : null,
      },
    });
    if (state.eventId !== eventId) throw new SessionShowFlowError("Show flow not found", 404);
    await recordEventActivity(tx as DbClient, {
      eventId,
      actor: { kind: "USER", userId: input.actorUserId },
      module: "RUN_OF_SHOW",
      action: nextStatus === SessionShowFlowStatus.APPROVED ? "APPROVED" : "UPDATED",
      entityType: "SessionShowFlow",
      entityId: sessionId,
      entityLabel: workspace.session.title,
      message: nextStatus === SessionShowFlowStatus.APPROVED ? "Show Flow approved" : "Show Flow returned to draft",
      changes: [{ field: "status", label: "Approval status", from: workspace.status, to: nextStatus }],
      source: { type: "SessionShowFlowRevision", id: `${sessionId}:${workspace.revision}` },
    });
  });
  return getSessionShowFlowWorkspace(eventId, sessionId);
}

export async function applySessionShowFlowTemplate(
  eventId: string,
  sessionId: string,
  input: { template: unknown; expectedRevision?: unknown; actorUserId: string },
) {
  if (typeof input.template !== "string" || !(input.template in SESSION_SHOW_FLOW_TEMPLATES)) {
    throw new SessionShowFlowError("template must be General Session, Breakout, Meal, or Reception");
  }
  const template = input.template as SessionShowFlowTemplate;
  const workspace = await replaceSessionShowFlow(
    eventId,
    sessionId,
    SESSION_SHOW_FLOW_TEMPLATES[template],
    { expectedRevision: input.expectedRevision, actorUserId: input.actorUserId },
  );
  await getPrisma().sessionShowFlowState.update({
    where: { sessionId },
    data: { templateSourceSessionId: null },
  });
  return { ...workspace, appliedTemplate: template };
}

export async function copySessionShowFlow(
  eventId: string,
  sessionId: string,
  input: { sourceSessionId: unknown; expectedRevision?: unknown; actorUserId: string },
) {
  if (typeof input.sourceSessionId !== "string" || !UUID_PATTERN.test(input.sourceSessionId)) {
    throw new SessionShowFlowError("sourceSessionId must be a valid session identifier");
  }
  if (input.sourceSessionId === sessionId) throw new SessionShowFlowError("Choose a different session to copy");
  const source = await getSessionShowFlowWorkspace(eventId, input.sourceSessionId);
  if (source.items.length === 0) throw new SessionShowFlowError("The selected session has no Show Flow cues", 409, "EMPTY_SOURCE_SHOW_FLOW");
  const copied = source.items.map((item) => ({
    ...item,
    id: undefined,
    ownerPerson: undefined,
    speaker: undefined,
    effectiveStartTime: undefined,
    effectiveEndTime: undefined,
    effectiveStartMinute: undefined,
    effectiveEndMinute: undefined,
  }));
  const workspace = await replaceSessionShowFlow(eventId, sessionId, copied, {
    expectedRevision: input.expectedRevision,
    actorUserId: input.actorUserId,
  });
  await getPrisma().sessionShowFlowState.update({
    where: { sessionId },
    data: { templateSourceSessionId: input.sourceSessionId },
  });
  return { ...workspace, copiedFrom: { sessionId: input.sourceSessionId, title: source.session.title } };
}

function safePublicSnapshot(workspace: Awaited<ReturnType<typeof getSessionShowFlowWorkspace>>) {
  return {
    sessionId: workspace.session.id,
    title: workspace.session.title,
    date: workspace.session.date,
    startTime: workspace.session.startTime,
    endTime: workspace.session.endTime,
    roomName: workspace.session.roomName,
    description: workspace.session.publicDescription?.trim() || null,
    cues: workspace.items
      .map((item) => projectPublicShowFlowCue(item))
      .filter((item): item is NonNullable<typeof item> => Boolean(item)),
  };
}

export async function previewSessionAgenda(eventId: string, sessionId: string) {
  const workspace = await getSessionShowFlowWorkspace(eventId, sessionId);
  return {
    preview: safePublicSnapshot(workspace),
    revision: workspace.revision,
    conflicts: workspace.conflicts,
    publication: workspace.publication,
  };
}

export async function publishSessionAgenda(
  eventId: string,
  sessionId: string,
  input: { expectedRevision?: unknown; actorUserId: string },
) {
  const workspace = await getSessionShowFlowWorkspace(eventId, sessionId);
  const requestedRevision = expectedRevision(input.expectedRevision);
  if (typeof requestedRevision !== "undefined" && requestedRevision !== workspace.revision) {
    throw new SessionShowFlowError("Show flow changed before publication. Reload the preview.", 409, "STALE_SHOW_FLOW_REVISION");
  }
  const blockers = workspace.conflicts.filter((conflict) => conflict.severity === "BLOCKING");
  if (blockers.length > 0) {
    throw new SessionShowFlowError("Resolve blocking show-flow conflicts before publishing.", 409, "SHOW_FLOW_CONFLICTS");
  }
  const snapshot = safePublicSnapshot(workspace);
  const sessionUpdatedAt = new Date(workspace.session.updatedAt);

  const publication = await getPrisma().$transaction(async (tx) => {
    const state = await tx.sessionShowFlowState.findUnique({ where: { sessionId } });
    const currentRevision = state?.revision ?? 0;
    if (currentRevision !== workspace.revision) {
      throw new SessionShowFlowError("Show flow changed before publication. Reload the preview.", 409, "STALE_SHOW_FLOW_REVISION");
    }
    const currentSession = await tx.matrixRow.findFirst({ where: { id: sessionId, eventId, archivedAt: null }, select: { updatedAt: true } });
    if (!currentSession || currentSession.updatedAt.getTime() !== sessionUpdatedAt.getTime()) {
      throw new SessionShowFlowError("Session details changed before publication. Reload the preview.", 409, "STALE_SESSION_REVISION");
    }
    const latest = await tx.sessionAgendaPublication.findFirst({ where: { eventId, sessionId }, orderBy: { version: "desc" }, select: { version: true } });
    const version = (latest?.version ?? 0) + 1;
    const created = await tx.sessionAgendaPublication.create({
      data: {
        eventId,
        sessionId,
        version,
        showFlowRevision: currentRevision,
        sessionUpdatedAt,
        snapshot: snapshot as Prisma.InputJsonValue,
        publishedByUserId: input.actorUserId,
      },
    });
    await recordEventActivity(tx as DbClient, {
      eventId,
      actor: { kind: "USER", userId: input.actorUserId },
      module: "RUN_OF_SHOW",
      action: "APPROVED",
      entityType: "SessionAgendaPublication",
      entityId: created.id,
      entityLabel: workspace.session.title,
      message: `Published attendee agenda version ${version}`,
      changes: [{ field: "version", label: "Publication version", from: latest?.version ?? 0, to: version }],
      source: { type: "SessionAgendaPublication", id: created.id },
    });
    return created;
  });

  return {
    version: publication.version,
    publishedAt: publication.publishedAt.toISOString(),
    preview: snapshot,
  };
}

export async function listPublishedEventAgenda(eventId: string) {
  const publications = await getPrisma().sessionAgendaPublication.findMany({
    where: { eventId, session: { archivedAt: null } },
    orderBy: [{ sessionId: "asc" }, { version: "desc" }],
    select: { sessionId: true, version: true, publishedAt: true, snapshot: true },
  });
  const latest = new Map<string, (typeof publications)[number]>();
  for (const publication of publications) {
    if (!latest.has(publication.sessionId)) latest.set(publication.sessionId, publication);
  }
  return [...latest.values()]
    .map((publication): Record<string, unknown> => ({
      version: publication.version,
      publishedAt: publication.publishedAt.toISOString(),
      ...(publication.snapshot as Record<string, unknown>),
    }))
    .sort((left, right) => String(left["date"] ?? "").localeCompare(String(right["date"] ?? ""))
      || String(left["startTime"] ?? "").localeCompare(String(right["startTime"] ?? "")));
}
