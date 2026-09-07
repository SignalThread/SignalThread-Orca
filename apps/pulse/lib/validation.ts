import { z } from 'zod'

// Environment-based constraints
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE_BYTES || '52428800', 10) // 50MB default
const ALLOWED_MIME_TYPES = (process.env.ALLOWED_MIME_TYPES || 'audio/webm,audio/mp4,audio/mpeg,audio/wav,audio/ogg').split(',')

/**
 * Normalize MIME type by removing codec parameters
 * Example: "audio/webm;codecs=opus" -> "audio/webm"
 */
export function normalizeMimeType(mimeType: string): string {
  return mimeType.split(';')[0].trim()
}

/**
 * Zod schemas for API request validation (Answer-based)
 * Note: These are reference schemas. Actual validation is done in API routes.
 */
export const presignAnswerSchema = z.object({
  responseId: z.string().cuid(),
  questionId: z.string().cuid().optional(),
  answerType: z.enum(['QUESTION', 'FREEFORM']),
  promptLabel: z.string().min(1).max(500),
  fileName: z.string().min(1).max(255),
  fileSize: z.number().int().positive().max(MAX_FILE_SIZE),
  mimeType: z.preprocess(
    (val) => typeof val === 'string' ? normalizeMimeType(val) : val,
    z.enum(ALLOWED_MIME_TYPES as [string, ...string[]])
  ),
})

export const confirmAnswerSchema = z.object({
  answerId: z.string().cuid(),
  objectEtag: z.string().min(1),
  durationMs: z.number().int().positive(),
  language: z.string().length(2).optional(), // ISO 639-1 code
})

export type PresignAnswerRequest = z.infer<typeof presignAnswerSchema>
export type ConfirmAnswerRequest = z.infer<typeof confirmAnswerSchema>
