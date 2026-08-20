import { calculateFnbAssignmentFinancials } from "@/lib/fnb-cost-calculation";
import {
  buildOperationalExport,
  deterministicExportHash,
  type OperationalExportFormat,
  type OperationalExportProjection,
  type OperationalExportRecipient,
  type OperationalExportSession,
} from "@/lib/operational-export";
import { getPrisma } from "@/lib/prisma";
import { getEventTerminology } from "@/lib/orca-terminology";

export type OperationalExportFilters = Readonly<{
  date?: string;
  room?: string;
  session?: string;
  status?: "ready" | "attention" | "blocked";
  changedSince?: string;
}>;

function clock(value: Date | null): string {
  return value?.toISOString().slice(11, 16) ?? "";
}

function displayCode(code: string, customLabel: string | null): string {
  return customLabel?.trim() || code.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function join(values: Array<string | null | undefined>): string {
  return values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)).join("; ");
}

function requirementList(
  selections: readonly { quantity: number | null; item: { label: string; section: { key: string; label: string } } }[],
  key: "supplies" | "signage",
): string {
  return selections
    .filter((selection) => selection.item.section.key.toLowerCase() === key || selection.item.section.label.toLowerCase() === key)
    .map((selection) => `${selection.item.label}${selection.quantity == null ? "" : ` × ${selection.quantity}`}`)
    .join("; ");
}

function sourceTimestamp(dates: Date[]): string {
  return new Date(Math.max(0, ...dates.map((date) => date.getTime()))).toISOString();
}

function passesFilters(session: OperationalExportSession, filters: OperationalExportFilters): boolean {
  if (filters.date && session.date !== filters.date) return false;
  if (filters.room && session.room.toLowerCase() !== filters.room.toLowerCase() && session.id !== filters.room) return false;
  if (filters.session && session.id !== filters.session && !session.title.toLowerCase().includes(filters.session.toLowerCase())) return false;
  if (filters.status && session.status !== filters.status) return false;
  if (filters.changedSince && (!session.changedAt || new Date(session.changedAt) <= new Date(filters.changedSince))) return false;
  return true;
}

function plainFilters(filters: OperationalExportFilters): Record<string, string> {
  return Object.fromEntries(Object.entries(filters).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0));
}

async function publicSessions(eventId: string): Promise<{ sessions: OperationalExportSession[]; dataAsOf: string }> {
  const publications = await getPrisma().sessionAgendaPublication.findMany({
    where: { eventId, session: { archivedAt: null } },
    orderBy: [{ sessionId: "asc" }, { version: "desc" }],
    select: { sessionId: true, version: true, publishedAt: true, snapshot: true },
  });
  const latest = new Map<string, (typeof publications)[number]>();
  for (const publication of publications) if (!latest.has(publication.sessionId)) latest.set(publication.sessionId, publication);
  const sessions = [...latest.values()].map((publication): OperationalExportSession => {
    const snapshot = publication.snapshot as Record<string, unknown>;
    const cues = Array.isArray(snapshot.cues) ? snapshot.cues as Array<Record<string, unknown>> : [];
    return {
      id: publication.sessionId,
      date: String(snapshot.date ?? ""),
      start: String(snapshot.startTime ?? ""),
      end: String(snapshot.endTime ?? ""),
      title: String(snapshot.title ?? ""),
      room: String(snapshot.roomName ?? ""),
      publicDescription: typeof snapshot.description === "string" ? snapshot.description : null,
      status: "ready",
      changedAt: publication.publishedAt.toISOString(),
      showFlow: cues.map((cue) => ({
        label: String(cue.cue ?? cue.label ?? ""),
        start: String(cue.startTime ?? cue.computedStartTime ?? ""),
        publicDescription: typeof cue.description === "string" ? cue.description : typeof cue.publicDescription === "string" ? cue.publicDescription : null,
        visibility: "PUBLIC" as const,
      })),
    };
  }).sort((left, right) => left.date.localeCompare(right.date) || left.start.localeCompare(right.start) || left.id.localeCompare(right.id));
  return { sessions, dataAsOf: sourceTimestamp([...latest.values()].map((row) => row.publishedAt)) };
}

async function internalSessions(eventId: string): Promise<{ sessions: OperationalExportSession[]; dataAsOf: string }> {
  const [rows, linkedTasks] = await Promise.all([
    getPrisma().matrixRow.findMany({
      where: { eventId, archivedAt: null },
      include: {
        room: true,
        showFlowItems: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }], include: { speaker: { select: { name: true } } } },
        sessionAvRequirements: { orderBy: [{ avType: "asc" }, { id: "asc" }] },
        sessionSpeakerAssignments: { include: { speaker: { select: { name: true } } } },
        sessionStaffAssignments: { include: { person: { select: { name: true } } }, orderBy: { createdAt: "asc" } },
        sessionRequirementSelections: { include: { item: { include: { section: true } } } },
        sessionFoodService: true,
        fnbRequirements: { orderBy: [{ kind: "asc" }, { code: "asc" }] },
        fnbCatalogAssignments: {
          include: { catalogItem: true, taxes: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }, safetyResolutions: true, budgetLineItem: true },
          orderBy: { createdAt: "asc" },
        },
        budgetLineItems: { select: { lineItem: true, approval: true, status: true, updatedAt: true } },
      },
      orderBy: [{ dayDate: "asc" }, { startTime: "asc" }, { sortOrder: "asc" }, { id: "asc" }],
    }),
    getPrisma().task.findMany({
      where: { eventId, links: { some: { objectType: "MATRIX_ROW" } } },
      select: { title: true, status: true, priority: true, dueAt: true, updatedAt: true, links: { where: { objectType: "MATRIX_ROW" }, select: { objectId: true } } },
    }),
  ]);
  const tasksBySession = new Map<string, typeof linkedTasks>();
  for (const task of linkedTasks) for (const link of task.links) tasksBySession.set(link.objectId, [...(tasksBySession.get(link.objectId) ?? []), task]);
  const sourceDates: Date[] = [];
  const sessions = rows.map((row): OperationalExportSession => {
    sourceDates.push(row.updatedAt, ...row.showFlowItems.map((item) => item.updatedAt), ...row.fnbRequirements.map((item) => item.updatedAt), ...row.fnbCatalogAssignments.map((item) => item.updatedAt), ...row.budgetLineItems.map((item) => item.updatedAt));
    const requirements = row.fnbRequirements.filter((requirement) => requirement.disposition !== "NOT_NEEDED");
    const activeSafetyProblems = row.fnbCatalogAssignments.flatMap((assignment) => assignment.safetyResolutions)
      .filter((resolution) => ["CONFLICT", "INSUFFICIENT_INFORMATION", "STALE_VERIFICATION", "POSSIBLE_MATCH"].includes(resolution.outcome)
        && !(resolution.modification && resolution.modificationStatus === "VERIFIED"));
    const status = activeSafetyProblems.length > 0 ? "blocked" : !row.startTime || !row.endTime || !(row.room?.name || row.roomName) ? "attention" : "ready";
    const assignmentFinancials = row.fnbCatalogAssignments.map((assignment) => {
      const snapshot = assignment.catalogItemSnapshot && typeof assignment.catalogItemSnapshot === "object" && !Array.isArray(assignment.catalogItemSnapshot)
        ? assignment.catalogItemSnapshot as Record<string, unknown> : null;
      const numeric = (key: string, fallback: number | null): number | null => typeof snapshot?.[key] === "number" ? snapshot[key] as number : fallback;
      const result = calculateFnbAssignmentFinancials({
        id: assignment.id,
        currency: typeof snapshot?.currency === "string" ? snapshot.currency : assignment.catalogItem.currency,
        quantity: assignment.quantity,
        minimumQuantity: numeric("minimumQuantity", assignment.catalogItem.minimumQuantity),
        publishedUnitCents: numeric("publishedPriceCents", assignment.catalogItem.publishedPriceCents),
        negotiatedUnitCents: numeric("negotiatedPriceCents", assignment.catalogItem.negotiatedPriceCents),
        discountUnitCents: numeric("discountCents", assignment.catalogItem.discountCents),
        taxable: typeof snapshot?.taxable === "boolean" ? snapshot.taxable : assignment.catalogItem.taxable,
        totalOverrideCents: assignment.manualPriceCents,
        taxPercent: row.fnbTaxPercent.toString(),
        serviceChargePercent: row.fnbServiceChargePercent.toString(),
        itemTaxes: assignment.taxes.map((tax) => ({ id: tax.id, label: tax.label, percentage: tax.percentage.toString() })),
        actualTotalCents: assignment.budgetLineItem?.actualCents,
      });
      return { name: assignment.catalogItem.itemName, total: result.breakdown.totalCents, currency: assignment.catalogItem.currency };
    });
    const taskRows = tasksBySession.get(row.id) ?? [];
    const riskTasks = taskRows.filter((task) => task.status === "BLOCKED" || task.priority === "CRITICAL");
    const unresolvedTasks = taskRows.filter((task) => task.status !== "DONE" && task.status !== "CANCELED");
    const latest = sourceTimestamp([row.updatedAt, ...row.showFlowItems.map((item) => item.updatedAt), ...row.fnbRequirements.map((item) => item.updatedAt), ...row.fnbCatalogAssignments.map((item) => item.updatedAt), ...row.budgetLineItems.map((item) => item.updatedAt), ...taskRows.map((item) => item.updatedAt)]);
    return {
      id: row.id,
      date: row.dayDate.toISOString().slice(0, 10),
      start: clock(row.startTime),
      end: clock(row.endTime),
      title: row.sessionName?.trim() || "Untitled session",
      room: row.room?.name ?? row.roomName ?? "",
      status,
      changedAt: latest,
      setupType: row.setupType,
      attendance: row.sessionFoodService?.headcount ?? row.attendance,
      supplies: requirementList(row.sessionRequirementSelections, "supplies"),
      signage: requirementList(row.sessionRequirementSelections, "signage"),
      accessibility: join(row.fnbRequirements.filter((requirement) => requirement.kind === "ACCESSIBILITY").map((requirement) => `${displayCode(requirement.code, requirement.customLabel)}${requirement.quantity == null ? "" : ` × ${requirement.quantity}`} (${requirement.disposition.toLowerCase().replaceAll("_", " ")})`)),
      operationalNotes: row.room?.roomSetNotes,
      fnbContext: join([row.sessionFoodService?.serviceType, row.sessionFoodService?.serviceStyle, ...row.fnbCatalogAssignments.map((assignment) => assignment.serviceTiming), row.fnbNotes]),
      fnbSelections: row.fnbCatalogAssignments.map((assignment) => `${assignment.catalogItem.itemName}${assignment.quantity == null ? "" : ` × ${assignment.quantity}`}`).join("; "),
      fnbVerifiedNeeds: requirements.filter((requirement) => requirement.kind !== "ACCESSIBILITY").map((requirement) => `${displayCode(requirement.code, requirement.customLabel)}${requirement.quantity == null ? "" : ` × ${requirement.quantity}`} (${requirement.disposition.toLowerCase().replaceAll("_", " ")})`).join("; "),
      fnbModifications: row.fnbCatalogAssignments.flatMap((assignment) => assignment.safetyResolutions).filter((resolution) => resolution.modificationStatus === "VERIFIED" && resolution.modification).map((resolution) => resolution.modification!).join("; "),
      fnbFinancials: assignmentFinancials.map((item) => `${item.name}: ${item.total == null ? "Not priced" : new Intl.NumberFormat("en-US", { style: "currency", currency: item.currency }).format(item.total / 100)}`).join("; "),
      avSummary: join([row.avNeeds, row.avNotes, ...row.sessionAvRequirements.map((requirement) => `${requirement.avType}${requirement.quantity == null ? "" : ` × ${requirement.quantity}`}`)]),
      speakers: row.sessionSpeakerAssignments.map((assignment) => assignment.speaker.name).sort().join("; "),
      staffing: row.sessionStaffAssignments.map((assignment) => `${assignment.person.name}${assignment.role ? ` — ${assignment.role}` : ""}`).join("; "),
      approvals: row.budgetLineItems.map((item) => `${item.lineItem}: ${item.approval.toLowerCase()}`).join("; "),
      risks: riskTasks.map((task) => task.title).join("; "),
      unresolved: join([...activeSafetyProblems.map((problem) => problem.outcome.toLowerCase().replaceAll("_", " ")), ...unresolvedTasks.map((task) => task.title)]),
      internalNotes: row.notes,
      publicDescription: row.publicDescription,
      showFlow: row.showFlowItems.map((item) => ({
        label: item.label,
        start: clock(item.startTime),
        owner: item.owner,
        department: item.department,
        speaker: item.speaker?.name ?? item.talentName,
        avNotes: join([item.avNotes, item.audioNotes, item.lightingNotes]),
        notes: join([item.notes, item.internalNotes]),
        publicDescription: item.publicDescription,
        visibility: item.visibility,
      })),
    };
  });
  sourceDates.push(...linkedTasks.map((task) => task.updatedAt));
  return { sessions, dataAsOf: sourceTimestamp(sourceDates) };
}

export async function previewOperationalExport(
  eventId: string,
  recipient: OperationalExportRecipient,
  filters: OperationalExportFilters,
): Promise<OperationalExportProjection> {
  const [source, terminology] = await Promise.all([
    recipient === "public" ? publicSessions(eventId) : internalSessions(eventId),
    getEventTerminology(eventId),
  ]);
  const sessions = source.sessions.filter((session) => passesFilters(session, filters));
  const normalizedFilters = plainFilters(filters);
  const projectionKey = deterministicExportHash({ recipient, filters: normalizedFilters });
  const sourceVersion = deterministicExportHash({ recipient, projectionKey, sessions, terminology: terminology.terms });
  const existing = await getPrisma().eventFnbExportRecord.findFirst({
    where: { eventId, recipient: recipient === "venue" ? "HOTEL" : recipient.toUpperCase() as "HOTEL" | "CATERER" | "AV" | "INTERNAL" | "PUBLIC", projectionKey, sourceDataVersion: sourceVersion },
    orderBy: { generatedAt: "desc" },
    select: { projectionVersion: true },
  });
  const latest = existing ?? await getPrisma().eventFnbExportRecord.findFirst({
    where: { eventId, recipient: recipient === "venue" ? "HOTEL" : recipient.toUpperCase() as "HOTEL" | "CATERER" | "AV" | "INTERNAL" | "PUBLIC", projectionKey },
    orderBy: { projectionVersion: "desc" },
    select: { projectionVersion: true },
  });
  const projectionVersion = existing?.projectionVersion ?? (latest?.projectionVersion ?? 0) + 1;
  return buildOperationalExport(recipient, sessions, { dataAsOf: source.dataAsOf, sourceVersion, projectionVersion, filters: normalizedFilters, terminology: terminology.terms });
}

export async function auditOperationalExport(input: {
  eventId: string;
  userId: string;
  format: OperationalExportFormat;
  projection: OperationalExportProjection;
}): Promise<void> {
  const projectionKey = deterministicExportHash({ recipient: input.projection.metadata.recipient, filters: input.projection.metadata.filters });
  await getPrisma().eventFnbExportRecord.create({
    data: {
      eventId: input.eventId,
      recipient: input.projection.metadata.recipient === "venue" ? "HOTEL" : input.projection.metadata.recipient.toUpperCase() as "HOTEL" | "CATERER" | "AV" | "INTERNAL" | "PUBLIC",
      filters: { ...input.projection.metadata.filters, sensitiveFieldsExcluded: input.projection.sensitiveFieldsExcluded },
      sourceDataVersion: input.projection.metadata.sourceVersion,
      projectionKey,
      projectionVersion: input.projection.metadata.projectionVersion,
      format: input.format,
      rowCount: input.projection.rowCount,
      checksum: input.projection.checksum,
      generatedFilename: input.projection.filename.replace(/\.csv$/, input.format === "xlsx" ? ".xlsx" : input.format === "print" ? ".html" : ".csv"),
      dataAsOf: new Date(input.projection.metadata.dataAsOf),
      generatedByUserId: input.userId,
    },
  });
}
