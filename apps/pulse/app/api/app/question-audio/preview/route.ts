import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { previewQuestionAudio, resolveEventTtsSettings } from '@/lib/question-audio'
import { requireAccountMembership } from '@/lib/auth/require-account-membership'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  provider: z.string().min(1).optional(),
  voice: z.string().min(1),
  locale: z.string().min(1).optional(),
  text: z.string().min(1),
})

export async function POST(request: NextRequest) {
  try {
    const accountSlug = request.nextUrl.searchParams.get('account')
    if (!accountSlug?.trim()) {
      return NextResponse.json({ success: false, error: 'account required' }, { status: 400 })
    }

    const membership = await requireAccountMembership(accountSlug, { allowSuperAdmin: true })
    if (!membership.ok) return membership.response

    const body = await request.json().catch(() => ({}))
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: parsed.error.errors.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join(', '),
        },
        { status: 400 },
      )
    }

    const settings = resolveEventTtsSettings({
      override: parsed.data,
    })
    const result = await previewQuestionAudio({
      provider: settings.provider,
      voice: settings.voice,
      locale: settings.locale,
      text: parsed.data.text,
    })

    return NextResponse.json({
      success: true,
      provider: settings.provider,
      voice: settings.voice,
      locale: settings.locale,
      mimeType: result.mimeType,
      audioBase64: result.buffer.toString('base64'),
    })
  } catch (error) {
    console.error('[POST /api/app/question-audio/preview]', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to preview question audio' },
      { status: 500 },
    )
  }
}
