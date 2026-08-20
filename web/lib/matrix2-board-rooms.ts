type Matrix2BoardRoomInput = {
  id: string;
  name: string;
  capacity: number | null;
};

type Matrix2BoardSessionInput = {
  roomId: string | null;
  roomName: string;
  roomCapacity?: number | null;
};

export type Matrix2BoardRoomGroup = Matrix2BoardRoomInput & {
  isVirtual?: boolean;
  virtualRoomKey?: string;
};

const UNASSIGNED_ROOM_NAME = "Unassigned";
const UNASSIGNED_ROOM_KEY = "unassigned-room";

export function normalizeMatrix2VirtualRoomKey(roomName: string): string {
  const normalized = roomName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || UNASSIGNED_ROOM_KEY;
}

function normalizeRoomLabel(roomName: string): string {
  const trimmed = roomName.trim();
  return trimmed.length > 0 ? trimmed : UNASSIGNED_ROOM_NAME;
}

export function deriveMatrix2BoardRoomGroups(
  rooms: Matrix2BoardRoomInput[],
  sessions: Matrix2BoardSessionInput[],
): Matrix2BoardRoomGroup[] {
  const realRoomIds = new Set(rooms.map((room) => room.id));
  const virtualRoomsByKey = new Map<string, Matrix2BoardRoomGroup>();

  for (const session of sessions) {
    const sessionRoomId = session.roomId?.trim() ?? "";
    if (sessionRoomId && realRoomIds.has(sessionRoomId)) continue;

    const roomName = normalizeRoomLabel(session.roomName);
    const virtualRoomKey = normalizeMatrix2VirtualRoomKey(roomName);
    if (virtualRoomsByKey.has(virtualRoomKey)) continue;

    virtualRoomsByKey.set(virtualRoomKey, {
      id: `virtual-room:${virtualRoomKey}`,
      name: roomName,
      capacity: session.roomCapacity ?? null,
      isVirtual: true,
      virtualRoomKey,
    });
  }

  const virtualRooms = [...virtualRoomsByKey.values()].sort((left, right) => {
    if (left.name === UNASSIGNED_ROOM_NAME && right.name !== UNASSIGNED_ROOM_NAME) return 1;
    if (right.name === UNASSIGNED_ROOM_NAME && left.name !== UNASSIGNED_ROOM_NAME) return -1;
    return left.name.localeCompare(right.name);
  });

  return [...rooms, ...virtualRooms];
}
