/**
 * Registration integration foundation — PROVIDER-AGNOSTIC.
 *
 * No real provider (Aura/Bizzabo/etc.) is implemented. This layer models the
 * connection + capability flags and a tiny adapter seam so future providers plug
 * in without changing the attendee core. Capability flags — not provider names —
 * drive whether the UI/service may sync in or write back. The attendee core never
 * assumes writeback exists.
 */
import {
  type EventIntegrationConnection,
  type EventIntegrationConnectionStatus,
  type EventIntegrationSyncMode,
} from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { assertEventAccessForUser, type EventAccessUser } from "@/lib/event-access";
import { recordEventActivity } from "@/src/server/services/event-activity";

export type IntegrationUser = EventAccessUser;

export class EventIntegrationError extends Error {
  constructor(message: string, public readonly status = 400, public readonly code = "EVENT_INTEGRATION_ERROR") {
    super(message);
    this.name = "EventIntegrationError";
  }
}

const SAFE_PROVIDER = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const SAFE_OBJECT_TYPE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;
const CONNECTION_STATUSES: EventIntegrationConnectionStatus[] = ["NOT_CONNECTED", "CONNECTED", "ERROR", "DISABLED"];
const SYNC_MODES: EventIntegrationSyncMode[] = ["READ_ONLY", "READ_WRITE", "MANUAL"];

function normalizedProvider(value: unknown): string {
  if (typeof value !== "string") throw new EventIntegrationError("provider is required", 400, "INVALID_PROVIDER");
  const provider = value.trim().toLowerCase();
  if (!SAFE_PROVIDER.test(provider)) throw new EventIntegrationError("provider must use 1–64 letters, numbers, dots, underscores, or hyphens", 400, "INVALID_PROVIDER");
  return provider;
}

function normalizedOptionalExternalId(value: unknown, field: string): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new EventIntegrationError(`${field} must be text or null`, 400, "INVALID_EXTERNAL_ID");
  const normalized = value.trim();
  if (!normalized || normalized.length > 200 || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new EventIntegrationError(`${field} must be 1–200 supported characters`, 400, "INVALID_EXTERNAL_ID");
  }
  return normalized;
}

export function normalizeCapabilities(value: unknown): RegistrationProviderCapabilities {
  if (value == null) return { ...NO_CAPABILITIES };
  if (typeof value !== "object" || Array.isArray(value)) throw new EventIntegrationError("capabilities must be an object", 400, "INVALID_CAPABILITIES");
  const input = value as Record<string, unknown>;
  const unknown = Object.keys(input).find((key) => !CAPABILITY_KEYS.includes(key as keyof RegistrationProviderCapabilities));
  if (unknown) throw new EventIntegrationError(`Unknown capability: ${unknown}`, 400, "INVALID_CAPABILITIES");
  const output = { ...NO_CAPABILITIES };
  for (const key of CAPABILITY_KEYS) {
    const entry = input[key];
    if (entry !== undefined && typeof entry !== "boolean") throw new EventIntegrationError(`${key} must be true or false`, 400, "INVALID_CAPABILITIES");
    if (typeof entry === "boolean") output[key] = entry;
  }
  return output;
}

// ---------------------------------------------------------------------------
// Capabilities (pure, provider-agnostic)
// ---------------------------------------------------------------------------

export type RegistrationProviderCapabilities = {
  canPullAttendees: boolean;
  canCreateAttendees: boolean;
  canUpdateAttendees: boolean;
  canCancelAttendees: boolean;
  canPullSessions: boolean;
  canPushSessions: boolean;
  canPullSessionRegistrations: boolean;
  canPushSessionRegistrations: boolean;
  supportsWebhooks: boolean;
  supportsOrders: boolean;
  supportsBadgeTypes: boolean;
};

export const CAPABILITY_KEYS: (keyof RegistrationProviderCapabilities)[] = [
  "canPullAttendees", "canCreateAttendees", "canUpdateAttendees", "canCancelAttendees",
  "canPullSessions", "canPushSessions", "canPullSessionRegistrations", "canPushSessionRegistrations",
  "supportsWebhooks", "supportsOrders", "supportsBadgeTypes",
];

export const NO_CAPABILITIES: RegistrationProviderCapabilities = {
  canPullAttendees: false, canCreateAttendees: false, canUpdateAttendees: false, canCancelAttendees: false,
  canPullSessions: false, canPushSessions: false, canPullSessionRegistrations: false, canPushSessionRegistrations: false,
  supportsWebhooks: false, supportsOrders: false, supportsBadgeTypes: false,
};

export type CapabilityInterpretation = {
  canSyncIn: boolean;
  canWriteback: boolean;
  isReadOnly: boolean;
};

/** Derive behavior from capability flags. Read-only when no writeback is supported. */
export function interpretCapabilities(c: RegistrationProviderCapabilities): CapabilityInterpretation {
  const canSyncIn = c.canPullAttendees || c.canPullSessions || c.canPullSessionRegistrations;
  const canWriteback = c.canCreateAttendees || c.canUpdateAttendees || c.canCancelAttendees || c.canPushSessions || c.canPushSessionRegistrations;
  return { canSyncIn, canWriteback, isReadOnly: !canWriteback };
}

export type AttendeeOwnership = "local" | "imported" | "integration_owned";

/** Where does an attendee's truth live? local (planner-owned) / imported / integration-owned. */
export function attendeeOwnership(args: { source: string; syncStatus: string; hasExternalIdentity: boolean }): AttendeeOwnership {
  if (args.source === "REGISTRATION_INTEGRATION" || args.hasExternalIdentity) return "integration_owned";
  if (args.source === "CSV_IMPORT" || ["SYNCED", "READ_ONLY_EXTERNAL"].includes(args.syncStatus)) return "imported";
  return "local";
}

/** Can a planner edit this attendee locally? Local/imported always yes; integration-owned
 *  only when the provider capabilities support writeback. Never pretends otherwise. */
export function isLocallyEditable(ownership: AttendeeOwnership, capabilities: RegistrationProviderCapabilities): boolean {
  if (ownership !== "integration_owned") return true;
  return interpretCapabilities(capabilities).canWriteback;
}

// ---------------------------------------------------------------------------
// Provider adapter seam (no providers implemented yet)
// ---------------------------------------------------------------------------

export interface RegistrationProviderAdapter {
  readonly provider: string;
  capabilities(): RegistrationProviderCapabilities;
  // Future: pullAttendees(ctx), pushAttendee(ctx, attendee), cancelAttendee(ctx, ...), etc.
}

// Intentionally empty — future Aura/Bizzabo/etc. adapters register here.
const PROVIDER_ADAPTERS: Record<string, RegistrationProviderAdapter> = {};

export function getRegistrationProviderAdapter(provider: string): RegistrationProviderAdapter | null {
  return PROVIDER_ADAPTERS[normalizedProvider(provider)] ?? null;
}

// ---------------------------------------------------------------------------
// Connection persistence
// ---------------------------------------------------------------------------

export function capabilitiesFromConnection(c: RegistrationProviderCapabilities): RegistrationProviderCapabilities {
  return {
    canPullAttendees: c.canPullAttendees, canCreateAttendees: c.canCreateAttendees, canUpdateAttendees: c.canUpdateAttendees,
    canCancelAttendees: c.canCancelAttendees, canPullSessions: c.canPullSessions, canPushSessions: c.canPushSessions,
    canPullSessionRegistrations: c.canPullSessionRegistrations, canPushSessionRegistrations: c.canPushSessionRegistrations,
    supportsWebhooks: c.supportsWebhooks, supportsOrders: c.supportsOrders, supportsBadgeTypes: c.supportsBadgeTypes,
  };
}

export async function listEventIntegrationConnections(args: { eventId: string; user: IntegrationUser }): Promise<EventIntegrationConnection[]> {
  await assertEventAccessForUser(args.eventId, args.user, "read");
  return getPrisma().eventIntegrationConnection.findMany({ where: { eventId: args.eventId }, orderBy: { provider: "asc" } });
}

export async function upsertEventIntegrationConnection(args: {
  eventId: string;
  user: IntegrationUser;
  provider: string;
  externalEventId?: string | null;
  connectionStatus?: unknown;
  syncMode?: unknown;
  capabilities?: unknown;
}): Promise<EventIntegrationConnection> {
  await assertEventAccessForUser(args.eventId, args.user, "write");
  const provider = normalizedProvider(args.provider);
  const caps = normalizeCapabilities(args.capabilities);
  const connectionStatus = args.connectionStatus ?? "NOT_CONNECTED";
  const syncMode = args.syncMode ?? "READ_ONLY";
  if (typeof connectionStatus !== "string" || !CONNECTION_STATUSES.includes(connectionStatus as EventIntegrationConnectionStatus)) throw new EventIntegrationError("Invalid connectionStatus", 400, "INVALID_STATUS");
  if (typeof syncMode !== "string" || !SYNC_MODES.includes(syncMode as EventIntegrationSyncMode)) throw new EventIntegrationError("Invalid syncMode", 400, "INVALID_SYNC_MODE");
  const data = {
    externalEventId: normalizedOptionalExternalId(args.externalEventId, "externalEventId"),
    connectionStatus: connectionStatus as EventIntegrationConnectionStatus,
    syncMode: syncMode as EventIntegrationSyncMode,
    ...caps,
  };

  const existing = await getPrisma().eventIntegrationConnection.findUnique({
    where: { eventId_provider: { eventId: args.eventId, provider } },
    select: { id: true, connectionStatus: true },
  });

  return getPrisma().$transaction(async (tx) => {
    const connection = await tx.eventIntegrationConnection.upsert({
      where: { eventId_provider: { eventId: args.eventId, provider } },
      update: data,
      create: { eventId: args.eventId, provider, createdByUserId: args.user.id, ...data },
    });

    // Status-aware action; never records provider secrets/tokens/capabilities payloads.
    const disconnected = data.connectionStatus === "NOT_CONNECTED";
    await recordEventActivity(tx, {
      eventId: args.eventId,
      actor: { kind: "USER", userId: args.user.id },
      module: "INTEGRATIONS",
      action: !existing ? "CREATED" : disconnected ? "UNLINKED" : "UPDATED",
      entityType: "IntegrationConnection",
      entityId: connection.id,
      entityLabel: provider,
      message: !existing
        ? `Configured ${provider} integration`
        : disconnected
          ? `Disconnected ${provider} integration`
          : `Updated ${provider} integration (${data.connectionStatus})`,
    });

    return connection;
  });
}

/** Idempotently map a provider's external object id to a Directory person (and optionally an attendee). */
export async function linkExternalIdentity(args: {
  eventId: string;
  user?: IntegrationUser;
  directoryPersonId: string;
  attendeeId?: string | null;
  provider: string;
  externalObjectType: string;
  externalObjectId: string;
}): Promise<{ created: boolean; id: string }> {
  if (args.user) await assertEventAccessForUser(args.eventId, args.user, "write");
  const provider = normalizedProvider(args.provider);
  const externalObjectType = normalizedOptionalExternalId(args.externalObjectType, "externalObjectType");
  const externalObjectId = normalizedOptionalExternalId(args.externalObjectId, "externalObjectId");
  if (!externalObjectType || !SAFE_OBJECT_TYPE.test(externalObjectType)) throw new EventIntegrationError("externalObjectType must use 1–64 letters, numbers, dots, underscores, or hyphens", 400, "INVALID_OBJECT_TYPE");
  if (!externalObjectId) throw new EventIntegrationError("externalObjectId is required", 400, "INVALID_EXTERNAL_ID");
  return getPrisma().$transaction(async (tx) => {
    const lockKey = `${args.eventId}:${provider}:${externalObjectType}:${externalObjectId}`;
    await tx.$queryRaw<Array<{ locked: boolean }>>`SELECT true AS "locked" FROM pg_advisory_xact_lock(hashtext(${lockKey}))`;
    const [person, attendee] = await Promise.all([
      tx.eventDirectoryPerson.findFirst({ where: { id: args.directoryPersonId, eventId: args.eventId, deletedAt: null }, select: { id: true } }),
      args.attendeeId ? tx.eventAttendee.findFirst({ where: { id: args.attendeeId, eventId: args.eventId, directoryPersonId: args.directoryPersonId }, select: { id: true } }) : Promise.resolve(null),
    ]);
    if (!person) throw new EventIntegrationError("Directory person not found in this event", 404, "DIRECTORY_PERSON_NOT_FOUND");
    if (args.attendeeId && !attendee) throw new EventIntegrationError("Attendee not found for this person in this event", 404, "ATTENDEE_NOT_FOUND");
    const where = { eventId_provider_externalObjectType_externalObjectId: { eventId: args.eventId, provider, externalObjectType, externalObjectId } };
    const existing = await tx.eventExternalIdentity.findUnique({ where, select: { id: true, directoryPersonId: true } });
    if (existing && existing.directoryPersonId !== args.directoryPersonId) {
      throw new EventIntegrationError("External identity is already linked to another person", 409, "IDENTITY_CONFLICT");
    }
    const identity = await tx.eventExternalIdentity.upsert({
      where,
      update: { lastSeenAt: new Date(), attendeeId: args.attendeeId ?? undefined },
      create: { eventId: args.eventId, directoryPersonId: args.directoryPersonId, attendeeId: args.attendeeId ?? null, provider, externalObjectType, externalObjectId, lastSeenAt: new Date() },
      select: { id: true },
    });
    return { created: !existing, id: identity.id };
  });
}
