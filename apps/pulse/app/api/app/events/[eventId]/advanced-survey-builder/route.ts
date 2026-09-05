import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  CollectionPhase,
  QuestionType,
  ResponseMode,
  SurveyAvailabilityAnchor,
  SurveyAvailabilityMode,
  SurveyPresentationMode,
} from '@prisma/client'
import { requireAccountAdmin } from '@/lib/auth/require-account-admin'
import {
  AdvancedEventSurveyBuilderError,
  loadAdvancedEventSurvey,
  publishAdvancedEventSurvey,
  reconcileAdvancedSurveyAssignments,
  saveAdvancedEventSurveyDraft,
} from '@/lib/advanced-event-survey-builder'
import { generateAdvancedSurveyQuestions, rewriteAdvancedSurveyQuestion } from '@/lib/advanced-event-survey-ai'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: { eventId: string } },
) {
  const admin = await requireAccountAdmin(request.nextUrl.searchParams.get('account'))
  if (!admin.ok) return admin.response
  const surveyId = request.nextUrl.searchParams.get('survey')?.trim()
  if (!surveyId) return NextResponse.json({ success: false, error: 'Survey is required' }, { status: 400 })
  try {
    const survey = await loadAdvancedEventSurvey({ accountId: admin.account.id, eventId: params.eventId, surveyId })
    return NextResponse.json({ success: true, data: { survey } })
  } catch (error) {
    if (error instanceof AdvancedEventSurveyBuilderError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    }
    console.error('[GET /api/app/events/[eventId]/advanced-survey-builder]', error)
    return NextResponse.json({ success: false, error: 'Failed to load survey' }, { status: 500 })
  }
}

const saveDraftSchema = z.object({
  surveyId: z.string().trim().min(1).optional().nullable(),
  creationRequestId: z.string().uuid(),
  name: z.string().max(160).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  collectionPhase: z.nativeEnum(CollectionPhase).optional().nullable(),
  presentationMode: z.nativeEnum(SurveyPresentationMode).optional(),
  responseMode: z.nativeEnum(ResponseMode).optional(),
  experiencePreset: z.enum(['VOICE_FIRST', 'TEXT_FIRST', 'CUSTOM']).optional(),
  surveyContext: z.enum(['NOT_SURE', 'EVENT', 'SESSIONS', 'SPEAKERS', 'EVENT_AREAS', 'CUSTOM']).optional(),
  speakerFeedbackMode: z.enum(['EACH_SPEAKER', 'SPEAKERS_AS_GROUP']).optional(),
  ttsVoice: z.string().trim().min(1).optional().nullable(),
  availability: z.object({
    mode: z.nativeEnum(SurveyAvailabilityMode),
    timezone: z.string().optional().nullable(),
    opensAt: z.string().datetime().optional().nullable(),
    closesAt: z.string().datetime().optional().nullable(),
    openAnchor: z.nativeEnum(SurveyAvailabilityAnchor).optional().nullable(),
    closeAnchor: z.nativeEnum(SurveyAvailabilityAnchor).optional().nullable(),
    openOffsetMinutes: z.number().int().optional().nullable(),
    closeOffsetMinutes: z.number().int().optional().nullable(),
    override: z.enum(['FORCE_OPEN', 'FORCE_CLOSED']).optional().nullable(),
  }).optional(),
  questions: z.array(z.object({
    id: z.string().trim().min(1).max(120),
    text: z.string().max(1000),
    type: z.nativeEnum(QuestionType),
    required: z.boolean().optional(),
    options: z.array(z.string().max(240)).max(12).optional(),
  })).max(100).optional(),
})

const assignmentSchema = z.object({
  surveyId: z.string().trim().min(1),
  assignments: z.array(z.object({
    kind: z.enum(['EVENT', 'SESSION', 'SPEAKER', 'LOCATION', 'CUSTOM']),
    selection: z.enum(['ALL', 'SELECTED']),
    targetIds: z.array(z.string().trim().min(1)).max(500).optional(),
    customKey: z.string().trim().min(1).max(120).optional(),
    customName: z.string().trim().min(1).max(160).optional(),
  })).max(5),
})

const generateSchema = z.object({
  action: z.literal('GENERATE_AI'),
  surveyId: z.string().trim().min(1),
  goal: z.string().trim().min(1).max(80),
  tone: z.enum(['friendly', 'direct', 'premium']),
  count: z.number().int().min(3).max(8),
  excludedContextKeys: z.array(z.string().max(200)).max(100).optional(),
})

const regenerateSuggestionSchema = z.object({
  action: z.literal('REGENERATE_AI_SUGGESTION'),
  surveyId: z.string().trim().min(1),
  goal: z.string().trim().min(1).max(80),
  tone: z.enum(['friendly', 'direct', 'premium']),
  excludedContextKeys: z.array(z.string().max(200)).max(100).optional(),
  avoidQuestions: z.array(z.string().trim().min(1).max(1000)).min(1).max(108),
})

const rewriteSchema = z.object({
  action: z.literal('REWRITE_AI'),
  surveyId: z.string().trim().min(1),
  text: z.string().trim().min(1).max(1000),
  instruction: z.string().trim().max(300).optional(),
  excludedContextKeys: z.array(z.string().max(200)).max(100).optional(),
})

const publishSchema = z.object({ action: z.literal('PUBLISH'), surveyId: z.string().trim().min(1) })

export async function PUT(
  request: NextRequest,
  { params }: { params: { eventId: string } },
) {
  const admin = await requireAccountAdmin(request.nextUrl.searchParams.get('account'))
  if (!admin.ok) return admin.response

  const parsed = saveDraftSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: 'Validation failed', message: parsed.error.issues.map((issue) => issue.message).join(', ') },
      { status: 400 },
    )
  }

  try {
    const survey = await saveAdvancedEventSurveyDraft({
      accountId: admin.account.id,
      eventId: params.eventId,
      ...parsed.data,
    })
    return NextResponse.json({ success: true, data: { survey } })
  } catch (error) {
    if (error instanceof AdvancedEventSurveyBuilderError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    }
    console.error('[PUT /api/app/events/[eventId]/advanced-survey-builder]', error)
    return NextResponse.json({ success: false, error: 'Failed to save survey draft' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { eventId: string } },
) {
  const admin = await requireAccountAdmin(request.nextUrl.searchParams.get('account'))
  if (!admin.ok) return admin.response
  const body = await request.json().catch(() => null)
  const schema = body?.action === 'GENERATE_AI' ? generateSchema : body?.action === 'REGENERATE_AI_SUGGESTION' ? regenerateSuggestionSchema : body?.action === 'REWRITE_AI' ? rewriteSchema : assignmentSchema
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'Validation failed', message: parsed.error.issues.map((issue) => issue.message).join(', ') }, { status: 400 })
  }
  try {
    if ('action' in parsed.data && (parsed.data.action === 'GENERATE_AI' || parsed.data.action === 'REGENERATE_AI_SUGGESTION')) {
      const result = await generateAdvancedSurveyQuestions({
        accountId: admin.account.id,
        eventId: params.eventId,
        ...parsed.data,
        count: parsed.data.action === 'REGENERATE_AI_SUGGESTION' ? 1 : parsed.data.count,
      })
      return NextResponse.json({ success: true, data: result })
    }
    if ('action' in parsed.data && parsed.data.action === 'REWRITE_AI') {
      const result = await rewriteAdvancedSurveyQuestion({ accountId: admin.account.id, eventId: params.eventId, ...parsed.data })
      return NextResponse.json({ success: true, data: result })
    }
    const survey = await reconcileAdvancedSurveyAssignments({ accountId: admin.account.id, eventId: params.eventId, ...parsed.data })
    return NextResponse.json({ success: true, data: { survey, assignmentWarnings: survey.assignmentWarnings } })
  } catch (error) {
    if (error instanceof AdvancedEventSurveyBuilderError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    }
    console.error('[POST /api/app/events/[eventId]/advanced-survey-builder]', error)
    const fallback = body?.action === 'GENERATE_AI' || body?.action === 'REGENERATE_AI_SUGGESTION'
      ? 'Failed to generate survey questions'
      : body?.action === 'REWRITE_AI'
        ? 'Failed to rewrite question'
        : 'Failed to update survey assignments'
    return NextResponse.json({ success: false, error: fallback }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { eventId: string } },
) {
  const admin = await requireAccountAdmin(request.nextUrl.searchParams.get('account'))
  if (!admin.ok) return admin.response
  const parsed = publishSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'Validation failed', message: parsed.error.issues.map((issue) => issue.message).join(', ') }, { status: 400 })
  }
  try {
    const survey = await publishAdvancedEventSurvey({ accountId: admin.account.id, eventId: params.eventId, surveyId: parsed.data.surveyId })
    return NextResponse.json({ success: true, data: { survey } })
  } catch (error) {
    if (error instanceof AdvancedEventSurveyBuilderError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    }
    console.error('[PATCH /api/app/events/[eventId]/advanced-survey-builder]', error)
    return NextResponse.json({ success: false, error: 'Failed to publish survey' }, { status: 500 })
  }
}
