import { prisma } from '@/lib/prisma'
import { sentimentBucket } from '@/lib/insights/source-answers'

export interface InsightDrilldownQuery {
  sentiment?: 'positive' | 'negative' | 'neutral' | 'all'
  questionKey?: string
  dateFrom?: string
  dateTo?: string
  /** Case-insensitive substring match on transcript text (full insight set, server-side). */
  textContains?: string
  page?: number
  pageSize?: number
}

export interface InsightDrilldownAnswerRow {
  answerId: string
  responseId: string
  /** Stable question key from event config (same as questionKey) */
  questionId: string
  questionKey: string
  promptLabel: string
  transcriptText: string | null
  sentimentLabel: string | null
  sentimentScore: number | null
  sentimentBucket: 'positive' | 'negative' | 'neutral'
  createdAt: string
  responseStartedAt: string
}

export interface InsightDrilldownPayload {
  insight: {
    id: string
    eventId: string
    eventName: string
    themeKey: string
    section: 'WORKING' | 'OPPORTUNITY'
    title: string
    bodyText: string | null
    isAction: boolean
    totalMentions: number
    windowDays: number
    periodEnd: string
    impactScore: number | null
    priority: string | null
  }
  sentimentBreakdown: { positive: number; negative: number; neutral: number }
  mentionsOverTime: { date: string; count: number }[]
  filterOptions: {
    questions: { questionKey: string; promptLabel: string }[]
  }
  answers: {
    page: number
    pageSize: number
    total: number
    items: InsightDrilldownAnswerRow[]
  }
}

function parseDayBoundary(iso: string, endOfDay: boolean): Date {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return new Date(0)
  if (endOfDay) {
    d.setHours(23, 59, 59, 999)
  } else {
    d.setHours(0, 0, 0, 0)
  }
  return d
}

export async function getInsightDrilldownForAccount(
  insightId: string,
  accountId: string,
  query: InsightDrilldownQuery
): Promise<InsightDrilldownPayload | null> {
  const insight = await prisma.insight.findFirst({
    where: {
      id: insightId,
      event: {
        location: { accountId },
      },
    },
    include: {
      event: { select: { id: true, name: true } },
    },
  })

  if (!insight) return null

  const page = Math.max(1, query.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20))

  const links = await prisma.insightSourceAnswer.findMany({
    where: { insightId },
    select: { answerId: true },
  })
  const answerIds = links.map((l) => l.answerId)

  const baseWhere = {
    id: { in: answerIds },
    response: { eventId: insight.eventId },
  }

  const allRows = await prisma.answer.findMany({
    where: baseWhere,
    include: {
      response: { select: { id: true, startedAt: true } },
      answerTranscript: { select: { text: true } },
      answerAnalysis: {
        select: {
          sentimentScore: true,
          sentimentLabel: true,
        },
      },
    },
  })

  type Row = {
    answerId: string
    responseId: string
    questionKey: string
    promptLabel: string
    transcriptText: string | null
    sentimentLabel: string | null
    sentimentScore: number | null
    sentimentBucket: 'positive' | 'negative' | 'neutral'
    createdAt: Date
    responseStartedAt: Date
  }

  const mapped: Row[] = allRows.map((a) => ({
    answerId: a.id,
    responseId: a.response.id,
    questionKey: a.questionKey,
    promptLabel: a.promptLabel,
    transcriptText: a.answerTranscript?.text ?? null,
    sentimentLabel: a.answerAnalysis?.sentimentLabel ?? null,
    sentimentScore: a.answerAnalysis?.sentimentScore ?? null,
    sentimentBucket: sentimentBucket(a.answerAnalysis?.sentimentScore ?? null),
    createdAt: a.createdAt,
    responseStartedAt: a.response.startedAt,
  }))

  const qMap = new Map<string, string>()
  for (const r of mapped) {
    if (!qMap.has(r.questionKey)) qMap.set(r.questionKey, r.promptLabel)
  }
  const filterOptions = {
    questions: [...qMap.entries()]
      .map(([questionKey, promptLabel]) => ({ questionKey, promptLabel }))
      .sort((a, b) => a.promptLabel.localeCompare(b.promptLabel)),
  }

  let filtered = mapped

  const sentimentFilter = query.sentiment && query.sentiment !== 'all' ? query.sentiment : null
  if (sentimentFilter) {
    filtered = filtered.filter((r) => r.sentimentBucket === sentimentFilter)
  }
  if (query.questionKey) {
    filtered = filtered.filter((r) => r.questionKey === query.questionKey)
  }
  if (query.dateFrom) {
    const from = parseDayBoundary(query.dateFrom, false)
    filtered = filtered.filter((r) => r.responseStartedAt >= from)
  }
  if (query.dateTo) {
    const to = parseDayBoundary(query.dateTo, true)
    filtered = filtered.filter((r) => r.responseStartedAt <= to)
  }

  const textNeedle = query.textContains?.trim().toLowerCase()
  if (textNeedle) {
    filtered = filtered.filter((r) => (r.transcriptText ?? '').toLowerCase().includes(textNeedle))
  }

  filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

  const sentimentBreakdown = filtered.reduce(
    (acc, r) => {
      acc[r.sentimentBucket]++
      return acc
    },
    { positive: 0, negative: 0, neutral: 0 }
  )

  // Chart buckets by calendar day (response.startedAt) — counts match filtered transcript totals.
  const dayCounts = new Map<string, number>()
  for (const r of filtered) {
    const day = r.responseStartedAt.toISOString().slice(0, 10)
    dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1)
  }
  const mentionsOverTime = [...dayCounts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }))

  const total = filtered.length
  const slice = filtered.slice((page - 1) * pageSize, page * pageSize)

  const items: InsightDrilldownAnswerRow[] = slice.map((r) => ({
    answerId: r.answerId,
    responseId: r.responseId,
    questionId: r.questionKey,
    questionKey: r.questionKey,
    promptLabel: r.promptLabel,
    transcriptText: r.transcriptText,
    sentimentLabel: r.sentimentLabel,
    sentimentScore: r.sentimentScore,
    sentimentBucket: r.sentimentBucket,
    createdAt: r.createdAt.toISOString(),
    responseStartedAt: r.responseStartedAt.toISOString(),
  }))

  return {
    insight: {
      id: insight.id,
      eventId: insight.eventId,
      eventName: insight.event.name,
      themeKey: insight.themeKey,
      section: insight.section,
      title: insight.title,
      bodyText: insight.bodyText,
      isAction: insight.isAction,
      totalMentions: answerIds.length,
      windowDays: insight.windowDays,
      periodEnd: insight.periodEnd.toISOString(),
      impactScore: insight.impactScore,
      priority: insight.priority,
    },
    sentimentBreakdown,
    mentionsOverTime,
    filterOptions,
    answers: {
      page,
      pageSize,
      total,
      items,
    },
  }
}
