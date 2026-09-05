/**
 * LEGACY PUBLIC ROUTE — NOT THE EVENTS PRODUCT SOURCE OF TRUTH
 *
 * This eventId-based route under /api/events/[eventId]/* is a public,
 * unauthenticated legacy/admin surface consumed by the protected
 * /admin/events/* pages. It is NOT used by the kiosk runtime (kiosk uses
 * /api/response/create and /api/kiosk/*).
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
 * GET /api/events/[eventId]/responses/[responseId]
 * 
 * Returns a Response with all Answers ordered by question order
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { eventId: string; responseId: string } }
) {
  try {
    const { eventId, responseId } = params

    // Validate params
    const schema = z.object({
      eventId: z.string().min(1),
      responseId: z.string().min(1),
    })

    const validation = schema.safeParse({ eventId, responseId })
    if (!validation.success) {
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: 'Invalid parameters',
          message: validation.error.errors.map(e => e.message).join(', '),
        },
        { status: 400 }
      )
    }

    // Get response with all answers
    const response = await prisma.response.findUnique({
      where: { id: responseId },
      include: {
        event: {
          select: {
            id: true,
            name: true,
          },
        },
        answers: {
          include: {
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
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    })

    if (!response) {
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: 'Response not found',
        },
        { status: 404 }
      )
    }

    // Verify response belongs to the specified event
    if (response.eventId !== eventId) {
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: 'Response does not belong to specified event',
        },
        { status: 400 }
      )
    }

    // Format answers
    const formattedAnswers = response.answers.map(answer => ({
      id: answer.id,
      promptLabel: answer.promptLabel,
      questionKey: answer.questionKey,
      objectKey: answer.objectKey,
      status: answer.status,
      durationMs: answer.durationMs,
      transcript: answer.answerTranscript?.text,
      transcriptProvider: answer.answerTranscript?.provider,
      transcriptModel: answer.answerTranscript?.model,
      analysis: answer.answerAnalysis ? {
        summary: answer.answerAnalysis.summary,
        sentiment: answer.answerAnalysis.sentimentLabel,
        sentimentScore: answer.answerAnalysis.sentimentScore,
        evidenceState: (answer.answerAnalysis.themesJson as any)?.evidenceState,
        themes: (answer.answerAnalysis.themesJson as any)?.themes || [],
        actionItems: (answer.answerAnalysis.actionsJson as any)?.actionItems || [],
        keyQuote: (answer.answerAnalysis.themesJson as any)?.keyQuote,
      } : null,
      createdAt: answer.createdAt,
      updatedAt: answer.updatedAt,
    }))

    return NextResponse.json<ApiResponse>(
      {
        success: true,
        data: {
          id: response.id,
          eventId: response.eventId,
          eventName: response.event.name,
          anonymousId: response.anonymousId,
          status: response.status,
          startedAt: response.startedAt,
          completedAt: response.completedAt,
          answers: formattedAnswers,
          answersCompleted: formattedAnswers.filter(a => a.status === 'COMPLETED').length,
          answersTotal: formattedAnswers.length,
        },
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Error fetching response:', error)
    
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
