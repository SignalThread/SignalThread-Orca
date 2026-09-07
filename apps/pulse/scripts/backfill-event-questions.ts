import { PrismaClient } from '@prisma/client'
import { normalizeQuestionsJsonForBackfill } from '../lib/question-backfill'

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DIRECT_URL || process.env.DATABASE_URL,
    },
  },
})

async function main() {
  const events = await prisma.event.findMany({
    select: {
      id: true,
      name: true,
      questionsJson: true,
    },
    orderBy: { createdAt: 'asc' },
  })

  let processedEvents = 0
  let upsertedQuestions = 0
  let skippedQuestions = 0

  for (const event of events) {
    const rawQuestions = Array.isArray(event.questionsJson) ? event.questionsJson : []
    if (rawQuestions.length === 0) continue

    const normalized = normalizeQuestionsJsonForBackfill(rawQuestions)

    if (normalized.length === 0) continue

    await prisma.$transaction(
      normalized.map((question) =>
        prisma.question.upsert({
          where: {
            eventId_key: {
              eventId: event.id,
              key: question.key,
            },
          },
          update: {
            label: question.label,
            ttsText: question.ttsText,
            order: question.order,
            required: question.required,
          },
          create: {
            eventId: event.id,
            key: question.key,
            label: question.label,
            ttsText: question.ttsText,
            order: question.order,
            required: question.required,
          },
        })
      )
    )

    processedEvents++
    upsertedQuestions += normalized.length
    skippedQuestions += rawQuestions.length - normalized.length

    console.log(
      `[backfill-event-questions] ${event.id} (${event.name}): upserted ${normalized.length}, skipped ${rawQuestions.length - normalized.length}`
    )
  }

  console.log('[backfill-event-questions] complete')
  console.log(`  processed events: ${processedEvents}`)
  console.log(`  upserted questions: ${upsertedQuestions}`)
  console.log(`  skipped questions: ${skippedQuestions}`)
}

main()
  .catch((error) => {
    console.error('[backfill-event-questions] failed:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
