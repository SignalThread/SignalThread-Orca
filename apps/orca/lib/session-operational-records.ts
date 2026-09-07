import { SessionOptionalModule } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";

const SUPPORTED_MODULES = new Set<SessionOptionalModule>([
  SessionOptionalModule.ACCESSIBILITY,
  SessionOptionalModule.VENDOR_AND_PRODUCTION,
]);

export class SessionOperationalRecordError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

function optionalText(value: unknown) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
}
function moduleFrom(value: unknown): SessionOptionalModule {
  if (value !== SessionOptionalModule.ACCESSIBILITY && value !== SessionOptionalModule.VENDOR_AND_PRODUCTION) {
    throw new SessionOperationalRecordError("This session operations module is not available here");
  }
  return value;
}
async function assertSession(eventId: string, sessionId: string) {
  const session = await getPrisma().matrixRow.findFirst({ where: { id: sessionId, eventId, archivedAt: null }, select: { id: true } });
  if (!session) throw new SessionOperationalRecordError("Session not found", 404);
}
async function assertOwner(eventId: string, ownerPersonId: string | null) {
  if (!ownerPersonId) return null;
  const person = await getPrisma().eventPerson.findFirst({ where: { id: ownerPersonId, eventId }, select: { id: true } });
  if (!person) throw new SessionOperationalRecordError("Owner must belong to this event");
  return person.id;
}
function date(value: unknown) {
  const text = optionalText(value); if (!text) return null;
  const parsed = new Date(text); if (Number.isNaN(parsed.getTime())) throw new SessionOperationalRecordError("Invalid arrival time");
  return parsed;
}

export async function listSessionOperationalRecords(eventId: string, sessionId: string, module: unknown) {
  const resolvedModule = moduleFrom(module); await assertSession(eventId, sessionId);
  return getPrisma().sessionOperationalRecord.findMany({
    where: { eventId, sessionId, module: resolvedModule }, orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    include: { ownerPerson: { select: { id: true, name: true } } },
  });
}

export async function createSessionOperationalRecord(eventId: string, sessionId: string, module: unknown, input: Record<string, unknown>) {
  const resolvedModule = moduleFrom(module); await assertSession(eventId, sessionId);
  const title = optionalText(input.title); if (!title) throw new SessionOperationalRecordError("A requirement title is required");
  const ownerPersonId = await assertOwner(eventId, optionalText(input.ownerPersonId));
  return getPrisma().sessionOperationalRecord.create({ data: {
    eventId, sessionId, module: resolvedModule, title, kind: optionalText(input.kind) ?? "OTHER", status: optionalText(input.status) ?? "PENDING",
    ownerPersonId, partnerName: optionalText(input.partnerName), onsiteContact: optionalText(input.onsiteContact), scope: optionalText(input.scope), arrivalAt: date(input.arrivalAt), notes: optionalText(input.notes), documentUrl: optionalText(input.documentUrl),
  }, include: { ownerPerson: { select: { id: true, name: true } } } });
}

export async function updateSessionOperationalRecord(eventId: string, sessionId: string, recordId: string, input: Record<string, unknown>) {
  await assertSession(eventId, sessionId);
  const existing = await getPrisma().sessionOperationalRecord.findFirst({ where: { id: recordId, eventId, sessionId } });
  if (!existing || !SUPPORTED_MODULES.has(existing.module)) throw new SessionOperationalRecordError("Operational record not found", 404);
  const ownerPersonId = input.ownerPersonId === undefined ? undefined : await assertOwner(eventId, optionalText(input.ownerPersonId));
  const title = input.title === undefined ? undefined : optionalText(input.title);
  if (title === null) throw new SessionOperationalRecordError("A requirement title is required");
  const status = input.status === undefined ? undefined : optionalText(input.status);
  return getPrisma().sessionOperationalRecord.update({ where: { id: recordId }, data: {
    ...(title !== undefined ? { title } : {}), ...(input.kind !== undefined ? { kind: optionalText(input.kind) ?? "OTHER" } : {}), ...(status !== undefined ? { status: status ?? "PENDING", confirmedAt: status === "CONFIRMED" ? new Date() : null } : {}),
    ...(ownerPersonId !== undefined ? { ownerPersonId } : {}), ...(input.partnerName !== undefined ? { partnerName: optionalText(input.partnerName) } : {}), ...(input.onsiteContact !== undefined ? { onsiteContact: optionalText(input.onsiteContact) } : {}), ...(input.scope !== undefined ? { scope: optionalText(input.scope) } : {}), ...(input.arrivalAt !== undefined ? { arrivalAt: date(input.arrivalAt) } : {}), ...(input.notes !== undefined ? { notes: optionalText(input.notes) } : {}), ...(input.documentUrl !== undefined ? { documentUrl: optionalText(input.documentUrl) } : {}),
  }, include: { ownerPerson: { select: { id: true, name: true } } } });
}

export async function removeSessionOperationalRecord(eventId: string, sessionId: string, recordId: string) {
  await assertSession(eventId, sessionId);
  const removed = await getPrisma().sessionOperationalRecord.deleteMany({ where: { id: recordId, eventId, sessionId, module: { in: [...SUPPORTED_MODULES] } } });
  if (removed.count !== 1) throw new SessionOperationalRecordError("Operational record not found", 404);
}
