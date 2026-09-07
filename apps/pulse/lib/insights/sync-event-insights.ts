import { prisma } from '@/lib/prisma'
import type { AnalyticsSignals, FetchedData } from '@/lib/analytics/signals'
import { classifyKeyInsights } from '@/lib/insights/themes'
import { normalizeThemeKey } from '@/lib/insights/theme-keys'
import {
  collectAnswerIdsForActionOpportunity,
  collectAnswerIdsForThemeKey,
} from '@/lib/insights/source-answers'

/**
 * Persists Key Insights rows and InsightSourceAnswer rows for the survey.
 * Uses full lifetime event data (not the rolling pulse window). `windowDays`
 * stores the span in days from the first response to sync time for bookkeeping.
 */
export async function syncEventInsights(
  eventId: string,
  windowData: FetchedData,
  signals: AnalyticsSignals,
  windowDays: number,
  humanizeAction: (s: string) => string
): Promise<Record<string, string>> {
  const classified = classifyKeyInsights(
    signals.themeSentimentBreakdown,
    signals.biggestOpportunity.opportunities,
    humanizeAction
  )

  const rawOppText = new Map<string, string>()
  for (const opp of signals.biggestOpportunity.opportunities) {
    rawOppText.set(normalizeThemeKey(opp.text), opp.text)
  }

  const periodEnd = windowData.periodEnd
  const currentKeys = new Set<string>()
  const byKey: Record<string, string> = {}

  await prisma.$transaction(async (tx) => {
    const upsertOne = async (
      themeKey: string,
      section: 'WORKING' | 'OPPORTUNITY',
      title: string,
      bodyText: string | null,
      isAction: boolean,
      impactScore: number | null,
      priority: string | null,
      answerIds: string[]
    ) => {
      currentKeys.add(themeKey)
      const insight = await tx.insight.upsert({
        where: { eventId_themeKey: { eventId, themeKey } },
        create: {
          eventId,
          themeKey,
          section,
          title,
          bodyText,
          isAction,
          impactScore,
          priority,
          windowDays,
          periodEnd,
        },
        update: {
          section,
          title,
          bodyText,
          isAction,
          impactScore,
          priority,
          windowDays,
          periodEnd,
        },
      })

      await tx.insightSourceAnswer.deleteMany({ where: { insightId: insight.id } })
      if (answerIds.length) {
        await tx.insightSourceAnswer.createMany({
          data: answerIds.map((answerId) => ({ insightId: insight.id, answerId })),
          skipDuplicates: true,
        })
      }
      byKey[themeKey] = insight.id
    }

    for (const w of classified.working) {
      const ids = collectAnswerIdsForThemeKey(windowData.responses, w.key)
      await upsertOne(w.key, 'WORKING', w.displayName, null, false, null, null, ids)
    }

    for (const o of classified.opportunities) {
      const ids = o.isAction
        ? collectAnswerIdsForActionOpportunity(
            windowData.responses,
            rawOppText.get(o.key) ?? o.key
          )
        : collectAnswerIdsForThemeKey(windowData.responses, o.key)
      await upsertOne(
        o.key,
        'OPPORTUNITY',
        o.displayName,
        o.text,
        o.isAction,
        o.impactScore,
        o.priority,
        ids
      )
    }

    if (currentKeys.size === 0) {
      await tx.insight.deleteMany({ where: { eventId } })
    } else {
      await tx.insight.deleteMany({
        where: {
          eventId,
          themeKey: { notIn: [...currentKeys] },
        },
      })
    }
  })

  return byKey
}
