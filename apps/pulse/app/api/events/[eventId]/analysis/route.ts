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
import type { ApiResponse } from '@/types'
import { z } from 'zod'
import { computeEventAnalysis } from '@/lib/event-analysis'

// Force dynamic rendering
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/events/[eventId]/analysis
 *
 * Returns computed aggregated analysis for an event.
 * Uses shared computeEventAnalysis so full analysis (including overallSummary) is returned.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { eventId: string } }
) {
  try {
    const { eventId } = params

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

    const data = await computeEventAnalysis(eventId)

    if (!data) {
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: 'Event not found',
        },
        { status: 404 }
      )
    }

    return NextResponse.json<ApiResponse>(
      {
        success: true,
        data,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Error fetching event analysis:', error)

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
