import { createHash } from 'node:crypto'
import { z } from 'zod'

const nullableTrimmedText = z.string().trim().min(1).nullable().optional()

/**
 * Versioned runtime contract for EventStructureItem(kind=SESSION).metadata.
 * Unknown legacy keys are retained so adopting this contract is additive.
 * Speaker identity is intentionally absent and belongs to EventSpeakerProfile.
 */
export const eventAgendaSessionMetadataSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  room: nullableTrimmedText,
  track: nullableTrimmedText,
  format: nullableTrimmedText,
  externalId: nullableTrimmedText,
  capacity: z.number().int().nonnegative().nullable().optional(),
  tags: z.array(z.string().trim().min(1)).max(50).optional(),
  importSource: z.object({
    importJobId: z.string().trim().min(1),
    importRowId: z.string().trim().min(1),
    sourceExternalId: nullableTrimmedText,
  }).optional(),
}).passthrough()

export type EventAgendaSessionMetadata = z.infer<typeof eventAgendaSessionMetadataSchema>

export const eventSpeakerProfileInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  title: nullableTrimmedText,
  organization: nullableTrimmedText,
  email: z.string().trim().email().nullable().optional(),
  phone: nullableTrimmedText,
  biography: nullableTrimmedText,
})

export const eventSpeakerProfileUpdateInputSchema = eventSpeakerProfileInputSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one speaker field is required')

export const eventSpeakerAssignmentInputSchema = z.object({
  speakerId: z.string().trim().min(1),
  role: z.enum(['SPEAKER', 'MODERATOR', 'HOST', 'PANELIST']),
  sortOrder: z.number().int().nonnegative().default(0),
})

export const eventAgendaSessionInputSchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: nullableTrimmedText,
  // An agenda row can be intentionally unscheduled.  When either boundary is
  // supplied the service below requires both; null never means "use event dates".
  startsAt: z.string().datetime({ offset: true }).nullable().optional(),
  endsAt: z.string().datetime({ offset: true }).nullable().optional(),
  timezone: z.string().trim().min(1).max(100).nullable().optional(),
  room: nullableTrimmedText,
  track: nullableTrimmedText,
  format: nullableTrimmedText,
  externalId: nullableTrimmedText,
  capacity: z.number().int().nonnegative().nullable().optional(),
  tags: z.array(z.string().trim().min(1)).max(50).default([]),
  confirmWarnings: z.boolean().default(false),
  confirmLiveEdit: z.boolean().default(false),
}).strict()

export const eventAgendaSessionUpdateInputSchema = eventAgendaSessionInputSchema.extend({
  sessionId: z.string().trim().min(1),
})

export const eventAgendaImportMappingSchema = z.object({
  title: z.string().trim().min(1),
  startDate: nullableTrimmedText,
  startTime: nullableTrimmedText,
  endTime: nullableTrimmedText,
  endDate: nullableTrimmedText,
  externalId: nullableTrimmedText,
  description: nullableTrimmedText,
  room: nullableTrimmedText,
  track: nullableTrimmedText,
  format: nullableTrimmedText,
  speakerNames: nullableTrimmedText,
  speakerFirstNames: nullableTrimmedText,
  speakerLastNames: nullableTrimmedText,
  speakerEmails: nullableTrimmedText,
  speakerOrganizations: nullableTrimmedText,
  speakerTitles: nullableTrimmedText,
  capacity: nullableTrimmedText,
  tags: nullableTrimmedText,
})

export const eventAgendaNormalizedSpeakerSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().email().nullable().optional(),
  organization: nullableTrimmedText,
  title: nullableTrimmedText,
})

export const eventAgendaNormalizedRowSchema = z.object({
  title: z.string().trim().min(1),
  startsAt: z.string().datetime({ offset: true }).nullable(),
  endsAt: z.string().datetime({ offset: true }).nullable(),
  timezone: z.string().trim().min(1).nullable(),
  externalId: nullableTrimmedText,
  description: nullableTrimmedText,
  room: nullableTrimmedText,
  track: nullableTrimmedText,
  format: nullableTrimmedText,
  capacity: z.number().int().nonnegative().nullable().optional(),
  tags: z.array(z.string().trim().min(1)).max(50).default([]),
  speakers: z.array(eventAgendaNormalizedSpeakerSchema).default([]),
})

export const eventAgendaValidationIssueSchema = z.object({
  code: z.enum([
    'MISSING_REQUIRED_INFORMATION',
    'INVALID_DATE_TIME',
    'END_BEFORE_START',
    'POSSIBLE_OVERLAP',
    'INVALID_CAPACITY',
    'UNKNOWN_FORMAT',
    'AMBIGUOUS_SPEAKER_MATCH',
    'INVALID_EMAIL',
    'UNSUPPORTED_DATE_FORMAT',
    'EMPTY_ROW_IGNORED',
  ]),
  field: z.string().trim().min(1).nullable().optional(),
  message: z.string().trim().min(1),
  severity: z.enum(['ERROR', 'WARNING']),
})
export type EventAgendaValidationIssue = z.infer<typeof eventAgendaValidationIssueSchema>

export const eventAgendaSpeakerResolutionSchema = z.object({
  sourceName: z.string().trim().min(1),
  sourceEmail: z.string().trim().email().nullable().optional(),
  sourceOrganization: nullableTrimmedText,
  sourceTitle: nullableTrimmedText,
  decision: z.enum(['LINK_EXISTING', 'CREATE_NEW', 'KEEP_SEPARATE', 'MERGE', 'IGNORE']).nullable().optional(),
  matchedSpeakerId: z.string().trim().min(1).nullable().optional(),
  candidateSpeakerIds: z.array(z.string().trim().min(1)).default([]),
})

export const eventAgendaImportRowDecisionSchema = z.object({
  rowId: z.string().trim().min(1),
  resolution: z.enum(['SKIP', 'REPLACE_EXISTING', 'KEEP_BOTH', 'REVIEW']),
  speakerResolutions: z.array(eventAgendaSpeakerResolutionSchema).optional(),
})

export const eventAgendaImportRowCorrectionSchema = z.object({
  rowId: z.string().trim().min(1),
  normalizedRow: eventAgendaNormalizedRowSchema,
}).strict()

export class EventAgendaContractError extends Error {
  constructor(message: string, public issues: z.ZodIssue[]) {
    super(message)
    this.name = 'EventAgendaContractError'
  }
}

export function parseEventAgendaSessionMetadata(input: unknown): EventAgendaSessionMetadata {
  const parsed = eventAgendaSessionMetadataSchema.safeParse(input ?? {})
  if (!parsed.success) {
    throw new EventAgendaContractError('Invalid agenda session metadata', parsed.error.issues)
  }

  return {
    ...parsed.data,
    tags: parsed.data.tags ? [...new Set(parsed.data.tags)] : undefined,
  }
}

export function normalizeSpeakerName(name: string) {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

export function normalizeSpeakerEmail(email: string | null | undefined) {
  const normalized = email?.trim().toLocaleLowerCase('en-US')
  return normalized || null
}

function digest(parts: Array<string | number | null | undefined>) {
  return createHash('sha256')
    .update(parts.map((part) => String(part ?? '')).join('\u001f'))
    .digest('hex')
}

export function buildAgendaImportIdempotencyKey(input: {
  eventId: string
  sourceChecksumSha256: string
  importType?: 'AGENDA' | 'SPEAKER_ROSTER'
  worksheetName?: string | null
  worksheetIndex?: number | null
}) {
  return digest([
    'event-agenda-import-v1',
    input.eventId.trim(),
    input.sourceChecksumSha256.trim().toLocaleLowerCase('en-US'),
    input.importType ?? 'AGENDA',
    input.worksheetName?.trim() ?? null,
    input.worksheetIndex,
  ])
}

export function buildAgendaImportStableRowKey(input: {
  sourceChecksumSha256: string
  worksheetName?: string | null
  worksheetIndex?: number | null
  sourceRowNumber: number
}) {
  if (!Number.isInteger(input.sourceRowNumber) || input.sourceRowNumber < 1) {
    throw new Error('sourceRowNumber must be a positive integer')
  }

  return digest([
    'event-agenda-row-v1',
    input.sourceChecksumSha256.trim().toLocaleLowerCase('en-US'),
    input.worksheetName?.trim() ?? null,
    input.worksheetIndex,
    input.sourceRowNumber,
  ])
}
