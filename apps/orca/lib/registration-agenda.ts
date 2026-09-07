import {
  Prisma,
  RegistrationAgendaPublicationStatus,
  RegistrationAgendaSource,
} from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import { getPrisma } from "@/lib/prisma";

export class RegistrationAgendaError extends Error {
  constructor(message: string, readonly status = 400, readonly code = "REGISTRATION_AGENDA_ERROR") {
    super(message);
  }
}

export type RegistrationAgendaSpeaker = {
  id: string;
  name: string;
  headshotUrl: string | null;
  bio: string | null;
};

export type RegistrationAgendaHandoffRecord = {
  eventId: string;
  sourceSessionId: string;
  sourceUpdatedAt: Date;
  title: string;
  description: string | null;
  dayDate: Date;
  startTime: Date;
  endTime: Date;
  location: string | null;
  sessionType: string | null;
  officialStatus: string | null;
  speakers: RegistrationAgendaSpeaker[];
};

export type RegistrationAgendaSyncResult = {
  adapter: "INTERNAL_REGISTRATION_STAGING";
  externalSyncSucceeded: false;
  created: number;
  updated: number;
  unchanged: number;
  removed: number;
  invalid: Array<{ sourceSessionId: string; errors: string[] }>;
  warnings: Array<{ sourceSessionId: string; message: string }>;
};

export interface RegistrationAgendaAdapter {
  readonly name: string;
  syncShowOpsAgenda(args: {
    eventId: string;
    actorUserId: string;
    records: RegistrationAgendaHandoffRecord[];
    officialSourceSessionIds: string[];
  }): Promise<Omit<RegistrationAgendaSyncResult, "invalid" | "warnings">>;
}

function noteField(notes: string | null, label: string): string | null {
  if (!notes) return null;
  const match = notes.match(new RegExp(`^\\[${label.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\]\\s*(.+)$`, "im"));
  return match?.[1]?.trim() || null;
}

function normalizedSpeakers(value: unknown): RegistrationAgendaSpeaker[] {
  if (!Array.isArray(value)) return [];
  return value.map((speaker) => {
    const item = speaker && typeof speaker === "object" ? speaker as Record<string, unknown> : {};
    return {
      id: typeof item.id === "string" ? item.id : "",
      name: typeof item.name === "string" ? item.name : "",
      headshotUrl: typeof item.headshotUrl === "string" ? item.headshotUrl : null,
      bio: typeof item.bio === "string" ? item.bio : null,
    };
  });
}

function handoffFingerprint(record: Omit<RegistrationAgendaHandoffRecord, "eventId" | "sourceSessionId" | "sourceUpdatedAt" | "speakers"> & { speakers: unknown }): string {
  return JSON.stringify({
    title: record.title,
    description: record.description,
    dayDate: record.dayDate.toISOString(),
    startTime: record.startTime.toISOString(),
    endTime: record.endTime.toISOString(),
    location: record.location,
    sessionType: record.sessionType,
    officialStatus: record.officialStatus,
    speakers: normalizedSpeakers(record.speakers),
  });
}

export const internalRegistrationAgendaAdapter: RegistrationAgendaAdapter = {
  name: "INTERNAL_REGISTRATION_STAGING",
  async syncShowOpsAgenda({ eventId, actorUserId, records, officialSourceSessionIds }) {
    return getPrisma().$transaction(async (tx) => {
      const existing = await tx.registrationAgendaEntry.findMany({
        where: { eventId, source: RegistrationAgendaSource.SHOWOPS },
      });
      const bySourceSessionId = new Map(existing.map((entry) => [entry.sourceSessionId, entry]));
      let created = 0;
      let updated = 0;
      let unchanged = 0;

      for (const record of records) {
        const current = bySourceSessionId.get(record.sourceSessionId);
        const data = {
          title: record.title,
          description: record.description,
          dayDate: record.dayDate,
          startTime: record.startTime,
          endTime: record.endTime,
          location: record.location,
          sessionType: record.sessionType,
          officialStatus: record.officialStatus,
          speakers: record.speakers as unknown as Prisma.InputJsonValue,
          sourceUpdatedAt: record.sourceUpdatedAt,
          archivedAt: null,
          updatedByUserId: actorUserId,
        };
        if (!current) {
          await tx.registrationAgendaEntry.create({
            data: {
              eventId,
              source: RegistrationAgendaSource.SHOWOPS,
              sourceKey: record.sourceSessionId,
              sourceSessionId: record.sourceSessionId,
              createdByUserId: actorUserId,
              ...data,
            },
          });
          created += 1;
          continue;
        }

        const currentFingerprint = handoffFingerprint({
          title: current.title,
          description: current.description,
          dayDate: current.dayDate,
          startTime: current.startTime,
          endTime: current.endTime,
          location: current.location,
          sessionType: current.sessionType,
          officialStatus: current.officialStatus,
          speakers: current.speakers,
        });
        if (!current.archivedAt && current.sourceUpdatedAt?.getTime() === record.sourceUpdatedAt.getTime()
          && currentFingerprint === handoffFingerprint(record)) {
          unchanged += 1;
          continue;
        }
        await tx.registrationAgendaEntry.update({ where: { id: current.id }, data });
        updated += 1;
      }

      const officialIds = new Set(officialSourceSessionIds);
      const removedEntries = existing.filter((entry) => (
        entry.sourceSessionId && !entry.archivedAt && !officialIds.has(entry.sourceSessionId)
      ));
      if (removedEntries.length > 0) {
        await tx.registrationAgendaEntry.updateMany({
          where: { id: { in: removedEntries.map((entry) => entry.id) } },
          data: {
            archivedAt: new Date(),
            publicationStatus: RegistrationAgendaPublicationStatus.UNPUBLISHED,
            updatedByUserId: actorUserId,
          },
        });
      }

      return {
        adapter: "INTERNAL_REGISTRATION_STAGING" as const,
        externalSyncSucceeded: false as const,
        created,
        updated,
        unchanged,
        removed: removedEntries.length,
      };
    });
  },
};

function validateHandoffRecord(record: RegistrationAgendaHandoffRecord): string[] {
  const errors: string[] = [];
  if (!record.title.trim()) errors.push("Title is required");
  if (!(record.dayDate instanceof Date) || Number.isNaN(record.dayDate.getTime())) errors.push("Date is required");
  if (!(record.startTime instanceof Date) || Number.isNaN(record.startTime.getTime())) errors.push("Start time is required");
  if (!(record.endTime instanceof Date) || Number.isNaN(record.endTime.getTime())) errors.push("End time is required");
  if (record.startTime && record.endTime && record.endTime.getTime() <= record.startTime.getTime()) {
    errors.push("End time must be after start time");
  }
  return errors;
}

export async function syncShowOpsAgendaToRegistration(
  eventId: string,
  actorUserId: string,
  adapter: RegistrationAgendaAdapter = internalRegistrationAgendaAdapter,
): Promise<RegistrationAgendaSyncResult> {
  const sessions = await getPrisma().matrixRow.findMany({
    where: { eventId, archivedAt: null, includeInOfficialAgenda: true },
    orderBy: [{ dayDate: "asc" }, { startTime: "asc" }, { id: "asc" }],
    select: {
      id: true,
      eventId: true,
      sessionName: true,
      publicDescription: true,
      dayDate: true,
      startTime: true,
      endTime: true,
      roomName: true,
      notes: true,
      updatedAt: true,
      sessionSpeakerAssignments: {
        select: {
          speaker: { select: { id: true, name: true, headshotUrl: true, bio: true } },
        },
      },
    },
  });

  const invalid: RegistrationAgendaSyncResult["invalid"] = [];
  const warnings: RegistrationAgendaSyncResult["warnings"] = [];
  const records: RegistrationAgendaHandoffRecord[] = [];
  for (const session of sessions) {
    const speakers = session.sessionSpeakerAssignments.map(({ speaker }) => ({
      id: speaker.id,
      name: speaker.name.trim(),
      headshotUrl: speaker.headshotUrl,
      bio: speaker.bio,
    }));
    const record: RegistrationAgendaHandoffRecord = {
      eventId: session.eventId,
      sourceSessionId: session.id,
      sourceUpdatedAt: session.updatedAt,
      title: session.sessionName?.trim() ?? "",
      description: session.publicDescription?.trim() || null,
      dayDate: session.dayDate,
      startTime: session.startTime as Date,
      endTime: session.endTime as Date,
      location: session.roomName?.trim() || null,
      sessionType: noteField(session.notes, "Session Type"),
      officialStatus: noteField(session.notes, "Status"),
      speakers,
    };
    const errors = validateHandoffRecord(record);
    if (errors.length > 0) {
      invalid.push({ sourceSessionId: session.id, errors });
      continue;
    }
    for (const speaker of speakers) {
      const missing = [!speaker.headshotUrl ? "headshot" : null, !speaker.bio ? "bio" : null].filter(Boolean);
      if (missing.length > 0) {
        warnings.push({
          sourceSessionId: session.id,
          message: `${speaker.name || "Assigned speaker"} is missing ${missing.join(" and ")}.`,
        });
      }
    }
    records.push(record);
  }

  const result = await adapter.syncShowOpsAgenda({
    eventId,
    actorUserId,
    records,
    officialSourceSessionIds: sessions.map((session) => session.id),
  });
  return { ...result, invalid, warnings };
}

export async function listRegistrationAgendaEntries(eventId: string, options: { includeArchived?: boolean } = {}) {
  const entries = await getPrisma().registrationAgendaEntry.findMany({
    where: { eventId, ...(options.includeArchived ? {} : { archivedAt: null }) },
    orderBy: [{ dayDate: "asc" }, { startTime: "asc" }, { title: "asc" }],
  });
  return entries.map((entry) => ({
    id: entry.id,
    eventId: entry.eventId,
    source: entry.source,
    sourceKey: entry.sourceKey,
    sourceSessionId: entry.sourceSessionId,
    sourceUpdatedAt: entry.sourceUpdatedAt?.toISOString() ?? null,
    title: entry.title,
    description: entry.description,
    date: entry.dayDate.toISOString().slice(0, 10),
    startTime: entry.startTime.toISOString().slice(11, 16),
    endTime: entry.endTime.toISOString().slice(11, 16),
    location: entry.location,
    sessionType: entry.sessionType,
    officialStatus: entry.officialStatus,
    speakers: entry.speakers,
    publicationStatus: entry.publicationStatus,
    sourceFileName: entry.sourceFileName,
    sourceReference: entry.sourceReference,
    archivedAt: entry.archivedAt?.toISOString() ?? null,
    updatedAt: entry.updatedAt.toISOString(),
  }));
}

export type RegistrationAgendaDraft = {
  title: string;
  description: string | null;
  dayDate: Date;
  startTime: Date;
  endTime: Date;
  location: string | null;
  sessionType: string | null;
  officialStatus: string | null;
};

export type SpreadsheetAgendaRow = Record<string, unknown>;

function optionalString(value: unknown): string | null {
  if (typeof value === "undefined" || value === null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function parseAgendaDate(value: unknown): Date | null {
  const text = optionalString(value);
  if (!text) return null;
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(text)
    ? text
    : (() => {
        const parsed = new Date(text);
        return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
      })();
  if (!iso) return null;
  const date = new Date(`${iso}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseAgendaTime(value: unknown): Date | null {
  const text = optionalString(value);
  if (!text) return null;
  const match = text.match(/^(\d{1,2}):(\d{2})(?:\s*([ap])\.?m\.?)?$/i);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3]?.toLowerCase();
  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    if (meridiem === "p" && hours !== 12) hours += 12;
    if (meridiem === "a" && hours === 12) hours = 0;
  }
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return new Date(Date.UTC(1970, 0, 1, hours, minutes));
}

export function validateRegistrationAgendaDraft(input: SpreadsheetAgendaRow): {
  draft: RegistrationAgendaDraft | null;
  errors: string[];
} {
  const title = optionalString(input.title) ?? "";
  const dayDate = parseAgendaDate(input.date ?? input.dayDate);
  const startTime = parseAgendaTime(input.startTime);
  const endTime = parseAgendaTime(input.endTime);
  const errors: string[] = [];
  if (!title) errors.push("Title is required");
  if (!dayDate) errors.push("Date must be a valid date");
  if (!startTime) errors.push("Start time must be HH:mm or h:mm am/pm");
  if (!endTime) errors.push("End time must be HH:mm or h:mm am/pm");
  if (startTime && endTime && endTime.getTime() <= startTime.getTime()) errors.push("End time must be after start time");
  if (errors.length > 0 || !dayDate || !startTime || !endTime) return { draft: null, errors };
  return {
    draft: {
      title,
      description: optionalString(input.description),
      dayDate,
      startTime,
      endTime,
      location: optionalString(input.location ?? input.room),
      sessionType: optionalString(input.sessionType ?? input.type),
      officialStatus: optionalString(input.officialStatus ?? input.status),
    },
    errors,
  };
}

function spreadsheetSourceKey(draft: RegistrationAgendaDraft): string {
  return createHash("sha256").update(JSON.stringify({
    title: draft.title.toLowerCase(),
    date: draft.dayDate.toISOString().slice(0, 10),
    start: draft.startTime.toISOString().slice(11, 16),
    end: draft.endTime.toISOString().slice(11, 16),
    location: draft.location?.toLowerCase() ?? "",
  })).digest("hex");
}

export async function createManualRegistrationAgendaEntry(eventId: string, actorUserId: string, input: SpreadsheetAgendaRow) {
  const validated = validateRegistrationAgendaDraft(input);
  if (!validated.draft) throw new RegistrationAgendaError(validated.errors.join("; "), 400, "INVALID_AGENDA_ENTRY");
  const draft = validated.draft;
  return getPrisma().registrationAgendaEntry.create({
    data: {
      eventId,
      source: RegistrationAgendaSource.MANUAL,
      sourceKey: randomUUID(),
      ...draft,
      speakers: [],
      createdByUserId: actorUserId,
      updatedByUserId: actorUserId,
    },
  });
}

export async function updateRegistrationAgendaEntry(
  eventId: string,
  entryId: string,
  actorUserId: string,
  input: SpreadsheetAgendaRow,
) {
  const existing = await getPrisma().registrationAgendaEntry.findFirst({ where: { id: entryId, eventId } });
  if (!existing) throw new RegistrationAgendaError("Agenda entry not found", 404, "AGENDA_ENTRY_NOT_FOUND");
  const action = optionalString(input.action);
  if (action === "publish" || action === "unpublish") {
    return getPrisma().registrationAgendaEntry.update({
      where: { id: entryId },
      data: {
        publicationStatus: action === "publish"
          ? RegistrationAgendaPublicationStatus.PUBLISHED
          : RegistrationAgendaPublicationStatus.UNPUBLISHED,
        updatedByUserId: actorUserId,
      },
    });
  }
  if (action === "archive") {
    return getPrisma().registrationAgendaEntry.update({
      where: { id: entryId },
      data: { archivedAt: new Date(), publicationStatus: RegistrationAgendaPublicationStatus.UNPUBLISHED, updatedByUserId: actorUserId },
    });
  }
  const validated = validateRegistrationAgendaDraft({
    title: input.title ?? existing.title,
    description: Object.prototype.hasOwnProperty.call(input, "description") ? input.description : existing.description,
    date: input.date ?? existing.dayDate.toISOString().slice(0, 10),
    startTime: input.startTime ?? existing.startTime.toISOString().slice(11, 16),
    endTime: input.endTime ?? existing.endTime.toISOString().slice(11, 16),
    location: Object.prototype.hasOwnProperty.call(input, "location") ? input.location : existing.location,
    sessionType: Object.prototype.hasOwnProperty.call(input, "sessionType") ? input.sessionType : existing.sessionType,
    officialStatus: Object.prototype.hasOwnProperty.call(input, "officialStatus") ? input.officialStatus : existing.officialStatus,
  });
  if (!validated.draft) throw new RegistrationAgendaError(validated.errors.join("; "), 400, "INVALID_AGENDA_ENTRY");
  return getPrisma().registrationAgendaEntry.update({
    where: { id: entryId },
    data: { ...validated.draft, updatedByUserId: actorUserId },
  });
}

export async function importRegistrationAgendaSpreadsheet(args: {
  eventId: string;
  actorUserId: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number;
  mapping: Record<string, string>;
  rows: SpreadsheetAgendaRow[];
}) {
  const validated = args.rows.map((row, index) => ({ index, ...validateRegistrationAgendaDraft(row) }));
  const invalidRows = validated.filter((row) => !row.draft).map((row) => ({ row: row.index + 2, errors: row.errors }));
  const valid = validated.filter((row): row is typeof row & { draft: RegistrationAgendaDraft } => Boolean(row.draft));
  const sourceKeys = valid.map((row) => spreadsheetSourceKey(row.draft));
  const existing = await getPrisma().registrationAgendaEntry.findMany({
    where: { eventId: args.eventId, source: RegistrationAgendaSource.SPREADSHEET, sourceKey: { in: sourceKeys } },
    select: { sourceKey: true },
  });
  const seen = new Set(existing.map((entry) => entry.sourceKey));
  const importable: Array<{ draft: RegistrationAgendaDraft; sourceKey: string }> = [];
  let duplicateCount = 0;
  valid.forEach((row, index) => {
    const sourceKey = sourceKeys[index]!;
    if (seen.has(sourceKey)) {
      duplicateCount += 1;
      return;
    }
    seen.add(sourceKey);
    importable.push({ draft: row.draft, sourceKey });
  });

  const batch = await getPrisma().$transaction(async (tx) => {
    if (importable.length > 0) {
      await tx.registrationAgendaEntry.createMany({
        data: importable.map(({ draft, sourceKey }) => ({
          eventId: args.eventId,
          source: RegistrationAgendaSource.SPREADSHEET,
          sourceKey,
          ...draft,
          speakers: [],
          sourceFileName: args.fileName,
          createdByUserId: args.actorUserId,
          updatedByUserId: args.actorUserId,
        })),
        skipDuplicates: true,
      });
    }
    return tx.registrationAgendaImportBatch.create({
      data: {
        eventId: args.eventId,
        source: RegistrationAgendaSource.SPREADSHEET,
        fileName: args.fileName,
        mimeType: args.mimeType,
        sizeBytes: args.sizeBytes,
        mapping: args.mapping,
        rowCount: args.rows.length,
        importedCount: importable.length,
        invalidCount: invalidRows.length,
        duplicateCount,
        status: invalidRows.length > 0 ? "COMPLETED_WITH_ERRORS" : "COMPLETED",
        createdByUserId: args.actorUserId,
      },
    });
  });
  return { batchId: batch.id, importedCount: importable.length, duplicateCount, invalidRows };
}

export async function recordRegistrationAgendaPdfReference(args: {
  eventId: string;
  actorUserId: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number;
}) {
  return getPrisma().registrationAgendaImportBatch.create({
    data: {
      eventId: args.eventId,
      source: RegistrationAgendaSource.PDF_REFERENCE,
      fileName: args.fileName,
      mimeType: args.mimeType,
      sizeBytes: args.sizeBytes,
      status: "REFERENCE_RECORDED_NO_EXTRACTION",
      referenceOnly: true,
      createdByUserId: args.actorUserId,
    },
  });
}
