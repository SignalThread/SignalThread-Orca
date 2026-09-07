import {
  EventAgendaImportConflictType,
  EventAgendaImportResolution,
  EventAgendaImportRowResult,
  EventAgendaImportRowStatus,
  EventAgendaImportStatus,
  EventStructureItemKind,
  EventType,
  Prisma,
  type PrismaClient,
} from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import {
  buildAgendaImportStableRowKey,
  eventAgendaImportMappingSchema,
  eventAgendaImportRowCorrectionSchema,
  eventAgendaImportRowDecisionSchema,
  eventAgendaNormalizedRowSchema,
  eventAgendaSpeakerResolutionSchema,
  normalizeSpeakerEmail,
  normalizeSpeakerName,
  parseEventAgendaSessionMetadata,
} from '@/lib/event-agenda-contract'
import { interpretEventAgendaColumns, type EventAgendaAiInterpretation } from '@/lib/ai/event-agenda-interpretation'
import { buildEventAgendaReconciliationPlan, eventAgendaReconciliationPlanSchema } from '@/lib/event-agenda-reconciliation'
import {
  eventSpeakerRosterImportMappingSchema,
  eventSpeakerRosterNormalizedRowSchema,
  discoverSpeakerRosterImportMapping,
  findSpeakerRosterDuplicates,
  normalizeSpeakerRosterImportRow,
} from '@/lib/event-speaker-roster-import'
import {
  type AgendaImportInspection,
  type AgendaImportWorksheet,
  discoverAgendaImportMapping,
  inspectAgendaImportFile,
  normalizeAgendaImportRow,
} from '@/lib/event-agenda-import-parser'
import {
  EventAgendaServiceError,
  addSpeakerToEvent,
  assignSpeakerToAgendaSession,
  createAgendaSession,
  createEventSpeakerProfile,
  createOrReuseAgendaImportJob,
  getEventAgendaWorkspace,
  requireAgendaEventScope,
  updateAgendaSession,
} from '@/lib/event-agenda-service'

type AgendaDb = typeof prisma | PrismaClient
type SpeakerRosterBatchDb = Pick<PrismaClient, 'eventSpeakerProfile' | 'eventSessionSpeakerAssignment' | 'eventAgendaImportRow'>
type AgendaBatchDb = Pick<PrismaClient, 'eventSpeakerProfile' | 'eventStructureItem' | 'eventSessionSpeakerAssignment' | 'eventAgendaImportRow'>

const sourceRowSchema = z.object({
  sourceRowNumber: z.number().int().positive(),
  values: z.record(z.string()),
})
const worksheetSchema = z.object({
  name: z.string(), index: z.number().int().nonnegative(), columns: z.array(z.string()),
  rowCount: z.number().int().nonnegative(), rows: z.array(sourceRowSchema),
})
const inspectionSchema = z.object({
  schemaVersion: z.literal(1),
  fileType: z.enum(['CSV', 'XLSX']),
  checksumSha256: z.string().regex(/^[a-f0-9]{64}$/),
  worksheets: z.array(worksheetSchema).min(1),
})
const importSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  importType: z.enum(['AGENDA', 'SPEAKER_ROSTER']).default('AGENDA'),
  inspection: inspectionSchema,
  mapping: z.object({
    worksheetName: z.string(),
    worksheetIndex: z.number().int().nonnegative(),
    timezone: z.string(),
    columns: z.record(z.string(), z.string().nullable()),
    // Speaker imports can seed the reusable account directory without
    // necessarily adding every profile to the event that opened the importer.
    assignSpeakersToEvent: z.boolean().optional().default(true),
  }).nullable().default(null),
  interpretation: z.object({
    status: z.enum(['NOT_NEEDED', 'PROPOSED', 'UNAVAILABLE', 'FAILED']),
    plan: z.object({
      mapping: z.record(z.string(), z.string().nullable()),
      rules: z.object({
        timeRangeColumn: z.string().nullable(),
        speakerDelimiters: z.array(z.enum(['NEWLINE', 'SEMICOLON', 'PIPE', 'COMMA'])),
      }).default({ timeRangeColumn: null, speakerDelimiters: [] }),
      confidence: z.number().min(0).max(1),
      warnings: z.array(z.string()),
    }).nullable(),
    message: z.string().nullable(),
  }).optional(),
  reconciliation: eventAgendaReconciliationPlanSchema.nullable().optional(),
})

type ImportSnapshot = z.infer<typeof importSnapshotSchema>
type SpeakerResolution = z.infer<typeof eventAgendaSpeakerResolutionSchema>
type AgendaInterpretationService = typeof interpretEventAgendaColumns

interface ExistingAgendaSession {
  id: string
  name: string
  description?: string | null
  startsAt: Date | null
  endsAt: Date | null
  metadata: unknown
  speakerAssignments?: Array<{ speaker: { normalizedName: string; normalizedEmail: string | null } }>
}

interface ExistingSpeaker {
  id: string
  normalizedName: string
  normalizedEmail: string | null
  organization?: string | null
  title?: string | null
}

interface ClassifiedImportRow {
  eventId: string
  importJobId: string
  sourceRowNumber: number
  stableSourceKey: string
  sourceExternalId: string | null
  rawRowSnapshot: Prisma.InputJsonValue
  normalizedRowSnapshot: Prisma.InputJsonValue | typeof Prisma.JsonNull
  validationIssues: Prisma.InputJsonValue
  status: EventAgendaImportRowStatus
  conflictType: EventAgendaImportConflictType | null
  resolution: EventAgendaImportResolution | null
  speakerResolutionSnapshot: Prisma.InputJsonValue
  existingSessionId: string | null
}

export interface AgendaImportCanonicalServices {
  createSession: typeof createAgendaSession
  updateSession: typeof updateAgendaSession
  createSpeaker: typeof createEventSpeakerProfile
  addSpeakerToEvent: typeof addSpeakerToEvent
  assignSpeaker: typeof assignSpeakerToAgendaSession
}

const canonicalServices: AgendaImportCanonicalServices = {
  createSession: createAgendaSession,
  updateSession: updateAgendaSession,
  createSpeaker: createEventSpeakerProfile,
  addSpeakerToEvent,
  assignSpeaker: assignSpeakerToAgendaSession,
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

function importError(message: string, status: number, code: string, details?: unknown) {
  return new EventAgendaServiceError(message, status, code, details)
}

function parseSnapshot(value: unknown): ImportSnapshot {
  const parsed = importSnapshotSchema.safeParse(value)
  if (!parsed.success) throw importError('Import source inspection is unavailable or invalid', 409, 'IMPORT_SNAPSHOT_INVALID')
  return parsed.data
}

function chooseInitialAgendaWorksheet(worksheets: AgendaImportInspection['worksheets']) {
  return worksheets
    .map((worksheet) => {
      const discovered = discoverAgendaImportMapping(worksheet.columns)
      const mappedFields = Object.keys(discovered.mapping).length
      // A recognizable session title is the strongest signal. Row count only
      // breaks ties, so a formatted or notes sheet cannot win on size alone.
      const score = (discovered.mapping.title ? 10_000 : 0) + mappedFields * 100 + Math.min(worksheet.rowCount, 99)
      return { worksheet, score }
    })
    .sort((left, right) => right.score - left.score || left.worksheet.index - right.worksheet.index)[0]?.worksheet
}

async function getScopedImportJob(input: { accountId: string; eventId: string; importJobId: string }, db: AgendaDb) {
  const scope = await requireAgendaEventScope(input, db)
  const job = await db.eventAgendaImportJob.findFirst({
    where: { id: input.importJobId.trim(), eventId: scope.eventId, accountId: scope.accountId },
    include: { rows: { orderBy: { sourceRowNumber: 'asc' } } },
  })
  if (!job) throw importError('Agenda import not found or access denied', 404, 'IMPORT_NOT_FOUND')
  return { scope, job }
}

async function requireImportActor(input: { accountId: string; userId: string }, db: AgendaDb) {
  const actor = await db.user.findFirst({
    where: {
      id: input.userId.trim(),
      isActive: true,
      OR: [
        { accountMemberships: { some: { accountId: input.accountId } } },
        { role: 'SUPER_ADMIN', accountId: null },
      ],
    },
    select: { id: true },
  })
  if (!actor) throw importError('Import actor not found or access denied', 403, 'ACTOR_FORBIDDEN')
  return actor
}

function findWorksheet(snapshot: ImportSnapshot, input: { worksheetName?: string; worksheetIndex?: number }) {
  const worksheet = snapshot.inspection.worksheets.find((candidate) => (
    input.worksheetName !== undefined ? candidate.name === input.worksheetName : candidate.index === input.worksheetIndex
  ))
  if (!worksheet) throw importError('Selected worksheet was not found in this import', 400, 'WORKSHEET_NOT_FOUND')
  return worksheet
}

function speakerCandidates(source: { name: string; email?: string | null; organization?: string | null; title?: string | null }, speakers: ExistingSpeaker[]): SpeakerResolution {
  const normalizedEmail = normalizeSpeakerEmail(source.email)
  const normalizedName = normalizeSpeakerName(source.name)
  const emailMatches = normalizedEmail ? speakers.filter((speaker) => speaker.normalizedEmail === normalizedEmail) : []
  if (emailMatches.length === 1) {
    return { sourceName: source.name, sourceEmail: normalizedEmail, sourceOrganization: source.organization ?? null, sourceTitle: source.title ?? null, decision: 'LINK_EXISTING', matchedSpeakerId: emailMatches[0].id, candidateSpeakerIds: [emailMatches[0].id] }
  }
  const nameMatches = speakers.filter((speaker) => speaker.normalizedName === normalizedName)
  const matches = emailMatches.length > 0 ? emailMatches : nameMatches
  if (matches.length > 0) {
    return { sourceName: source.name, sourceEmail: normalizedEmail, sourceOrganization: source.organization ?? null, sourceTitle: source.title ?? null, decision: null, matchedSpeakerId: null, candidateSpeakerIds: matches.map((speaker) => speaker.id) }
  }
  return { sourceName: source.name, sourceEmail: normalizedEmail, sourceOrganization: source.organization ?? null, sourceTitle: source.title ?? null, decision: 'CREATE_NEW', matchedSpeakerId: null, candidateSpeakerIds: [] }
}

function isExactSessionMatch(session: ExistingAgendaSession, normalized: z.infer<typeof eventAgendaNormalizedRowSchema>) {
  if (!normalized.startsAt || !normalized.endsAt) return false
  return session.name.trim().toLocaleLowerCase('en-US') === normalized.title.trim().toLocaleLowerCase('en-US')
    && session.startsAt?.toISOString() === normalized.startsAt
    && session.endsAt?.toISOString() === normalized.endsAt
}

function isRoomOverlap(session: ExistingAgendaSession, normalized: z.infer<typeof eventAgendaNormalizedRowSchema>) {
  if (!normalized.room || !session.startsAt || !session.endsAt) return false
  let metadata: ReturnType<typeof parseEventAgendaSessionMetadata>
  try { metadata = parseEventAgendaSessionMetadata(session.metadata) } catch { return false }
  return metadata.room?.trim().toLocaleLowerCase('en-US') === normalized.room.trim().toLocaleLowerCase('en-US')
    && session.startsAt < new Date(normalized.endsAt!)
    && session.endsAt > new Date(normalized.startsAt!)
}

export function classifyAgendaImportRows(input: {
  eventId: string
  importJobId: string
  checksumSha256: string
  worksheet: AgendaImportWorksheet
  mapping: unknown
  timezone: string
  eventStartDate?: string | Date | null
  eventEndDate?: string | Date | null
  existingSessions: ExistingAgendaSession[]
  existingSpeakers: ExistingSpeaker[]
}): ClassifiedImportRow[] {
  const mapping = eventAgendaImportMappingSchema.parse(input.mapping)
  const seenExternalIds = new Set<string>()
  const seenExactRows = new Set<string>()
  return input.worksheet.rows.map((sourceRow) => {
    const parsed = normalizeAgendaImportRow({
      row: sourceRow,
      mapping,
      timezone: input.timezone,
      eventStartDate: input.eventStartDate,
      eventEndDate: input.eventEndDate,
    })
    const issues = [...parsed.issues]
    let status: EventAgendaImportRowStatus = parsed.empty ? EventAgendaImportRowStatus.IGNORED : EventAgendaImportRowStatus.INVALID
    let conflictType: EventAgendaImportConflictType | null = null
    let existingSessionId: string | null = null
    let speakerResolutions: SpeakerResolution[] = []
    const normalized = parsed.normalized

    if (normalized) {
      speakerResolutions = normalized.speakers.map((speaker) => speakerCandidates(speaker, input.existingSpeakers))
      const ambiguousSpeakers = speakerResolutions.some((speaker) => speaker.decision === null)
      if (ambiguousSpeakers) {
        issues.push({ code: 'AMBIGUOUS_SPEAKER_MATCH', field: 'speakers', message: 'One or more speakers require an explicit match decision', severity: 'WARNING' })
      }

      const externalId = normalized.externalId?.trim().toLocaleLowerCase('en-US') || null
      const externalMatch = externalId ? input.existingSessions.find((session) => {
        try { return parseEventAgendaSessionMetadata(session.metadata).externalId?.trim().toLocaleLowerCase('en-US') === externalId } catch { return false }
      }) : null
      const exactMatch = input.existingSessions.find((session) => isExactSessionMatch(session, normalized))
      const possibleTitleMatch = input.existingSessions.find((session) => session.name.trim().toLocaleLowerCase('en-US') === normalized.title.trim().toLocaleLowerCase('en-US'))
      const overlap = input.existingSessions.find((session) => isRoomOverlap(session, normalized))
      const exactKey = `${normalized.title.trim().toLocaleLowerCase('en-US')}\u001f${normalized.startsAt ?? ''}\u001f${normalized.endsAt ?? ''}`
      const duplicateInFile = seenExactRows.has(exactKey) || Boolean(externalId && seenExternalIds.has(externalId))
      seenExactRows.add(exactKey)
      if (externalId) seenExternalIds.add(externalId)

      if (externalMatch) {
        status = EventAgendaImportRowStatus.DUPLICATE
        conflictType = EventAgendaImportConflictType.EXTERNAL_ID_MATCH
        existingSessionId = externalMatch.id
      } else if (exactMatch || duplicateInFile) {
        status = EventAgendaImportRowStatus.DUPLICATE
        conflictType = EventAgendaImportConflictType.EXACT_DUPLICATE
        existingSessionId = exactMatch?.id ?? null
      } else if (ambiguousSpeakers) {
        status = EventAgendaImportRowStatus.NEEDS_REVIEW
        conflictType = EventAgendaImportConflictType.AMBIGUOUS_SPEAKER_MATCH
      } else if (possibleTitleMatch) {
        status = EventAgendaImportRowStatus.NEEDS_REVIEW
        conflictType = EventAgendaImportConflictType.POSSIBLE_DUPLICATE
        existingSessionId = possibleTitleMatch.id
      } else if (overlap) {
        status = EventAgendaImportRowStatus.NEEDS_REVIEW
        conflictType = EventAgendaImportConflictType.POSSIBLE_OVERLAP
        existingSessionId = overlap.id
        issues.push({ code: 'POSSIBLE_OVERLAP', field: 'room', message: `Session may overlap with “${overlap.name}” in ${normalized.room}`, severity: 'WARNING' })
      } else if (issues.some((issue) => issue.severity === 'WARNING')) {
        status = EventAgendaImportRowStatus.NEEDS_REVIEW
      } else {
        status = EventAgendaImportRowStatus.READY
      }
    }

    return {
      eventId: input.eventId,
      importJobId: input.importJobId,
      sourceRowNumber: sourceRow.sourceRowNumber,
      stableSourceKey: buildAgendaImportStableRowKey({
        sourceChecksumSha256: input.checksumSha256,
        worksheetName: input.worksheet.name,
        worksheetIndex: input.worksheet.index,
        sourceRowNumber: sourceRow.sourceRowNumber,
      }),
      sourceExternalId: normalized?.externalId ?? null,
      rawRowSnapshot: asJson(sourceRow.values),
      normalizedRowSnapshot: normalized ? asJson(normalized) : Prisma.JsonNull,
      validationIssues: asJson(issues),
      status,
      conflictType,
      resolution: null,
      speakerResolutionSnapshot: asJson(speakerResolutions),
      existingSessionId,
    }
  })
}

function classifySpeakerRosterImportRows(input: {
  eventId: string
  importJobId: string
  checksumSha256: string
  worksheet: AgendaImportWorksheet
  mapping: unknown
  existingSpeakers: ExistingSpeaker[]
}): ClassifiedImportRow[] {
  const mapping = eventSpeakerRosterImportMappingSchema.parse(input.mapping)
  const seenEmails = new Set<string>()
  return input.worksheet.rows.map((sourceRow) => {
    const parsed = normalizeSpeakerRosterImportRow({ row: sourceRow, mapping })
    const normalized = parsed.normalized
    const duplicate = normalized ? findSpeakerRosterDuplicates(normalized, input.existingSpeakers.map((speaker) => ({ ...speaker, organization: speaker.organization ?? null, title: speaker.title ?? null }))) : null
    const speakerResolution = normalized ? [{
      sourceName: normalized.displayName,
      sourceEmail: normalized.email,
      decision: duplicate?.exactId ? 'LINK_EXISTING' as const : duplicate?.uncertain ? null : 'CREATE_NEW' as const,
      matchedSpeakerId: duplicate?.exactId ?? null,
      candidateSpeakerIds: duplicate?.candidateIds ?? [],
    }] : []
    const issues: Array<{ code: string; field: string | null; message: string; severity: 'ERROR' | 'WARNING' }> = [...parsed.issues]
    const duplicateInFile = Boolean(normalized?.email && seenEmails.has(normalizeSpeakerEmail(normalized.email) ?? normalized.email))
    if (normalized?.email) seenEmails.add(normalizeSpeakerEmail(normalized.email) ?? normalized.email)
    if (duplicateInFile) issues.push({ code: 'DUPLICATE_EMAIL_IN_FILE', field: 'email', message: 'Another row in this file uses this email address', severity: 'WARNING' })
    if (duplicate?.uncertain) issues.push({ code: 'AMBIGUOUS_SPEAKER_MATCH', field: 'name', message: 'Possible existing speaker match requires review', severity: 'WARNING' })
    const status = parsed.empty ? EventAgendaImportRowStatus.IGNORED
      : !normalized ? EventAgendaImportRowStatus.INVALID
        : duplicateInFile ? EventAgendaImportRowStatus.DUPLICATE
        : duplicate?.uncertain ? EventAgendaImportRowStatus.NEEDS_REVIEW
          : EventAgendaImportRowStatus.READY
    return {
      eventId: input.eventId,
      importJobId: input.importJobId,
      sourceRowNumber: sourceRow.sourceRowNumber,
      stableSourceKey: buildAgendaImportStableRowKey({ sourceChecksumSha256: input.checksumSha256, worksheetName: input.worksheet.name, worksheetIndex: input.worksheet.index, sourceRowNumber: sourceRow.sourceRowNumber }),
      sourceExternalId: normalized?.externalSessionId ?? null,
      rawRowSnapshot: asJson(sourceRow.values),
      normalizedRowSnapshot: normalized ? asJson(normalized) : Prisma.JsonNull,
      validationIssues: asJson(issues),
      status,
      conflictType: duplicateInFile ? EventAgendaImportConflictType.EXACT_DUPLICATE : duplicate?.uncertain ? EventAgendaImportConflictType.AMBIGUOUS_SPEAKER_MATCH : null,
      resolution: null,
      speakerResolutionSnapshot: asJson(speakerResolution),
      existingSessionId: null,
    }
  })
}

function rowIsResolved(row: {
  status: EventAgendaImportRowStatus
  resolution: EventAgendaImportResolution | null
  speakerResolutionSnapshot: unknown
}) {
  if (row.status === EventAgendaImportRowStatus.IGNORED || row.status === EventAgendaImportRowStatus.CONFIRMED) return true
  if (row.resolution === EventAgendaImportResolution.REVIEW) return false
  if (row.status === EventAgendaImportRowStatus.INVALID && row.resolution !== EventAgendaImportResolution.SKIP) return false
  if ((row.status === EventAgendaImportRowStatus.DUPLICATE || row.status === EventAgendaImportRowStatus.NEEDS_REVIEW)
    && row.resolution !== EventAgendaImportResolution.SKIP
    && row.resolution !== EventAgendaImportResolution.REPLACE_EXISTING
    && row.resolution !== EventAgendaImportResolution.KEEP_BOTH) return false
  const speakers = z.array(eventAgendaSpeakerResolutionSchema).safeParse(row.speakerResolutionSnapshot ?? [])
  if (!speakers.success) return false
  return speakers.data.every((speaker) => Boolean(speaker.decision)
    && (!['LINK_EXISTING', 'MERGE'].includes(speaker.decision ?? '') || Boolean(speaker.matchedSpeakerId)))
}

function completionCounts(job: {
  createdSessionCount: number; updatedSessionCount: number; skippedRowCount: number; duplicateRowCount: number
  failedRowCount: number; createdSpeakerCount: number; matchedSpeakerCount: number
}) {
  return {
    importedCount: job.createdSessionCount,
    updatedCount: job.updatedSessionCount,
    skippedCount: job.skippedRowCount,
    duplicateCount: job.duplicateRowCount,
    failedCount: job.failedRowCount,
    createdSpeakerCount: job.createdSpeakerCount,
    matchedSpeakerCount: job.matchedSpeakerCount,
  }
}

export async function createAgendaImportUpload(input: {
  accountId: string
  eventId: string
  userId: string
  fileName: string
  mimeType: string
  buffer: Buffer
  importType?: 'AGENDA' | 'SPEAKER_ROSTER'
}, db: AgendaDb = prisma, interpretColumns: AgendaInterpretationService = interpretEventAgendaColumns) {
  const startedAt = Date.now()
  const scope = await requireAgendaEventScope(input, db)
  const inspection = await inspectAgendaImportFile(input)
  const importType = input.importType ?? 'AGENDA'
  const initialWorksheet = importType === 'AGENDA'
    ? chooseInitialAgendaWorksheet(inspection.worksheets) ?? inspection.worksheets[0]
    : inspection.worksheets[0]
  const job = await createOrReuseAgendaImportJob({
    accountId: input.accountId,
    eventId: input.eventId,
    createdByUserId: input.userId,
    sourceFileName: input.fileName,
    sourceMimeType: input.mimeType,
    sourceFileSizeBytes: input.buffer.byteLength,
    sourceChecksumSha256: inspection.checksumSha256,
    importType: input.importType,
    worksheetName: initialWorksheet.name,
    worksheetIndex: initialWorksheet.index,
  }, db)
  if (job.status === EventAgendaImportStatus.COMPLETED) {
    return getAgendaImport({ accountId: input.accountId, eventId: input.eventId, importJobId: job.id }, db)
  }
  if (job.status !== EventAgendaImportStatus.UPLOADED) {
    return getAgendaImport({ accountId: input.accountId, eventId: input.eventId, importJobId: job.id }, db)
  }
  const deterministic = importType === 'AGENDA' ? discoverAgendaImportMapping(initialWorksheet.columns) : null
  const deterministicallyMappedColumns = new Set(Object.values(deterministic?.mapping ?? {}).filter(Boolean))
  const hasUnresolvedColumns = initialWorksheet.columns.some((column) => !deterministicallyMappedColumns.has(column))
  let interpretation: ImportSnapshot['interpretation'] = { status: 'NOT_NEEDED', plan: null, message: null }
  const shouldInterpret = importType === 'AGENDA' && Boolean(deterministic && (
    deterministic.missingRequired.length > 0 || deterministic.needsStructuralInterpretation || hasUnresolvedColumns
  ))
  let aiDurationMs: number | null = null
  if (shouldInterpret) {
    const aiStartedAt = Date.now()
    try {
      const existingSessions = await db.eventStructureItem.findMany({
        where: { eventId: scope.eventId, kind: EventStructureItemKind.SESSION, isActive: true },
        select: { name: true },
        take: 50,
      })
      const plan = await interpretColumns({
        columns: initialWorksheet.columns,
        sampleRows: initialWorksheet.rows.slice(0, 12).map((row) => row.values),
        event: {
          name: scope.eventName,
          startDate: scope.eventStartDate?.toISOString() ?? null,
          endDate: scope.eventEndDate?.toISOString() ?? null,
          timezone: scope.eventTimezone,
        },
        existingSessionTitles: existingSessions.map((session) => session.name),
      })
      interpretation = plan
        ? { status: 'PROPOSED', plan: plan as EventAgendaAiInterpretation, message: null }
        : { status: 'UNAVAILABLE', plan: null, message: 'AI interpretation is unavailable; review the mapping manually.' }
    } catch (error) {
      interpretation = { status: 'FAILED', plan: null, message: error instanceof Error ? error.message : 'AI interpretation failed safely.' }
    } finally {
      aiDurationMs = Date.now() - aiStartedAt
    }
  }
  const snapshot: ImportSnapshot = { schemaVersion: 1, importType, inspection, mapping: null, interpretation, reconciliation: null }
  await db.eventAgendaImportJob.update({
    where: { id: job.id },
    data: {
      status: EventAgendaImportStatus.MAPPING,
      worksheetName: initialWorksheet.name,
      worksheetIndex: initialWorksheet.index,
      mappingSnapshot: asJson(snapshot),
      failureCode: null,
      failureMessage: null,
    },
  })
  const proposedMapping = Object.fromEntries(Object.entries(
    interpretation.status === 'PROPOSED' ? interpretation.plan?.mapping ?? {} : {},
  ).filter(([, column]) => !column || initialWorksheet.columns.includes(column)))
  const timeRangeColumn = interpretation.status === 'PROPOSED' ? interpretation.plan?.rules?.timeRangeColumn ?? null : null
  const timeRangeMapping = timeRangeColumn && initialWorksheet.columns.includes(timeRangeColumn)
    ? { startTime: timeRangeColumn, endTime: timeRangeColumn }
    : {}
  const autoMapping = { ...proposedMapping, ...timeRangeMapping, ...deterministic?.mapping }
  const canAutoReview = importType === 'AGENDA' && Boolean(autoMapping.title)
  const aiParticipated = interpretation.status === 'PROPOSED'
  const aiReason = shouldInterpret
    ? aiParticipated
      ? deterministic?.needsStructuralInterpretation ? 'non-canonical structural shape' : 'unresolved columns'
      : interpretation.status === 'UNAVAILABLE' ? 'AI unavailable; deterministic fallback used' : 'AI interpretation failed; deterministic fallback used'
    : 'deterministic mapping was sufficient'

  if (canAutoReview && importType === 'AGENDA') {
    const reviewed = await saveAgendaImportMapping({
      accountId: input.accountId,
      eventId: input.eventId,
      importJobId: job.id,
      mapping: autoMapping,
      timezone: scope.eventTimezone || 'UTC',
    }, db)
    console.info('agenda-import', {
      fileType: inspection.fileType,
      sheetName: initialWorksheet.name,
      meaningfulRowCount: initialWorksheet.rowCount,
      detectedHeaders: initialWorksheet.columns,
      deterministicConfidence: deterministic?.confidence ?? null,
      aiInvoked: aiParticipated,
      aiAttempted: shouldInterpret,
      aiReason,
      aiModel: aiParticipated ? process.env.EVENT_AGENDA_INTERPRETATION_MODEL || 'gpt-4o-mini' : null,
      aiDurationMs,
      interpretedMappings: autoMapping,
      normalizedSessionCount: reviewed.rows.filter((row) => Boolean(row.normalizedRowSnapshot)).length,
      normalizedSpeakerCount: new Set(reviewed.rows.flatMap((row) => {
        const normalized = row.normalizedRowSnapshot as { speakers?: Array<{ email?: string | null; name: string }> } | null
        return normalized?.speakers?.map((speaker) => (speaker.email || speaker.name).trim().toLocaleLowerCase('en-US')) ?? []
      })).size,
      warningOrErrorCount: reviewed.rows.reduce((count, row) => count + (Array.isArray(row.validationIssues) ? row.validationIssues.length : 0), 0),
      totalDurationMs: Date.now() - startedAt,
    })
    return reviewed
  }

  console.info('agenda-import', {
    fileType: inspection.fileType,
    sheetName: initialWorksheet.name,
    meaningfulRowCount: initialWorksheet.rowCount,
    detectedHeaders: initialWorksheet.columns,
    deterministicConfidence: deterministic?.confidence ?? null,
    aiInvoked: aiParticipated,
    aiAttempted: shouldInterpret,
    aiReason,
    aiModel: aiParticipated ? process.env.EVENT_AGENDA_INTERPRETATION_MODEL || 'gpt-4o-mini' : null,
    aiDurationMs,
    interpretedMappings: autoMapping,
    normalizedSessionCount: 0,
    normalizedSpeakerCount: 0,
    warningOrErrorCount: 0,
    totalDurationMs: Date.now() - startedAt,
  })
  return getAgendaImport({ accountId: input.accountId, eventId: input.eventId, importJobId: job.id }, db)
}

export async function getAgendaImport(input: { accountId: string; eventId: string; importJobId: string }, db: AgendaDb = prisma) {
  const { job } = await getScopedImportJob(input, db)
  if (job.status === EventAgendaImportStatus.CANCELLED) {
    throw importError('This import draft was discarded. Start a new import to continue.', 410, 'IMPORT_DISCARDED')
  }
  const snapshot = parseSnapshot(job.mappingSnapshot)
  const workspace = job.status === EventAgendaImportStatus.COMPLETED
    ? await getEventAgendaWorkspace({ accountId: input.accountId, eventId: input.eventId }, db)
    : null
  const selectedWorksheet = job.worksheetName === null
    ? null
    : findWorksheet(snapshot, { worksheetName: job.worksheetName })
  return {
    ...job,
    inspection: {
      fileType: snapshot.inspection.fileType,
      worksheets: snapshot.inspection.worksheets.map(({ rows: _rows, ...worksheet }) => worksheet),
    },
    // A deliberately small read-only source sample lets the advanced mapping
    // escape hatch describe Pulse's interpretation in source terms without
    // duplicating or exposing the full imported spreadsheet in the client.
    sourcePreview: selectedWorksheet
      ? {
          worksheetName: selectedWorksheet.name,
          columns: selectedWorksheet.columns.filter((column) => selectedWorksheet.rows.some((row) => Boolean(row.values[column]?.trim()))),
          rows: selectedWorksheet.rows.slice(0, 3).map((row) => row.values),
        }
      : null,
    importType: snapshot.importType,
    discoveredMapping: job.worksheetName === null ? null : snapshot.importType === 'SPEAKER_ROSTER'
      ? discoverSpeakerRosterImportMapping(findWorksheet(snapshot, { worksheetName: job.worksheetName }).columns)
      : (() => {
          const worksheet = findWorksheet(snapshot, { worksheetName: job.worksheetName })
          const deterministic = discoverAgendaImportMapping(worksheet.columns)
          const proposed = Object.fromEntries(Object.entries(
            snapshot.interpretation?.status === 'PROPOSED' ? snapshot.interpretation.plan?.mapping ?? {} : {},
          ).filter(([, column]) => !column || worksheet.columns.includes(column)))
          const mapping = { ...proposed, ...deterministic.mapping }
          return {
            mapping,
            missingRequired: deterministic.missingRequired.filter((field) => !mapping[field]),
          }
        })(),
    aiInterpretation: snapshot.interpretation ?? { status: 'NOT_NEEDED', plan: null, message: null },
    reconciliation: snapshot.reconciliation ?? null,
    completion: completionCounts(job),
    sessionsStillNeedingReview: workspace?.summary.sessionsNeedingReview ?? null,
    confirmationMode: 'ATOMIC_ALL_OR_NOTHING' as const,
  }
}

export async function selectAgendaImportWorksheet(input: {
  accountId: string; eventId: string; importJobId: string; worksheetName?: string; worksheetIndex?: number
}, db: AgendaDb = prisma) {
  const { job } = await getScopedImportJob(input, db)
  if (job.status === EventAgendaImportStatus.CONFIRMING || job.status === EventAgendaImportStatus.COMPLETED || job.status === EventAgendaImportStatus.CANCELLED) {
    throw importError('This import can no longer change worksheets', 409, 'IMPORT_LOCKED')
  }
  const snapshot = parseSnapshot(job.mappingSnapshot)
  const worksheet = findWorksheet(snapshot, input)
  await db.$transaction(async (transaction) => {
    await transaction.eventAgendaImportRow.deleteMany({ where: { importJobId: job.id } })
    await transaction.eventAgendaImportJob.update({
      where: { id: job.id },
      data: {
        status: EventAgendaImportStatus.MAPPING,
        worksheetName: worksheet.name,
        worksheetIndex: worksheet.index,
        mappingSnapshot: asJson({ ...snapshot, mapping: null }),
        failureCode: null,
        failureMessage: null,
        duplicateRowCount: 0,
      },
    })
  })
  return getAgendaImport(input, db)
}

/** Cancel only the staged import state; it never touches sessions or speakers. */
export async function discardAgendaImport(input: {
  accountId: string; eventId: string; importJobId: string
}, db: AgendaDb = prisma) {
  const { job } = await getScopedImportJob(input, db)
  if (job.status === EventAgendaImportStatus.COMPLETED || job.status === EventAgendaImportStatus.CONFIRMING) {
    throw importError('A completed or confirming import cannot be discarded', 409, 'IMPORT_LOCKED')
  }
  if (job.status === EventAgendaImportStatus.CANCELLED) return { importJobId: job.id, discarded: true, idempotentReplay: true }
  await db.$transaction(async (transaction) => {
    await transaction.eventAgendaImportRow.deleteMany({ where: { importJobId: job.id, eventId: input.eventId } })
    await transaction.eventAgendaImportJob.update({
      where: { id: job.id },
      data: {
        status: EventAgendaImportStatus.CANCELLED,
        failureCode: null,
        failureMessage: null,
        mappingSnapshot: Prisma.JsonNull,
      },
    })
  })
  return { importJobId: job.id, discarded: true, idempotentReplay: false }
}

export async function saveAgendaImportMapping(input: {
  accountId: string; eventId: string; importJobId: string; mapping: unknown; timezone: string; assignSpeakersToEvent?: boolean
}, db: AgendaDb = prisma) {
  const { scope, job } = await getScopedImportJob(input, db)
  if (job.status === EventAgendaImportStatus.CONFIRMING || job.status === EventAgendaImportStatus.COMPLETED || job.status === EventAgendaImportStatus.CANCELLED) {
    throw importError('This import can no longer change its mapping', 409, 'IMPORT_LOCKED')
  }
  const snapshot = parseSnapshot(job.mappingSnapshot)
  const worksheet = findWorksheet(snapshot, { worksheetName: job.worksheetName ?? undefined, worksheetIndex: job.worksheetIndex ?? undefined })
  const importType = snapshot.importType
  const mapping = importType === 'SPEAKER_ROSTER'
    ? eventSpeakerRosterImportMappingSchema.parse(input.mapping)
    : eventAgendaImportMappingSchema.parse(input.mapping)
  for (const [field, column] of Object.entries(mapping)) {
    if (column && !worksheet.columns.includes(column)) throw importError(`Mapped column “${column}” for ${field} does not exist`, 400, 'MAPPING_COLUMN_NOT_FOUND')
  }
  try { new Intl.DateTimeFormat('en-US', { timeZone: input.timezone }).format(new Date()) } catch { throw importError('Choose a valid IANA timezone', 400, 'INVALID_TIMEZONE') }

  const [existingSessions, existingSpeakers] = await Promise.all([
    db.eventStructureItem.findMany({
      where: { eventId: scope.eventId, kind: EventStructureItemKind.SESSION, isActive: true },
      select: {
        id: true,
        name: true,
        description: true,
        startsAt: true,
        endsAt: true,
        metadata: true,
        speakerAssignments: { select: { speaker: { select: { normalizedName: true, normalizedEmail: true } } } },
      },
    }),
    db.eventSpeakerProfile.findMany({
      where: { accountId: scope.accountId, isArchived: false },
      select: { id: true, normalizedName: true, normalizedEmail: true, organization: true, title: true },
    }),
  ])
  const rows = importType === 'SPEAKER_ROSTER'
    ? classifySpeakerRosterImportRows({ eventId: scope.eventId, importJobId: job.id, checksumSha256: job.sourceChecksumSha256, worksheet, mapping, existingSpeakers })
    : classifyAgendaImportRows({
        eventId: scope.eventId,
        importJobId: job.id,
        checksumSha256: job.sourceChecksumSha256,
        worksheet,
        mapping,
        timezone: input.timezone,
        eventStartDate: scope.eventStartDate,
        eventEndDate: scope.eventEndDate,
        existingSessions,
        existingSpeakers,
      })
  if (rows.length === 0 || rows.every((row) => row.status === EventAgendaImportRowStatus.IGNORED)) {
    throw importError('The selected worksheet has no agenda rows to import', 400, 'NO_IMPORTABLE_ROWS')
  }
  const status = rows.every(rowIsResolved) ? EventAgendaImportStatus.READY : EventAgendaImportStatus.NEEDS_REVIEW
  const nextSnapshot: ImportSnapshot = {
    ...snapshot,
    mapping: {
      worksheetName: worksheet.name,
      worksheetIndex: worksheet.index,
      timezone: input.timezone,
      columns: mapping,
      assignSpeakersToEvent: importType === 'SPEAKER_ROSTER' ? input.assignSpeakersToEvent !== false : true,
    },
    reconciliation: importType === 'AGENDA'
      ? buildEventAgendaReconciliationPlan({ rows, existingSessions })
      : null,
  }
  await db.$transaction(async (transaction) => {
    await transaction.eventAgendaImportRow.deleteMany({ where: { importJobId: job.id } })
    if (rows.length > 0) await transaction.eventAgendaImportRow.createMany({ data: rows })
    await transaction.eventAgendaImportJob.update({
      where: { id: job.id },
      data: {
        status,
        mappingSnapshot: asJson(nextSnapshot),
        createdSessionCount: 0,
        updatedSessionCount: 0,
        skippedRowCount: 0,
        duplicateRowCount: rows.filter((row) => row.status === EventAgendaImportRowStatus.DUPLICATE).length,
        failedRowCount: 0,
        createdSpeakerCount: 0,
        matchedSpeakerCount: 0,
        confirmedByUserId: null,
        confirmedAt: null,
        completedAt: null,
        failureCode: null,
        failureMessage: null,
      },
    })
  }, { maxWait: 5_000, timeout: 30_000 })
  return getAgendaImport(input, db)
}

export async function saveAgendaImportDecisions(input: {
  accountId: string; eventId: string; importJobId: string; decisions: unknown
}, db: AgendaDb = prisma) {
  const { scope, job } = await getScopedImportJob(input, db)
  if (job.status === EventAgendaImportStatus.CONFIRMING || job.status === EventAgendaImportStatus.COMPLETED || job.status === EventAgendaImportStatus.CANCELLED) {
    throw importError('This import can no longer change row decisions', 409, 'IMPORT_LOCKED')
  }
  const decisions = z.array(eventAgendaImportRowDecisionSchema).min(1).parse(input.decisions)
  const rowsById = new Map(job.rows.map((row) => [row.id, row]))
  const candidateIds = [...new Set(decisions.flatMap((decision) => decision.speakerResolutions ?? []).flatMap((speaker) => speaker.matchedSpeakerId ? [speaker.matchedSpeakerId] : []))]
  const allowedSpeakers = candidateIds.length === 0 ? [] : await db.eventSpeakerProfile.findMany({
    where: { accountId: scope.accountId, isArchived: false, id: { in: candidateIds } }, select: { id: true },
  })
  const allowedIds = new Set(allowedSpeakers.map((speaker) => speaker.id))
  for (const decision of decisions) {
    const row = rowsById.get(decision.rowId)
    if (!row) throw importError('Import row not found or access denied', 404, 'IMPORT_ROW_NOT_FOUND')
    if (decision.resolution === EventAgendaImportResolution.REPLACE_EXISTING
      && (!row.existingSessionId || (row.conflictType !== EventAgendaImportConflictType.EXACT_DUPLICATE
        && row.conflictType !== EventAgendaImportConflictType.EXTERNAL_ID_MATCH
        && row.conflictType !== EventAgendaImportConflictType.POSSIBLE_DUPLICATE))) {
      throw importError('Only a matched existing session can be replaced', 400, 'INVALID_ROW_RESOLUTION')
    }
    if (decision.speakerResolutions) {
      const stored = z.array(eventAgendaSpeakerResolutionSchema).safeParse(row.speakerResolutionSnapshot ?? [])
      if (!stored.success || stored.data.length !== decision.speakerResolutions.length
        || stored.data.some((speaker, index) => normalizeSpeakerName(speaker.sourceName) !== normalizeSpeakerName(decision.speakerResolutions![index].sourceName)
          || normalizeSpeakerEmail(speaker.sourceEmail) !== normalizeSpeakerEmail(decision.speakerResolutions![index].sourceEmail))) {
        throw importError('Speaker decisions must preserve the imported speaker identities', 400, 'SPEAKER_SOURCE_MISMATCH')
      }
    }
    for (const speaker of decision.speakerResolutions ?? []) {
      if (speaker.decision === 'CREATE_NEW' && speaker.candidateSpeakerIds.length > 0) {
        throw importError('Choose Keep separate when creating a new profile despite a match candidate', 400, 'SPEAKER_DECISION_REQUIRED')
      }
      if (['LINK_EXISTING', 'MERGE'].includes(speaker.decision ?? '') && (!speaker.matchedSpeakerId || !allowedIds.has(speaker.matchedSpeakerId))) {
        throw importError('Speaker match is outside this account or unavailable', 400, 'INVALID_SPEAKER_MATCH')
      }
    }
  }
  await db.$transaction(async (transaction) => {
    for (const decision of decisions) {
      const row = rowsById.get(decision.rowId)!
      await transaction.eventAgendaImportRow.update({
        where: { id: row.id },
        data: {
          resolution: decision.resolution,
          ...(decision.speakerResolutions ? { speakerResolutionSnapshot: asJson(decision.speakerResolutions) } : {}),
        },
      })
    }
    const rows = await transaction.eventAgendaImportRow.findMany({ where: { importJobId: job.id } })
    const status = rows.every(rowIsResolved) ? EventAgendaImportStatus.READY : EventAgendaImportStatus.NEEDS_REVIEW
    await transaction.eventAgendaImportJob.update({ where: { id: job.id }, data: { status, failureCode: null, failureMessage: null } })
  })
  return getAgendaImport(input, db)
}

/**
 * Applies an operator correction to staged normalized data only. The server
 * revalidates the canonical row and rebuilds speaker match proposals before a
 * corrected row can become confirmable.
 */
export async function saveAgendaImportRowCorrection(input: {
  accountId: string; eventId: string; importJobId: string; correction: unknown
}, db: AgendaDb = prisma) {
  const { scope, job } = await getScopedImportJob(input, db)
  if (job.status === EventAgendaImportStatus.CONFIRMING || job.status === EventAgendaImportStatus.COMPLETED || job.status === EventAgendaImportStatus.CANCELLED) {
    throw importError('This import can no longer change review data', 409, 'IMPORT_LOCKED')
  }
  const correction = eventAgendaImportRowCorrectionSchema.parse(input.correction)
  const snapshot = parseSnapshot(job.mappingSnapshot)
  const row = job.rows.find((candidate) => candidate.id === correction.rowId)
  if (!row) throw importError('Import row not found or access denied', 404, 'IMPORT_ROW_NOT_FOUND')
  const normalized = correction.normalizedRow
  if (Boolean(normalized.startsAt) !== Boolean(normalized.endsAt) || Boolean(normalized.startsAt) !== Boolean(normalized.timezone)) {
    throw importError('Start time, end time, and timezone must be corrected together', 400, 'INCOMPLETE_SESSION_SCHEDULE')
  }
  if (normalized.startsAt && normalized.endsAt && new Date(normalized.endsAt) <= new Date(normalized.startsAt)) {
    throw importError('End time must be after start time', 400, 'END_BEFORE_START')
  }
  const [existingSpeakers, existingSessions] = await Promise.all([
    db.eventSpeakerProfile.findMany({
      where: { accountId: scope.accountId, isArchived: false },
      select: { id: true, normalizedName: true, normalizedEmail: true, organization: true, title: true },
    }),
    db.eventStructureItem.findMany({
      where: { eventId: scope.eventId, kind: EventStructureItemKind.SESSION, isActive: true },
      select: {
        id: true, name: true, description: true, startsAt: true, endsAt: true, metadata: true,
        speakerAssignments: { select: { speaker: { select: { normalizedName: true, normalizedEmail: true } } } },
      },
    }),
  ])
  const speakerResolutions = normalized.speakers.map((speaker) => speakerCandidates(speaker, existingSpeakers))
  const ambiguous = speakerResolutions.some((speaker) => speaker.decision === null)
  const validationIssues = ambiguous
    ? [{ code: 'AMBIGUOUS_SPEAKER_MATCH', field: 'speakers', message: 'One or more speakers require an explicit match decision', severity: 'WARNING' }]
    : []
  await db.$transaction(async (transaction) => {
    await transaction.eventAgendaImportRow.update({
      where: { id: row.id },
      data: {
        normalizedRowSnapshot: asJson(normalized),
        speakerResolutionSnapshot: asJson(speakerResolutions),
        validationIssues: asJson(validationIssues),
        status: ambiguous || row.existingSessionId ? EventAgendaImportRowStatus.NEEDS_REVIEW : EventAgendaImportRowStatus.READY,
        resolution: row.existingSessionId ? row.resolution : null,
      },
    })
    const rows = await transaction.eventAgendaImportRow.findMany({ where: { importJobId: job.id } })
    const reconciliation = snapshot.importType === 'AGENDA'
      ? buildEventAgendaReconciliationPlan({ rows, existingSessions })
      : null
    await transaction.eventAgendaImportJob.update({
      where: { id: job.id },
      data: {
        status: rows.every(rowIsResolved) ? EventAgendaImportStatus.READY : EventAgendaImportStatus.NEEDS_REVIEW,
        mappingSnapshot: asJson({ ...snapshot, reconciliation }),
        failureCode: null,
        failureMessage: null,
      },
    })
  })
  return getAgendaImport(input, db)
}

function sessionPayload(normalized: z.infer<typeof eventAgendaNormalizedRowSchema>, confirmLiveEdit: boolean) {
  return {
    title: normalized.title,
    description: normalized.description ?? null,
    startsAt: normalized.startsAt,
    endsAt: normalized.endsAt,
    timezone: normalized.timezone ?? null,
    room: normalized.room ?? null,
    track: normalized.track ?? null,
    format: normalized.format ?? null,
    externalId: normalized.externalId ?? null,
    capacity: normalized.capacity ?? null,
    tags: normalized.tags,
    confirmWarnings: true,
    confirmLiveEdit,
  }
}

/**
 * Production roster imports deliberately avoid per-row profile lookups and
 * event-membership writes. The generic agenda importer still uses its
 * canonical service adapters; this specialized branch is only for the
 * account-level speaker directory and keeps its writes inside the same
 * confirmation transaction.
 */
async function confirmSpeakerRosterImportInBatches(input: {
  accountId: string
  eventId: string
  rows: Array<{
    id: string
    status: EventAgendaImportRowStatus
    resolution: EventAgendaImportResolution | null
    normalizedRowSnapshot: unknown
    speakerResolutionSnapshot: unknown
  }>
  assignSpeakersToEvent: boolean
}, transaction: SpeakerRosterBatchDb) {
  const actionable = input.rows.filter((row) => row.status !== EventAgendaImportRowStatus.IGNORED && row.resolution !== EventAgendaImportResolution.SKIP)
  const parsed = actionable.map((row) => ({
    row,
    normalized: eventSpeakerRosterNormalizedRowSchema.parse(row.normalizedRowSnapshot),
    resolution: z.array(eventAgendaSpeakerResolutionSchema).parse(row.speakerResolutionSnapshot ?? [])[0],
  }))
  const selectedIds = parsed.flatMap(({ resolution }) => resolution?.matchedSpeakerId ? [resolution.matchedSpeakerId] : [])
  const importedEmails = parsed.flatMap(({ normalized }) => normalizeSpeakerEmail(normalized.email) ? [normalizeSpeakerEmail(normalized.email)!] : [])
  const existing: Array<{ id: string; normalizedEmail: string | null }> = (selectedIds.length || importedEmails.length) ? await transaction.eventSpeakerProfile.findMany({
    where: {
      accountId: input.accountId,
      isArchived: false,
      OR: [
        ...(selectedIds.length ? [{ id: { in: [...new Set(selectedIds)] } }] : []),
        ...(importedEmails.length ? [{ normalizedEmail: { in: [...new Set(importedEmails)] } }] : []),
      ],
    },
    select: { id: true, normalizedEmail: true },
  }) : []
  const existingById = new Map(existing.map((speaker) => [speaker.id, speaker]))
  const existingByEmail = new Map(existing.flatMap((speaker) => speaker.normalizedEmail ? [[speaker.normalizedEmail, speaker] as const] : []))
  const profilesToCreate: Array<{ id: string; accountId: string; name: string; normalizedName: string; normalizedEmail: string | null; email: string | null; organization: string | null; title: string | null; phone: string | null; biography: string | null }> = []
  const importedProfiles = new Map<string, string>()
  const resolved: Array<{ rowId: string; speakerId: string; created: boolean }> = []
  let createdSpeakerCount = 0
  let matchedSpeakerCount = 0

  for (const { row, normalized, resolution } of parsed) {
    if (!resolution || resolution.decision === 'IGNORE') continue
    let speakerId = resolution.matchedSpeakerId ?? null
    let created = false
    if (resolution.decision === 'LINK_EXISTING' || resolution.decision === 'MERGE') {
      if (!speakerId || !existingById.has(speakerId)) throw importError('Speaker match is outside this account or unavailable', 409, 'INVALID_SPEAKER_MATCH')
      matchedSpeakerCount += 1
    } else {
      const normalizedEmail = normalizeSpeakerEmail(normalized.email)
      const identity = normalizedEmail ?? normalizeSpeakerName(normalized.displayName)
      if (resolution.decision === 'CREATE_NEW') speakerId = importedProfiles.get(identity) ?? null
      if (!speakerId && normalizedEmail) {
        speakerId = existingByEmail.get(normalizedEmail)?.id ?? null
        if (speakerId) matchedSpeakerCount += 1
      }
      if (!speakerId) {
        const newSpeakerId = randomUUID()
        speakerId = newSpeakerId
        created = true
        profilesToCreate.push({
          id: newSpeakerId,
          accountId: input.accountId,
          name: normalized.displayName,
          normalizedName: normalizeSpeakerName(normalized.displayName),
          normalizedEmail,
          email: normalized.email,
          organization: normalized.organization,
          title: normalized.title,
          phone: normalized.phone,
          biography: normalized.biography,
        })
        createdSpeakerCount += 1
      }
      if (resolution.decision === 'CREATE_NEW' && speakerId) importedProfiles.set(identity, speakerId)
    }
    if (!speakerId) throw importError('Speaker resolution is incomplete', 409, 'SPEAKER_RESOLUTION_INCOMPLETE', { rowId: row.id })
    resolved.push({ rowId: row.id, speakerId, created })
  }

  if (profilesToCreate.length) await transaction.eventSpeakerProfile.createMany({ data: profilesToCreate })

  if (input.assignSpeakersToEvent && resolved.length) {
    const speakerIds = [...new Set(resolved.map((item) => item.speakerId))]
    const currentMemberships = await transaction.eventSessionSpeakerAssignment.findMany({
      where: { accountId: input.accountId, eventId: input.eventId, sessionId: null, speakerId: { in: speakerIds } },
      select: { speakerId: true },
    })
    const alreadyAssigned = new Set(currentMemberships.map((assignment) => assignment.speakerId))
    const missingMemberships = speakerIds.filter((speakerId) => !alreadyAssigned.has(speakerId)).map((speakerId) => ({
      accountId: input.accountId,
      eventId: input.eventId,
      sessionId: null,
      speakerId,
      metadata: { eventRosterMembership: true },
    }))
    if (missingMemberships.length) await transaction.eventSessionSpeakerAssignment.createMany({ data: missingMemberships })
  }

  const skippedRowIds = input.rows.filter((row) => row.status === EventAgendaImportRowStatus.IGNORED || row.resolution === EventAgendaImportResolution.SKIP).map((row) => row.id)
  const createdRowIds = resolved.filter((item) => item.created).map((item) => item.rowId)
  const reusedRowIds = resolved.filter((item) => !item.created).map((item) => item.rowId)
  const processedAt = new Date()
  if (skippedRowIds.length) await transaction.eventAgendaImportRow.updateMany({ where: { id: { in: skippedRowIds } }, data: { status: EventAgendaImportRowStatus.CONFIRMED, result: EventAgendaImportRowResult.SKIPPED, processedAt, resultMessage: 'Speaker skipped by import decision' } })
  const resultMessage = input.assignSpeakersToEvent ? 'Speaker added to this event; no session assignment was created' : 'Speaker added to the account speaker library'
  if (createdRowIds.length) await transaction.eventAgendaImportRow.updateMany({ where: { id: { in: createdRowIds } }, data: { status: EventAgendaImportRowStatus.CONFIRMED, result: EventAgendaImportRowResult.CREATED, processedAt, resultMessage } })
  if (reusedRowIds.length) await transaction.eventAgendaImportRow.updateMany({ where: { id: { in: reusedRowIds } }, data: { status: EventAgendaImportRowStatus.CONFIRMED, result: EventAgendaImportRowResult.UPDATED, processedAt, resultMessage } })

  return { createdSpeakerCount, matchedSpeakerCount, skippedRowCount: skippedRowIds.length }
}

function importSlugBase(name: string) {
  return name.toLocaleLowerCase('en-US').trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/g, '') || 'agenda-session'
}

/** Batch agenda confirmation uses the same staged canonical contract while
 * avoiding speaker/session lookups inside the row loop. */
async function confirmAgendaImportInBatches(input: {
  accountId: string
  eventId: string
  importJobId: string
  sessionDrivenSpeakers: boolean
  rows: Array<{
    id: string
    sourceRowNumber: number
    sourceExternalId: string | null
    status: EventAgendaImportRowStatus
    resolution: EventAgendaImportResolution | null
    normalizedRowSnapshot: unknown
    speakerResolutionSnapshot: unknown
    existingSessionId: string | null
  }>
}, transaction: AgendaBatchDb) {
  const actionable = input.rows.filter((row) => row.status !== EventAgendaImportRowStatus.IGNORED && row.resolution !== EventAgendaImportResolution.SKIP)
  const parsed = actionable.map((row) => ({
    row,
    normalized: eventAgendaNormalizedRowSchema.parse(row.normalizedRowSnapshot),
    resolutions: z.array(eventAgendaSpeakerResolutionSchema).parse(row.speakerResolutionSnapshot ?? []),
  }))
  const selectedIds = [...new Set(parsed.flatMap(({ resolutions }) => resolutions.flatMap((speaker) => speaker.matchedSpeakerId ? [speaker.matchedSpeakerId] : [])))]
  const importedEmails = [...new Set(parsed.flatMap(({ resolutions }) => resolutions.flatMap((speaker) => normalizeSpeakerEmail(speaker.sourceEmail) ? [normalizeSpeakerEmail(speaker.sourceEmail)!] : [])))]
  const existingSpeakers = selectedIds.length || importedEmails.length ? await transaction.eventSpeakerProfile.findMany({
    where: {
      accountId: input.accountId,
      isArchived: false,
      OR: [
        ...(selectedIds.length ? [{ id: { in: selectedIds } }] : []),
        ...(importedEmails.length ? [{ normalizedEmail: { in: importedEmails } }] : []),
      ],
    },
    select: { id: true, normalizedEmail: true },
  }) : []
  const speakerById = new Map(existingSpeakers.map((speaker) => [speaker.id, speaker]))
  const speakerByEmail = new Map(existingSpeakers.flatMap((speaker) => speaker.normalizedEmail ? [[speaker.normalizedEmail, speaker] as const] : []))
  const importedSpeakers = new Map<string, string>()
  const profilesToCreate: Prisma.EventSpeakerProfileCreateManyInput[] = []
  let createdSpeakerCount = 0
  let matchedSpeakerCount = 0

  const resolvedRows = parsed.map(({ row, normalized, resolutions }) => {
    const speakers = resolutions.flatMap((resolution, sortOrder) => {
      if (resolution.decision === 'IGNORE') return []
      let speakerId = resolution.matchedSpeakerId ?? null
      if (resolution.decision === 'LINK_EXISTING' || resolution.decision === 'MERGE') {
        if (!speakerId || !speakerById.has(speakerId)) throw importError('Speaker match is outside this account or unavailable', 409, 'INVALID_SPEAKER_MATCH')
        matchedSpeakerCount += 1
      } else {
        const identity = normalizeSpeakerEmail(resolution.sourceEmail) ?? `name:${normalizeSpeakerName(resolution.sourceName)}`
        if (resolution.decision === 'CREATE_NEW') speakerId = importedSpeakers.get(identity) ?? null
        if (!speakerId && resolution.sourceEmail) {
          speakerId = speakerByEmail.get(normalizeSpeakerEmail(resolution.sourceEmail)!)?.id ?? null
          if (speakerId) matchedSpeakerCount += 1
        }
        if (!speakerId) {
          speakerId = randomUUID()
          profilesToCreate.push({
            id: speakerId,
            accountId: input.accountId,
            name: resolution.sourceName,
            normalizedName: normalizeSpeakerName(resolution.sourceName),
            email: resolution.sourceEmail ?? null,
            normalizedEmail: normalizeSpeakerEmail(resolution.sourceEmail),
            organization: resolution.sourceOrganization ?? null,
            title: resolution.sourceTitle ?? null,
          })
          createdSpeakerCount += 1
        }
        if (resolution.decision === 'CREATE_NEW') importedSpeakers.set(identity, speakerId)
      }
      return [{ speakerId, sortOrder }]
    })
    return { row, normalized, speakers }
  })
  if (profilesToCreate.length) await transaction.eventSpeakerProfile.createMany({ data: profilesToCreate })

  const existingSlugs = await transaction.eventStructureItem.findMany({ where: { eventId: input.eventId }, select: { slug: true } })
  const usedSlugs = new Set(existingSlugs.map((session) => session.slug))
  const nextSlug = (title: string) => {
    const base = importSlugBase(title)
    let slug = base
    let suffix = 1
    while (usedSlugs.has(slug)) { suffix += 1; slug = `${base}-${suffix}` }
    usedSlugs.add(slug)
    return slug
  }
  const createdSessions: Prisma.EventStructureItemCreateManyInput[] = []
  const updatedSessions: Array<{ id: string; data: Prisma.EventStructureItemUpdateInput }> = []
  const applied = resolvedRows.map(({ row, normalized, speakers }) => {
    const importSource = { importJobId: input.importJobId, importRowId: row.id, sourceExternalId: row.sourceExternalId }
    const metadata = asJson({
      schemaVersion: 1,
      room: normalized.room ?? null,
      track: normalized.track ?? null,
      format: normalized.format ?? null,
      externalId: normalized.externalId ?? null,
      capacity: normalized.capacity ?? null,
      tags: normalized.tags,
      importSource,
    })
    const values = {
      name: normalized.title,
      description: normalized.description ?? null,
      startsAt: normalized.startsAt ? new Date(normalized.startsAt) : null,
      endsAt: normalized.endsAt ? new Date(normalized.endsAt) : null,
      timezone: normalized.timezone ?? null,
      metadata,
      isActive: true,
    }
    if (row.resolution === EventAgendaImportResolution.REPLACE_EXISTING) {
      if (!row.existingSessionId) throw importError('Replacement row lost its existing-session match', 409, 'IMPORT_MATCH_MISSING')
      updatedSessions.push({ id: row.existingSessionId, data: values })
      return { row, sessionId: row.existingSessionId, speakers, result: EventAgendaImportRowResult.UPDATED }
    }
    const sessionId = randomUUID()
    createdSessions.push({ id: sessionId, eventId: input.eventId, kind: EventStructureItemKind.SESSION, slug: nextSlug(normalized.title), sortOrder: row.sourceRowNumber, ...values })
    return { row, sessionId, speakers, result: EventAgendaImportRowResult.CREATED }
  })
  if (createdSessions.length) await transaction.eventStructureItem.createMany({ data: createdSessions })
  if (updatedSessions.length) await Promise.all(updatedSessions.map((session) => transaction.eventStructureItem.update({ where: { id: session.id }, data: session.data })))

  const replacedSessionIds = updatedSessions.map((session) => session.id)
  if (replacedSessionIds.length) await transaction.eventSessionSpeakerAssignment.deleteMany({ where: { eventId: input.eventId, sessionId: { in: replacedSessionIds } } })
  const speakerIds = [...new Set(applied.flatMap((item) => item.speakers.map((speaker) => speaker.speakerId)))]
  if (speakerIds.length) {
    if (!input.sessionDrivenSpeakers) {
      await transaction.eventSessionSpeakerAssignment.createMany({ data: speakerIds.map((speakerId) => ({ accountId: input.accountId, eventId: input.eventId, sessionId: null, speakerId, metadata: { eventRosterMembership: true } })), skipDuplicates: true })
    }
    await transaction.eventSessionSpeakerAssignment.createMany({ data: applied.flatMap((item) => item.speakers.map((speaker) => ({ accountId: input.accountId, eventId: input.eventId, sessionId: item.sessionId, speakerId: speaker.speakerId, sortOrder: speaker.sortOrder }))), skipDuplicates: true })
  }
  const processedAt = new Date()
  await Promise.all(applied.map((item) => transaction.eventAgendaImportRow.update({
    where: { id: item.row.id },
    data: { status: EventAgendaImportRowStatus.CONFIRMED, result: item.result, resultSessionId: item.sessionId, processedAt, resultMessage: null },
  })))
  const skippedIds = input.rows.filter((row) => row.status === EventAgendaImportRowStatus.IGNORED || row.resolution === EventAgendaImportResolution.SKIP).map((row) => row.id)
  if (skippedIds.length) await transaction.eventAgendaImportRow.updateMany({ where: { id: { in: skippedIds } }, data: { status: EventAgendaImportRowStatus.CONFIRMED, result: EventAgendaImportRowResult.SKIPPED, processedAt, resultMessage: 'Skipped by import decision' } })
  return {
    createdSessionCount: createdSessions.length,
    updatedSessionCount: updatedSessions.length,
    skippedRowCount: skippedIds.length,
    createdSpeakerCount,
    matchedSpeakerCount,
  }
}

export async function confirmAgendaImport(input: {
  accountId: string; eventId: string; importJobId: string; userId: string; confirmLiveEdit?: boolean
}, db: AgendaDb = prisma, services: AgendaImportCanonicalServices = canonicalServices) {
  const scoped = await getScopedImportJob(input, db)
  const actor = await requireImportActor({ accountId: scoped.scope.accountId, userId: input.userId }, db)
  if (scoped.job.status === EventAgendaImportStatus.COMPLETED) {
    const workspace = await getEventAgendaWorkspace({ accountId: input.accountId, eventId: input.eventId }, db)
    return { job: scoped.job, completion: completionCounts(scoped.job), idempotentReplay: true, sessionsStillNeedingReview: workspace.summary.sessionsNeedingReview }
  }
  if (!scoped.job.rows.every(rowIsResolved)) throw importError('Resolve or skip every review row before confirming', 409, 'IMPORT_NOT_READY')
  if (scoped.job.status === EventAgendaImportStatus.FAILED) {
    await db.eventAgendaImportJob.update({ where: { id: scoped.job.id }, data: { status: EventAgendaImportStatus.READY, failureCode: null, failureMessage: null } })
  } else if (scoped.job.status !== EventAgendaImportStatus.READY) {
    throw importError('Import is not ready to confirm', 409, 'IMPORT_NOT_READY')
  }
  const importType = parseSnapshot(scoped.job.mappingSnapshot).importType
  if (importType === 'SPEAKER_ROSTER' && scoped.scope.eventType === EventType.TEMPLATE) {
    throw importError('Template events import speakers through agenda sessions', 409, 'TEMPLATE_SPEAKER_ROSTER_NOT_SUPPORTED')
  }
  if (importType === 'AGENDA' && scoped.scope.eventStatus === 'ACTIVE' && input.confirmLiveEdit !== true) {
    throw importError('Confirm this schedule import before changing an active event', 409, 'LIVE_EVENT_CONFIRMATION_REQUIRED')
  }

  try {
    const result = await db.$transaction(async (transaction) => {
      const claimed = await transaction.eventAgendaImportJob.updateMany({
        where: { id: scoped.job.id, eventId: scoped.scope.eventId, accountId: scoped.scope.accountId, status: EventAgendaImportStatus.READY },
        data: { status: EventAgendaImportStatus.CONFIRMING, confirmedByUserId: actor.id, confirmedAt: new Date() },
      })
      if (claimed.count !== 1) {
        const current = await transaction.eventAgendaImportJob.findFirst({ where: { id: scoped.job.id, eventId: scoped.scope.eventId, accountId: scoped.scope.accountId }, include: { rows: true } })
        if (current?.status === EventAgendaImportStatus.COMPLETED) return { job: current, idempotentReplay: true }
        throw importError('Import confirmation is already in progress', 409, 'IMPORT_CONFIRMATION_IN_PROGRESS')
      }
      const job = await transaction.eventAgendaImportJob.findFirst({
        where: { id: scoped.job.id, eventId: scoped.scope.eventId, accountId: scoped.scope.accountId },
        include: { rows: { orderBy: { sourceRowNumber: 'asc' } } },
      })
      if (!job) throw importError('Agenda import not found', 404, 'IMPORT_NOT_FOUND')

      let createdSessionCount = 0
      let updatedSessionCount = 0
      let skippedRowCount = 0
      let createdSpeakerCount = 0
      let matchedSpeakerCount = 0
      const importedSpeakers = new Map<string, string>()
      const snapshot = parseSnapshot(job.mappingSnapshot)
      const importType = snapshot.importType
      const assignSpeakersToEvent = snapshot.mapping?.assignSpeakersToEvent !== false

      const supportsBatchedRosterImport = importType === 'SPEAKER_ROSTER'
        && services === canonicalServices
        && typeof transaction.eventSpeakerProfile.createMany === 'function'
        && typeof transaction.eventSessionSpeakerAssignment.createMany === 'function'
      if (supportsBatchedRosterImport) {
        const result = await confirmSpeakerRosterImportInBatches({
          accountId: scoped.scope.accountId,
          eventId: scoped.scope.eventId,
          rows: job.rows,
          assignSpeakersToEvent,
        }, transaction)
        createdSpeakerCount = result.createdSpeakerCount
        matchedSpeakerCount = result.matchedSpeakerCount
        skippedRowCount = result.skippedRowCount
      }

      const supportsBatchedAgendaImport = importType === 'AGENDA'
        && services === canonicalServices
        && typeof transaction.eventStructureItem.createMany === 'function'
        && typeof transaction.eventSessionSpeakerAssignment.createMany === 'function'
      if (supportsBatchedAgendaImport) {
        const result = await confirmAgendaImportInBatches({
          accountId: scoped.scope.accountId,
          eventId: scoped.scope.eventId,
          importJobId: job.id,
          sessionDrivenSpeakers: scoped.scope.eventType === EventType.TEMPLATE,
          rows: job.rows,
        }, transaction)
        createdSessionCount = result.createdSessionCount
        updatedSessionCount = result.updatedSessionCount
        skippedRowCount = result.skippedRowCount
        createdSpeakerCount = result.createdSpeakerCount
        matchedSpeakerCount = result.matchedSpeakerCount
      }

      for (const row of supportsBatchedRosterImport || supportsBatchedAgendaImport ? [] : job.rows) {
        if (row.status === EventAgendaImportRowStatus.IGNORED || row.resolution === EventAgendaImportResolution.SKIP) {
          skippedRowCount += 1
          await transaction.eventAgendaImportRow.update({ where: { id: row.id }, data: { status: EventAgendaImportRowStatus.CONFIRMED, result: EventAgendaImportRowResult.SKIPPED, processedAt: new Date(), resultMessage: 'Skipped by import decision' } })
          continue
        }
        if (importType === 'SPEAKER_ROSTER') {
          const normalized = eventSpeakerRosterNormalizedRowSchema.parse(row.normalizedRowSnapshot)
          const resolution = z.array(eventAgendaSpeakerResolutionSchema).parse(row.speakerResolutionSnapshot ?? [])[0]
          if (!resolution || resolution.decision === 'IGNORE') {
            skippedRowCount += 1
            await transaction.eventAgendaImportRow.update({ where: { id: row.id }, data: { status: EventAgendaImportRowStatus.CONFIRMED, result: EventAgendaImportRowResult.SKIPPED, processedAt: new Date(), resultMessage: 'Speaker skipped by import decision' } })
            continue
          }
          let speakerId = resolution.matchedSpeakerId ?? null
          if (resolution.decision === 'LINK_EXISTING' || resolution.decision === 'MERGE') {
            matchedSpeakerCount += 1
          } else {
            const identity = normalizeSpeakerEmail(normalized.email) ?? normalizeSpeakerName(normalized.displayName)
            if (resolution.decision === 'CREATE_NEW') speakerId = importedSpeakers.get(identity) ?? null
            if (!speakerId && resolution.decision === 'CREATE_NEW' && normalized.email) {
              const existing = await transaction.eventSpeakerProfile.findFirst({ where: { accountId: scoped.scope.accountId, isArchived: false, normalizedEmail: normalizeSpeakerEmail(normalized.email) }, select: { id: true } })
              speakerId = existing?.id ?? null
              if (speakerId) matchedSpeakerCount += 1
            }
            if (!speakerId) {
              const created = await services.createSpeaker({
                accountId: scoped.scope.accountId,
                eventId: scoped.scope.eventId,
                profile: { name: normalized.displayName, email: normalized.email, organization: normalized.organization, title: normalized.title },
                confirmDuplicate: resolution.decision === 'KEEP_SEPARATE',
              }, transaction as never)
              speakerId = created.id
              createdSpeakerCount += 1
            }
            if (resolution.decision === 'CREATE_NEW') importedSpeakers.set(identity, speakerId)
          }
          if (!speakerId) throw importError('Speaker resolution is incomplete', 409, 'SPEAKER_RESOLUTION_INCOMPLETE', { rowId: row.id })
          if (assignSpeakersToEvent) {
            await services.addSpeakerToEvent({
              accountId: scoped.scope.accountId,
              eventId: scoped.scope.eventId,
              speakerId,
            }, transaction as never)
          }
          await transaction.eventAgendaImportRow.update({
            where: { id: row.id },
            data: {
              status: EventAgendaImportRowStatus.CONFIRMED,
              result: resolution.matchedSpeakerId ? EventAgendaImportRowResult.UPDATED : EventAgendaImportRowResult.CREATED,
              processedAt: new Date(),
              resultMessage: assignSpeakersToEvent ? 'Speaker added to this event; no session assignment was created' : 'Speaker added to the account speaker library',
            },
          })
          continue
        }
        const normalized = eventAgendaNormalizedRowSchema.parse(row.normalizedRowSnapshot)
        const importSource = { importJobId: job.id, importRowId: row.id, sourceExternalId: row.sourceExternalId }
        let sessionId: string
        let rowResult: EventAgendaImportRowResult
        if (row.resolution === EventAgendaImportResolution.REPLACE_EXISTING) {
          if (!row.existingSessionId) throw importError('Replacement row lost its existing-session match', 409, 'IMPORT_MATCH_MISSING', { rowId: row.id })
          const updated = await services.updateSession({
            accountId: scoped.scope.accountId,
            eventId: scoped.scope.eventId,
            session: { ...sessionPayload(normalized, input.confirmLiveEdit === true), sessionId: row.existingSessionId },
            importSource,
          }, transaction as never)
          sessionId = updated.session.id
          updatedSessionCount += 1
          rowResult = EventAgendaImportRowResult.UPDATED
        } else {
          const created = await services.createSession({
            accountId: scoped.scope.accountId,
            eventId: scoped.scope.eventId,
            session: sessionPayload(normalized, input.confirmLiveEdit === true),
            importSource,
          }, transaction as never)
          sessionId = created.session.id
          createdSessionCount += 1
          rowResult = EventAgendaImportRowResult.CREATED
        }

        const resolutions = z.array(eventAgendaSpeakerResolutionSchema).parse(row.speakerResolutionSnapshot ?? [])
        for (const resolution of resolutions) {
          if (resolution.decision === 'IGNORE') continue
          let speakerId = resolution.matchedSpeakerId ?? null
          if (['LINK_EXISTING', 'MERGE'].includes(resolution.decision ?? '')) {
            matchedSpeakerCount += 1
          } else {
            const identity = normalizeSpeakerEmail(resolution.sourceEmail) ?? normalizeSpeakerName(resolution.sourceName)
            if (resolution.decision === 'CREATE_NEW') speakerId = importedSpeakers.get(identity) ?? null
            if (!speakerId && resolution.decision === 'CREATE_NEW' && resolution.sourceEmail) {
              const existing = await transaction.eventSpeakerProfile.findFirst({
                where: { accountId: scoped.scope.accountId, isArchived: false, normalizedEmail: normalizeSpeakerEmail(resolution.sourceEmail) }, select: { id: true },
              })
              speakerId = existing?.id ?? null
              if (speakerId) matchedSpeakerCount += 1
            }
            if (!speakerId) {
              const created = await services.createSpeaker({
                accountId: scoped.scope.accountId,
                eventId: scoped.scope.eventId,
                profile: {
                  name: resolution.sourceName,
                  email: resolution.sourceEmail ?? null,
                  organization: resolution.sourceOrganization ?? null,
                  title: resolution.sourceTitle ?? null,
                },
                confirmDuplicate: resolution.decision === 'KEEP_SEPARATE',
              }, transaction as never)
              speakerId = created.id
              createdSpeakerCount += 1
            }
            if (resolution.decision === 'CREATE_NEW') importedSpeakers.set(identity, speakerId)
          }
          if (!speakerId) throw importError('Speaker resolution is incomplete', 409, 'SPEAKER_RESOLUTION_INCOMPLETE', { rowId: row.id })
          await services.addSpeakerToEvent({
            accountId: scoped.scope.accountId,
            eventId: scoped.scope.eventId,
            speakerId,
          }, transaction as never)
          await services.assignSpeaker({
            accountId: scoped.scope.accountId,
            eventId: scoped.scope.eventId,
            sessionId,
            assignment: { speakerId, role: 'SPEAKER', sortOrder: 0 },
          }, transaction as never)
        }
        await transaction.eventAgendaImportRow.update({
          where: { id: row.id },
          data: { status: EventAgendaImportRowStatus.CONFIRMED, result: rowResult, resultSessionId: sessionId, processedAt: new Date(), resultMessage: null },
        })
      }
      const completed = await transaction.eventAgendaImportJob.update({
        where: { id: job.id },
        data: {
          status: EventAgendaImportStatus.COMPLETED,
          createdSessionCount,
          updatedSessionCount,
          skippedRowCount,
          failedRowCount: 0,
          createdSpeakerCount,
          matchedSpeakerCount,
          completedAt: new Date(),
          failureCode: null,
          failureMessage: null,
        },
      })
      return { job: completed, idempotentReplay: false }
    }, { maxWait: 5_000, timeout: 120_000 })
    const workspace = await getEventAgendaWorkspace({ accountId: input.accountId, eventId: input.eventId }, db)
    return {
      ...result,
      completion: completionCounts(result.job),
      sessionsStillNeedingReview: workspace.summary.sessionsNeedingReview,
    }
  } catch (error) {
    if (error instanceof EventAgendaServiceError && error.code === 'IMPORT_CONFIRMATION_IN_PROGRESS') throw error
    await db.eventAgendaImportJob.updateMany({
      where: { id: scoped.job.id, eventId: scoped.scope.eventId, accountId: scoped.scope.accountId, status: { in: [EventAgendaImportStatus.READY, EventAgendaImportStatus.CONFIRMING] } },
      data: { status: EventAgendaImportStatus.FAILED, failureCode: error instanceof EventAgendaServiceError ? error.code : 'IMPORT_CONFIRMATION_FAILED', failureMessage: error instanceof Error ? error.message : 'Agenda import confirmation failed', failedRowCount: 1 },
    })
    throw importError('Agenda import failed atomically; no partial agenda changes were kept', 409, 'IMPORT_CONFIRMATION_FAILED', {
      atomic: true,
      resumable: true,
      cause: error instanceof Error ? error.message : 'Unknown import failure',
    })
  }
}
