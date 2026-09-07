/**
 * LEGACY ROUTE — NOT THE EVENTS PRODUCT SOURCE OF TRUTH
 *
 * This eventId-based route under /api/events/[eventId]/* is an organizer-authenticated legacy/admin
 * surface (requireLegacyEventReportingAccess: platform super admin, or an
 * active member of the account that owns the event) consumed by the protected
 * /admin/events/* pages. It is NOT used by the kiosk runtime (kiosk uses
 * /api/response/create and /api/kiosk/*).
 *
 * Do NOT build new EVENTS product features on this route. An Event/eventId does
 * NOT mean EVENTS product mode — the only valid EVENTS product boundary is
 * Account.accountType === "EVENTS". The authed, account/product-scoped EVENTS
 * app API lives under /api/app/events/*.
 *
 * See docs/event-mode/LEGACY_EVENT_ROUTES.md. Response shapes are intentionally
 * unchanged; only the access boundary was added (Pulse access-boundary hardening).
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireLegacyEventReportingAccess } from '@/lib/auth/require-legacy-event-reporting-access'
import { prisma } from '@/lib/prisma'
import { getResolvedEventQuestions } from '@/lib/question-read'
import type { ApiResponse } from '@/types'
import { z } from 'zod'

// Force dynamic rendering
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/events/[eventId]/responses
 * 
 * Returns list of Responses for an event with counts
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { eventId: string } }
) {
  try {
    const { eventId } = params

    const access = await requireLegacyEventReportingAccess(eventId)
    if (!access.ok) return access.response

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

    // Get responses with answer counts
    const responses = await prisma.response.findMany({
      where: { eventId },
      include: {
        _count: {
          select: { answers: true },
        },
        answers: {
          where: { status: 'COMPLETED' },
          select: { id: true },
        },
      },
      orderBy: { startedAt: 'desc' },
    })

    const totalQuestions = (await getResolvedEventQuestions(eventId)).length

    const formattedResponses = responses.map(response => ({
      id: response.id,
      status: response.status,
      anonymousId: response.anonymousId,
      startedAt: response.startedAt,
      completedAt: response.completedAt,
      answersCompleted: response.answers.length,
      answersTotal: totalQuestions,
    }))

    return NextResponse.json<ApiResponse>(
      {
        success: true,
        data: {
          eventId,
          eventName: event.name,
          responses: formattedResponses,
          totalResponses: formattedResponses.length,
        },
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Error fetching responses:', error)
    
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
