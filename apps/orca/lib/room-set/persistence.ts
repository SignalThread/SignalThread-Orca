import type { RoomSetDocumentV1 } from "./spatial-types";

const STORAGE_PREFIX = "planner.roomSet:v1";

function getBrowserLocalStorage(): Storage | null {
  try {
    if (typeof globalThis === "undefined") return null;

    return "localStorage" in globalThis ? globalThis.localStorage : null;

  } catch {

    return null;

  }

}

export function roomSetStorageKey(eventId: string, sessionId: string): string {
  return `${STORAGE_PREFIX}:${eventId}:${sessionId}`;
}

export function loadRoomSetDocument(eventId: string, sessionId: string): RoomSetDocumentV1 | null {
  const storage = getBrowserLocalStorage();

  if (!storage) return null;

  try {
    const raw = storage.getItem(roomSetStorageKey(eventId, sessionId));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as unknown;
    return validateStub(parsed);
  } catch {
    return null;
  }
}

export function persistRoomSetDocument(eventId: string, sessionId: string, doc: RoomSetDocumentV1): boolean {
  const storage = getBrowserLocalStorage();

  if (!storage) return false;

  try {
    storage.setItem(roomSetStorageKey(eventId, sessionId), JSON.stringify(doc));
    return true;
  } catch {
    // Quota / Safari private mode / disabled storage
    return false;
  }
}

function validateStub(value: unknown): RoomSetDocumentV1 | null {
  if (
    typeof value === "object" &&
    value !== null &&
    "version" in value &&
    (value as Record<string, unknown>).version === 1 &&
    "layouts" in value &&
    typeof (value as Record<string, unknown>).layouts === "object" &&
    (value as Record<string, unknown>).layouts !== null &&
    "activeLayoutId" in value &&
    typeof (value as Record<string, unknown>).activeLayoutId === "string"
  ) {
    return value as RoomSetDocumentV1;
  }

  return null;
}
