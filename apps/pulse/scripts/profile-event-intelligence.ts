import { PrismaClient } from '@prisma/client'
import { getEventIntelligenceSummary } from '../lib/event-intelligence/aggregation'

const accountSlug = process.argv[2] ?? 'events-demo'
const eventId = process.argv[3] ?? 'event_events_demo_summit_2026'

const db = new PrismaClient({
  log: [{ emit: 'event', level: 'query' }],
})

let queryDurations: Array<{ durationMs: number; query: string }> = []
db.$on('query', (event) => {
  queryDurations.push({
    durationMs: event.duration,
    query: event.query.replace(/\s+/g, ' ').trim().slice(0, 180),
  })
})

async function main() {
  const account = await db.account.findUnique({
    where: { slug: accountSlug },
    select: { id: true, accountType: true },
  })
  if (!account) throw new Error(`Account not found: ${accountSlug}`)
  const event = await db.event.findFirst({
    where: { id: eventId, location: { accountId: account.id } },
    select: {
      id: true,
      name: true,
      status: true,
      eventType: true,
      startDate: true,
      endDate: true,
      location: { select: { timezone: true } },
    },
  })
  if (!event) throw new Error(`Event not found: ${eventId}`)

  queryDurations = []
  const startedAt = performance.now()
  const summary = await getEventIntelligenceSummary({
    accountSlug,
    eventId,
    filters: { days: 30 },
    initialView: 'intelligence',
    authorized: { account, event },
    attention: { limit: 25 },
  }, db)
  const durationMs = performance.now() - startedAt
  const body = JSON.stringify({ success: true, data: summary })
  const componentBytes = Object.fromEntries(
    Object.entries(summary).map(([key, value]) => [key, Buffer.byteLength(JSON.stringify(value))]),
  )
  const selectQueries = queryDurations.filter((query) => query.query.startsWith('SELECT'))

  console.log(JSON.stringify({
    durationMs: Math.round(durationMs),
    logicalSelectCount: selectQueries.length,
    wireStatementCount: queryDurations.length,
    databaseDurationMs: queryDurations.reduce((total, query) => total + query.durationMs, 0),
    responseBytes: Buffer.byteLength(body),
    componentBytes,
    attentionItems: summary.attentionQueue.length,
    nextCursor: summary.pagination.attention.nextCursor,
    slowestQueries: [...queryDurations]
      .sort((left, right) => right.durationMs - left.durationMs)
      .slice(0, 5),
  }, null, 2))
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await db.$disconnect()
  })
