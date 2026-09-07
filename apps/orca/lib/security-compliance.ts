import { getPrisma } from "@/lib/prisma";
import { recordEventActivity } from "@/src/server/services/event-activity";

export const SECURITY_COMPLIANCE_AREAS = ["EMERGENCY_PLAN", "SECURITY_PLAN", "COMPLIANCE_PERMITS"] as const;
export const SECURITY_COMPLIANCE_STATUSES = ["NEEDS_REVIEW", "IN_PROGRESS", "APPROVED", "NOT_STARTED", "CONFIRMED", "AT_RISK"] as const;

export type SecurityComplianceArea = (typeof SECURITY_COMPLIANCE_AREAS)[number];
export type SecurityComplianceStatus = (typeof SECURITY_COMPLIANCE_STATUSES)[number];

export class SecurityComplianceError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "SecurityComplianceError";
  }
}

function parseArea(value: unknown): SecurityComplianceArea {
  if (!SECURITY_COMPLIANCE_AREAS.includes(value as SecurityComplianceArea)) throw new SecurityComplianceError("Unsupported Security & Compliance area");
  return value as SecurityComplianceArea;
}

function parseStatus(value: unknown, fallback: SecurityComplianceStatus): SecurityComplianceStatus {
  if (value === undefined || value === null || value === "") return fallback;
  if (!SECURITY_COMPLIANCE_STATUSES.includes(value as SecurityComplianceStatus)) throw new SecurityComplianceError("Unsupported Security & Compliance status");
  return value as SecurityComplianceStatus;
}

function optionalText(value: unknown): string | null {
  const result = typeof value === "string" ? value.trim() : "";
  return result || null;
}

function optionalDate(value: unknown): Date | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new SecurityComplianceError("Date must be a valid date");
  const parsed = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) throw new SecurityComplianceError("Date must be a valid date");
  return parsed;
}

export function assertSecurityComplianceClient(client: { securityComplianceRecord?: unknown }) {
  if (!client.securityComplianceRecord) {
    throw new SecurityComplianceError(
      "Security & Compliance is temporarily unavailable because the generated data client is out of date. Restart the app after running Prisma generation.",
      503,
    );
  }
}

function prismaWithSecurityCompliance() {
  const prisma = getPrisma();
  assertSecurityComplianceClient(prisma);
  return prisma;
}

export type ReadinessRecord = { status: string; dueDate: Date | string | null };

export function summarizeSecurityComplianceReadiness(records: ReadinessRecord[], now = new Date()) {
  return records.reduce((summary, record) => {
    const ready = record.status === "APPROVED" || record.status === "CONFIRMED";
    const overdue = !ready && Boolean(record.dueDate) && new Date(record.dueDate as Date | string).getTime() < now.getTime();
    if (ready) summary.ready += 1;
    else if (overdue || record.status === "AT_RISK") summary.atRisk += 1;
    else summary.needsWork += 1;
    return summary;
  }, { ready: 0, needsWork: 0, atRisk: 0 });
}

export async function listSecurityComplianceRecords(eventId: string, value?: unknown) {
  const recordArea = value ? parseArea(value) : undefined;
  return prismaWithSecurityCompliance().securityComplianceRecord.findMany({
    where: { eventId, ...(recordArea ? { area: recordArea } : {}) },
    orderBy: [{ status: "asc" }, { dueDate: "asc" }, { updatedAt: "desc" }],
  });
}

export async function createSecurityComplianceRecord(eventId: string, actorUserId: string, input: Record<string, unknown>) {
  const recordArea = parseArea(input.area);
  const title = optionalText(input.title);
  if (!title) throw new SecurityComplianceError("A title is required");
  const prisma = prismaWithSecurityCompliance();
  return prisma.$transaction(async (tx) => {
    const status = parseStatus(input.status, recordArea === "COMPLIANCE_PERMITS" ? "NOT_STARTED" : "NEEDS_REVIEW");
    const record = await tx.securityComplianceRecord.create({ data: {
      eventId, area: recordArea, title, status, owner: optionalText(input.owner), dueDate: optionalDate(input.dueDate),
      reviewedAt: status === "APPROVED" ? new Date() : null, details: optionalText(input.details), evidenceUrl: optionalText(input.evidenceUrl),
    } });
    await recordEventActivity(tx, {
      eventId, actor: { kind: "USER", userId: actorUserId }, module: "EVENT_SETTINGS", action: "CREATED",
      entityType: "SecurityComplianceRecord", entityId: record.id, entityLabel: record.title,
      message: `${recordArea.replaceAll("_", " ")} item created`, source: { type: "SecurityComplianceRecord", id: record.id },
    });
    return record;
  });
}

export async function updateSecurityComplianceRecord(eventId: string, actorUserId: string, id: string, input: Record<string, unknown>) {
  const prisma = prismaWithSecurityCompliance();
  const existing = await prisma.securityComplianceRecord.findFirst({ where: { id, eventId } });
  if (!existing) throw new SecurityComplianceError("Security & Compliance item not found", 404);
  return prisma.$transaction(async (tx) => {
    const status = input.status !== undefined ? parseStatus(input.status, existing.status as SecurityComplianceStatus) : undefined;
    const record = await tx.securityComplianceRecord.update({ where: { id }, data: {
      ...(input.title !== undefined ? { title: optionalText(input.title) ?? existing.title } : {}),
      ...(status ? { status, reviewedAt: status === "APPROVED" ? new Date() : null } : {}),
      ...(input.owner !== undefined ? { owner: optionalText(input.owner) } : {}),
      ...(input.dueDate !== undefined ? { dueDate: optionalDate(input.dueDate) } : {}),
      ...(input.details !== undefined ? { details: optionalText(input.details) } : {}),
      ...(input.evidenceUrl !== undefined ? { evidenceUrl: optionalText(input.evidenceUrl) } : {}),
    } });
    await recordEventActivity(tx, {
      eventId, actor: { kind: "USER", userId: actorUserId }, module: "EVENT_SETTINGS", action: "UPDATED",
      entityType: "SecurityComplianceRecord", entityId: record.id, entityLabel: record.title,
      message: `${existing.area.replaceAll("_", " ")} item updated`, source: { type: "SecurityComplianceRecord", id: record.id },
    });
    return record;
  });
}
