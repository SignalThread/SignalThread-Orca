import { z } from 'zod'
import {
  eventAgendaImportMappingSchema,
  eventAgendaNormalizedRowSchema,
  eventAgendaValidationIssueSchema,
} from '@/lib/event-agenda-contract'

export const preCreationAgendaSourceRowSchema = z.object({
  sourceRowNumber: z.number().int().positive(),
  values: z.record(z.string()),
})

export const preCreationAgendaWorksheetSchema = z.object({
  name: z.string(),
  index: z.number().int().nonnegative(),
  columns: z.array(z.string()),
  rowCount: z.number().int().nonnegative(),
  rows: z.array(preCreationAgendaSourceRowSchema),
})

export const preCreationAgendaInspectionSchema = z.object({
  schemaVersion: z.literal(1),
  fileType: z.enum(['CSV', 'XLSX']),
  checksumSha256: z.string().length(64),
  worksheets: z.array(preCreationAgendaWorksheetSchema).min(1),
})

export const preCreationAgendaReviewRowSchema = z.object({
  id: z.string().min(1),
  sourceRowNumber: z.number().int().positive(),
  sourceValues: z.record(z.string()),
  normalized: eventAgendaNormalizedRowSchema.nullable(),
  issues: z.array(eventAgendaValidationIssueSchema),
  status: z.enum(['READY', 'NEEDS_REVIEW', 'INVALID']),
})

export const preCreationAgendaDraftSchema = z.object({
  sourceFileName: z.string().trim().min(1),
  inspection: preCreationAgendaInspectionSchema,
  worksheetName: z.string().min(1),
  mapping: eventAgendaImportMappingSchema,
  rows: z.array(preCreationAgendaReviewRowSchema),
})

export const reviewedInitialAgendaRowSchema = z.object({
  sourceRowNumber: z.number().int().positive(),
  normalized: eventAgendaNormalizedRowSchema,
})

export const reviewedInitialAgendaSchema = z.object({
  sourceFileName: z.string().trim().min(1).max(255),
  rows: z.array(reviewedInitialAgendaRowSchema).min(1).max(5_000),
})

export type PreCreationAgendaDraft = z.infer<typeof preCreationAgendaDraftSchema>
export type PreCreationAgendaReviewRow = z.infer<typeof preCreationAgendaReviewRowSchema>
export type ReviewedInitialAgenda = z.infer<typeof reviewedInitialAgendaSchema>

export function countPreCreationAgendaRows(rows: PreCreationAgendaReviewRow[]) {
  const ready = rows.filter((row) => row.status === 'READY').length
  const needsReview = rows.filter((row) => row.status === 'NEEDS_REVIEW').length
  const invalid = rows.filter((row) => row.status === 'INVALID').length
  const speakerKeys = new Set(rows.flatMap((row) => row.normalized?.speakers.map((speaker) =>
    speaker.email?.toLocaleLowerCase('en-US') || speaker.name.toLocaleLowerCase('en-US').replace(/\s+/g, ' ').trim(),
  ) ?? []))
  return { sessions: rows.length, speakers: speakerKeys.size, ready, needsReview, invalid }
}
