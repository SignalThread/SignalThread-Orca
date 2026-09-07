import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveEventQuestionsFromSource } from '@/lib/question-read'
import { requireAccountMembership } from '@/lib/auth/require-account-membership'
import { isEventsAccount } from '@/lib/account-product-mode'
import { buildEventsHomeMetrics } from '@/lib/events-home-metrics'
import { withDevelopmentRouteTiming } from '@/lib/development-route-timing'

// Force dynamic rendering
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** CUIDs are 25 chars, start with 'c' */
function looksLikeCuid(value: string): boolean {
  return value.length >= 20 && /^c[a-z0-9]+$/i.test(value)
}

function resolveBranding(settingsJson: unknown) {
  const settings = settingsJson && !Array.isArray(settingsJson) && typeof settingsJson === 'object'
    ? settingsJson as Record<string, unknown>
    : {}
  const branding = settings.branding && !Array.isArray(settings.branding) && typeof settings.branding === 'object'
    ? settings.branding as Record<string, unknown>
    : {}
  return {
    logoUrl: typeof branding.logoUrl === 'string' ? branding.logoUrl : null,
    primaryColor: typeof branding.primaryColor === 'string' ? branding.primaryColor : null,
    primaryButtonColor: typeof branding.primaryButtonColor === 'string' ? branding.primaryButtonColor : null,
  }
}

/**
 * GET /api/app/account?account=<slug|id>
 *
 * Returns account data with locations and events.
 * Resolves account by slug (e.g. demo-video, acme-coffee) or by id (cuid).
 */
async function getAccount(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const accountParam = searchParams.get('account')

    if (!accountParam?.trim()) {
      return NextResponse.json(
        { success: false, error: 'No account specified' },
        { status: 400 }
      )
    }

    const where = looksLikeCuid(accountParam)
      ? { id: accountParam }
      : { slug: accountParam }

    let accountSlug = looksLikeCuid(accountParam) ? null : accountParam
    if (!accountSlug) {
      const accountRef = await prisma.account.findUnique({
        where,
        select: { slug: true },
      })
      if (!accountRef) {
        return NextResponse.json(
          { success: false, error: 'Account not found' },
          { status: 404 }
        )
      }
      accountSlug = accountRef.slug
    }

    const membership = await requireAccountMembership(accountSlug, { allowSuperAdmin: true })
    if (!membership.ok) return membership.response

    if (searchParams.get('scope') === 'context') {
      const context = await prisma.account.findUnique({
        where: { id: membership.account.id },
        select: { settingsJson: true },
      })
      if (!context) {
        return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 })
      }
      return NextResponse.json({
        success: true,
        account: {
          id: membership.account.id,
          name: membership.account.name,
          slug: membership.account.slug,
          accountType: membership.account.accountType,
          tier: membership.account.tier,
          branding: resolveBranding(context.settingsJson),
        },
      })
    }

    const account = await prisma.account.findUnique({
      where: { id: membership.account.id },
      include: {
        locations: {
          where: { isActive: true },
          include: {
            events: {
              include: {
                questions: {
                  select: {
                    key: true,
                    label: true,
                    ttsText: true,
                    order: true,
                    required: true,
                  },
                  orderBy: {
                    order: 'asc',
                  },
                },
              },
              orderBy: { createdAt: 'desc' },
            },
          },
          orderBy: { name: 'asc' },
        },
      },
    })

    if (!account) {
      return NextResponse.json(
        { success: false, error: 'Account not found' },
        { status: 404 }
      )
    }

    const totalEvents = account.locations.reduce(
      (sum, loc) => sum + loc.events.filter(e => e.status === 'ACTIVE').length,
      0
    )

    const allEventIds = account.locations.flatMap((loc) =>
      loc.events.map((e) => e.id)
    )

    let responsesCount = 0
    let avgSentiment: number | null = null

    if (allEventIds.length > 0) {
      responsesCount = await prisma.response.count({
        where: {
          eventId: { in: allEventIds },
          status: 'COMPLETED',
        },
      })

      const sentimentData = await prisma.answerAnalysis.aggregate({
        where: {
          answer: {
            response: {
              eventId: { in: allEventIds },
              status: 'COMPLETED',
            },
          },
          sentimentScore: { not: null },
        },
        _avg: {
          sentimentScore: true,
        },
      })
      avgSentiment = sentimentData._avg.sentimentScore
    }

    // Event-scoped Home metrics (EVENTS accounts only). These power the truthful
    // Events Home cards: featured-event responses, today's responses, real Survey
    // counts, open-attention counts, and shared inferred satisfaction. Derived
    // server-side from canonical Response / Survey / EventIssueCluster data and
    // the shared event intelligence aggregation.
    let eventsHome: Awaited<ReturnType<typeof buildEventsHomeMetrics>> | null = null
    if (isEventsAccount(account.accountType)) {
      eventsHome = await buildEventsHomeMetrics({
        accountId: account.id,
        accountSlug: account.slug,
        accountType: account.accountType,
        events: account.locations.flatMap((loc) =>
          loc.events.map((event) => ({
            id: event.id,
            status: event.status,
            isActive: event.isActive,
            startDate: event.startDate,
            endDate: event.endDate,
          })),
        ),
      })
    }

    return NextResponse.json({
      success: true,
      account: {
        id: account.id,
        name: account.name,
        accountType: account.accountType,
        tier: account.tier,
        branding: resolveBranding(account.settingsJson),
      },
      locations: account.locations.map((loc) => ({
        id: loc.id,
        name: loc.name,
        city: loc.city,
        state: loc.state,
        isActive: loc.isActive,
        events: loc.events.map((event) => {
          const questions = resolveEventQuestionsFromSource(event)

          return {
            id: event.id,
            name: event.name,
            status: event.status,
            eventType: event.eventType,
            startDate: event.startDate,
            endDate: event.endDate,
            isActive: event.isActive,
            questions,
            questionsJson: questions,
          }
        }),
      })),
      metrics: {
        totalEvents,
        totalResponses: responsesCount,
        avgSentiment,
        // Event-scoped rollups for the Events Home top summary cards. Present for
        // EVENTS accounts; 0 for retail (which does not render these).
        responsesToday: eventsHome?.summary.responsesToday ?? 0,
        needActionCount: eventsHome?.summary.needActionCount ?? 0,
        liveCount: eventsHome?.summary.liveCount ?? 0,
      },
      // Per-event truthful metrics keyed by event id (EVENTS accounts only).
      eventMetrics: eventsHome?.events ?? {},
    })
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    console.error('[API] /api/app/account error:', err.message, err.stack)
    return NextResponse.json(
      {
        success: false,
        error: err.message,
      },
      { status: 500 }
    )
  }
}

export function GET(request: NextRequest) {
  const searchParams = new URL(request.url).searchParams
  const account = searchParams.get('account')
  const scope = searchParams.get('scope')
  return withDevelopmentRouteTiming(
    { route: scope === 'context' ? '/api/app/account:context' : '/api/app/account', account },
    () => getAccount(request),
  )
}
