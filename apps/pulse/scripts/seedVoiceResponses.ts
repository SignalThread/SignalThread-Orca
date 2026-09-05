/**
 * Seed realistic raw voice-style responses into an existing Event.
 *
 * Run:
 *   npx tsx scripts/seedVoiceResponses.ts --eventId=retail-sf-jan-2026 --count=50
 *   npx tsx scripts/seedVoiceResponses.ts --token=public-survey-token --count=30 --runAnalysis
 *
 * Options:
 *   --eventId   Event/survey id (mutually exclusive with --token)
 *   --token     Public survey kiosk token (mutually exclusive with --eventId)
 *   --count     (optional) Number of responses to generate (default: 50)
 *   --runAnalysis (optional) Run AI analysis and normalized event intelligence after insert
 */

import { AnswerStatus, CollectionPhase, PrismaClient, ResponseStatus } from '@prisma/client'
import { resolveEventQuestionsFromSource } from '../lib/question-read'
import { resolvePublicSurveyLaunchContext } from '../lib/event'
import OpenAI from 'openai'

interface GeneratedAnswer {
  questionKey: string
  promptLabel: string
  transcript: string
}

interface GeneratedResponseSet {
  answers: GeneratedAnswer[]
}

export interface SeedVoiceResponsesArgs {
  mode: 'eventId' | 'token'
  eventId: string
  token: string
  count: number
  runAnalysis: boolean
}

interface SeedQuestion {
  id?: string | null
  key: string
  label: string
}

interface SeedContext {
  mode: 'eventId' | 'token'
  eventId: string
  surveyId?: string
  surveyTargetId?: string
  publicSurveyLinkId?: string
  collectionPhase?: CollectionPhase
  questions: SeedQuestion[]
}

function createPrismaClient() {
  return new PrismaClient({
    datasources: {
      db: {
        url: process.env.DIRECT_URL || process.env.DATABASE_URL,
      },
    },
  })
}

function usage() {
  return [
    'Usage:',
    '  npx tsx scripts/seedVoiceResponses.ts --eventId=retail-sf-jan-2026 --count=50 [--runAnalysis]',
    '  npx tsx scripts/seedVoiceResponses.ts --token=public-survey-token --count=30 [--runAnalysis]',
  ].join('\n')
}

export function parseArgs(args = process.argv.slice(2)): SeedVoiceResponsesArgs {
  let eventId = ''
  let token = ''
  let count = 50
  let runAnalysis = false

  for (const arg of args) {
    if (arg.startsWith('--eventId=')) {
      eventId = arg.replace('--eventId=', '').trim()
    } else if (arg.startsWith('--token=')) {
      token = arg.replace('--token=', '').trim()
    } else if (arg.startsWith('--count=')) {
      const n = parseInt(arg.replace('--count=', ''), 10)
      if (!isNaN(n) && n > 0) count = n
    } else if (arg === '--runAnalysis') {
      runAnalysis = true
    }
  }

  if (Boolean(eventId) === Boolean(token)) {
    throw new Error(`Provide exactly one of --eventId or --token.\n${usage()}`)
  }

  return {
    mode: token ? 'token' : 'eventId',
    eventId,
    token,
    count,
    runAnalysis,
  }
}

const BATCH_SIZE = 10
const MAX_ITERATIONS = 10

function isValidResponseSet(
  set: GeneratedResponseSet,
  validKeys: Set<string>
): boolean {
  if (!set?.answers || !Array.isArray(set.answers)) return false
  const answeredKeys = new Set(set.answers.map((a) => a.questionKey))
  return validKeys.size === answeredKeys.size && [...validKeys].every((k) => answeredKeys.has(k))
}

async function generateBatch(
  openai: OpenAI,
  questions: { key: string; label: string }[],
  batchCount: number
): Promise<GeneratedResponseSet[]> {
  const questionsJson = JSON.stringify(
    questions.map((q) => ({ key: q.key, label: q.label })),
    null,
    2
  )

  const prompt = `Generate ${batchCount} realistic customer voice survey response sets for a retail feedback flow.

Each response set should have exactly one answer per question. Answers should sound like spoken voice feedback: natural, varied, sometimes short, sometimes detailed. Mix positive, neutral, negative, emotional, awkward, and matter-of-fact tones. Keep them realistic for a customer leaving feedback at a kiosk.

Questions (use exact key and label):
${questionsJson}

Return a JSON array of exactly ${batchCount} objects. Each object has an "answers" array with one entry per question. Each answer has:
- questionKey: exact key from the questions (e.g. "q1_overall_rating")
- promptLabel: exact label from the questions
- transcript: what the customer said (spoken style, 10-150 words typical)

Output ONLY the JSON array, no other text.`

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content:
          'You output only valid JSON arrays. No markdown, no explanation. Each answer must use the exact questionKey and promptLabel from the provided questions.',
      },
      { role: 'user', content: prompt },
    ],
    max_tokens: 8000,
    temperature: 0.8,
  })

  const content = response.choices[0]?.message?.content?.trim() ?? ''
  const cleaned = content.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '').trim()
  const parsed = JSON.parse(cleaned) as unknown

  if (!Array.isArray(parsed)) {
    throw new Error('OpenAI did not return a JSON array')
  }

  return parsed as GeneratedResponseSet[]
}

async function generateResponseSets(
  questions: { key: string; label: string }[],
  targetCount: number
): Promise<GeneratedResponseSet[]> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required to generate seed responses')
  }

  const openai = new OpenAI({
    apiKey,
  })

  const validKeys = new Set(questions.map((q) => q.key))
  const all: GeneratedResponseSet[] = []
  let iteration = 0

  while (all.length < targetCount && iteration < MAX_ITERATIONS) {
    iteration++
    const batchCount = Math.min(BATCH_SIZE, targetCount - all.length)
    const batch = await generateBatch(openai, questions, batchCount)
    const valid = batch.filter((s) => isValidResponseSet(s, validKeys))
    all.push(...valid)
    console.log(`  Call ${iteration}: got ${batch.length}, valid ${valid.length}, total accumulated: ${all.length}`)
    if (batch.length === 0) break
    if (all.length < targetCount) {
      await new Promise((r) => setTimeout(r, 300))
    }
  }

  if (iteration >= MAX_ITERATIONS && all.length < targetCount) {
    console.warn(`  Warning: hit max iterations (${MAX_ITERATIONS}), have ${all.length}/${targetCount}`)
  }

  return all.slice(0, targetCount)
}

/** Full analysis plus the canonical normalized event intelligence dual-write. */
async function executeAnswerAnalysis(
  prisma: PrismaClient,
  answerId: string,
  transcript: string
): Promise<void> {
  const { analyzeTranscript } = await import('../lib/analysis')
  const { writeEventIntelligenceForAnalyzedAnswer } = await import('../lib/event-intelligence/dual-write')
  const result = await analyzeTranscript(transcript)
  const model = process.env.ANALYSIS_MODEL || 'gpt-4-turbo-preview'
  const promptVersion = process.env.ANALYSIS_PROMPT_VERSION || 'v1.0'

  await prisma.answerAnalysis.upsert({
    where: { answerId },
    create: {
      answerId,
      provider: process.env.ANALYSIS_PROVIDER || 'openai',
      model,
      promptVersion,
      summary: result.summary,
      sentimentLabel: result.sentiment,
      sentimentScore: result.sentimentScore,
      themesJson: { themes: result.themes, keyQuote: result.keyQuote } as object,
      actionsJson: { actionItems: result.actionItems } as object,
    },
    update: {
      summary: result.summary,
      sentimentLabel: result.sentiment,
      sentimentScore: result.sentimentScore,
      themesJson: { themes: result.themes, keyQuote: result.keyQuote } as object,
      actionsJson: { actionItems: result.actionItems } as object,
    },
  })

  const intelligenceResult = await writeEventIntelligenceForAnalyzedAnswer(
    {
      answerId,
      transcriptText: transcript,
      analysis: result,
      promptVersion,
      model,
    },
    prisma as never
  )

  console.log(`  Analysis completed for answer ${answerId}; intelligence: ${intelligenceResult.wrote ? 'written' : intelligenceResult.reason}`)
}

async function loadSeedContext(prisma: PrismaClient, parsed: SeedVoiceResponsesArgs): Promise<SeedContext> {
  if (parsed.mode === 'token') {
    const launch = await resolvePublicSurveyLaunchContext(parsed.token, prisma as never)
    if (launch.event.location.account.accountType === 'EVENTS' && !launch.survey.collectionPhase) {
      throw new Error('Event response seeding requires a phase-tagged survey token')
    }
    const questionRows = await prisma.question.findMany({
      where: {
        surveyId: launch.survey.id,
      },
      select: {
        id: true,
        key: true,
        label: true,
        order: true,
      },
      orderBy: {
        order: 'asc',
      },
    })

    return {
      mode: 'token',
      eventId: launch.event.id,
      surveyId: launch.survey.id,
      surveyTargetId: launch.target.id,
      publicSurveyLinkId: launch.publicLink.id,
      collectionPhase: launch.survey.collectionPhase ?? undefined,
      questions: questionRows.map((question) => ({
        id: question.id,
        key: question.key,
        label: question.label,
      })),
    }
  }

  const event = await prisma.event.findUnique({
    where: { id: parsed.eventId },
    select: {
      id: true,
      questionsJson: true,
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
      location: { select: { account: { select: { accountType: true } } } },
    },
  })

  if (!event) {
    throw new Error(`Event not found: ${parsed.eventId}`)
  }
  if (event.location.account.accountType === 'EVENTS') {
    throw new Error('Event response seeding requires a phase-tagged survey token')
  }

  return {
    mode: 'eventId',
    eventId: event.id,
    questions: resolveEventQuestionsFromSource(event).map((question) => ({
      key: question.key,
      label: question.label,
    })),
  }
}

export function buildResponseCreateData(
  context: SeedContext,
  index: number,
  startedAt: Date,
  completedAt: Date
) {
  return {
    eventId: context.eventId,
    ...(context.mode === 'token'
      ? {
          surveyId: context.surveyId,
          surveyTargetId: context.surveyTargetId,
          publicSurveyLinkId: context.publicSurveyLinkId,
          collectionPhase: context.collectionPhase,
        }
      : {}),
    anonymousId: `voice-seed-${Date.now()}-${index}`,
    status: ResponseStatus.COMPLETED,
    startedAt,
    completedAt,
    metadata: {
      source: 'seedVoiceResponses',
      voiceSeed: true,
      launchMode: context.mode,
    },
  }
}

export function buildAnswerCreateData(
  context: SeedContext,
  responseId: string,
  question: SeedQuestion,
  answer: GeneratedAnswer,
  objectKey: string,
  label: string
) {
  return {
    responseId,
    ...(context.mode === 'token' && question.id ? { questionId: question.id } : {}),
    questionKey: answer.questionKey,
    promptLabel: label,
    objectKey,
    objectEtag: `etag-${Math.random().toString(36).slice(2)}`,
    mimeType: 'audio/webm',
    fileSizeBytes: 50000 + Math.floor(Math.random() * 150000),
    durationMs: 5000 + Math.floor(Math.random() * 25000),
    status: AnswerStatus.COMPLETED,
    statusReason: null,
  }
}

async function main() {
  const parsed = parseArgs()
  const { count, runAnalysis } = parsed
  const prisma = createPrismaClient()

  try {
    if (runAnalysis && !process.env.OPENAI_API_KEY?.trim()) {
      throw new Error('OPENAI_API_KEY is required when --runAnalysis is passed')
    }

    console.log('\n🌱 Seed Voice Responses')
    console.log('─'.repeat(40))
    console.log(`Launch mode: ${parsed.mode}`)
    console.log(`Event ID: ${parsed.eventId || '(resolved from token)'}`)
    console.log(`Token: ${parsed.token || '(none)'}`)
    console.log(`Count: ${count}`)
    console.log(`Run analysis: ${runAnalysis}`)
    console.log('')

    const context = await loadSeedContext(prisma, parsed)
    const questions = context.questions.map((question) => ({
      key: question.key,
      label: question.label,
    }))

    console.log(`normalized question count: ${questions.length}`)
    if (questions.length > 0) {
      console.log(`first normalized question: ${JSON.stringify(questions[0])}`)
    }

    if (questions.length === 0) {
      throw new Error('No valid questions (need at least one with key and label as non-empty strings)')
    }

    console.log(`Questions: ${questions.length}`)
    questions.forEach((q, i) => console.log(`  ${i + 1}. ${q.key}: ${q.label?.slice(0, 50)}...`))
    console.log('')

    // Generate response sets via OpenAI
    console.log('Generating response sets via OpenAI gpt-4o-mini...')
    let generated: GeneratedResponseSet[]
    try {
      generated = await generateResponseSets(questions, count)
    } catch (err) {
      throw new Error(`OpenAI generation failed: ${err instanceof Error ? err.message : String(err)}`)
    }

    const validKeys = new Set(questions.map((q) => q.key))
    const keyToLabel = new Map(questions.map((q) => [q.key, q.label]))
    const keyToQuestion = new Map(context.questions.map((question) => [question.key, question]))

    let responsesCreated = 0
    let answersCreated = 0

    for (let i = 0; i < generated.length; i++) {
      const set = generated[i]
      if (!set?.answers || !Array.isArray(set.answers)) continue

      // Validate every answer maps to a real questionKey
      for (const a of set.answers) {
        if (!validKeys.has(a.questionKey)) {
          throw new Error(`Invalid questionKey "${a.questionKey}" in generated set ${i + 1}`)
        }
      }

      const startedAt = new Date(Date.now() - Math.random() * 14 * 24 * 60 * 60 * 1000)
      const completedAt = new Date(startedAt.getTime() + 60000 + Math.random() * 120000)

      const response = await prisma.response.create({
        data: buildResponseCreateData(context, i, startedAt, completedAt),
      })
      responsesCreated++

      for (const a of set.answers) {
        const label = a.promptLabel || keyToLabel.get(a.questionKey) || a.questionKey
        const question = keyToQuestion.get(a.questionKey)
        if (!question) {
          throw new Error(`Missing resolved question for key "${a.questionKey}"`)
        }
        const objectKey = `voice-seed/${context.eventId}/${response.id}/${a.questionKey}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

        const answer = await prisma.answer.create({
          data: buildAnswerCreateData(context, response.id, question, a, objectKey, label),
        })

        await prisma.answerTranscript.create({
          data: {
            answerId: answer.id,
            provider: 'openai',
            model: 'whisper-1',
            text: a.transcript || '(no transcript)',
          },
        })
        answersCreated++

        if (runAnalysis) {
          try {
            await executeAnswerAnalysis(prisma, answer.id, a.transcript || '')
            await new Promise((r) => setTimeout(r, 500))
          } catch (err) {
            console.warn(`  Warning: analysis failed for answer ${answer.id}:`, err instanceof Error ? err.message : err)
          }
        }
      }

      if ((i + 1) % 10 === 0) {
        console.log(`  Inserted ${i + 1}/${generated.length} responses...`)
      }
    }

    console.log('')
    console.log('─'.repeat(40))
    console.log('✅ Summary')
    console.log('─'.repeat(40))
    console.log(`  launch mode:      ${context.mode}`)
    console.log(`  eventId:          ${context.eventId}`)
    if (context.mode === 'token') {
      console.log(`  surveyId:         ${context.surveyId}`)
      console.log(`  surveyTargetId:   ${context.surveyTargetId}`)
      console.log(`  publicLinkId:     ${context.publicSurveyLinkId}`)
    }
    console.log(`  question count:   ${questions.length}`)
    console.log(`  responses created: ${responsesCreated}`)
    console.log(`  answers created:  ${answersCreated}`)
    console.log('')
  } finally {
    await prisma.$disconnect()
  }
}

if (process.argv[1]?.endsWith('seedVoiceResponses.ts') || process.argv[1]?.endsWith('seedVoiceResponses.js')) {
  main()
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err)
      process.exit(1)
    })
}
