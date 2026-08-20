import type { LayoutSpec } from "./layout-spec";
import type { RoomSetEventIntentId } from "./planner-intent-shared";

export type MatrixRoomSetupKind =
  | "theater"
  | "classroom"
  | "workshop_or_meeting"
  | "banquet"
  | "networking_reception"
  | "boardroom";

export type MatrixRoomSetupAlias = Readonly<{
  kind: MatrixRoomSetupKind;
  archetype: RoomSetEventIntentId;
}>;

export type RoomSetMatrixSeedSession = Readonly<{
  roomSetup?: string | null;
  expectedAttendance?: number | null;
}>;

export type PrototypeRoomSetInitialState = Readonly<{
  shouldSeedFromMatrix: boolean;
  attendeeCount: number | null;
  selectedEventIntent: RoomSetEventIntentId | null;
  setupKind: MatrixRoomSetupKind | null;
}>;

const SETUP_ALIASES: Record<string, MatrixRoomSetupAlias> = {
  theater: { kind: "theater", archetype: "general_session" },
  classroom: { kind: "classroom", archetype: "general_session" },
  ushape: { kind: "workshop_or_meeting", archetype: "workshop" },
  banquet: { kind: "banquet", archetype: "banquet_remarks" },
  rounds: { kind: "banquet", archetype: "banquet_remarks" },
  cocktail: { kind: "networking_reception", archetype: "networking_reception" },
  networking: { kind: "networking_reception", archetype: "networking_reception" },
  boardroom: { kind: "boardroom", archetype: "workshop" },
};

function setupKey(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function normalizeHeadcount(value: number | null | undefined): number | null {
  if (!Number.isFinite(value) || value == null) return null;
  const rounded = Math.round(value);
  return rounded > 0 ? rounded : null;
}

export function resolveMatrixRoomSetupAlias(label: string | null | undefined): MatrixRoomSetupAlias | null {
  if (!label?.trim()) return null;
  return SETUP_ALIASES[setupKey(label)] ?? null;
}

export function normalizeMatrixRoomSetupKind(label: string | null | undefined): MatrixRoomSetupKind | null {
  return resolveMatrixRoomSetupAlias(label)?.kind ?? null;
}

export function roomSetArchetypeForMatrixSetup(label: string | null | undefined): RoomSetEventIntentId | null {
  return resolveMatrixRoomSetupAlias(label)?.archetype ?? null;
}

export function resolvePrototypeRoomSetInitialState(input: Readonly<{
  session: RoomSetMatrixSeedSession;
  hasLocalDraft: boolean;
  recoveredLayoutSpec?: LayoutSpec | null;
}>): PrototypeRoomSetInitialState {
  if (input.recoveredLayoutSpec) {
    return {
      shouldSeedFromMatrix: false,
      attendeeCount: normalizeHeadcount(input.recoveredLayoutSpec.attendeeTarget),
      selectedEventIntent: input.recoveredLayoutSpec.eventIntent,
      setupKind: null,
    };
  }

  if (input.hasLocalDraft) {
    return {
      shouldSeedFromMatrix: false,
      attendeeCount: null,
      selectedEventIntent: null,
      setupKind: null,
    };
  }

  const alias = resolveMatrixRoomSetupAlias(input.session.roomSetup);
  return {
    shouldSeedFromMatrix: true,
    attendeeCount: normalizeHeadcount(input.session.expectedAttendance),
    selectedEventIntent: alias?.archetype ?? null,
    setupKind: alias?.kind ?? null,
  };
}
