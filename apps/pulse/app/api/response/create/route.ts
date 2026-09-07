import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { createKioskLaunchResponse } from '@/lib/event'
import { attendeeResponseModeSchema, ResponseModeSelectionError } from '@/lib/response-mode'
import type { ApiResponse } from '@/types'

// Force dynamic rendering
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isResponseSchemaMismatch(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError
    && error.code === 'P2022'
    && String(error.meta?.column ?? error.message).includes('responseMode')
}

/**
 * POST /api/response/create
 * 
 * Create a new Response (recording session) for kiosk mode
 * Auto-creates anonymous Attendee and returns questions to record
 * Auto-seeds default questions if event has none
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const eventId = typeof body?.eventId === 'string' ? body.eventId.trim() : ''
    const token = typeof body?.token === 'string' ? body.token.trim() : ''
    const selectedResponseMode = body?.selectedResponseMode === undefined
      ? undefined
      : attendeeResponseModeSchema.safeParse(body.selectedResponseMode)

    if (Boolean(eventId) === Boolean(token)) {
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: 'Bad request',
          message: 'Provide exactly one of eventId or token',
        },
        { status: 400 }
      )
    }

    if (selectedResponseMode && !selectedResponseMode.success) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Bad request', message: 'Invalid selected response method' },
        { status: 400 },
      )
    }

    const launch = await createKioskLaunchResponse(eventId
      ? { eventId, ...(selectedResponseMode?.data ? { selectedResponseMode: selectedResponseMode.data } : {}) }
      : { token, ...(selectedResponseMode?.data ? { selectedResponseMode: selectedResponseMode.data } : {}) })

    return NextResponse.json<ApiResponse>(
      {
        success: true,
        data: {
          responseId: launch.response.id,
          eventId: launch.event.id,
          responseMode: launch.response.responseMode ?? launch.event.responseMode,
          anonymousId: launch.response.anonymousId,
          ...(launch.mode === 'token'
            ? {
                surveyId: launch.survey?.id,
                surveyTargetId: launch.target?.id,
                publicSurveyLinkId: launch.publicLink?.id,
              }
            : {}),
          questions: launch.questions.map((q: any) => ({
            id: q.key || q.id,
            questionId: q.id,
            text: q.label || q.text,
            order: q.order,
            type: q.type || 'VOICE',
            responseTarget: q.responseTarget || 'GENERAL',
            ...(Array.isArray(q.configurationJson?.options) && q.configurationJson.options.length > 0
              ? {
                  options: q.configurationJson.options.filter(
                    (option: unknown): option is string => typeof option === 'string',
                  ),
                }
              : {}),
            isRequired: q.required ?? q.isRequired ?? false,
            audioUrl: q.audioUrl || null,
            ttsProvider: q.ttsProvider || null,
            ttsVoice: q.ttsVoice || null,
            ttsLocale: q.ttsLocale || null,
            fallbackReason: q.fallbackReason || null,
          })),
          sessionContext: launch.sessionContext ?? null,
          speakerContext: launch.speakerContext ?? null,
        },
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Error creating response:', error)

    if (isResponseSchemaMismatch(error)) {
      return NextResponse.json(
        {
          success: false,
          error: 'response_creation_unavailable',
          message: 'Unable to start this survey right now. Please try again shortly.',
        },
        { status: 503 },
      )
    }

    const message = error instanceof Error ? error.message : 'Unknown error occurred'
    const status =
      error instanceof ResponseModeSelectionError
        ? 400
        :
      message.includes('not found')
        ? 404
        : message.includes('inactive') ||
            message.includes('expired') ||
            message.includes('launchable') ||
            message.includes('does not belong')
          ? 400
          : 500
    
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error: status === 404 ? 'Not found' : status === 400 ? 'Bad request' : 'Internal server error',
        message: status < 500
          ? message
          : 'Unable to start this survey right now. Please try again shortly.',
      },
      { status }
    )
  }
}
