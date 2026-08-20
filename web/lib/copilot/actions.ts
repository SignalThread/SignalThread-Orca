import { addLineItem, updateLineItem } from "@/src/server/services/budget";
import { getPrisma } from "@/lib/prisma";
import { createRoom, updateRoom } from "@/lib/rooms";
import { createMatrixRow, updateMatrixRow } from "@/lib/matrix";
import { getMatrix2Snapshot, type Matrix2SessionRecord } from "@/lib/matrix2";
import { updateMatrix2Session, type Matrix2SessionUpdateInput } from "@/lib/matrix2-session";
import type { ProposedAction } from "@/lib/copilot/types";

export class CopilotExecutionError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

type ExecutionResult = {
  summary: string;
  entityId?: string;
};

function toText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseTimeToMinutes(value: string): number {
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) {
    throw new CopilotExecutionError(`Invalid time format: ${value}`, 400);
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new CopilotExecutionError(`Invalid time: ${value}`, 400);
  }
  return hours * 60 + minutes;
}

function minutesToTime(value: number): string {
  const safe = Math.max(0, Math.min(value, 23 * 60 + 59));
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function deriveEndTime(startTime: string, durationMinutes: number): string {
  const startMinutes = parseTimeToMinutes(startTime);
  const duration = Math.max(15, Math.floor(durationMinutes));
  return minutesToTime(startMinutes + duration);
}

async function resolveRoom(input: {
  eventId: string;
  roomId?: string | null;
  roomName?: string | null;
}): Promise<{ id: string; name: string } | null> {
  if (input.roomId) {
    const byId = await getPrisma().room.findFirst({
      where: {
        id: input.roomId,
        eventId: input.eventId,
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!byId) {
      throw new CopilotExecutionError("Room not found for this event.", 404);
    }

    return byId;
  }

  if (!input.roomName) {
    return null;
  }

  const normalized = input.roomName.trim();
  const rooms = await getPrisma().room.findMany({
    where: { eventId: input.eventId },
    select: { id: true, name: true },
  });

  const exact = rooms.find((room) => room.name.trim().toLowerCase() === normalized.toLowerCase());
  if (exact) return exact;

  const partial = rooms.filter((room) => room.name.trim().toLowerCase().includes(normalized.toLowerCase()));
  if (partial.length === 1) return partial[0];
  if (partial.length > 1) {
    throw new CopilotExecutionError(`Multiple rooms matched "${normalized}". Be more specific.`, 400);
  }

  throw new CopilotExecutionError(`Room "${normalized}" was not found.`, 404);
}

function normalizeSessionNameForMatch(value: string): string {
  return value.trim().toLowerCase();
}

async function resolveSession(input: {
  eventId: string;
  sessionId?: string | null;
  sessionName?: string | null;
}): Promise<Matrix2SessionRecord> {
  const snapshot = await getMatrix2Snapshot(input.eventId);

  if (input.sessionId) {
    const byId = snapshot.sessions.find((session) => session.id === input.sessionId);
    if (!byId) {
      throw new CopilotExecutionError("Session not found for this event.", 404);
    }
    return byId;
  }

  const sessionName = input.sessionName?.trim();
  if (!sessionName) {
    throw new CopilotExecutionError("Session name or id is required.", 400);
  }

  const normalized = normalizeSessionNameForMatch(sessionName);
  const exact = snapshot.sessions.filter((session) => normalizeSessionNameForMatch(session.title) === normalized);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) {
    throw new CopilotExecutionError(`Multiple sessions named "${sessionName}" were found. Use a specific session id.`, 400);
  }

  const partial = snapshot.sessions.filter((session) => normalizeSessionNameForMatch(session.title).includes(normalized));
  if (partial.length === 1) return partial[0];
  if (partial.length > 1) {
    throw new CopilotExecutionError(`Multiple sessions matched "${sessionName}". Be more specific.`, 400);
  }

  throw new CopilotExecutionError(`Session "${sessionName}" was not found.`, 404);
}

async function resolveBudgetLineItem(input: {
  eventId: string;
  lineItemId?: string | null;
  lineItem?: string | null;
}) {
  const budget = await getPrisma().budget.findUnique({
    where: { eventId: input.eventId },
    select: {
      id: true,
      lineItems: {
        select: {
          id: true,
          lineItem: true,
        },
      },
    },
  });

  if (!budget) {
    throw new CopilotExecutionError("Budget is not configured for this event.", 404);
  }

  if (input.lineItemId) {
    const byId = budget.lineItems.find((item) => item.id === input.lineItemId);
    if (!byId) {
      throw new CopilotExecutionError("Budget line item not found for this event.", 404);
    }
    return byId;
  }

  const lineItem = input.lineItem?.trim();
  if (!lineItem) {
    throw new CopilotExecutionError("Budget line item target is required.", 400);
  }

  const exact = budget.lineItems.filter((item) => item.lineItem.trim().toLowerCase() === lineItem.toLowerCase());
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) {
    throw new CopilotExecutionError(`Multiple budget line items named "${lineItem}" were found.`, 400);
  }

  const partial = budget.lineItems.filter((item) => item.lineItem.trim().toLowerCase().includes(lineItem.toLowerCase()));
  if (partial.length === 1) return partial[0];
  if (partial.length > 1) {
    throw new CopilotExecutionError(`Multiple budget line items matched "${lineItem}". Be more specific.`, 400);
  }

  throw new CopilotExecutionError(`Budget line item "${lineItem}" was not found.`, 404);
}

function draftSpeakers(session: Matrix2SessionRecord): Array<{ speakerId?: string; name: string; company?: string | null; email?: string | null }> {
  if (session.speakerAssignments.length > 0) {
    return session.speakerAssignments.map((speaker) => ({
      speakerId: speaker.speakerId,
      name: speaker.name,
      company: speaker.company,
      email: speaker.email,
    }));
  }

  return session.speakers.map((name) => ({ name }));
}

function draftStaff(session: Matrix2SessionRecord): Array<{ personId?: string; name: string; company?: string | null; email?: string | null; role?: string | null }> {
  if (session.staffAssignments.length > 0) {
    return session.staffAssignments.map((staff) => ({
      personId: staff.personId,
      name: staff.name,
      company: staff.company,
      email: staff.email,
      role: staff.assignmentRole,
    }));
  }

  return session.staffAssigned.map((label) => {
    const match = label.match(/^(.*?)\s*\((.*?)\)$/);
    if (match) {
      return {
        name: match[1]!.trim(),
        role: match[2]!.trim(),
      };
    }

    return { name: label.trim() };
  }).filter((entry) => entry.name.length > 0);
}

function draftAv(session: Matrix2SessionRecord): Array<{ avType: string; quantity: number | null }> {
  if (session.avRequirementsStructured.length > 0) {
    return session.avRequirementsStructured.map((entry) => ({
      avType: entry.avType,
      quantity: entry.quantity,
    }));
  }

  return session.avRequirements.map((entry) => {
    const match = entry.match(/^(.*?)\s*\((\d+)\)$/);
    if (match) {
      return {
        avType: match[1]!.trim(),
        quantity: Number(match[2]),
      };
    }

    return {
      avType: entry.trim(),
      quantity: null,
    };
  }).filter((entry) => entry.avType.length > 0);
}

export function toSessionEditPayload(session: Matrix2SessionRecord): Matrix2SessionUpdateInput {
  // updateMatrix2Session is a full-replace: any field omitted here is persisted as
  // its empty/default value (e.g. status -> "", foodAndBeverage -> []). This is the
  // read side of a read-modify-write, so it must carry EVERY field the service
  // consumes, otherwise a copilot mutation of one slice clobbers the others.
  return {
    title: session.title,
    sessionType: session.sessionType,
    status: session.status,
    roomId: session.roomId,
    startTime: session.startTime,
    endTime: session.endTime,
    expectedAttendance: session.expectedAttendance,
    roomSetupType: session.roomSetup,
    speakers: draftSpeakers(session),
    avRequirements: draftAv(session),
    foodService: session.foodService
      ? {
          serviceType: session.foodService.serviceType,
          serviceStyle: session.foodService.serviceStyle,
          headcount: session.foodService.headcount,
        }
      : null,
    foodAndBeverage: session.foodAndBeverage,
    staffAssignments: draftStaff(session),
    notes: session.notes,
  };
}

async function applySessionStructuredUpdate(input: {
  eventId: string;
  session: Matrix2SessionRecord;
  mutate: (payload: Matrix2SessionUpdateInput) => void;
}): Promise<void> {
  const payload = toSessionEditPayload(input.session);
  input.mutate(payload);
  await updateMatrix2Session(input.eventId, input.session.id, payload);
}

async function executeSessionCreate(action: ProposedAction): Promise<ExecutionResult> {
  const eventId = action.scope.eventId;
  if (!eventId) throw new CopilotExecutionError("Event context is required for session.create", 400);

  const sessionName = toText(action.params.sessionName) ?? "New Session";
  const sessionType = toText(action.params.sessionType) ?? "Session";
  const startTime = toText(action.params.startTime) ?? "09:00";
  const durationMinutes = Math.floor(toNumber(action.params.durationMinutes) ?? 60);
  const endTime = toText(action.params.endTime) ?? deriveEndTime(startTime, durationMinutes);
  const date = toText(action.params.date) ?? new Date().toISOString().slice(0, 10);
  const expectedAttendance = toNumber(action.params.expectedAttendance);
  const requestedRoomId = toText(action.params.roomId);
  const requestedRoomName = toText(action.params.roomName);
  const room =
    requestedRoomId || requestedRoomName
      ? await resolveRoom({
          eventId,
          roomId: requestedRoomId,
          roomName: requestedRoomName,
        })
      : null;

  const created = await createMatrixRow(eventId, {
    date,
    startTime,
    endTime,
    roomId: room?.id,
    room: room?.name ?? toText(action.params.roomName) ?? "",
    sessionName,
    setup: toText(action.params.roomSetupType) ?? "",
    attendance: expectedAttendance,
    notes: `Session Type: ${sessionType}`,
  });

  return {
    summary: `Created session "${created.sessionName || sessionName}" in ${created.room || room?.name || "Unassigned"} at ${created.startTime}.`,
    entityId: created.id,
  };
}

async function executeSessionUpdate(action: ProposedAction): Promise<ExecutionResult> {
  const eventId = action.scope.eventId;
  if (!eventId) throw new CopilotExecutionError("Event context is required for session.update", 400);

  const session = await resolveSession({
    eventId,
    sessionId: toText(action.params.sessionId),
    sessionName: toText(action.params.sessionName),
  });

  const resolvedRoom = await resolveRoom({
    eventId,
    roomId: toText(action.params.roomId),
    roomName: toText(action.params.roomName),
  }).catch(() => null);

  const nextStartTime = toText(action.params.startTime);
  const nextEndTime = toText(action.params.endTime);

  const updated = await updateMatrixRow(eventId, session.rowId, {
    ...(toText(action.params.newTitle) ? { sessionName: toText(action.params.newTitle) } : {}),
    ...(nextStartTime ? { startTime: nextStartTime } : {}),
    ...(nextEndTime ? { endTime: nextEndTime } : {}),
    ...(resolvedRoom ? { roomId: resolvedRoom.id, room: resolvedRoom.name } : {}),
    ...(toText(action.params.roomSetupType) ? { setup: toText(action.params.roomSetupType) } : {}),
    ...(toNumber(action.params.expectedAttendance) !== null ? { attendance: toNumber(action.params.expectedAttendance) } : {}),
  });

  return {
    summary: `Updated session "${session.title}" (${updated.startTime}-${updated.endTime}${updated.room ? `, ${updated.room}` : ""}).`,
    entityId: updated.id,
  };
}

async function executeSessionMove(action: ProposedAction): Promise<ExecutionResult> {
  const eventId = action.scope.eventId;
  if (!eventId) throw new CopilotExecutionError("Event context is required for session.move", 400);

  const session = await resolveSession({
    eventId,
    sessionId: toText(action.params.sessionId),
    sessionName: toText(action.params.sessionName),
  });

  const room = await resolveRoom({
    eventId,
    roomId: toText(action.params.roomId),
    roomName: toText(action.params.roomName),
  });
  if (!room) {
    throw new CopilotExecutionError("room.update requires a valid room target.", 400);
  }
  if (!room) {
    throw new CopilotExecutionError("session.move requires a target room.", 400);
  }

  const targetStart = toText(action.params.startTime);
  if (!targetStart) {
    throw new CopilotExecutionError("session.move requires a target startTime.", 400);
  }

  const existingStartMinutes = parseTimeToMinutes(session.startTime);
  const existingEndMinutes = parseTimeToMinutes(session.endTime);
  const defaultDuration = Math.max(15, existingEndMinutes - existingStartMinutes);
  const durationMinutes = Math.floor(toNumber(action.params.durationMinutes) ?? defaultDuration);
  const targetEnd = toText(action.params.endTime) ?? deriveEndTime(targetStart, durationMinutes);

  const updated = await updateMatrixRow(eventId, session.rowId, {
    roomId: room.id,
    room: room.name,
    startTime: targetStart,
    endTime: targetEnd,
  });

  return {
    summary: `Moved session "${session.title}" to ${room.name} at ${updated.startTime}-${updated.endTime}.`,
    entityId: updated.id,
  };
}

async function executeRoomCreate(action: ProposedAction): Promise<ExecutionResult> {
  const eventId = action.scope.eventId;
  if (!eventId) throw new CopilotExecutionError("Event context is required for room.create", 400);

  const roomName = toText(action.params.roomName);
  if (!roomName) {
    throw new CopilotExecutionError("room.create requires roomName.", 400);
  }

  const created = await createRoom(eventId, {
    name: roomName,
    capacity: toNumber(action.params.capacity),
    notes: toText(action.params.notes),
  });

  return {
    summary: `Created room "${created.name}"${created.capacity ? ` (capacity ${created.capacity})` : ""}.`,
    entityId: created.id,
  };
}

async function executeRoomUpdate(action: ProposedAction): Promise<ExecutionResult> {
  const eventId = action.scope.eventId;
  if (!eventId) throw new CopilotExecutionError("Event context is required for room.update", 400);

  const room = await resolveRoom({
    eventId,
    roomId: toText(action.params.roomId),
    roomName: toText(action.params.roomName),
  });
  if (!room) {
    throw new CopilotExecutionError("room.update requires a valid room target.", 400);
  }

  const nextName = toText(action.params.newName) ?? room.name;
  const capacityValue = toNumber(action.params.capacity);

  const updated = await updateRoom(eventId, room.id, {
    name: nextName,
    capacity: capacityValue,
    notes: toText(action.params.notes),
  });

  return {
    summary: `Updated room "${updated.name}"${updated.capacity ? ` (capacity ${updated.capacity})` : ""}.`,
    entityId: updated.id,
  };
}

async function executeSpeakerAssign(action: ProposedAction): Promise<ExecutionResult> {
  const eventId = action.scope.eventId;
  if (!eventId) throw new CopilotExecutionError("Event context is required for speaker.assign", 400);

  const speakerName = toText(action.params.speakerName);
  if (!speakerName) throw new CopilotExecutionError("speaker.assign requires speakerName.", 400);

  const session = await resolveSession({
    eventId,
    sessionId: toText(action.params.sessionId),
    sessionName: toText(action.params.sessionName),
  });

  await applySessionStructuredUpdate({
    eventId,
    session,
    mutate: (payload) => {
      const existing = Array.isArray(payload.speakers) ? payload.speakers as Array<{ speakerId?: string; name: string }> : [];
      const found = existing.some((entry) => entry.name.trim().toLowerCase() === speakerName.toLowerCase());
      if (!found) {
        existing.push({ name: speakerName });
      }
      payload.speakers = existing;
    },
  });

  return {
    summary: `Assigned speaker "${speakerName}" to "${session.title}".`,
    entityId: session.id,
  };
}

async function executeStaffAssign(action: ProposedAction): Promise<ExecutionResult> {
  const eventId = action.scope.eventId;
  if (!eventId) throw new CopilotExecutionError("Event context is required for staff.assign", 400);

  const staffName = toText(action.params.staffName);
  if (!staffName) throw new CopilotExecutionError("staff.assign requires staffName.", 400);
  const staffRole = toText(action.params.staffRole);

  const session = await resolveSession({
    eventId,
    sessionId: toText(action.params.sessionId),
    sessionName: toText(action.params.sessionName),
  });

  await applySessionStructuredUpdate({
    eventId,
    session,
    mutate: (payload) => {
      const existing = Array.isArray(payload.staffAssignments)
        ? payload.staffAssignments as Array<{ personId?: string; name: string; role?: string | null }>
        : [];
      const found = existing.find((entry) => entry.name.trim().toLowerCase() === staffName.toLowerCase());
      if (found) {
        if (staffRole) {
          found.role = staffRole;
        }
      } else {
        existing.push({ name: staffName, ...(staffRole ? { role: staffRole } : {}) });
      }
      payload.staffAssignments = existing;
    },
  });

  return {
    summary: `Assigned staff "${staffName}"${staffRole ? ` as ${staffRole}` : ""} to "${session.title}".`,
    entityId: session.id,
  };
}

async function executeRoomSetupSet(action: ProposedAction): Promise<ExecutionResult> {
  const eventId = action.scope.eventId;
  if (!eventId) throw new CopilotExecutionError("Event context is required for roomSetup.set", 400);

  const setupType = toText(action.params.roomSetupType);
  if (!setupType) throw new CopilotExecutionError("roomSetup.set requires roomSetupType.", 400);

  const session = await resolveSession({
    eventId,
    sessionId: toText(action.params.sessionId),
    sessionName: toText(action.params.sessionName),
  });

  await applySessionStructuredUpdate({
    eventId,
    session,
    mutate: (payload) => {
      payload.roomSetupType = setupType;
    },
  });

  return {
    summary: `Set room setup for "${session.title}" to ${setupType}.`,
    entityId: session.id,
  };
}

async function executeFoodServiceSet(action: ProposedAction): Promise<ExecutionResult> {
  const eventId = action.scope.eventId;
  if (!eventId) throw new CopilotExecutionError("Event context is required for foodService.set", 400);

  const serviceType = toText(action.params.serviceType);
  if (!serviceType) throw new CopilotExecutionError("foodService.set requires serviceType.", 400);

  const session = await resolveSession({
    eventId,
    sessionId: toText(action.params.sessionId),
    sessionName: toText(action.params.sessionName),
  });

  await applySessionStructuredUpdate({
    eventId,
    session,
    mutate: (payload) => {
      payload.foodService = {
        serviceType,
        serviceStyle: toText(action.params.serviceStyle),
        headcount: toNumber(action.params.headcount),
      };
    },
  });

  return {
    summary: `Set food service for "${session.title}" to ${serviceType}.`,
    entityId: session.id,
  };
}

async function executeBudgetLineItemCreate(action: ProposedAction): Promise<ExecutionResult> {
  const eventId = action.scope.eventId;
  if (!eventId) throw new CopilotExecutionError("Event context is required for budgetLineItem.create", 400);

  const lineItem = toText(action.params.lineItem);
  if (!lineItem) throw new CopilotExecutionError("budgetLineItem.create requires lineItem.", 400);

  const created = await addLineItem(eventId, {
    lineItem,
    category: toText(action.params.category) ?? "Operations",
    subcategory: toText(action.params.subcategory) ?? "General",
    vendor: toText(action.params.vendor),
    forecastCents: toNumber(action.params.forecastCents) ?? 0,
    actualCents: toNumber(action.params.actualCents) ?? 0,
  });

  return {
    summary: `Created budget line item "${created.lineItem}".`,
    entityId: created.id,
  };
}

async function executeBudgetLineItemUpdate(action: ProposedAction): Promise<ExecutionResult> {
  const eventId = action.scope.eventId;
  if (!eventId) throw new CopilotExecutionError("Event context is required for budgetLineItem.update", 400);

  const existing = await resolveBudgetLineItem({
    eventId,
    lineItemId: toText(action.params.lineItemId),
    lineItem: toText(action.params.lineItem),
  });

  const updated = await updateLineItem(eventId, existing.id, {
    ...(toText(action.params.category) ? { category: toText(action.params.category) } : {}),
    ...(toText(action.params.subcategory) ? { subcategory: toText(action.params.subcategory) } : {}),
    ...(toText(action.params.newLineItem) ? { lineItem: toText(action.params.newLineItem) } : {}),
    ...(toText(action.params.vendor) ? { vendor: toText(action.params.vendor) } : {}),
    ...(toNumber(action.params.forecastCents) !== null ? { forecastCents: toNumber(action.params.forecastCents) } : {}),
    ...(toNumber(action.params.actualCents) !== null ? { actualCents: toNumber(action.params.actualCents) } : {}),
  });

  return {
    summary: `Updated budget line item "${updated.lineItem}".`,
    entityId: updated.id,
  };
}

async function executeNoteAdd(action: ProposedAction): Promise<ExecutionResult> {
  const eventId = action.scope.eventId;
  if (!eventId) throw new CopilotExecutionError("Event context is required for note.add", 400);

  const noteText = toText(action.params.noteText);
  if (!noteText) throw new CopilotExecutionError("note.add requires noteText.", 400);

  const session = await resolveSession({
    eventId,
    sessionId: toText(action.params.sessionId),
    sessionName: toText(action.params.sessionName),
  });

  await applySessionStructuredUpdate({
    eventId,
    session,
    mutate: (payload) => {
      const existingNotes = toText(payload.notes) ?? "";
      payload.notes = existingNotes ? `${existingNotes}\n\n${noteText}` : noteText;
    },
  });

  return {
    summary: `Added note to "${session.title}".`,
    entityId: session.id,
  };
}

export async function executeProposedAction(action: ProposedAction): Promise<ExecutionResult> {
  switch (action.actionType) {
    case "session.create":
      return executeSessionCreate(action);
    case "session.update":
      return executeSessionUpdate(action);
    case "session.move":
      return executeSessionMove(action);
    case "room.create":
      return executeRoomCreate(action);
    case "room.update":
      return executeRoomUpdate(action);
    case "speaker.assign":
      return executeSpeakerAssign(action);
    case "staff.assign":
      return executeStaffAssign(action);
    case "roomSetup.set":
      return executeRoomSetupSet(action);
    case "foodService.set":
      return executeFoodServiceSet(action);
    case "budgetLineItem.create":
      return executeBudgetLineItemCreate(action);
    case "budgetLineItem.update":
      return executeBudgetLineItemUpdate(action);
    case "note.add":
      return executeNoteAdd(action);
    default:
      throw new CopilotExecutionError("Unsupported action type", 400);
  }
}
