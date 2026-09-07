import { z } from 'zod'
import type { ResponseMode } from '@prisma/client'

export const responseModeSchema = z.enum(['VOICE_ONLY', 'TEXT_ONLY', 'VOICE_AND_TEXT'])
export const attendeeResponseModeSchema = z.enum(['VOICE_ONLY', 'TEXT_ONLY'])

export type AttendeeResponseMode = z.infer<typeof attendeeResponseModeSchema>

export class ResponseModeSelectionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ResponseModeSelectionError'
  }
}

export function parseResponseMode(body: unknown, fieldName = 'responseMode'): ResponseMode {
  const parsed = responseModeSchema.safeParse(body)
  if (!parsed.success) {
    throw new Error(`Invalid ${fieldName}`)
  }
  return parsed.data
}

/**
 * Resolves the survey's organizer setting to the immutable response method for
 * one attendee attempt. Let-attendee-choose is intentionally resolved before a
 * Response is created so every answer path can trust Response.responseMode.
 */
export function resolveAttemptResponseMode(
  configuredMode: ResponseMode | string | null | undefined,
  selectedMode?: AttendeeResponseMode | null,
): AttendeeResponseMode {
  const mode = configuredMode ?? 'VOICE_ONLY'
  if (mode === 'VOICE_AND_TEXT') {
    if (!selectedMode) {
      throw new ResponseModeSelectionError('Choose whether to speak or type your answers before starting.')
    }
    return selectedMode
  }

  if (mode === 'TEXT_ONLY' || mode === 'VOICE_ONLY') {
    if (selectedMode && selectedMode !== mode) {
      throw new ResponseModeSelectionError('The selected response method is not available for this survey.')
    }
    return mode
  }

  return 'VOICE_ONLY'
}
