import { PrismaClient, AnswerStatus, ResponseStatus } from '@prisma/client'
import { resolveEventQuestionsFromSource } from '../lib/question-read'

const prisma = new PrismaClient()

// Sample data for realistic feedback generation
const RETAIL_FEEDBACK = {
  positive: [
    'The coffee was absolutely delicious, best latte I\'ve had in months!',
    'Staff was incredibly friendly and helpful, made my day better',
    'Quick service even during rush hour, very impressed',
    'Clean and welcoming atmosphere, perfect for working',
    'Great selection of pastries, the croissant was amazing',
    'Love the new seasonal drink, will definitely come back',
    'Best customer service experience I\'ve had, staff remembered my order',
    'The ambiance is perfect, great music and comfortable seating',
  ],
  negative: [
    'Wait time was way too long, almost 20 minutes for a simple order',
    'Coffee was lukewarm when I received it, disappointing',
    'Prices are getting too high for the quality',
    'Staff seemed rushed and not very attentive',
    'Ran out of several menu items mid-morning, poor inventory',
    'Bathroom wasn\'t clean, needs more attention',
    'WiFi was down, couldn\'t get any work done',
    'Too noisy, hard to have a conversation',
  ],
  neutral: [
    'It was okay, nothing special but nothing terrible either',
    'Standard experience, what you\'d expect from a coffee shop',
    'The drink was fine, atmosphere was decent',
    'Service was average, got what I ordered',
    'Place was clean enough, nothing remarkable',
    'Decent coffee, reasonable prices',
  ],
}

const CONFERENCE_FEEDBACK = {
  positive: [
    'Outstanding keynote speakers, learned so much from industry leaders',
    'Great networking opportunities, made valuable connections',
    'Well-organized schedule, everything ran smoothly',
    'Excellent venue with modern facilities and comfortable spaces',
    'Breakout sessions were informative and engaging',
    'The app made it easy to navigate and plan my day',
    'Food quality was surprisingly good for a conference',
    'Sponsors were relevant and their demos were interesting',
  ],
  negative: [
    'WiFi was unreliable, couldn\'t stay connected during sessions',
    'Sessions were too sales-focused, not enough technical depth',
    'Long lines for food, waited 30+ minutes',
    'Some rooms were too small for popular sessions, couldn\'t get in',
    'Audio quality was poor in several sessions',
    'Not enough diversity in speakers and topics',
    'Registration process was confusing and slow',
    'Venue was too spread out, hard to get between sessions',
  ],
  neutral: [
    'Standard conference experience, met my expectations',
    'Some sessions were great, others were just okay',
    'Venue was fine, nothing special',
    'Good mix of content, hit or miss on quality',
    'Networking was decent, made a few connections',
  ],
}

const THEMES = {
  retail: [
    'Coffee Quality',
    'Service Speed',
    'Staff Friendliness',
    'Cleanliness',
    'Atmosphere',
    'Product Selection',
    'Pricing',
    'Wait Time',
    'Food Quality',
    'WiFi',
  ],
  events: [
    'Content Quality',
    'Networking',
    'Organization',
    'Venue',
    'Technology',
    'Food & Beverage',
    'Speakers',
    'Sessions',
    'Registration',
    'Mobile App',
  ],
}

const ACTIONS = {
  retail: [
    { text: 'Train staff on customer service best practices', impact: 'High' },
    { text: 'Review inventory management to prevent stockouts', impact: 'High' },
    { text: 'Add more staff during peak hours', impact: 'High' },
    { text: 'Implement quality control for drink temperature', impact: 'Medium' },
    { text: 'Upgrade WiFi infrastructure', impact: 'Medium' },
    { text: 'Review pricing strategy relative to competitors', impact: 'Medium' },
    { text: 'Increase cleaning frequency for high-traffic areas', impact: 'Low' },
    { text: 'Update music playlist to reduce noise levels', impact: 'Low' },
  ],
  events: [
    { text: 'Upgrade venue WiFi capacity for next event', impact: 'High' },
    { text: 'Add more technical depth to session content', impact: 'High' },
    { text: 'Increase food service capacity and reduce lines', impact: 'High' },
    { text: 'Book larger rooms for popular session tracks', impact: 'Medium' },
    { text: 'Conduct audio checks before all sessions', impact: 'Medium' },
    { text: 'Recruit more diverse speakers for next year', impact: 'Medium' },
    { text: 'Simplify registration process', impact: 'Low' },
    { text: 'Provide venue maps and improve signage', impact: 'Low' },
  ],
}

function randomChoice<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)]
}

function randomChoices<T>(array: T[], count: number): T[] {
  const shuffled = [...array].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, count)
}

function generateSentiment(): {
  label: string
  score: number
  feedback: string
  themes: string[]
  actions: { text: string; impact: string }[]
  feedbackType: 'retail' | 'events'
} {
  const rand = Math.random()
  const isRetail = Math.random() > 0.5
  const feedbackType = isRetail ? 'retail' : 'events'
  const feedbackSource = isRetail ? RETAIL_FEEDBACK : CONFERENCE_FEEDBACK
  const themeSource = isRetail ? THEMES.retail : THEMES.events
  const actionSource = isRetail ? ACTIONS.retail : ACTIONS.events

  let label: string
  let score: number
  let feedback: string

  if (rand < 0.5) {
    // Positive (50%)
    label = 'Positive'
    score = 0.7 + Math.random() * 0.3 // 0.7-1.0
    feedback = randomChoice(feedbackSource.positive)
  } else if (rand < 0.85) {
    // Negative (35%)
    label = 'Negative'
    score = Math.random() * 0.4 // 0.0-0.4
    feedback = randomChoice(feedbackSource.negative)
  } else {
    // Neutral (15%)
    label = 'Neutral'
    score = 0.4 + Math.random() * 0.3 // 0.4-0.7
    feedback = randomChoice(feedbackSource.neutral)
  }

  // Generate themes (2-4 themes)
  const themeCount = 2 + Math.floor(Math.random() * 3)
  const themes = randomChoices(themeSource, themeCount)

  // Generate action items (1-3 actions)
  const actionCount = 1 + Math.floor(Math.random() * 3)
  const actions = randomChoices(actionSource, actionCount)

  return { label, score, feedback, themes, actions, feedbackType }
}

async function main() {
  console.log('🌱 Seeding demo responses for existing events...\n')

  // Find all active events
  const events = await prisma.event.findMany({
    where: { isActive: true },
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
      location: {
        include: {
          account: true,
        },
      },
    },
  })

  if (events.length === 0) {
    console.log('❌ No active events found. Run prisma/seed-multi-tenant.ts first.')
    return
  }

  console.log(`Found ${events.length} active event(s):\n`)

  for (const event of events) {
    console.log(`📍 Processing: ${event.name} (${event.id})`)
    console.log(`   Account: ${event.location.account.name}`)
    console.log(`   Location: ${event.location.name}`)

    // This legacy fixture generator has no Survey context. Event Intelligence
    // responses must be created through a phase-tagged Survey instead.
    if (event.location.account.accountType === 'EVENTS') {
      console.log('   Skipping Events workspace: a phase-tagged survey token is required.\n')
      continue
    }

    // Get questions from event
    const enabledQuestions = resolveEventQuestionsFromSource(event)

    if (enabledQuestions.length === 0) {
      console.log('   ⚠️  No questions configured, skipping\n')
      continue
    }

    console.log(`   Questions: ${enabledQuestions.length}`)

    // Check existing responses
    const existingCount = await prisma.response.count({
      where: { eventId: event.id },
    })

    const targetCount = 25
    const neededCount = Math.max(0, targetCount - existingCount)

    if (neededCount === 0) {
      console.log(`   ✅ Already has ${existingCount} responses, skipping\n`)
      continue
    }

    console.log(`   Creating ${neededCount} new responses (existing: ${existingCount})...\n`)

    // Create responses
    for (let i = 0; i < neededCount; i++) {
      const responseNum = existingCount + i + 1
      const anonymousId = `demo-user-${responseNum}`

      // Create response
      const response = await prisma.response.create({
        data: {
          eventId: event.id,
          anonymousId,
          status: ResponseStatus.COMPLETED,
          startedAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000), // Last 7 days
          completedAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000),
          metadata: {
            source: 'seed-script',
            demoData: true,
          },
        },
      })

      // Create answers for each question
      for (const question of enabledQuestions) {
        const sentiment = generateSentiment()
        const objectKey = `demo/${event.id}/${response.id}/${question.key}.webm`

        // Create answer
        const answer = await prisma.answer.create({
          data: {
            responseId: response.id,
            questionKey: question.key,
            promptLabel: question.label || question.key,
            objectKey,
            objectEtag: `etag-${Math.random().toString(36).slice(2)}`,
            mimeType: 'audio/webm',
            fileSizeBytes: 50000 + Math.floor(Math.random() * 150000), // 50KB-200KB
            durationMs: 5000 + Math.floor(Math.random() * 25000), // 5-30 seconds
            status: AnswerStatus.COMPLETED,
            statusReason: null,
          },
        })

        // Create transcript
        await prisma.answerTranscript.create({
          data: {
            answerId: answer.id,
            provider: 'openai',
            model: 'whisper-1',
            text: sentiment.feedback,
          },
        })

        // Create analysis
        await prisma.answerAnalysis.create({
          data: {
            answerId: answer.id,
            provider: 'openai',
            model: 'gpt-4-turbo-preview',
            promptVersion: 'v1.0',
            summary: sentiment.feedback.slice(0, 100) + (sentiment.feedback.length > 100 ? '...' : ''),
            sentimentScore: sentiment.score,
            sentimentLabel: sentiment.label,
            themesJson: { themes: sentiment.themes },
            actionsJson: {
              actionItems: sentiment.actions.map((a) => ({
                text: a.text,
                priority: a.impact as 'High' | 'Medium' | 'Low',
              })),
            },
          },
        })

        // Create processing logs
        await prisma.answerProcessingLog.create({
          data: {
            answerId: answer.id,
            step: 'UPLOAD',
            attempt: 1,
            startedAt: new Date(Date.now() - 70000),
            endedAt: new Date(Date.now() - 60000),
            errorCode: null,
            errorMessage: null,
            metadata: { provider: 's3' },
          },
        })

        await prisma.answerProcessingLog.create({
          data: {
            answerId: answer.id,
            step: 'TRANSCRIBE',
            attempt: 1,
            startedAt: new Date(Date.now() - 60000),
            endedAt: new Date(Date.now() - 50000),
            errorCode: null,
            errorMessage: null,
            metadata: { provider: 'openai' },
          },
        })

        await prisma.answerProcessingLog.create({
          data: {
            answerId: answer.id,
            step: 'ANALYZE',
            attempt: 1,
            startedAt: new Date(Date.now() - 50000),
            endedAt: new Date(Date.now() - 40000),
            errorCode: null,
            errorMessage: null,
            metadata: { provider: 'openai' },
          },
        })
      }

      // Progress indicator
      if ((i + 1) % 5 === 0 || i + 1 === neededCount) {
        console.log(`   Progress: ${i + 1}/${neededCount} responses created`)
      }
    }

    console.log(`   ✅ Completed seeding for ${event.name}\n`)
  }

  console.log('✨ Seed complete!\n')

  // Summary
  const totalResponses = await prisma.response.count()
  const totalAnswers = await prisma.answer.count()
  const totalAnalyses = await prisma.answerAnalysis.count()

  console.log('Summary:')
  console.log(`  • ${events.length} events processed`)
  console.log(`  • ${totalResponses} total responses in database`)
  console.log(`  • ${totalAnswers} total answers in database`)
  console.log(`  • ${totalAnalyses} total analyses in database`)
  console.log('')
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
