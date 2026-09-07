import { NextRequest, NextResponse } from 'next/server'
import { CollectionPhase, EventStatus, EventType } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireAccountMembership } from '@/lib/auth/require-account-membership'
import { syncEventQuestions } from '@/lib/questions'
import { ensureEventQuestionAudioForEvent, getDefaultEventTtsSettings } from '@/lib/question-audio'
import { deriveLocaleFromVoice } from '@/lib/tts-voices'
import { parseResponseMode } from '@/lib/response-mode'
import { isEventsAccount } from '@/lib/account-product-mode'
import { isEventCreationType } from '@/lib/event-creation-type'
import { isEventTemplateKey } from '@/lib/event-templates'
import { EventDateInputError, parseEventDateInput } from '@/lib/event-dates'
import { seedEventStructureFromTemplate } from '@/lib/event-template-seed'
import {
    expandEventTemplateSurveys,
    type EventTemplateSurveySelection,
} from '@/lib/event-template-expansion'
import { createEventWithReviewedAgenda } from '@/lib/create-event-with-reviewed-agenda'
import { reviewedInitialAgendaSchema } from '@/lib/pre-creation-agenda'

/**
 * GET /api/app/events
 * List all events for the authenticated user's account
 */
export async function GET(request: NextRequest) {
    try {
        const accountSlug = request.nextUrl.searchParams.get('account')
        const membership = await requireAccountMembership(accountSlug, { allowSuperAdmin: true })
        if (!membership.ok) return membership.response
        const { account } = membership

        // Get all events for the account's locations
        const events = await prisma.event.findMany({
            where: {
                location: {
                    accountId: account.id
                }
            },
            include: {
                location: {
                    select: {
                        id: true,
                        name: true,
                        slug: true
                    }
                },
                _count: {
                    select: {
                        responses: true
                    }
                }
            },
            orderBy: {
                createdAt: 'desc'
            }
        })

        return NextResponse.json({
            success: true,
            events
        })
    } catch (error: any) {
        console.error('[API] Error fetching events:', error)
        return NextResponse.json(
            { error: error.message || 'Failed to fetch events' },
            { status: 500 }
        )
    }
}

/**
 * POST /api/app/events
 * Create a new event (Draft status)
 */
export async function POST(request: NextRequest) {
    try {
        const accountSlug = request.nextUrl.searchParams.get('account')
        const membership = await requireAccountMembership(accountSlug, { allowSuperAdmin: true })
        if (!membership.ok) return membership.response
        const { account } = membership

        const body = await request.json()
        const {
            name,
            description,
            locationId,
            questions,
            ttsProvider,
            ttsVoice,
            ttsLocale,
            responseMode: rawResponseMode,
            template,
            venue,
            startDate: rawStartDate,
            endDate: rawEndDate,
            setupType,
            initialSetup,
            templateSurveyRecommendations: rawTemplateSurveyRecommendations,
        } = body

        // Validation
        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return NextResponse.json({ error: 'Event name is required' }, { status: 400 })
        }

        if (!locationId) {
            return NextResponse.json({ error: 'Location is required' }, { status: 400 })
        }

        // Optional event template (Events accounts only). Unknown keys are rejected.
        let templateKey: string | null = null
        if (template !== undefined && template !== null && template !== '') {
            if (!isEventTemplateKey(template)) {
                return NextResponse.json({ error: 'Invalid event template' }, { status: 400 })
            }
            templateKey = template
        }

        let templateSurveyRecommendations: EventTemplateSurveySelection[] = []
        if (rawTemplateSurveyRecommendations !== undefined) {
            if (!Array.isArray(rawTemplateSurveyRecommendations)) {
                return NextResponse.json({ error: 'Template survey recommendations must be an array' }, { status: 400 })
            }
            if (rawTemplateSurveyRecommendations.length > 25) {
                return NextResponse.json({ error: 'Too many template survey recommendations' }, { status: 400 })
            }
            templateSurveyRecommendations = rawTemplateSurveyRecommendations.map((selection: unknown) => {
                if (!selection || typeof selection !== 'object' || Array.isArray(selection)) return { key: '', collectionPhase: null as never }
                const record = selection as Record<string, unknown>
                return {
                    key: typeof record.key === 'string' ? record.key : '',
                    collectionPhase: Object.values(CollectionPhase).includes(record.collectionPhase as CollectionPhase)
                        ? record.collectionPhase as CollectionPhase
                        : null as never,
                    ...(record.surveyName !== undefined
                        ? { surveyName: typeof record.surveyName === 'string' ? record.surveyName : '' }
                        : {}),
                }
            })
        }

        if (templateSurveyRecommendations.length > 0 && !templateKey) {
            return NextResponse.json({ error: 'A template is required for recommended surveys' }, { status: 400 })
        }

        // Optional venue + dates.
        const normalizedVenue =
            typeof venue === 'string' && venue.trim().length > 0 ? venue.trim() : null

        // Canonical calendar-date rule: date-only input persists as the same
        // calendar date in every display timezone (no UTC-midnight drift).
        let startDate: Date | null
        let endDate: Date | null
        try {
            startDate = parseEventDateInput(rawStartDate, 'startDate')
            endDate = parseEventDateInput(rawEndDate, 'endDate')
        } catch (dateError) {
            return NextResponse.json(
                { error: dateError instanceof EventDateInputError ? dateError.message : 'Invalid date' },
                { status: 400 },
            )
        }

        if (startDate && endDate && endDate.getTime() < startDate.getTime()) {
            return NextResponse.json(
                { error: 'End date cannot be before the start date' },
                { status: 400 },
            )
        }

        const isEventsProductMode = isEventsAccount(account.accountType)

        // Events-account customers select one of the three supported creation
        // modes. Older API callers that omit it retain the historical SURVEY
        // value and legacy template behavior without rewriting old events.
        if (isEventsProductMode && setupType !== undefined && !isEventCreationType(setupType)) {
            return NextResponse.json({ error: 'Invalid event setup type' }, { status: 400 })
        }
        const eventType = isEventsProductMode && isEventCreationType(setupType)
            ? EventType[setupType]
            : EventType.SURVEY

        if (!isEventsProductMode && (!questions || !Array.isArray(questions) || questions.length === 0)) {
            return NextResponse.json({ error: 'At least one question is required' }, { status: 400 })
        }

        if (ttsProvider !== undefined && (typeof ttsProvider !== 'string' || ttsProvider.trim().length === 0)) {
            return NextResponse.json({ error: 'TTS provider is invalid' }, { status: 400 })
        }

        if (ttsVoice !== undefined && (typeof ttsVoice !== 'string' || ttsVoice.trim().length === 0)) {
            return NextResponse.json({ error: 'TTS voice is invalid' }, { status: 400 })
        }

        if (ttsLocale !== undefined && (typeof ttsLocale !== 'string' || ttsLocale.trim().length === 0)) {
            return NextResponse.json({ error: 'TTS locale is invalid' }, { status: 400 })
        }

        let responseModeParsed
        try {
            responseModeParsed = rawResponseMode !== undefined ? parseResponseMode(rawResponseMode) : 'VOICE_ONLY'
        } catch {
            return NextResponse.json({ error: 'Invalid response mode' }, { status: 400 })
        }

        // Verify location belongs to user's account
        const location = await prisma.location.findUnique({
            where: { id: locationId }
        })

        if (!location || location.accountId !== account.id) {
            return NextResponse.json({ error: 'Invalid location' }, { status: 400 })
        }

        const defaultTtsSettings = getDefaultEventTtsSettings()

        const normalizedTtsVoice = ttsVoice?.trim()
        const normalizedTtsLocale = deriveLocaleFromVoice(normalizedTtsVoice, ttsLocale?.trim() || defaultTtsSettings.locale)

        if (isEventsProductMode) {
            if (initialSetup?.agenda) {
                const agenda = reviewedInitialAgendaSchema.safeParse(initialSetup.agenda)
                if (!agenda.success) return NextResponse.json({ error: 'Reviewed agenda data is invalid' }, { status: 400 })
                if (!Array.isArray(initialSetup.eventAreaNames) || !initialSetup.eventAreaNames.every((value: unknown) => typeof value === 'string')) {
                    return NextResponse.json({ error: 'Event Areas are invalid' }, { status: 400 })
                }
                if (typeof initialSetup.requestId !== 'string') {
                    return NextResponse.json({ error: 'Creation request ID is required' }, { status: 400 })
                }
                const creation = await createEventWithReviewedAgenda({
                    accountId: account.id,
                    requestId: initialSetup.requestId,
                    eventAreaNames: initialSetup.eventAreaNames,
                    agenda: agenda.data,
                    eventData: {
                        name: name.trim(),
                        description: description?.trim() || null,
                        locationId,
                        status: EventStatus.ACTIVE,
                        eventType,
                        ttsProvider: ttsProvider?.trim().toLowerCase() || defaultTtsSettings.provider,
                        ttsVoice: normalizedTtsVoice || defaultTtsSettings.voice,
                        ttsLocale: normalizedTtsVoice ? normalizedTtsLocale : defaultTtsSettings.locale,
                        responseMode: 'VOICE_ONLY',
                        questionsJson: [],
                        isActive: true,
                        ...(normalizedVenue ? { venue: normalizedVenue } : {}),
                        ...(startDate ? { startDate } : {}),
                        ...(endDate ? { endDate } : {}),
                    },
                })
                const event = await prisma.event.findFirstOrThrow({
                    where: { id: creation.eventId, location: { accountId: account.id } },
                    include: {
                        location: { select: { id: true, name: true, slug: true } },
                        _count: { select: { surveyTargets: true, surveys: true, questions: true } },
                    },
                })
                return NextResponse.json({ success: true, event, initialSetup: creation }, { status: creation.idempotentReplay ? 200 : 201 })
            }
            const event = await prisma.event.create({
                data: {
                    name: name.trim(),
                    description: description?.trim() || null,
                    locationId,
                    status: EventStatus.ACTIVE,
                    eventType,
                    ttsProvider: ttsProvider?.trim().toLowerCase() || defaultTtsSettings.provider,
                    ttsVoice: normalizedTtsVoice || defaultTtsSettings.voice,
                    ttsLocale: normalizedTtsVoice ? normalizedTtsLocale : defaultTtsSettings.locale,
                    responseMode: 'VOICE_ONLY',
                    questionsJson: [],
                    isActive: true,
                    // Conditionally include optional fields so legacy callers that
                    // omit them keep producing the original event-container shape.
                    ...(templateKey ? { templateKey } : {}),
                    ...(normalizedVenue ? { venue: normalizedVenue } : {}),
                    ...(startDate ? { startDate } : {}),
                    ...(endDate ? { endDate } : {}),
                },
                include: {
                    location: {
                        select: {
                            id: true,
                            name: true,
                            slug: true
                        }
                    },
                    _count: {
                        select: {
                            surveyTargets: true,
                            surveys: true,
                            questions: true,
                        }
                    }
                }
            })

            // Seed starter Event structure from the template (structure only — no
            // surveys, responses, or fabricated analytics). Blank seeds nothing.
            if (templateKey) {
                try {
                    const seededCount = await seedEventStructureFromTemplate(event.id, templateKey)
                    if (seededCount > 0) {
                        console.info('[Events API] Seeded starter event structure', {
                            eventId: event.id,
                            templateKey,
                            seededCount,
                        })
                    }
                } catch (seedError) {
                    // Structure seeding is best-effort; the event container already
                    // exists and the organizer can add areas manually.
                    console.error('[Events API] Failed to seed event structure', {
                        eventId: event.id,
                        templateKey,
                        error: seedError instanceof Error ? seedError.message : seedError,
                    })
                }
            }

            let templateExpansion = { created: [], skipped: [], failed: [] } as Awaited<ReturnType<typeof expandEventTemplateSurveys>>
            if (templateKey && templateSurveyRecommendations.length > 0) {
                try {
                    templateExpansion = await expandEventTemplateSurveys({
                        eventId: event.id,
                        templateKey,
                        selections: templateSurveyRecommendations,
                    })
                } catch (expansionError) {
                    const reason = expansionError instanceof Error
                        ? expansionError.message
                        : 'Failed to create recommended surveys'
                    templateExpansion.failed = templateSurveyRecommendations.map((selection) => ({
                        key: selection.key || '(missing)',
                        reason,
                    }))
                    console.error('[Events API] Failed to expand recommended surveys', {
                        eventId: event.id,
                        templateKey,
                        error: reason,
                    })
                }
            }

            console.info('[Events API] Created event container', {
                eventId: event.id,
                accountId: account.id,
                templateKey,
            })

            return NextResponse.json({
                success: true,
                event,
                templateExpansion,
            }, { status: 201 })
        }

        // Create event with DRAFT status and dual-write questions to the first-class table.
        const event = await prisma.$transaction(async (tx) => {
            const createdEvent = await tx.event.create({
                data: {
                    name: name.trim(),
                    description: description?.trim() || null,
                    locationId,
                    status: 'DRAFT',
                    eventType: 'SURVEY',
                    ttsProvider: ttsProvider?.trim().toLowerCase() || defaultTtsSettings.provider,
                    ttsVoice: normalizedTtsVoice || defaultTtsSettings.voice,
                    ttsLocale: normalizedTtsVoice ? normalizedTtsLocale : defaultTtsSettings.locale,
                    responseMode: responseModeParsed,
                    questionsJson: questions,
                    isActive: true
                },
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

            await syncEventQuestions(tx, createdEvent.id, questions)

            return createdEvent
        })

        console.info('[Events API] Saved survey TTS settings on create', {
            eventId: event.id,
            provider: event.ttsProvider,
            voice: event.ttsVoice,
            locale: event.ttsLocale,
        })

        await ensureEventQuestionAudioForEvent(event.id, {
            provider: event.ttsProvider,
            voice: event.ttsVoice,
            locale: event.ttsLocale,
        })

        return NextResponse.json({
            success: true,
            event
        }, { status: 201 })
    } catch (error: any) {
        console.error('[API] Error creating event:', error)
        return NextResponse.json(
            { error: error.message || 'Failed to create event' },
            { status: 500 }
        )
    }
}
