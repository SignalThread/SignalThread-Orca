import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAccountMembership } from '@/lib/auth/require-account-membership'
import { prisma } from '@/lib/prisma'
import { ensureEventQuestionAudioAssets, resolveEventTtsSettings } from '@/lib/question-audio'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  provider: z.string().min(1).optional(),
  voice: z.string().min(1).optional(),
  locale: z.string().min(1).optional(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: { eventId: string } },
) {
  try {
    const accountSlug = request.nextUrl.searchParams.get('account')
    const auth = await requireAccountMembership(accountSlug)
    if (!auth.ok) return auth.response

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

    const event = await prisma.event.findFirst({
      where: {
        id: params.eventId,
        location: {
          accountId: auth.account.id,
        },
      },
      select: {
        id: true,
        name: true,
        ttsProvider: true,
        ttsVoice: true,
        ttsLocale: true,
        questions: {
          where: { surveyId: null },
          select: {
            id: true,
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
      },
    })

    if (!event) {
      return NextResponse.json({ success: false, error: 'Event not found' }, { status: 404 })
    }

    if (event.questions.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Event has no Question rows. Backfill questions before generating cached audio.',
        },
        { status: 400 },
      )
    }

    const settings = resolveEventTtsSettings({
      event,
      override: parsed.data,
    })

    const results = await ensureEventQuestionAudioAssets(event.questions, settings)

    return NextResponse.json({
      success: true,
      eventId: event.id,
      eventName: event.name,
      provider: settings.provider,
      voice: settings.voice,
      locale: settings.locale,
      questions: results.map((result) => ({
        id: result.question.id,
        key: result.question.key,
        label: result.question.label,
        ttsText: result.question.ttsText,
        order: result.question.order,
        required: result.question.required,
        sourceText: result.sourceText,
        cached: result.cached,
        audio: {
          id: result.asset.id,
          provider: result.asset.provider,
          voice: result.asset.voice,
          language: result.asset.language,
          locale: result.asset.locale,
          textHash: result.asset.textHash,
          sourceText: result.asset.sourceText,
          objectKey: result.asset.objectKey,
          storageUrl: result.asset.storageUrl,
          mimeType: result.asset.mimeType,
          durationMs: result.asset.durationMs,
          createdAt: result.asset.createdAt,
          updatedAt: result.asset.updatedAt,
        },
      })),
    })
  } catch (error) {
    console.error('[POST /api/app/events/[eventId]/question-audio]', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to ensure question audio' },
      { status: 500 },
    )
  }
}
