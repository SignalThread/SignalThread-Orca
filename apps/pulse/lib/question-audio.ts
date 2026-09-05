import crypto from 'crypto'
import { prisma } from './prisma'
import {
  buildObjectUrl,
  getPlayableObjectUrl,
  uploadObject,
  verifyObjectExists,
} from './objectStorage'
import {
  DEFAULT_TTS_LOCALE_LITERAL,
  DEFAULT_TTS_PROVIDER,
  DEFAULT_TTS_VOICE_LITERAL,
  deriveLocaleFromVoice,
} from './tts-voices'
import { resolveEventQuestionsFromSource } from './question-read'
import { QuestionResponseTarget, QuestionType, type Prisma } from '@prisma/client'

export interface QuestionAudioQuestion {
  id: string
  key: string
  label: string
  ttsText: string | null
  order: number
  required: boolean
  type?: QuestionType
  responseTarget?: QuestionResponseTarget
  configurationJson?: Prisma.JsonValue | null
}

export interface EnsureQuestionAudioParams {
  question: QuestionAudioQuestion
  provider?: string
  voice?: string
  locale?: string
}

export interface EventTtsSettings {
  provider: string
  voice: string
  locale: string
}

export interface EnsuredQuestionAudioResult {
  question: QuestionAudioQuestion
  sourceText: string
  cached: boolean
  asset: {
    id: string
    questionId: string
    provider: string
    voice: string
    language: string
    locale: string
    textHash: string
    sourceText: string
    objectKey: string
    storageUrl: string | null
    mimeType: string
    durationMs: number | null
    createdAt: Date
    updatedAt: Date
  }
}

export interface RuntimeQuestionAudioResult {
  id: string
  key: string
  label: string
  ttsText: string | null
  order: number
  required: boolean
  type: QuestionType
  responseTarget: QuestionResponseTarget
  configurationJson?: Prisma.JsonValue | null
  audioUrl: string | null
  ttsProvider: string
  ttsVoice: string
  ttsLocale: string
  fallbackReason: string | null
}

type DbLike = Pick<typeof prisma, 'questionAudioAsset'>

interface GenerateSpeechResult {
  buffer: Buffer
  mimeType: string
  durationMs?: number | null
}

interface QuestionAudioDeps {
  db: DbLike
  bucket: string
  generateSpeech: (params: {
    provider: string
    voice: string
    locale: string
    text: string
  }) => Promise<GenerateSpeechResult>
  uploadAudio: (params: {
    bucket: string
    key: string
    body: Buffer
    contentType: string
  }) => Promise<void>
  verifyAudioExists: (bucket: string, key: string) => Promise<boolean>
  buildStorageUrl: (bucket: string, key: string) => string | null
}

type QuestionReadDbLike = Pick<typeof prisma, 'question'>
type EventReadDbLike = Pick<typeof prisma, 'event'>

const DEFAULT_VOICE = process.env.TTS_DEFAULT_VOICE || DEFAULT_TTS_VOICE_LITERAL
const DEFAULT_LOCALE = process.env.TTS_DEFAULT_LOCALE || DEFAULT_TTS_LOCALE_LITERAL
const DEFAULT_MIME_TYPE = 'audio/mpeg'
const GOOGLE_TTS_URL = 'https://texttospeech.googleapis.com/v1/text:synthesize'

export function getDefaultEventTtsSettings(): EventTtsSettings {
  return {
    provider: DEFAULT_TTS_PROVIDER,
    voice: DEFAULT_VOICE,
    locale: DEFAULT_LOCALE,
  }
}

type TtsSettingsRecord = {
  ttsProvider?: string | null
  ttsVoice?: string | null
  ttsLocale?: string | null
}

type AccountTtsSettingsRecord = {
  settingsJson?: unknown
} | null

function resolveAccountTtsSettings(account?: AccountTtsSettingsRecord): Partial<EventTtsSettings> {
  const settingsJson = account?.settingsJson
  if (!settingsJson || typeof settingsJson !== 'object' || Array.isArray(settingsJson)) {
    return {}
  }

  const settings = settingsJson as Record<string, unknown>
  const nested =
    settings.tts && typeof settings.tts === 'object' && !Array.isArray(settings.tts)
      ? settings.tts as Record<string, unknown>
      : {}

  return {
    provider: optionalString(nested.provider) ?? optionalString(settings.ttsProvider),
    voice: optionalString(nested.voice) ?? optionalString(settings.ttsVoice),
    locale: optionalString(nested.locale) ?? optionalString(settings.ttsLocale),
  }
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

export function resolveSurveyQuestionVoiceSettings(params: {
  survey?: TtsSettingsRecord | null
  event?: TtsSettingsRecord | null
  account?: AccountTtsSettingsRecord
  override?: {
    provider?: string
    voice?: string
    locale?: string
  }
}): EventTtsSettings {
  const defaults = getDefaultEventTtsSettings()
  const accountSettings = resolveAccountTtsSettings(params.account)
  const voice =
    params.override?.voice?.trim() ||
    params.survey?.ttsVoice?.trim() ||
    params.event?.ttsVoice?.trim() ||
    accountSettings.voice ||
    defaults.voice
  const requestedLocale =
    params.override?.locale?.trim() ||
    params.survey?.ttsLocale?.trim() ||
    params.event?.ttsLocale?.trim() ||
    accountSettings.locale ||
    defaults.locale

  return {
    provider:
      params.override?.provider?.trim() ||
      params.survey?.ttsProvider?.trim() ||
      params.event?.ttsProvider?.trim() ||
      accountSettings.provider ||
      defaults.provider,
    voice,
    locale: deriveLocaleFromVoice(voice, requestedLocale),
  }
}

export function resolveEventTtsSettings(params: {
  event?: {
    ttsProvider?: string | null
    ttsVoice?: string | null
    ttsLocale?: string | null
  } | null
  account?: AccountTtsSettingsRecord
  override?: {
    provider?: string
    voice?: string
    locale?: string
  }
}): EventTtsSettings {
  return resolveSurveyQuestionVoiceSettings({
    event: params.event,
    account: params.account,
    override: params.override,
  })
}

type RuntimeEventRecord = {
  id: string
  ttsProvider: string | null
  ttsVoice: string | null
  ttsLocale: string | null
  location?: {
    account?: AccountTtsSettingsRecord | null
  } | null
  questionsJson: unknown
  questions: QuestionAudioQuestion[]
}

type RuntimeVoiceSource = {
  survey?: TtsSettingsRecord | null
  event?: TtsSettingsRecord | null
  account?: AccountTtsSettingsRecord
}

async function generateSpeechWithGoogle(params: {
  provider: string
  voice: string
  locale: string
  text: string
}): Promise<GenerateSpeechResult> {
  if (process.env.EVENTS_TEST_DISABLE_EXTERNAL_PROVIDERS === '1') {
    throw new Error('External TTS is disabled for deterministic Events tests')
  }
  if (params.provider !== 'google') {
    throw new Error(`Unsupported TTS provider "${params.provider}"`)
  }

  const apiKey = process.env.GOOGLE_TTS_API_KEY
  if (!apiKey) {
    throw new Error('GOOGLE_TTS_API_KEY is required for question audio generation')
  }

  const response = await fetch(`${GOOGLE_TTS_URL}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: {
        text: params.text,
      },
      voice: {
        languageCode: params.locale,
        name: params.voice,
      },
      audioConfig: {
        audioEncoding: 'MP3',
      },
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Google TTS request failed: ${response.status} ${text}`)
  }

  const json = await response.json() as { audioContent?: string }
  if (!json.audioContent) {
    throw new Error('Google TTS response did not include audioContent')
  }

  return {
    buffer: Buffer.from(json.audioContent, 'base64'),
    mimeType: DEFAULT_MIME_TYPE,
    durationMs: null,
  }
}

function buildDeps(overrides: Partial<QuestionAudioDeps> = {}): QuestionAudioDeps {
  const bucket = overrides.bucket ?? process.env.S3_BUCKET_NAME
  if (!bucket) {
    throw new Error('S3_BUCKET_NAME is required for question audio generation')
  }

  return {
    db: overrides.db ?? prisma,
    bucket,
    generateSpeech: overrides.generateSpeech ?? generateSpeechWithGoogle,
    uploadAudio:
      overrides.uploadAudio ??
      (async ({ bucket, key, body, contentType }) => {
        await uploadObject({
          bucket,
          key,
          body,
          contentType,
          cacheControl: 'public, max-age=31536000, immutable',
        })
      }),
    verifyAudioExists: overrides.verifyAudioExists ?? verifyObjectExists,
    buildStorageUrl: overrides.buildStorageUrl ?? buildObjectUrl,
  }
}

export function getQuestionAudioSourceText(question: Pick<QuestionAudioQuestion, 'label' | 'ttsText'>): string {
  const text = question.ttsText?.trim() || question.label.trim()
  if (!text) {
    throw new Error('Question audio source text is empty')
  }
  return text
}

export function getQuestionAudioLanguage(locale: string): string {
  const trimmed = locale.trim()
  if (!trimmed) return ''
  return trimmed.split(/[-_]/)[0]?.toLowerCase() || ''
}

export function generateQuestionAudioTextHash(params: {
  provider: string
  voice: string
  locale: string
  sourceText: string
}): string {
  return crypto
    .createHash('sha256')
    .update(`${params.provider}:${params.voice}:${params.locale}:${params.sourceText}`)
    .digest('hex')
}

function extensionForMimeType(mimeType: string): string {
  if (mimeType.includes('mpeg')) return 'mp3'
  if (mimeType.includes('wav')) return 'wav'
  if (mimeType.includes('ogg')) return 'ogg'
  return 'bin'
}

export function buildQuestionAudioObjectKey(questionId: string, textHash: string, mimeType: string): string {
  return `question-audio/${questionId}/${textHash}.${extensionForMimeType(mimeType)}`
}

export async function ensureQuestionAudioAsset(
  params: EnsureQuestionAudioParams,
  overrides: Partial<QuestionAudioDeps> = {},
): Promise<EnsuredQuestionAudioResult> {
  const deps = buildDeps(overrides)
  const provider = (params.provider || DEFAULT_TTS_PROVIDER).trim().toLowerCase()
  const voice = (params.voice || DEFAULT_VOICE).trim()
  const locale = deriveLocaleFromVoice(voice, (params.locale || DEFAULT_LOCALE).trim())
  const language = getQuestionAudioLanguage(locale)
  const sourceText = getQuestionAudioSourceText(params.question)
  const textHash = generateQuestionAudioTextHash({
    provider,
    voice,
    locale,
    sourceText,
  })
  const uniqueWhere = {
    questionId_provider_voice_language_locale_textHash: {
      questionId: params.question.id,
      provider,
      voice,
      language,
      locale,
      textHash,
    },
  } as const

  const existing = await deps.db.questionAudioAsset.findUnique({
    where: uniqueWhere,
  })

  if (existing) {
    const objectExists = await deps.verifyAudioExists(deps.bucket, existing.objectKey)
    if (objectExists) {
      console.info('[QuestionAudio] Reusing cached question audio asset', {
        questionId: params.question.id,
        provider,
        voice,
        locale,
        textHash,
        objectKey: existing.objectKey,
      })
      return {
        question: params.question,
        sourceText,
        cached: true,
        asset: existing,
      }
    }
  }

  const generated = await deps.generateSpeech({
    provider,
    voice,
    locale,
    text: sourceText,
  })
  console.info('[QuestionAudio] Generated new question audio asset', {
    questionId: params.question.id,
    provider,
    voice,
    locale,
    textHash,
  })
  const objectKey =
    existing?.objectKey || buildQuestionAudioObjectKey(params.question.id, textHash, generated.mimeType)

  await deps.uploadAudio({
    bucket: deps.bucket,
    key: objectKey,
    body: generated.buffer,
    contentType: generated.mimeType,
  })

  const storageUrl = deps.buildStorageUrl(deps.bucket, objectKey)
  const asset = await deps.db.questionAudioAsset.upsert({
    where: uniqueWhere,
    update: {
      sourceText,
      objectKey,
      storageUrl,
      mimeType: generated.mimeType,
      durationMs: generated.durationMs ?? null,
    },
    create: {
      questionId: params.question.id,
      provider,
      voice,
      language,
      locale,
      textHash,
      sourceText,
      objectKey,
      storageUrl,
      mimeType: generated.mimeType,
      durationMs: generated.durationMs ?? null,
    },
  })

  return {
    question: params.question,
    sourceText,
    cached: false,
    asset,
  }
}

export async function ensureEventQuestionAudioAssets(
  questions: QuestionAudioQuestion[],
  options: {
    provider?: string
    voice?: string
    locale?: string
  } = {},
  overrides: Partial<QuestionAudioDeps> = {},
): Promise<EnsuredQuestionAudioResult[]> {
  const ordered = [...questions].sort((a, b) => a.order - b.order)
  const results: EnsuredQuestionAudioResult[] = []

  for (const question of ordered) {
    results.push(
      await ensureQuestionAudioAsset(
        {
          question,
          provider: options.provider,
          voice: options.voice,
          locale: options.locale,
        },
        overrides,
      ),
    )
  }

  return results
}

export async function getEventQuestionsForAudio(
  eventId: string,
  db: QuestionReadDbLike = prisma,
): Promise<QuestionAudioQuestion[]> {
  return db.question.findMany({
    where: { eventId, surveyId: null },
    select: {
      id: true,
      key: true,
      label: true,
      ttsText: true,
      order: true,
      required: true,
      type: true,
      responseTarget: true,
      configurationJson: true,
    },
    orderBy: {
      order: 'asc',
    },
  })
}

export async function ensureEventQuestionAudioForEvent(
  eventId: string,
  options: {
    provider?: string
    voice?: string
    locale?: string
  } = {},
  overrides: Partial<QuestionAudioDeps> & { questionDb?: QuestionReadDbLike } = {},
): Promise<EnsuredQuestionAudioResult[]> {
  const questions = await getEventQuestionsForAudio(eventId, overrides.questionDb ?? prisma)

  if (questions.length === 0) {
    console.warn('[QuestionAudio] No Question rows found while ensuring event audio', { eventId })
    return []
  }

  console.info('[QuestionAudio] Ensuring question audio for event', {
    eventId,
    provider: options.provider,
    voice: options.voice,
    locale: options.locale,
    questionCount: questions.length,
  })

  return ensureEventQuestionAudioAssets(questions, options, overrides)
}

export async function getSurveyQuestionsForAudio(
  surveyId: string,
  db: QuestionReadDbLike = prisma,
): Promise<QuestionAudioQuestion[]> {
  return db.question.findMany({
    where: { surveyId },
    select: {
      id: true,
      key: true,
      label: true,
      ttsText: true,
      order: true,
      required: true,
      type: true,
      responseTarget: true,
      configurationJson: true,
    },
    orderBy: {
      order: 'asc',
    },
  })
}

export async function ensureSurveyQuestionAudioForSurvey(
  surveyId: string,
  options: {
    provider?: string
    voice?: string
    locale?: string
  } = {},
  overrides: Partial<QuestionAudioDeps> & { questionDb?: QuestionReadDbLike } = {},
): Promise<EnsuredQuestionAudioResult[]> {
  const questions = await getSurveyQuestionsForAudio(surveyId, overrides.questionDb ?? prisma)

  if (questions.length === 0) {
    console.warn('[QuestionAudio] No Question rows found while ensuring survey audio', { surveyId })
    return []
  }

  console.info('[QuestionAudio] Ensuring question audio for survey', {
    surveyId,
    provider: options.provider,
    voice: options.voice,
    locale: options.locale,
    questionCount: questions.length,
  })

  return ensureEventQuestionAudioAssets(questions, options, overrides)
}

async function buildRuntimeQuestionAudioResults(
  questions: QuestionAudioQuestion[],
  settings: EventTtsSettings,
  logScope: { eventId?: string; surveyId?: string },
  overrides: Partial<QuestionAudioDeps> & {
    getPlayableUrl?: (bucket: string, key: string) => Promise<string>
    fallbackQuestionId?: 'id' | 'key'
  } = {},
): Promise<RuntimeQuestionAudioResult[]> {
  const buildTextOnlyFallbackForQuestion = (question: QuestionAudioQuestion, reason: string) => ({
    id: overrides.fallbackQuestionId === 'key' ? question.key : question.id,
    key: question.key,
    label: question.label,
    ttsText: question.ttsText,
    order: question.order,
    required: question.required,
    type: question.type ?? QuestionType.VOICE,
    responseTarget: question.responseTarget ?? QuestionResponseTarget.GENERAL,
    configurationJson: question.configurationJson ?? null,
    audioUrl: null,
    ttsProvider: settings.provider,
    ttsVoice: settings.voice,
    ttsLocale: settings.locale,
    fallbackReason: reason,
  })

  const buildTextOnlyFallback = (reason: string) =>
    questions.map((question) => buildTextOnlyFallbackForQuestion(question, reason))

  if (questions.length === 0) {
    return []
  }

  // Critical journey tests keep our Next routes, Prisma writes, and question
  // resolution real while stubbing the external TTS/object-storage boundary.
  // The flag is opt-in and never set by application runtime configuration.
  if (process.env.EVENTS_TEST_DISABLE_EXTERNAL_PROVIDERS === '1') {
    return buildTextOnlyFallback('external-providers-disabled-for-test')
  }

  let assets: EnsuredQuestionAudioResult[]
  try {
    assets = await ensureEventQuestionAudioAssets(questions, settings, overrides)
  } catch (error) {
    console.warn('[QuestionAudio] Runtime fallback to temporary TTS because cached question audio generation failed', {
      ...logScope,
      provider: settings.provider,
      voice: settings.voice,
      locale: settings.locale,
      error: error instanceof Error ? error.message : 'unknown',
    })
    return buildTextOnlyFallback('question-audio-generation-failed')
  }

  const bucket = overrides.bucket ?? process.env.S3_BUCKET_NAME
  if (!bucket) {
    console.warn('[QuestionAudio] Runtime fallback to temporary TTS because S3 bucket is unavailable', {
      ...logScope,
      provider: settings.provider,
      voice: settings.voice,
      locale: settings.locale,
    })
    return buildTextOnlyFallback('missing-storage-bucket')
  }

  const getPlayableUrl = overrides.getPlayableUrl ?? getPlayableObjectUrl

  return Promise.all(
    assets.map(async (result) => {
      // Defensive: if cached audio generation could not produce an asset for a
      // question, fall back to text-only for that question rather than crashing
      // the entire kiosk launch.
      if (!result.asset) {
        return buildTextOnlyFallbackForQuestion(result.question, 'question-audio-generation-failed')
      }
      try {
        const audioUrl = await getPlayableUrl(bucket, result.asset.objectKey)
        return {
          id: result.question.id,
          key: result.question.key,
          label: result.question.label,
          ttsText: result.question.ttsText,
          order: result.question.order,
          required: result.question.required,
          type: result.question.type ?? QuestionType.VOICE,
          responseTarget: result.question.responseTarget ?? QuestionResponseTarget.GENERAL,
          configurationJson: result.question.configurationJson ?? null,
          audioUrl,
          ttsProvider: result.asset.provider,
          ttsVoice: result.asset.voice,
          ttsLocale: result.asset.locale,
          fallbackReason: null,
        }
      } catch (error) {
        console.warn('[QuestionAudio] Failed to build playable runtime question audio URL', {
          ...logScope,
          questionId: result.question.id,
          objectKey: result.asset.objectKey,
          error: error instanceof Error ? error.message : 'unknown',
        })
        return {
          id: result.question.id,
          key: result.question.key,
          label: result.question.label,
          ttsText: result.question.ttsText,
          order: result.question.order,
          required: result.question.required,
          type: result.question.type ?? QuestionType.VOICE,
          responseTarget: result.question.responseTarget ?? QuestionResponseTarget.GENERAL,
          configurationJson: result.question.configurationJson ?? null,
          audioUrl: null,
          ttsProvider: result.asset.provider,
          ttsVoice: result.asset.voice,
          ttsLocale: result.asset.locale,
          fallbackReason: 'playable-url-unavailable',
        }
      }
    }),
  )
}

export async function getSurveyQuestionsForRuntime(
  surveyId: string,
  voiceSource: RuntimeVoiceSource,
  overrides: Partial<QuestionAudioDeps> & {
    questionDb?: QuestionReadDbLike
    getPlayableUrl?: (bucket: string, key: string) => Promise<string>
  } = {},
): Promise<RuntimeQuestionAudioResult[]> {
  const questions = await getSurveyQuestionsForAudio(surveyId, overrides.questionDb ?? prisma)
  const settings = resolveSurveyQuestionVoiceSettings(voiceSource)

  if (questions.length === 0) {
    console.warn('[QuestionAudio] Runtime token survey has no scoped Question rows', {
      surveyId,
      provider: settings.provider,
      voice: settings.voice,
      locale: settings.locale,
    })
    return []
  }

  return buildRuntimeQuestionAudioResults(questions, settings, { surveyId }, overrides)
}

export async function getEventQuestionsForRuntime(
  eventId: string,
  options: {
    provider?: string
    voice?: string
    locale?: string
  } = {},
  overrides: Partial<QuestionAudioDeps> & {
    eventDb?: EventReadDbLike
    getPlayableUrl?: (bucket: string, key: string) => Promise<string>
  } = {},
): Promise<RuntimeQuestionAudioResult[]> {
  const buildTextOnlyFallback = (source: RuntimeEventRecord, settings: EventTtsSettings, reason: string) =>
    resolveEventQuestionsFromSource(source).map((question) => ({
      id: question.key,
      key: question.key,
      label: question.label,
      ttsText: question.ttsText,
      order: question.order,
      required: question.required,
      type: QuestionType.VOICE,
      responseTarget: QuestionResponseTarget.GENERAL,
      audioUrl: null,
      ttsProvider: settings.provider,
      ttsVoice: settings.voice,
      ttsLocale: settings.locale,
      fallbackReason: reason,
    }))

  const event = await (overrides.eventDb ?? prisma).event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      ttsProvider: true,
      ttsVoice: true,
      ttsLocale: true,
      location: {
        select: {
          account: {
            select: {
              settingsJson: true,
            },
          },
        },
      },
      questionsJson: true,
      questions: {
        where: { surveyId: null },
        select: {
          id: true,
          key: true,
          label: true,
          ttsText: true,
          order: true,
          required: true,
          type: true,
          responseTarget: true,
        },
        orderBy: {
          order: 'asc',
        },
      },
    },
  }) as RuntimeEventRecord | null

  if (!event) {
    throw new Error(`Event ${eventId} not found while loading runtime question audio`)
  }

  const settings = resolveEventTtsSettings({
    event,
    account: event.location?.account ?? undefined,
    override: options,
  })

  if (event.questions.length === 0) {
    console.warn('[QuestionAudio] Runtime fallback to text-only questions because Question rows are missing', {
      eventId,
      provider: settings.provider,
      voice: settings.voice,
      locale: settings.locale,
    })

    return buildTextOnlyFallback(event, settings, 'missing-question-rows')
  }

  return buildRuntimeQuestionAudioResults(event.questions, settings, { eventId }, {
    ...overrides,
    fallbackQuestionId: 'key',
  })
}

export async function previewQuestionAudio(
  params: {
    provider?: string
    voice?: string
    locale?: string
    text: string
  },
  overrides: {
    generateSpeech?: (params: {
      provider: string
      voice: string
      locale: string
      text: string
    }) => Promise<GenerateSpeechResult>
  } = {},
): Promise<GenerateSpeechResult> {
  const provider = (params.provider || DEFAULT_TTS_PROVIDER).trim().toLowerCase()
  const voice = (params.voice || DEFAULT_VOICE).trim()
  const locale = deriveLocaleFromVoice(voice, (params.locale || DEFAULT_LOCALE).trim())
  const text = params.text.trim()

  if (!text) {
    throw new Error('Preview text is required')
  }

  const generateSpeech = overrides.generateSpeech ?? generateSpeechWithGoogle
  return generateSpeech({
    provider,
    voice,
    locale,
    text,
  })
}
