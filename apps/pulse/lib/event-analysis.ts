import { prisma } from '@/lib/prisma'

export interface EventAnalysisResult {
  eventId: string
  eventName: string
  eventStatus: string
  totalResponses: number
  completedResponses: number
  totalAnswers: number
  completedAnswers: number
  overallSummary: string | null
  overallSentiment: string | null
  avgSentimentScore: number | null
  topThemes: { theme: string; count: number }[]
  topActionItems: string[]
  lastComputedAt: Date
}

/**
 * Compute aggregated analysis for an event.
 * Used by both GET /api/events/[eventId]/analysis and POST recompute.
 */
export async function computeEventAnalysis(eventId: string): Promise<EventAnalysisResult | null> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
  })

  if (!event) return null

  const totalResponses = await prisma.response.count({
    where: { eventId },
  })

  const completedResponses = await prisma.response.count({
    where: { eventId, status: 'COMPLETED' },
  })

  const totalAnswers = await prisma.answer.count({
    where: { response: { eventId } },
  })

  const completedAnswers = await prisma.answer.count({
    where: {
      response: { eventId },
      status: 'COMPLETED',
      answerTranscript: {
        text: { not: '' },
      },
    },
  })

  const answersWithAnalysis = await prisma.answerAnalysis.findMany({
    where: {
      answer: {
        response: { eventId },
        status: 'COMPLETED',
        answerTranscript: {
          is: { text: { not: '' } },
        },
      },
    },
    select: {
      summary: true,
      sentimentLabel: true,
      sentimentScore: true,
      themesJson: true,
      actionsJson: true,
    },
  })

  let avgSentimentScore: number | null = null
  const sentimentCounts: Record<string, number> = {}

  if (answersWithAnalysis.length > 0) {
    const scores = answersWithAnalysis
      .filter(a => typeof a.sentimentScore === 'number')
      .map(a => a.sentimentScore!)

    if (scores.length > 0) {
      avgSentimentScore = scores.reduce((sum, score) => sum + score, 0) / scores.length
    }

    answersWithAnalysis.forEach(a => {
      if (a.sentimentLabel) {
        const label = a.sentimentLabel
        sentimentCounts[label] = (sentimentCounts[label] || 0) + 1
      }
    })
  }

  let overallSentiment: string | null = null
  if (Object.keys(sentimentCounts).length > 0) {
    overallSentiment = Object.entries(sentimentCounts).sort((a, b) => b[1] - a[1])[0][0]
  }

  const themeMap: Record<string, number> = {}
  answersWithAnalysis.forEach(answer => {
    if (answer.themesJson) {
      const themes = (answer.themesJson as any)?.themes || []
      themes.forEach((theme: string) => {
        themeMap[theme] = (themeMap[theme] || 0) + 1
      })
    }
  })

  const topThemes = Object.entries(themeMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([theme, count]) => ({ theme, count }))

  const actionItemsSet = new Set<string>()
  answersWithAnalysis.forEach(answer => {
    if (answer.actionsJson) {
      const items = (answer.actionsJson as any)?.actionItems || []
      items.forEach((item: string) => actionItemsSet.add(item))
    }
  })

  const topActionItems = Array.from(actionItemsSet).slice(0, 20)

  let overallSummary: string | null = null
  if (answersWithAnalysis.length > 0) {
    const summaries = answersWithAnalysis
      .filter(a => a.summary)
      .map(a => a.summary)
      .slice(0, 5)

    if (summaries.length > 0) {
      overallSummary =
        `Based on ${answersWithAnalysis.length} completed responses:\n\n` +
        summaries.map(s => `• ${s}`).join('\n')
    }
  }

  return {
    eventId: event.id,
    eventName: event.name,
    eventStatus: String(event.status),
    totalResponses,
    completedResponses,
    totalAnswers,
    completedAnswers,
    overallSummary,
    overallSentiment,
    avgSentimentScore,
    topThemes,
    topActionItems,
    lastComputedAt: new Date(),
  }
}
