import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireEventAccess } from '@/lib/auth/require-events-event-access'
import {
  EventDashboardFilterError,
  buildSurveyTargetStructureWhere,
  parseEventDashboardStructureFilters,
  validateEventDashboardFilters,
} from '@/lib/event-dashboard-filters'
import { isEventsAccount } from '@/lib/account-product-mode'
import { resolveEventLifecyclePhase } from '@/lib/events-home-groups'
import { resolveLocalAdvancedDemoLifecycleOverride } from '@/lib/advanced-events-demo-lifecycle'
import { getEventClosingBrief } from '@/lib/event-closing-brief'
import {
  getEventIntelligenceSummary,
  parseEventIntelligenceFilters,
} from '@/lib/event-intelligence/aggregation'

// Force dynamic rendering
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/app/events/[eventId]/analysis?account=<slug>
 * 
 * Returns aggregated analysis for an event (account-scoped)
 * Verifies event belongs to user's account
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { eventId: string } }
) {
  try {
    const { eventId } = params
    
    // Get account slug and time period from query params
    const { searchParams } = new URL(request.url)
    const accountSlug = searchParams.get('account')
    const daysParam = searchParams.get('days')
    const days = daysParam ? parseInt(daysParam) : 30 // Default to 30 days
    const surveyId = searchParams.get('surveyId')?.trim() || null
    const structureFilters = parseEventDashboardStructureFilters(searchParams)

    const access = await requireEventAccess(accountSlug, eventId)
    if (!access.ok) return access.response
    const { account, event } = access

    const resolvedLifecyclePhase = isEventsAccount(account.accountType)
      ? resolveEventLifecyclePhase({ ...event, timezone: event.location?.timezone })
      : null
    const lifecyclePhase = resolveLocalAdvancedDemoLifecycleOverride({
      eventId,
      accountSlug: account.slug,
      hostname: new URL(request.url).hostname,
      value: searchParams.get('devLifecycle'),
    }) ?? resolvedLifecyclePhase
    const defaultLifecyclePhase = resolvedLifecyclePhase
    if (searchParams.get('scope') === 'bootstrap') {
      return NextResponse.json({
        success: true,
        data: {
          eventId,
          eventName: event.name,
          eventStatus: event.status,
          eventType: event.eventType,
          accountType: account.accountType,
          lifecyclePhase,
          defaultLifecyclePhase,
          totalResponses: 0,
          completedResponses: 0,
          totalAnswers: 0,
          answersCaptured: 0,
          answersAnalyzed: 0,
          completedAnswers: 0,
          avgCompletedResponsesPerMonth: 0,
          overallSummary: null,
          overallSentiment: null,
          avgSentimentScore: null,
          topThemes: null,
          topActionItems: null,
          lastComputedAt: new Date().toISOString(),
        },
      })
    }
    const postEventClosingBrief = lifecyclePhase === 'POST_EVENT'
      ? await getEventClosingBrief({
          accountId: account.id,
          accountSlug: account.slug,
          eventId,
          lifecyclePhase: 'POST_EVENT',
          forceEditorialRefresh: searchParams.has('cacheBust'),
        })
      : null

    if (postEventClosingBrief) {
      const averageSentiment = postEventClosingBrief.summary.avgSentiment
      return NextResponse.json({
        success: true,
        data: {
          eventId,
          eventName: event.name,
          eventStatus: event.status,
          eventType: event.eventType,
          accountType: account.accountType,
          lifecyclePhase,
          defaultLifecyclePhase,
          postEventClosingBrief,
          totalResponses: postEventClosingBrief.summary.responseCount,
          completedResponses: postEventClosingBrief.summary.responseCount,
          totalAnswers: postEventClosingBrief.summary.answerCount,
          answersCaptured: postEventClosingBrief.summary.answerCount,
          answersAnalyzed: postEventClosingBrief.summary.answerCount,
          completedAnswers: postEventClosingBrief.summary.answerCount,
          avgCompletedResponsesPerMonth: 0,
          overallSummary: postEventClosingBrief.summary.verdict,
          overallSentiment: postEventClosingBrief.summary.sentiment,
          avgSentimentScore: averageSentiment === null ? null : (averageSentiment + 1) / 2,
          topThemes: null,
          topActionItems: null,
          lastComputedAt: postEventClosingBrief.generatedAt,
        },
      })
    }

    // Events lifecycle surfaces share the normalized intelligence aggregate.
    // The legacy AnswerAnalysis scan below remains intact for SMB accounts.
    if (isEventsAccount(account.accountType)) {
      const intelligence = await getEventIntelligenceSummary({
        accountSlug: account.slug,
        eventId,
        filters: parseEventIntelligenceFilters(searchParams),
        lifecyclePhase,
        authorized: {
          account: { id: account.id, accountType: account.accountType },
          event: {
            id: event.id,
            name: event.name,
            status: event.status,
            eventType: event.eventType,
            startDate: event.startDate,
            endDate: event.endDate,
            location: event.location,
          },
        },
      })
      const sentiment = intelligence.eventPulse.sentimentLabel === 'POSITIVE'
        ? 'Mostly Positive'
        : intelligence.eventPulse.sentimentLabel === 'NEGATIVE'
          ? 'Mostly Negative'
          : intelligence.eventPulse.sentimentLabel === 'MIXED'
            ? 'Mixed'
            : null

      return NextResponse.json({
        success: true,
        data: {
          eventId,
          eventName: event.name,
          eventStatus: event.status,
          eventType: event.eventType,
          accountType: account.accountType,
          lifecyclePhase,
          defaultLifecyclePhase,
          totalResponses: intelligence.responseCount,
          completedResponses: intelligence.responseCount,
          totalAnswers: intelligence.capturedAnswerCount,
          answersCaptured: intelligence.capturedAnswerCount,
          answersAnalyzed: intelligence.answerCount,
          completedAnswers: intelligence.answerCount,
          avgCompletedResponsesPerMonth: 0,
          overallSummary: intelligence.eventPulse.summary,
          overallSentiment: sentiment,
          avgSentimentScore: intelligence.avgSentiment === null ? null : (intelligence.avgSentiment + 1) / 2,
          topThemes: intelligence.topThemes.length > 0
            ? intelligence.topThemes.map((theme) => ({ theme: theme.label, count: theme.count }))
            : null,
          topActionItems: intelligence.topActions.length > 0
            ? intelligence.topActions.map((action) => ({ text: action.title, priority: action.priority }))
            : null,
          lastComputedAt: intelligence.eventPulse.lastComputedAt,
        },
      })
    }

    const validatedFilters = await validateEventDashboardFilters({
      accountId: account.id,
      accountType: account.accountType,
      eventId,
      filters: {
        surveyId,
        ...structureFilters,
      },
    })
    const structureWhere = buildSurveyTargetStructureWhere(validatedFilters)

    const responseScope = {
      eventId,
      ...(surveyId ? { surveyId } : {}),
      ...structureWhere,
    }

    const now = new Date()
    const completedResponsesLifetime = await prisma.response.count({
      where: { ...responseScope, status: 'COMPLETED' },
    })
    const firstResponse = await prisma.response.findFirst({
      where: responseScope,
      orderBy: { startedAt: 'asc' },
      select: { startedAt: true },
    })
    const MS_PER_MONTH = 1000 * 60 * 60 * 24 * 30.437
    const monthsSinceFirst =
      firstResponse != null
        ? Math.max((now.getTime() - firstResponse.startedAt.getTime()) / MS_PER_MONTH, 1 / 30.437)
        : 1
    const avgCompletedResponsesPerMonth =
      firstResponse != null && completedResponsesLifetime > 0
        ? Math.round((completedResponsesLifetime / monthsSinceFirst) * 10) / 10
        : 0

    // Calculate date threshold for time period filtering
    const dateThreshold = new Date()
    dateThreshold.setDate(dateThreshold.getDate() - days)

    // Keep dashboard reads event-scoped in SQL. Loading nested answers,
    // transcripts, and analyses makes Prisma build 500+ ID relation batches.
    const responses = await prisma.response.findMany({
      where: { 
        ...responseScope,
        startedAt: {
          gte: dateThreshold,
        },
      },
      select: {
        id: true,
        status: true,
      },
    })

    const totalResponses = responses.length
    const completedResponses = responses.filter((r) => r.status === 'COMPLETED').length

    const answerScope = {
      response: {
        ...responseScope,
        startedAt: { gte: dateThreshold },
      },
    }
    const [totalAnswers, completedAnswers] = await prisma.$transaction([
      prisma.answer.count({ where: answerScope }),
      prisma.answerAnalysis.findMany({
        where: {
          answer: {
            ...answerScope,
            status: 'COMPLETED',
            answerTranscript: { isNot: null },
          },
        },
        select: {
          sentimentScore: true,
          themesJson: true,
          actionsJson: true,
        },
      }),
    ])

    // Compute aggregated metrics
    // Note: AI outputs sentiment on -1 to 1 scale, normalize to 0 to 1 for display
    const sentiments = completedAnswers
      .map((a) => a.sentimentScore)
      .filter((s): s is number => s !== null && s !== undefined)
      .map((score) => (score + 1) / 2) // Normalize: -1→0, 0→0.5, 1→1

    const avgSentimentScore =
      sentiments.length > 0
        ? sentiments.reduce((sum, score) => sum + score, 0) / sentiments.length
        : null

    // Collect themes
    const themeCounts = new Map<string, number>()
    completedAnswers.forEach((answer) => {
      // themesJson is an object: { themes: string[], keyQuote: string }
      const themesData = answer.themesJson as any
      const themes = themesData?.themes || []
      if (Array.isArray(themes)) {
        themes.forEach((theme: string) => {
          themeCounts.set(theme, (themeCounts.get(theme) || 0) + 1)
        })
      }
    })

    const topThemes = Array.from(themeCounts.entries())
      .map(([theme, count]) => ({ theme, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    // Collect action items with priorities
    interface ActionItem {
      text: string
      priority: 'High' | 'Medium' | 'Low'
    }
    
    const allActions: ActionItem[] = []
    completedAnswers.forEach((answer) => {
      const actionsData = answer.actionsJson as any
      const actions = actionsData?.actionItems || []
      if (Array.isArray(actions)) {
        actions.forEach((action: any) => {
          // Handle both old (string) and new (object with priority) formats
          if (typeof action === 'string') {
            allActions.push({ text: action, priority: 'Medium' })
          } else if (action?.text) {
            allActions.push({
              text: action.text,
              priority: action.priority || 'Medium'
            })
          }
        })
      }
    })

    // Sort by priority (High > Medium > Low) and take top 10
    const priorityOrder = { High: 1, Medium: 2, Low: 3 }
    const topActionItems = allActions
      .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])
      .slice(0, 10)

    // Generate overall summary
    const positiveSentiments = sentiments.filter((s) => s > 0.6).length
    const negativeSentiments = sentiments.filter((s) => s < 0.4).length
    const overallSentiment =
      positiveSentiments > negativeSentiments
        ? 'Mostly Positive'
        : negativeSentiments > positiveSentiments
        ? 'Mostly Negative'
        : 'Mixed'

    const overallSummary = `Based on ${completedResponses} completed responses with ${completedAnswers.length} answers analyzed. Sentiment is ${overallSentiment.toLowerCase()} with ${topThemes.length} distinct themes identified.`

    return NextResponse.json({
      success: true,
      data: {
        eventId,
        eventName: event.name,
        eventStatus: event.status,
        eventType: event.eventType,
        accountType: account.accountType,
        ...(lifecyclePhase ? { lifecyclePhase } : {}),
        ...(defaultLifecyclePhase ? { defaultLifecyclePhase } : {}),
        ...(postEventClosingBrief ? { postEventClosingBrief } : {}),
        totalResponses,
        completedResponses,
        totalAnswers,
        answersCaptured: totalAnswers,
        answersAnalyzed: completedAnswers.length,
        completedAnswers: completedAnswers.length,
        avgCompletedResponsesPerMonth,
        overallSummary,
        overallSentiment,
        avgSentimentScore,
        topThemes: topThemes.length > 0 ? topThemes : null,
        topActionItems: topActionItems.length > 0 ? topActionItems : null,
        lastComputedAt: new Date().toISOString(),
      },
    })
  } catch (error) {
    if (
      error instanceof EventDashboardFilterError
      || (error instanceof Error && 'status' in error && typeof error.status === 'number')
    ) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: (error as Error & { status: number }).status }
      )
    }

    console.error(`[API] /api/app/events/${params.eventId}/analysis error:`, error)
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to fetch analysis',
      },
      { status: 500 }
    )
  }
}
