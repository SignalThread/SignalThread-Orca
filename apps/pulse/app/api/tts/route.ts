import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { getPlayableObjectUrl, uploadObject, verifyObjectExists } from '@/lib/objectStorage'
import { previewQuestionAudio } from '@/lib/question-audio'
import {
  DEFAULT_TTS_LOCALE_LITERAL,
  DEFAULT_TTS_PROVIDER,
  DEFAULT_TTS_VOICE_LITERAL,
  deriveLocaleFromVoice,
} from '@/lib/tts-voices'

const DEFAULT_VOICE = process.env.TTS_DEFAULT_VOICE || DEFAULT_TTS_VOICE_LITERAL
const DEFAULT_LOCALE = process.env.TTS_DEFAULT_LOCALE || DEFAULT_TTS_LOCALE_LITERAL

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const text = typeof body?.text === 'string' ? body.text.trim() : ''
    const provider =
      typeof body?.provider === 'string' && body.provider.trim().length > 0
        ? body.provider.trim().toLowerCase()
        : DEFAULT_TTS_PROVIDER
    const voice =
      typeof body?.voice === 'string' && body.voice.trim().length > 0
        ? body.voice.trim()
        : DEFAULT_VOICE
    const locale = deriveLocaleFromVoice(
      voice,
      typeof body?.locale === 'string' && body.locale.trim().length > 0
        ? body.locale.trim()
        : DEFAULT_LOCALE,
    )

    if (!text) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 })
    }

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
    console.error('[TTS API] Error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to generate TTS audio' },
      { status: 500 },
    )
  }
}
