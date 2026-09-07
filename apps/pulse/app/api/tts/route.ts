import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { z } from 'zod'
import { getPlayableObjectUrl, uploadObject, verifyObjectExists } from '@/lib/objectStorage'
import { previewQuestionAudio } from '@/lib/question-audio'
import {
  isAnswerQuestionContextError,
  resolveAnswerQuestionContext,
} from '@/lib/answer-question-context'
import {
  DEFAULT_TTS_LOCALE_LITERAL,
  DEFAULT_TTS_PROVIDER,
  DEFAULT_TTS_VOICE_LITERAL,
  deriveLocaleFromVoice,
} from '@/lib/tts-voices'

const DEFAULT_VOICE = process.env.TTS_DEFAULT_VOICE || DEFAULT_TTS_VOICE_LITERAL
const DEFAULT_LOCALE = process.env.TTS_DEFAULT_LOCALE || DEFAULT_TTS_LOCALE_LITERAL

const nonEmpty = z.string().trim().min(1)

const ttsRequestSchema = z.object({
  text: z.string().max(2000),
  provider: nonEmpty.optional(),
  voice: nonEmpty.optional(),
  locale: nonEmpty.optional(),
  responseId: z.string().cuid(),
  questionKey: z.string().min(1).max(100),
})

function generateCacheKey(params: {
  provider: string
  voice: string
  locale: string
  text: string
}) {
  const hash = crypto
    .createHash('sha256')
    .update(`${params.provider}:${params.voice}:${params.locale}:${params.text}`)
    .digest('hex')
  return `tts/${hash}.mp3`
}

/**
 * POST /api/tts
 *
 * Attendee-facing fallback: the kiosk speaks a survey question aloud when no
 * pre-generated audio asset exists. It stays public (no organizer session), but
 * it is not a free-text speech service: the caller must name an existing
 * response and question, and the text must be that question's configured
 * label/TTS text. Anything else is refused before any billable provider call.
 * Organizer previews of arbitrary text use the authenticated
 * /api/app/question-audio/preview route instead.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const parsed = ttsRequestSchema.safeParse(body)
    if (!parsed.success) {
      const missingScope = parsed.error.errors.some((issue) => issue.path[0] === 'responseId' || issue.path[0] === 'questionKey')
      return NextResponse.json(
        {
          error: missingScope
            ? 'responseId and questionKey are required: /api/tts only speaks a survey question for an existing response'
            : parsed.error.errors.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join(', '),
        },
        { status: 400 },
      )
    }

    const text = parsed.data.text.trim()
    if (!text) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 })
    }

    const questionContext = await resolveAnswerQuestionContext({
      responseId: parsed.data.responseId,
      questionKey: parsed.data.questionKey,
    })
    if (!questionContext.spokenTexts.includes(text)) {
      return NextResponse.json(
        { error: 'Text does not match the configured wording of this question' },
        { status: 403 },
      )
    }

    const provider = parsed.data.provider ? parsed.data.provider.toLowerCase() : DEFAULT_TTS_PROVIDER
    const voice = parsed.data.voice ?? DEFAULT_VOICE
    const locale = deriveLocaleFromVoice(voice, parsed.data.locale ?? DEFAULT_LOCALE)

    const bucket = process.env.S3_BUCKET_NAME
    if (!bucket) {
      return NextResponse.json({ error: 'S3_BUCKET_NAME is missing' }, { status: 500 })
    }

    const cacheKey = generateCacheKey({
      provider,
      voice,
      locale,
      text,
    })

    const exists = await verifyObjectExists(bucket, cacheKey)
    if (exists) {
      const url = await getPlayableObjectUrl(bucket, cacheKey)
      console.info('[TTS API] Reusing cached fallback TTS audio', { provider, voice, locale, cacheKey })
      return NextResponse.json({ success: true, url, cached: true, provider, voice, locale })
    }

    const generated = await previewQuestionAudio({
      provider,
      voice,
      locale,
      text,
    })

    await uploadObject({
      bucket,
      key: cacheKey,
      body: generated.buffer,
      contentType: generated.mimeType,
      cacheControl: 'public, max-age=31536000, immutable',
    })

    const url = await getPlayableObjectUrl(bucket, cacheKey)
    console.info('[TTS API] Generated fallback TTS audio', { provider, voice, locale, cacheKey })
    return NextResponse.json({ success: true, url, cached: false, provider, voice, locale })
  } catch (error: any) {
    if (isAnswerQuestionContextError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[TTS API] Error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to generate TTS audio' },
      { status: 500 },
    )
  }
}
