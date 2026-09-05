import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireEventAccess } from '@/lib/auth/require-events-event-access'
import { resolveEventQuestionsFromSource, toQuestionBuilderQuestions } from '@/lib/question-read'
import { ensureEventQuestionAudioForEvent } from '@/lib/question-audio'
import { normalizeEventQuestions, syncEventQuestions } from '@/lib/questions'
import { deriveLocaleFromVoice } from '@/lib/tts-voices'
import { parseResponseMode } from '@/lib/response-mode'
import { loadPlannerSurveyTargetIds } from '@/lib/event-survey-scope'
import { withDevelopmentRouteTiming } from '@/lib/development-route-timing'
import { requireAccountAdmin } from '@/lib/auth/require-account-admin'
import { deleteEventForAccount, EventDeletionError } from '@/lib/event-deletion'
import { eventSpeakerWorkspaceWhere } from '@/lib/event-agenda-service'

function hasAudioRelevantQuestionChanges(
    existingQuestions: ReturnType<typeof resolveEventQuestionsFromSource>,
    incomingQuestions: Parameters<typeof normalizeEventQuestions>[0],
) {
    const normalizedIncoming = normalizeEventQuestions(incomingQuestions)
    const existingByKey = new Map(
        existingQuestions.map((question) => [
            question.key,
            {
                label: question.label,
                ttsText: question.ttsText ?? null,
            },
        ]),
    )

    return normalizedIncoming.some((question) => {
        const existing = existingByKey.get(question.key)
        if (!existing) return true
        return existing.label !== question.label || (existing.ttsText ?? null) !== (question.ttsText ?? null)
    })
}

/**
 * GET /api/app/events/[eventId]
 * Get a single event by ID
 */
async function getEvent(
    request: NextRequest,
    { params }: { params: { eventId: string } }
) {
    try {
        const { eventId } = params
        const accountSlug = request.nextUrl.searchParams.get('account')
        const access = await requireEventAccess(accountSlug, eventId)
        if (!access.ok) return access.response
        const { account } = access

        // Get event and verify it belongs to user's account
        const event = await prisma.event.findFirst({
            where: {
                id: eventId,
                location: {
                    accountId: account.id
                }
            },
            include: {
                location: {
                    select: {
                        id: true,
                        name: true,
                        slug: true,
                        accountId: true,
                        timezone: true
                    }
                },
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
                _count: {
                    select: {
                        responses: { where: { status: 'COMPLETED' } },
                        surveyTargets: { where: { isActive: true } },
                        questions: true,
                    }
                }
            }
        })

        if (!event) {
            return NextResponse.json({ error: 'Event not found' }, { status: 404 })
        }

        const plannerTargetIds = await loadPlannerSurveyTargetIds(prisma, eventId)
        const [answersCollected, activeSurveyTargetCount, surveyCount, assignedSpeakerCount] = await Promise.all([
            prisma.answer.count({ where: { response: { eventId, status: 'COMPLETED' } } }),
            prisma.surveyTarget.count({
                where: { eventId, isActive: true, id: { in: plannerTargetIds } },
            }),
            prisma.survey.count({
                where: { eventId, surveyTargetId: { in: plannerTargetIds } },
            }),
            // This deliberately uses the same event-scoped membership rule as
            // the Operations speaker workspace. Template events derive their
            // speakers from session assignments; manual/legacy events retain
            // the explicit event roster.
            prisma.eventSpeakerProfile.count({
                where: eventSpeakerWorkspaceWhere({
                    accountId: account.id,
                    eventId,
                    eventType: event.eventType,
                }),
            }),
        ])

        const resolvedQuestions = resolveEventQuestionsFromSource(event)

        return NextResponse.json({
            success: true,
            event: {
                ...event,
                _count: {
                    responses: event._count.responses,
                    answers: answersCollected,
                    surveys: surveyCount,
                    surveyTargets: activeSurveyTargetCount,
                    questions: event._count.questions,
                    assignedSpeakerCount,
                },
                questions: resolvedQuestions,
                questionsJson: toQuestionBuilderQuestions(resolvedQuestions),
            }
        })
    } catch (error: any) {
        console.error('[API] Error fetching event:', error)
        return NextResponse.json(
            { error: error.message || 'Failed to fetch event' },
            { status: 500 }
        )
    }
}

export function GET(request: NextRequest, context: { params: { eventId: string } }) {
    return withDevelopmentRouteTiming(
        {
            route: '/api/app/events/[eventId]',
            account: request.nextUrl?.searchParams.get('account') ?? (request.url ? new URL(request.url).searchParams.get('account') : null),
            eventId: context.params.eventId,
        },
        () => getEvent(request, context),
    )
}

/**
 * PATCH /api/app/events/[eventId]
 * Update an event (respects status-based edit rules)
 */
export async function PATCH(
    request: NextRequest,
    { params }: { params: { eventId: string } }
) {
    try {
        const { eventId } = params
        const accountSlug = request.nextUrl.searchParams.get('account')
        const access = await requireEventAccess(accountSlug, eventId)
        if (!access.ok) return access.response
        const { account } = access
        const body = await request.json()
        const { name, description, questions, status, ttsProvider, ttsVoice, ttsLocale, responseMode: rawResponseMode } = body

        // Get existing event
        const existingEvent = await prisma.event.findFirst({
            where: {
                id: eventId,
                location: {
                    accountId: account.id
                }
            },
            select: {
                id: true,
                status: true,
                ttsProvider: true,
                ttsVoice: true,
                ttsLocale: true,
                questionsJson: true,
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
        })

        if (!existingEvent) {
            return NextResponse.json({ error: 'Event not found' }, { status: 404 })
        }

        const responsesCollected = await prisma.response.count({ where: { eventId } })
        const answersCollected = await prisma.answer.count({
            where: { response: { eventId } },
        })
        const hasCollectedFeedback = responsesCollected > 0 || answersCollected > 0
        const isActiveSurvey = existingEvent.status === 'ACTIVE'
        const canEditQuestions = !isActiveSurvey && !hasCollectedFeedback

        if (questions !== undefined && !canEditQuestions) {
            const errorMessage =
                isActiveSurvey && hasCollectedFeedback
                    ? 'Questions cannot be edited while the survey is active or after responses have been collected. Duplicate this survey to make changes safely.'
                    : isActiveSurvey
                      ? 'Questions cannot be edited while the survey is active. Stop the survey first to make changes.'
                      : 'Questions cannot be edited after responses have been collected. Duplicate this survey to make changes safely.'
            // Note: messages match survey edit UI copy for support and client error display.
            return NextResponse.json({ error: errorMessage }, { status: 400 })
        }

        if (questions !== undefined) {
            if (!Array.isArray(questions) || questions.length === 0) {
                return NextResponse.json({ error: 'At least one question is required' }, { status: 400 })
            }
        }

        // Status-based edit rules
        const updateData: any = {}

        if (rawResponseMode !== undefined) {
            try {
                updateData.responseMode = parseResponseMode(rawResponseMode)
            } catch {
                return NextResponse.json({ error: 'Invalid response mode' }, { status: 400 })
            }
        }

        if (ttsProvider !== undefined) {
            if (typeof ttsProvider !== 'string' || ttsProvider.trim().length === 0) {
                return NextResponse.json({ error: 'TTS provider is invalid' }, { status: 400 })
            }
            updateData.ttsProvider = ttsProvider.trim().toLowerCase()
        }
        if (ttsVoice !== undefined) {
            if (typeof ttsVoice !== 'string' || ttsVoice.trim().length === 0) {
                return NextResponse.json({ error: 'TTS voice is invalid' }, { status: 400 })
            }
            updateData.ttsVoice = ttsVoice.trim()
        }
        if (ttsLocale !== undefined) {
            if (typeof ttsLocale !== 'string' || ttsLocale.trim().length === 0) {
                return NextResponse.json({ error: 'TTS locale is invalid' }, { status: 400 })
            }
            updateData.ttsLocale = ttsLocale.trim()
        }
        if (updateData.ttsVoice !== undefined || updateData.ttsLocale !== undefined) {
            updateData.ttsLocale = deriveLocaleFromVoice(
                updateData.ttsVoice ?? existingEvent.ttsVoice,
                updateData.ttsLocale ?? existingEvent.ttsLocale
            )
        }

        if (existingEvent.status === 'DRAFT') {
            // Draft: Full edit when collection rules allow questions (enforced above)
            if (name !== undefined) updateData.name = name.trim()
            if (description !== undefined) updateData.description = description?.trim() || null
            if (questions !== undefined) {
                updateData.questionsJson = questions
            }
            if (status !== undefined && ['ACTIVE', 'DRAFT'].includes(status)) {
                updateData.status = status
            }
        } else if (existingEvent.status === 'ACTIVE') {
            // Active: Name + audio settings; question edits rejected above when present
            if (name !== undefined) updateData.name = name.trim()
            if (status !== undefined && ['COMPLETED', 'ACTIVE'].includes(status)) {
                updateData.status = status
            }
        } else if (existingEvent.status === 'COMPLETED') {
            // Closed: Name + audio + questions only when nothing has been collected yet
            if (name !== undefined) updateData.name = name.trim()
            if (questions !== undefined) {
                updateData.questionsJson = questions
            }
            if (status !== undefined && ['ARCHIVED', 'ACTIVE'].includes(status)) {
                updateData.status = status
            }
        } else {
            return NextResponse.json(
                { error: 'Survey status does not allow edits' },
                { status: 400 }
            )
        }

        const nextTtsProvider = updateData.ttsProvider ?? existingEvent.ttsProvider
        const nextTtsVoice = updateData.ttsVoice ?? existingEvent.ttsVoice
        const nextTtsLocale = updateData.ttsLocale ?? existingEvent.ttsLocale
        const audioSettingsChanged =
            nextTtsProvider !== existingEvent.ttsProvider ||
            nextTtsVoice !== existingEvent.ttsVoice ||
            nextTtsLocale !== existingEvent.ttsLocale
        const audioQuestionChanged =
            canEditQuestions &&
            questions !== undefined &&
            hasAudioRelevantQuestionChanges(resolveEventQuestionsFromSource(existingEvent), questions)
        const shouldRegenerateAudio = audioSettingsChanged || audioQuestionChanged

        const shouldSyncQuestions = questions !== undefined && canEditQuestions

        const updatedEvent = shouldSyncQuestions
            ? await prisma.$transaction(async (tx) => {
                const updated = await tx.event.update({
                    where: { id: eventId },
                    data: updateData,
                    include: {
                        location: {
                            select: {
                                id: true,
                                name: true,
                                slug: true
                            }
                        }
                    }
                })

                await syncEventQuestions(tx, eventId, questions)
                return updated
            })
            : await prisma.event.update({
                where: { id: eventId },
                data: updateData,
                include: {
                    location: {
                        select: {
                            id: true,
                            name: true,
                            slug: true
                        }
                    }
                }
            })

        console.info('[Events API] Saved survey TTS settings on edit', {
            eventId,
            previousProvider: existingEvent.ttsProvider,
            previousVoice: existingEvent.ttsVoice,
            previousLocale: existingEvent.ttsLocale,
            provider: updatedEvent.ttsProvider,
            voice: updatedEvent.ttsVoice,
            locale: updatedEvent.ttsLocale,
            shouldRegenerateAudio,
        })

        if (shouldRegenerateAudio) {
            await ensureEventQuestionAudioForEvent(eventId, {
                provider: updatedEvent.ttsProvider,
                voice: updatedEvent.ttsVoice,
                locale: updatedEvent.ttsLocale,
            })
        }

        return NextResponse.json({
            success: true,
            event: updatedEvent
        })
    } catch (error: any) {
        console.error('[API] Error updating event:', error)
        return NextResponse.json(
            { error: error.message || 'Failed to update event' },
            { status: 500 }
        )
    }
}

/**
 * DELETE /api/app/events/[eventId]
 * Account-admin-only hard deletion. The canonical deletion service owns the
 * transactional dependency cleanup and final-removal verification.
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: { eventId: string } }
) {
    try {
        const { eventId } = params
        const accountSlug = request.nextUrl.searchParams.get('account')
        const admin = await requireAccountAdmin(accountSlug)
        if (!admin.ok) return admin.response
        const body = await request.json().catch(() => null) as { confirmationName?: unknown } | null
        const result = await deleteEventForAccount({
            accountId: admin.account.id,
            eventId,
            confirmationName: typeof body?.confirmationName === 'string' ? body.confirmationName : '',
        })

        return NextResponse.json({
            success: true,
            data: result,
            message: 'Event deleted successfully',
        })
    } catch (error: unknown) {
        if (error instanceof EventDeletionError) {
            const status = error.code === 'NOT_FOUND' ? 404 : error.code === 'CONFIRMATION_REQUIRED' ? 400 : 500
            return NextResponse.json({ success: false, error: error.message, code: error.code }, { status })
        }
        console.error('[API] Error deleting event:', error)
        return NextResponse.json(
            { success: false, error: 'Failed to delete event' },
            { status: 500 }
        )
    }
}
