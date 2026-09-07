import { SessionOptionalModule } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";

export const SESSION_OPTIONAL_MODULES = [
  "ACCESSIBILITY",
  "VENDOR_AND_PRODUCTION",
  "SAFETY_AND_ESCALATION",
] as const satisfies readonly SessionOptionalModule[];

export type SessionOptionalModuleId = (typeof SESSION_OPTIONAL_MODULES)[number];
export type SessionModuleSetting = {
  module: SessionOptionalModuleId;
  enabled: boolean;
  source: "event_default" | "session_override";
};

export class SessionModuleApplicabilityError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

function isOptionalModule(value: unknown): value is SessionOptionalModuleId {
  return typeof value === "string" && SESSION_OPTIONAL_MODULES.includes(value as SessionOptionalModuleId);
}

function assertOptionalModule(value: unknown): asserts value is SessionOptionalModuleId {
  if (!isOptionalModule(value)) throw new SessionModuleApplicabilityError("Unsupported optional session module");
}

async function assertEventSession(eventId: string, sessionId: string) {
  const session = await getPrisma().matrixRow.findFirst({
    where: { id: sessionId, eventId, archivedAt: null },
    select: { id: true },
  });
  if (!session) throw new SessionModuleApplicabilityError("Session not found", 404);
}

export function resolveSessionModuleSettings(
  defaults: Partial<Record<SessionOptionalModuleId, boolean>>,
  overrides: Partial<Record<SessionOptionalModuleId, boolean>>,
): SessionModuleSetting[] {
  return SESSION_OPTIONAL_MODULES.map((module) => {
    const hasOverride = Object.prototype.hasOwnProperty.call(overrides, module);
    return {
      module,
      enabled: hasOverride ? overrides[module] === true : defaults[module] === true,
      source: hasOverride ? "session_override" : "event_default",
    };
  });
}

export async function getSessionModuleSettings(eventId: string, sessionId: string) {
  await assertEventSession(eventId, sessionId);
  const [defaults, overrides] = await Promise.all([
    getPrisma().eventSessionModuleDefault.findMany({ where: { eventId }, select: { module: true, enabled: true } }),
    getPrisma().sessionModuleOverride.findMany({ where: { eventId, sessionId }, select: { module: true, enabled: true } }),
  ]);
  const defaultByModule = Object.fromEntries(defaults.map((row) => [row.module, row.enabled]));
  const overrideByModule = Object.fromEntries(overrides.map((row) => [row.module, row.enabled]));
  return { eventId, sessionId, modules: resolveSessionModuleSettings(defaultByModule, overrideByModule) };
}

export async function updateEventSessionModuleDefaults(
  eventId: string,
  updates: Array<{ module: unknown; enabled: unknown }>,
) {
  if (!Array.isArray(updates) || updates.length === 0) throw new SessionModuleApplicabilityError("At least one module default is required");
  const event = await getPrisma().event.findUnique({ where: { id: eventId }, select: { id: true } });
  if (!event) throw new SessionModuleApplicabilityError("Event not found", 404);
  await getPrisma().$transaction(updates.map((update) => {
    assertOptionalModule(update.module);
    if (typeof update.enabled !== "boolean") throw new SessionModuleApplicabilityError("enabled must be a boolean");
    return getPrisma().eventSessionModuleDefault.upsert({
      where: { eventId_module: { eventId, module: update.module } },
      create: { eventId, module: update.module, enabled: update.enabled },
      update: { enabled: update.enabled },
    });
  }));
}

export async function updateSessionModuleOverride(input: {
  eventId: string;
  sessionId: string;
  module: unknown;
  enabled?: unknown;
  inherit?: unknown;
}) {
  assertOptionalModule(input.module);
  await assertEventSession(input.eventId, input.sessionId);
  if (input.inherit === true) {
    await getPrisma().sessionModuleOverride.deleteMany({
      where: { eventId: input.eventId, sessionId: input.sessionId, module: input.module },
    });
    return getSessionModuleSettings(input.eventId, input.sessionId);
  }
  if (typeof input.enabled !== "boolean") throw new SessionModuleApplicabilityError("enabled must be a boolean");
  await getPrisma().sessionModuleOverride.upsert({
    where: { sessionId_module: { sessionId: input.sessionId, module: input.module } },
    create: { eventId: input.eventId, sessionId: input.sessionId, module: input.module, enabled: input.enabled },
    update: { enabled: input.enabled },
  });
  return getSessionModuleSettings(input.eventId, input.sessionId);
}
