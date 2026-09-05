/**
 * LEGACY PUBLIC ROUTE — NOT THE EVENTS PRODUCT SOURCE OF TRUTH
 *
 * This eventId-based route under /api/events/[eventId]/* is a public,
 * unauthenticated legacy/admin surface. It currently has no known callers
 * (candidate for future cleanup) and is NOT used by the kiosk runtime (kiosk
 * uses /api/response/create and /api/kiosk/*).
 *
 * Do NOT build new EVENTS product features on this route. An Event/eventId does
 * NOT mean EVENTS product mode — the only valid EVENTS product boundary is
 * Account.accountType === "EVENTS". The authed, account/product-scoped EVENTS
 * app API lives under /api/app/events/*.
 *
 * See docs/event-mode/LEGACY_EVENT_ROUTES.md. Behavior is intentionally unchanged.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import type { ApiResponse } from '@/types'
import { z } from 'zod'

// Force dynamic rendering
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/events/[eventId]/answers
 * 
 * Returns flat list of completed Answers for an event (for exports/analytics)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { eventId: string } }
) {
  try {
    const { eventId } = params

    // Validate eventId
    const schema = z.object({
      eventId: z.string().min(1),
    })

    const validation = schema.safeParse({ eventId })
    if (!validation.success) {
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: 'Invalid eventId',
          message: validation.error.errors.map(e => e.message).join(', '),
        },
        { status: 400 }
      )
    }

    // Verify event exists
    const event = await prisma.event.findUnique({
      where: { id: eventId },
    })

    if (!event) {
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: 'Event not found',
        },
        { status: 404 }
      )
    }

    // Get all completed answers for the event
    const answers = await prisma.answer.findMany({
      where: {
        response: {
          eventId,
        },
        status: 'COMPLETED',
        answerTranscript: {
          text: {
            not: '',
          },
        },
      },
      include: {
        response: {
          select: {
            id: true,
            status: true,
            startedAt: true,
            anonymousId: true,
          },
        },
        answerTranscript: {
          select: {
            text: true,
            provider: true,
            model: true,
          },
        },
        answerAnalysis: {
          select: {
            summary: true,
            sentimentLabel: true,
            sentimentScore: true,
            themesJson: true,
            actionsJson: true,
          },
        },
      },
      orderBy: [
        { createdAt: 'desc' },
      ],
    })

    // Format answers for export
    const formattedAnswers = answers.map(answer => ({
      answerId: answer.id,
      responseId: answer.responseId,
      anonymousId: answer.response.anonymousId,
      responseStatus: answer.response.status,
      responseStartedAt: answer.response.startedAt,
      questionKey: answer.questionKey,
      promptLabel: answer.promptLabel,
      durationMs: answer.durationMs,
      transcript: answer.answerTranscript?.text,
      transcriptProvider: answer.answerTranscript?.provider,
      transcriptModel: answer.answerTranscript?.model,
      summary: answer.answerAnalysis?.summary,
      sentiment: answer.answerAnalysis?.sentimentLabel,
      sentimentScore: answer.answerAnalysis?.sentimentScore,
      themes: (answer.answerAnalysis?.themesJson as any)?.themes || [],
      actionItems: (answer.answerAnalysis?.actionsJson as any)?.actionItems || [],
      keyQuote: (answer.answerAnalysis?.themesJson as any)?.keyQuote,
      answerCreatedAt: answer.createdAt,
    }))

    return NextResponse.json<ApiResponse>(
      {
        success: true,
        data: {
          eventId,
          eventName: event.name,
          answers: formattedAnswers,
          totalAnswers: formattedAnswers.length,
        },
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Error fetching answers:', error)
    
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 }
    )
  }
}
