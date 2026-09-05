import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAccountAdmin } from '@/lib/auth/require-account-admin'
import { ensureEventQuestionAudioForEvent } from '@/lib/question-audio'
import { resolveEventQuestionsFromSource } from '@/lib/question-read'
import { syncEventQuestions } from '@/lib/questions'
import { isEventsAccount } from '@/lib/account-product-mode'

function toCopiedQuestions(questions: ReturnType<typeof resolveEventQuestionsFromSource>) {
  return questions.map((question) => ({
    id: question.key,
    text: question.label,
    order: question.order,
    required: question.required,
    ...(question.ttsText ? { ttsText: question.ttsText } : {}),
  }))
}

function normalizedTier(tier: string | null | undefined) {
  const raw = (tier || 'starter').toLowerCase()
  if (raw === 'pro') return 'growth'
  if (raw === 'free') return 'starter'
  return raw
}

export async function POST(
  request: NextRequest,
  { params }: { params: { eventId: string } },
) {
  const accountSlug = request.nextUrl.searchParams.get('account')
  const admin = await requireAccountAdmin(accountSlug)
  if (!admin.ok) {
    return admin.response
  }

  const { account } = admin
  const { eventId } = params

  try {
    const body = await request.json().catch(() => ({}))
    const rawName = typeof body?.name === 'string' ? body.name.trim() : ''
    const targetLocationId = typeof body?.locationId === 'string' ? body.locationId.trim() : ''

    if (!rawName) {
      return NextResponse.json({ success: false, error: 'Survey name is required' }, { status: 400 })
    }

    if (!targetLocationId) {
      return NextResponse.json({ success: false, error: 'Target location/team is required' }, { status: 400 })
    }

    const accountPlan = await prisma.account.findUnique({
      where: { id: account.id },
      select: {
        accountType: true,
        tier: true,
      },
    })

    if (accountPlan && isEventsAccount(accountPlan.accountType) && normalizedTier(accountPlan.tier) === 'starter') {
      return NextResponse.json(
        { success: false, error: 'Event Launch accounts can only create one event' },
        { status: 409 },
      )
    }

    const [sourceEvent, targetLocation] = await Promise.all([
      prisma.event.findFirst({
        where: {
          id: eventId,
          location: {
            accountId: account.id,
          },
        },
        include: {
          questions: {
            where: { surveyId: null },
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
        },
      }),
      prisma.location.findUnique({
        where: { id: targetLocationId },
        select: {
          id: true,
          name: true,
          accountId: true,
        },
      }),
    ])

    if (!sourceEvent) {
      return NextResponse.json({ success: false, error: 'Source survey not found' }, { status: 404 })
    }

    if (!targetLocation || targetLocation.accountId !== account.id) {
      return NextResponse.json(
        { success: false, error: 'Target location/team must belong to the same account' },
        { status: 400 },
      )
    }

    const resolvedQuestions = resolveEventQuestionsFromSource(sourceEvent)
    if (resolvedQuestions.length === 0) {
      return NextResponse.json({ success: false, error: 'Source survey has no questions to copy' }, { status: 400 })
    }

    const copiedQuestions = toCopiedQuestions(resolvedQuestions)

    const copiedEvent = await prisma.$transaction(async (tx) => {
      const createdEvent = await tx.event.create({
        data: {
          locationId: targetLocation.id,
          name: rawName,
          description: sourceEvent.description,
          eventType: sourceEvent.eventType,
          startDate: sourceEvent.startDate,
          endDate: sourceEvent.endDate,
          status: 'DRAFT',
          isActive: true,
          ttsProvider: sourceEvent.ttsProvider,
          ttsVoice: sourceEvent.ttsVoice,
          ttsLocale: sourceEvent.ttsLocale,
          responseMode: sourceEvent.responseMode,
          questionsJson: copiedQuestions,
        },
        include: {
          location: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      })

      await syncEventQuestions(tx, createdEvent.id, copiedQuestions)

      return createdEvent
    })

    await ensureEventQuestionAudioForEvent(copiedEvent.id, {
      provider: copiedEvent.ttsProvider,
      voice: copiedEvent.ttsVoice,
      locale: copiedEvent.ttsLocale,
    })

    return NextResponse.json(
      {
        success: true,
        event: copiedEvent,
      },
      { status: 201 },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to copy survey'
    console.error('[API] Error copying survey:', message)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
