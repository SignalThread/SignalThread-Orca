import { NextRequest, NextResponse } from 'next/server'
import { requireEventAccess } from '@/lib/auth/require-events-event-access'
import { getEventClosingBrief, getPersistedEventClosingBrief } from '@/lib/event-closing-brief'
import { renderEventClosingBriefPdf } from '@/lib/event-closing-brief-pdf'
import type { EventLifecyclePhase } from '@/lib/events-home-groups'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function parseLifecycle(value: string | null): EventLifecyclePhase | null {
  return value === 'PRE_EVENT' || value === 'IN_EVENT' || value === 'POST_EVENT' ? value : null
}

function filenameForEvent(name: string, lifecyclePhase: EventLifecyclePhase) {
  const normalized = name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()
  const stage = lifecyclePhase === 'PRE_EVENT' ? 'pre-event' : lifecyclePhase === 'IN_EVENT' ? 'during-event' : 'post-event'
  return `${normalized || 'event'}-${stage}-brief.pdf`
}

/**
 * Returns the cached/generated canonical brief payload, or a dedicated PDF
 * document built from that exact payload. This deliberately does not render
 * the dashboard or rely on browser print styles.
 */
export async function GET(request: NextRequest, { params }: { params: { eventId: string } }) {
  const requestStartedAt = performance.now()
  const isPdfRequest = new URL(request.url).searchParams.get('format') === 'pdf'
  try {
    const { searchParams } = new URL(request.url)
    const accountSlug = searchParams.get('account')
    if (!accountSlug) return NextResponse.json({ success: false, error: 'Account is required' }, { status: 400 })
    const lifecyclePhase = parseLifecycle(searchParams.get('lifecycle'))
    if (!lifecyclePhase) return NextResponse.json({ success: false, error: 'A valid brief lifecycle is required' }, { status: 400 })

    const access = await requireEventAccess(accountSlug, params.eventId)
    if (!access.ok) return access.response

    if (isPdfRequest) {
      const cacheStartedAt = performance.now()
      const brief = await getPersistedEventClosingBrief({
        accountId: access.account.id,
        eventId: access.event.id,
        lifecyclePhase,
        briefHash: searchParams.get('briefHash'),
      })
      const cacheLookupMs = Math.round((performance.now() - cacheStartedAt) * 10) / 10
      if (!brief) {
        return NextResponse.json({
          success: false,
          code: 'BRIEF_NOT_GENERATED',
          error: 'Generate the Event Intelligence Brief before downloading its PDF.',
        }, { status: 409 })
      }
      const renderStartedAt = performance.now()
      const pdf = await renderEventClosingBriefPdf({
        brief,
        eventDates: {
          startDate: access.event.startDate?.toISOString() ?? null,
          endDate: access.event.endDate?.toISOString() ?? null,
        },
      })
      console.info('[EventClosingBriefPdf] timings', {
        eventId: access.event.id,
        cacheLookupMs,
        pdfRenderingMs: Math.round((performance.now() - renderStartedAt) * 10) / 10,
        pdfBytes: pdf.length,
        totalMs: Math.round((performance.now() - requestStartedAt) * 10) / 10,
      })
      return new NextResponse(Uint8Array.from(pdf), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Length': String(pdf.length),
          'Content-Disposition': `attachment; filename="${filenameForEvent(access.event.name, lifecyclePhase)}"`,
          'Cache-Control': 'private, no-store',
        },
      })
    }

    if (searchParams.get('mode') === 'status') {
      const brief = await getPersistedEventClosingBrief({
        accountId: access.account.id,
        eventId: access.event.id,
        lifecyclePhase,
      })
      return NextResponse.json({ success: true, data: { briefHash: brief?.versionId ?? brief?.editorial.inputHash ?? null } })
    }

    if (searchParams.get('mode') !== 'generate') {
      const briefHash = searchParams.get('briefHash')
      const brief = await getPersistedEventClosingBrief({
        accountId: access.account.id,
        eventId: access.event.id,
        lifecyclePhase,
        briefHash,
      })
      if (!brief || (briefHash && (brief.versionId ?? brief.editorial.inputHash) !== briefHash)) {
        return NextResponse.json({ success: false, code: 'BRIEF_NOT_GENERATED', error: 'Generate this lifecycle brief before viewing it.' }, { status: 404 })
      }
      return NextResponse.json({
        success: true,
        data: {
          brief,
          briefHash: brief.versionId ?? brief.editorial.inputHash,
          eventStartDate: access.event.startDate?.toISOString() ?? null,
          eventEndDate: access.event.endDate?.toISOString() ?? null,
        },
      })
    }

    const brief = await getEventClosingBrief({
      accountId: access.account.id,
      accountSlug: access.account.slug,
      eventId: access.event.id,
      lifecyclePhase,
      forceEditorialRefresh: searchParams.get('regenerate') === '1',
    })

    return NextResponse.json({
      success: true,
      data: {
        brief,
        briefHash: brief.versionId ?? brief.editorial.inputHash,
        eventStartDate: access.event.startDate?.toISOString() ?? null,
        eventEndDate: access.event.endDate?.toISOString() ?? null,
      },
    })
  } catch (error) {
    const errorId = crypto.randomUUID()
    console.error('[EventClosingBrief] request failed', { errorId, eventId: params.eventId, elapsedMs: Math.round((performance.now() - requestStartedAt) * 10) / 10, error })
    return NextResponse.json({
      success: false,
      code: isPdfRequest ? 'PDF_RENDER_FAILED' : 'BRIEF_GENERATION_FAILED',
      error: isPdfRequest ? 'Unable to render the Event Intelligence Brief PDF.' : 'Unable to generate the event intelligence brief.',
      errorId,
    }, { status: 500 })
  }
}
