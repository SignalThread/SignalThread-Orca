import { z } from 'zod'
import { normalizeSpeakerEmail, normalizeSpeakerName } from '@/lib/event-agenda-contract'
import type { AgendaImportSourceRow } from '@/lib/event-agenda-import-parser'
import { EVENT_SPEAKER_ROSTER_IMPORT_FIELDS, type SpeakerRosterImportMappingField } from '@/lib/event-speaker-roster-import-template'
export { EVENT_SPEAKER_ROSTER_IMPORT_FIELDS, type SpeakerRosterImportMappingField } from '@/lib/event-speaker-roster-import-template'

export const eventSpeakerRosterImportMappingSchema = z.object({
  fullName: z.string().trim().min(1).nullable().optional(),
  firstName: z.string().trim().min(1).nullable().optional(),
  lastName: z.string().trim().min(1).nullable().optional(),
  email: z.string().trim().min(1).nullable().optional(),
  organization: z.string().trim().min(1).nullable().optional(),
  title: z.string().trim().min(1).nullable().optional(),
  phone: z.string().trim().min(1).nullable().optional(),
  biography: z.string().trim().min(1).nullable().optional(),
  sessionTitle: z.string().trim().min(1).nullable().optional(),
  externalSessionId: z.string().trim().min(1).nullable().optional(),
  tags: z.string().trim().min(1).nullable().optional(),
}).superRefine((mapping, context) => {
  if (!mapping.fullName && !mapping.firstName) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Map either Full name or First name' })
  if (mapping.fullName && (mapping.firstName || mapping.lastName)) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Full name cannot be mapped with First or Last name' })
})

export const eventSpeakerRosterNormalizedRowSchema = z.object({
  displayName: z.string().trim().min(1).max(200),
  firstName: z.string().trim().min(1).max(100).nullable(),
  lastName: z.string().trim().min(1).max(150).nullable(),
  email: z.string().trim().email().nullable(),
  organization: z.string().trim().min(1).max(200).nullable(),
  title: z.string().trim().min(1).max(200).nullable(),
  phone: z.string().trim().min(1).max(80).nullable(),
  biography: z.string().trim().min(1).max(10_000).nullable(),
  sessionTitle: z.string().trim().min(1).max(300).nullable(),
  externalSessionId: z.string().trim().min(1).max(200).nullable(),
  tags: z.array(z.string().trim().min(1)).max(50),
})

export type NormalizedSpeakerRosterRow = z.infer<typeof eventSpeakerRosterNormalizedRowSchema>

export interface SpeakerRosterIssue { code: 'MISSING_REQUIRED_INFORMATION' | 'INVALID_EMAIL' | 'INVALID_PHONE'; field: string | null; message: string; severity: 'ERROR' | 'WARNING' }

function valueFrom(row: AgendaImportSourceRow, column: string | null | undefined) {
  return column ? row.values[column]?.trim() ?? '' : ''
}

function splitTags(value: string) {
  if (!value) return []
  return value.split(value.includes(';') ? /\s*;\s*/ : /\s*,\s*/).map((item) => item.trim()).filter(Boolean)
}

/**
 * A full-name source remains the speaker's displayed name.  We only derive
 * parts for the uncomplicated two-token case; multipart and prefixed names
 * stay intact rather than being destructively reinterpreted.
 */
export function deriveSpeakerNameParts(displayName: string) {
  const tokens = displayName.trim().split(/\s+/)
  if (tokens.length === 2 && /^[\p{L}'’.-]+$/u.test(tokens[0]) && /^[\p{L}'’.-]+$/u.test(tokens[1])) {
    return { firstName: tokens[0], lastName: tokens[1] }
  }
  return { firstName: null, lastName: null }
}

export function discoverSpeakerRosterImportMapping(columns: string[]) {
  const normalized = columns.map((column) => ({ column, normalized: column.trim().toLocaleLowerCase('en-US').replace(/[^a-z0-9]+/g, ' ').trim() }))
  const mapping: Partial<Record<SpeakerRosterImportMappingField, string>> = {}
  for (const field of EVENT_SPEAKER_ROSTER_IMPORT_FIELDS) {
    const match = normalized.find((column) => field.aliases.includes(column.normalized as never))
    if (match) mapping[field.key] = match.column
  }
  const valid = eventSpeakerRosterImportMappingSchema.safeParse(mapping)
  return { mapping, missingRequired: valid.success ? [] : ['name'] as const }
}

export function normalizeSpeakerRosterImportRow(input: { row: AgendaImportSourceRow; mapping: unknown }) {
  const mapping = eventSpeakerRosterImportMappingSchema.parse(input.mapping)
  if (Object.values(input.row.values).every((value) => !value.trim())) return { normalized: null, empty: true, issues: [] as SpeakerRosterIssue[] }
  const sourceFullName = valueFrom(input.row, mapping.fullName)
  const sourceFirstName = valueFrom(input.row, mapping.firstName)
  const sourceLastName = valueFrom(input.row, mapping.lastName)
  const displayName = sourceFullName || [sourceFirstName, sourceLastName].filter(Boolean).join(' ')
  const issues: SpeakerRosterIssue[] = []
  if (!displayName) issues.push({ code: 'MISSING_REQUIRED_INFORMATION', field: 'name', message: 'Speaker full name or first name is required', severity: 'ERROR' })
  const emailValue = valueFrom(input.row, mapping.email).toLocaleLowerCase('en-US') || null
  if (emailValue && !/^\S+@\S+\.\S+$/.test(emailValue)) issues.push({ code: 'INVALID_EMAIL', field: 'email', message: 'Speaker email is invalid', severity: 'ERROR' })
  const phone = valueFrom(input.row, mapping.phone) || null
  if (phone && !/^\+?[\d\s().-]{7,30}$/.test(phone)) issues.push({ code: 'INVALID_PHONE', field: 'phone', message: 'Speaker phone number is invalid', severity: 'WARNING' })
  if (issues.some((issue) => issue.severity === 'ERROR')) return { normalized: null, empty: false, issues }
  const derived = sourceFullName ? deriveSpeakerNameParts(sourceFullName) : { firstName: sourceFirstName || null, lastName: sourceLastName || null }
  return {
    normalized: eventSpeakerRosterNormalizedRowSchema.parse({
      displayName, firstName: derived.firstName, lastName: derived.lastName, email: emailValue,
      organization: valueFrom(input.row, mapping.organization) || null,
      title: valueFrom(input.row, mapping.title) || null,
      phone,
      biography: valueFrom(input.row, mapping.biography) || null,
      sessionTitle: valueFrom(input.row, mapping.sessionTitle) || null,
      externalSessionId: valueFrom(input.row, mapping.externalSessionId) || null,
      tags: splitTags(valueFrom(input.row, mapping.tags)),
    }),
    empty: false,
    issues,
  }
}

export interface SpeakerRosterDuplicateCandidate { id: string; normalizedName: string; normalizedEmail: string | null; organization: string | null; title: string | null }

/** Email is an exact identity; non-email similarities are deliberately review-only. */
export function findSpeakerRosterDuplicates(row: NormalizedSpeakerRosterRow, candidates: SpeakerRosterDuplicateCandidate[]) {
  const email = normalizeSpeakerEmail(row.email)
  const byEmail = email ? candidates.filter((candidate) => candidate.normalizedEmail === email) : []
  if (byEmail.length === 1) return { exactId: byEmail[0].id, candidateIds: [byEmail[0].id], uncertain: false }
  const normalizedName = normalizeSpeakerName(row.displayName)
  const contextual = candidates.filter((candidate) => candidate.normalizedName === normalizedName && (
    !row.organization || !candidate.organization || candidate.organization.trim().toLocaleLowerCase('en-US') === row.organization.trim().toLocaleLowerCase('en-US') ||
    !row.title || !candidate.title || candidate.title.trim().toLocaleLowerCase('en-US') === row.title.trim().toLocaleLowerCase('en-US')
  ))
  return { exactId: null, candidateIds: contextual.map((candidate) => candidate.id), uncertain: contextual.length > 0 }
}
