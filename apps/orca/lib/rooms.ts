import { Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";

export class RoomError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export type RoomRecord = {
  id: string;
  eventId: string;
  name: string;
  capacity: number | null;
  roomSetNotes: string | null;
  roomSetInternalNotes: string | null;
  createdAt: string;
  updatedAt: string;
};

type CreateRoomInput = {
  name?: unknown;
  capacity?: unknown;
  notes?: unknown;
  roomSetNotes?: unknown;
  roomSetInternalNotes?: unknown;
};

type UpdateRoomInput = {
  name?: unknown;
  capacity?: unknown;
  notes?: unknown;
  roomSetNotes?: unknown;
  roomSetInternalNotes?: unknown;
};

function normalizeName(value: unknown): string {
  if (typeof value !== "string") {
    throw new RoomError("Room name is required", 400);
  }

  const normalized = value.trim();
  if (!normalized) {
    throw new RoomError("Room name is required", 400);
  }

  return normalized;
}

function normalizeCapacity(value: unknown): number | null {
  if (typeof value === "undefined" || value === null || String(value).trim() === "") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new RoomError("Capacity must be a positive whole number", 400);
  }

  return parsed;
}

function normalizeOptionalNotes(value: unknown, fieldName: string): string | null {
  if (typeof value === "undefined" || value === null || value === "") return null;
  if (typeof value !== "string") throw new RoomError(`${fieldName} must be text`, 400);
  return value;
}

function toRecord(room: {
  id: string;
  eventId: string;
  name: string;
  capacity: number | null;
  roomSetNotes: string | null;
  roomSetInternalNotes: string | null;
  createdAt: Date;
  updatedAt: Date;
}): RoomRecord {
  return {
    id: room.id,
    eventId: room.eventId,
    name: room.name,
    capacity: room.capacity,
    roomSetNotes: room.roomSetNotes,
    roomSetInternalNotes: room.roomSetInternalNotes,
    createdAt: room.createdAt.toISOString(),
    updatedAt: room.updatedAt.toISOString(),
  };
}

async function ensureEventExists(eventId: string): Promise<void> {
  const event = await getPrisma().event.findUnique({
    where: { id: eventId },
    select: { id: true },
  });

  if (!event) {
    throw new RoomError("Event not found", 404);
  }
}

export async function listRooms(eventId: string): Promise<RoomRecord[]> {
  await ensureEventExists(eventId);

  const rooms = await getPrisma().room.findMany({
    where: { eventId },
    orderBy: { name: "asc" },
    select: {
      id: true,
      eventId: true,
      name: true,
      capacity: true,
      roomSetNotes: true,
      roomSetInternalNotes: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return rooms.map(toRecord);
}

export async function createRoom(eventId: string, input: CreateRoomInput): Promise<RoomRecord> {
  await ensureEventExists(eventId);

  const name = normalizeName(input.name);
  const capacity = normalizeCapacity(input.capacity);
  const roomSetNotes = normalizeOptionalNotes(input.roomSetNotes, "roomSetNotes");
  const roomSetInternalNotes = normalizeOptionalNotes(input.roomSetInternalNotes, "roomSetInternalNotes");

  // Legacy notes remain deliberately non-authoritative. Visibility-safe room-set
  // fields are explicit so internal content can never enter operational exports.
  void input.notes;

  const duplicate = await getPrisma().room.findFirst({
    where: {
      eventId,
      name: {
        equals: name,
        mode: "insensitive",
      },
    },
    select: { id: true },
  });

  if (duplicate) {
    throw new RoomError("Room name already exists for this event", 409);
  }

  try {
    const created = await getPrisma().room.create({
      data: {
        eventId,
        name,
        capacity,
        roomSetNotes,
        roomSetInternalNotes,
      },
      select: {
        id: true,
        eventId: true,
        name: true,
        capacity: true,
        roomSetNotes: true,
        roomSetInternalNotes: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return toRecord(created);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new RoomError("Room name already exists for this event", 409);
    }

    throw error;
  }
}

export async function updateRoom(eventId: string, roomId: string, input: UpdateRoomInput): Promise<RoomRecord> {
  await ensureEventExists(eventId);

  const existing = await getPrisma().room.findFirst({
    where: {
      id: roomId,
      eventId,
    },
    select: { id: true },
  });
  if (!existing) {
    throw new RoomError("Room not found", 404);
  }

  const name = normalizeName(input.name);
  const capacity = normalizeCapacity(input.capacity);
  const roomSetNotes = typeof input.roomSetNotes === "undefined"
    ? undefined
    : normalizeOptionalNotes(input.roomSetNotes, "roomSetNotes");
  const roomSetInternalNotes = typeof input.roomSetInternalNotes === "undefined"
    ? undefined
    : normalizeOptionalNotes(input.roomSetInternalNotes, "roomSetInternalNotes");

  // Legacy notes remain non-authoritative; callers must choose the visibility-safe field.
  void input.notes;

  const duplicate = await getPrisma().room.findFirst({
    where: {
      eventId,
      id: { not: roomId },
      name: {
        equals: name,
        mode: "insensitive",
      },
    },
    select: { id: true },
  });

  if (duplicate) {
    throw new RoomError("Room name already exists for this event", 409);
  }

  try {
    const updated = await getPrisma().room.update({
      where: { id: roomId },
      data: {
        name,
        capacity,
        ...(typeof roomSetNotes === "undefined" ? {} : { roomSetNotes }),
        ...(typeof roomSetInternalNotes === "undefined" ? {} : { roomSetInternalNotes }),
      },
      select: {
        id: true,
        eventId: true,
        name: true,
        capacity: true,
        roomSetNotes: true,
        roomSetInternalNotes: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return toRecord(updated);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new RoomError("Room name already exists for this event", 409);
    }

    throw error;
  }
}

/**
 * Deletes an empty room only. Matrix rows are sessions in the Run of Show, so
 * they must be deliberately moved or removed before their room can go away.
 */
export async function deleteRoom(eventId: string, roomId: string): Promise<void> {
  await ensureEventExists(eventId);

  const room = await getPrisma().room.findFirst({
    where: {
      id: roomId,
      eventId,
    },
    select: { id: true },
  });

  if (!room) {
    throw new RoomError("Room not found", 404);
  }

  // This is the authoritative guard. The board's displayed count is only
  // advisory; another user may assign a session between opening the dialog and
  // confirming deletion.
  const sessionCount = await getPrisma().matrixRow.count({
    where: {
      eventId,
      roomId,
    },
  });

  if (sessionCount > 0) {
    throw new RoomError(
      `This room contains ${sessionCount} session${sessionCount === 1 ? "" : "s"}. Reassign or remove those sessions before deleting it.`,
      409,
    );
  }

  await getPrisma().room.delete({ where: { id: roomId } });
}
