/**
 * LEGACY ROUTE — NOT THE EVENTS PRODUCT SOURCE OF TRUTH
 *
 * This eventId-based route under /api/events/[eventId]/* is an organizer-authenticated legacy/admin
 * surface (requireLegacyEventReportingAccess: platform super admin, or an
 * active member of the account that owns the event) consumed by the protected
 * /admin/events/* pages. It is NOT used by the kiosk runtime (kiosk receives
 * questions from /api/response/create).
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
import { getOrCreateEvent } from '@/lib/event'
import { getEventQuestionsForRuntime } from '@/lib/question-audio'
import type { ApiResponse } from '@/types'

// Force dynamic rendering
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/events/[eventId]/questions
 * 
 * Returns enabled questions for an event, ordered by order ASC
 * Auto-creates event and seeds default questions if event doesn't exist
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { eventId: string } }
) {
  try {
    const { eventId } = params

    const access = await requireLegacyEventReportingAccess(eventId)
    if (!access.ok) return access.response

    // Get or create event (auto-seeds questions if needed)
    const event = await getOrCreateEvent(eventId)

    // Get enabled questions with preferred runtime audio
    const questions = await getEventQuestionsForRuntime(event.id)

    return NextResponse.json<ApiResponse>(
      {
        success: true,
        data: {
          eventId: event.id,
          eventName: event.name,
          questions: questions.map((q: any) => ({
            key: q.key,
            label: q.label || q.text,
            order: q.order,
            required: q.required || q.isRequired || false,
            audioUrl: q.audioUrl || null,
            ttsProvider: q.ttsProvider || null,
            ttsVoice: q.ttsVoice || null,
            ttsLocale: q.ttsLocale || null,
            fallbackReason: q.fallbackReason || null,
          })),
        },
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Error fetching questions:', error)
    
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
