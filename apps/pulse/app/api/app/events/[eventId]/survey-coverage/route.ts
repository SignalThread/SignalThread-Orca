import { NextRequest, NextResponse } from 'next/server'
import { ZodError, z } from 'zod'
import { requireAccountAdmin } from '@/lib/auth/require-account-admin'
import {
  EventSurveyCoverageError,
  bulkAttachSurveyToSessions,
  createEventAreaForSurveyCoverage,
  ensureEventSurveyCoverageTarget,
  getEventSurveyCoverage,
  removeEventAreaForSurveyCoverage,
  renameEventAreaForSurveyCoverage,
  duplicateAdvancedSurvey,
  setAdvancedSurveyCollectionState,
  setEventSurveyDeployment,
} from '@/lib/event-survey-coverage'
import { EventStructureError } from '@/lib/event-structure'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const actionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('ENSURE_TARGET'),
    kind: z.enum(['OVERALL_EVENT', 'SESSION', 'EVENT_AREA']),
    structureItemId: z.string().trim().min(1).optional(),
  }),
  z.object({
    action: z.literal('CREATE_EVENT_AREA'),
    name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(1000).optional().nullable(),
  }),
  z.object({
    action: z.literal('UPDATE_EVENT_AREA'),
    eventAreaId: z.string().trim().min(1),
    name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(1000).optional().nullable(),
  }),
  z.object({
    action: z.literal('REMOVE_EVENT_AREA'),
    eventAreaId: z.string().trim().min(1),
  }),
  z.object({
    action: z.literal('BULK_ATTACH_SESSIONS'),
    sessionIds: z.array(z.string().trim().min(1)).min(1).max(500),
    surveyId: z.string().trim().min(1),
  }),
  z.object({
    action: z.literal('SET_SURVEY_DEPLOYMENT'),
    surveyId: z.string().trim().min(1),
    kind: z.enum(['OVERALL_EVENT', 'SESSION', 'SPEAKER', 'EVENT_AREA', 'CUSTOM']),
    structureItemIds: z.array(z.string().trim().min(1)).max(500).optional(),
    customKey: z.string().trim().min(1).max(120).optional(),
    customName: z.string().trim().min(1).max(160).optional(),
  }),
  z.object({
    action: z.literal('SET_SURVEY_COLLECTION_STATE'),
    surveyId: z.string().trim().min(1),
    paused: z.boolean(),
  }),
  z.object({
    action: z.literal('DUPLICATE_ADVANCED_SURVEY'),
    surveyId: z.string().trim().min(1),
  }),
])

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof EventSurveyCoverageError || error instanceof EventStructureError) {
    return NextResponse.json({
      success: false,
      error: error.message,
      code: error instanceof EventSurveyCoverageError
        ? error.code
        : 'EVENT_STRUCTURE_ERROR',
      details: error instanceof EventSurveyCoverageError ? error.details : undefined,
    }, { status: error.status })
  }
  if (error instanceof ZodError) {
    return NextResponse.json({ success: false, error: 'Validation failed', details: error.issues }, { status: 400 })
  }
  console.error('[Event Survey Coverage API]', error)
  return NextResponse.json({ success: false, error: fallback }, { status: 500 })
}

export async function GET(request: NextRequest, { params }: { params: { eventId: string } }) {
  const admin = await requireAccountAdmin(request.nextUrl.searchParams.get('account'))
  if (!admin.ok) return admin.response
  try {
    const data = await getEventSurveyCoverage({ accountId: admin.account.id, eventId: params.eventId })
    return NextResponse.json({ success: true, data })
  } catch (error) {
    return errorResponse(error, 'Failed to load survey coverage')
  }
}

export async function POST(request: NextRequest, { params }: { params: { eventId: string } }) {
  const accountSlug = request.nextUrl.searchParams.get('account') ?? ''
  const admin = await requireAccountAdmin(accountSlug)
  if (!admin.ok) return admin.response
  try {
    const body = actionSchema.parse(await request.json())
    if (body.action === 'ENSURE_TARGET') {
      const data = await ensureEventSurveyCoverageTarget({
        accountId: admin.account.id,
        eventId: params.eventId,
        kind: body.kind,
        structureItemId: body.structureItemId,
      })
      return NextResponse.json({ success: true, data })
    }
    if (body.action === 'CREATE_EVENT_AREA') {
      const data = await createEventAreaForSurveyCoverage({
        accountSlug,
        eventId: params.eventId,
        name: body.name,
        description: body.description,
      })
      return NextResponse.json({ success: true, data }, { status: 201 })
    }
    if (body.action === 'UPDATE_EVENT_AREA') {
      const data = await renameEventAreaForSurveyCoverage({
        accountSlug,
        eventId: params.eventId,
        eventAreaId: body.eventAreaId,
        name: body.name,
        description: body.description,
      })
      return NextResponse.json({ success: true, data })
    }
    if (body.action === 'REMOVE_EVENT_AREA') {
      const data = await removeEventAreaForSurveyCoverage({
        accountId: admin.account.id,
        accountSlug,
        eventId: params.eventId,
        eventAreaId: body.eventAreaId,
      })
      return NextResponse.json({ success: true, data })
    }
    if (body.action === 'SET_SURVEY_DEPLOYMENT') {
      const data = await setEventSurveyDeployment({
        accountId: admin.account.id,
        eventId: params.eventId,
        surveyId: body.surveyId,
        kind: body.kind,
        structureItemIds: body.structureItemIds,
        customKey: body.customKey,
        customName: body.customName,
      })
      return NextResponse.json({ success: true, data })
    }
    if (body.action === 'SET_SURVEY_COLLECTION_STATE') {
      const data = await setAdvancedSurveyCollectionState({
        accountId: admin.account.id,
        eventId: params.eventId,
        surveyId: body.surveyId,
        paused: body.paused,
      })
      return NextResponse.json({ success: true, data })
    }
    if (body.action === 'DUPLICATE_ADVANCED_SURVEY') {
      const data = await duplicateAdvancedSurvey({
        accountId: admin.account.id,
        eventId: params.eventId,
        surveyId: body.surveyId,
      })
      return NextResponse.json({ success: true, data }, { status: 201 })
    }
    const data = await bulkAttachSurveyToSessions({
      accountId: admin.account.id,
      eventId: params.eventId,
      sessionIds: body.sessionIds,
      surveyId: body.surveyId,
    })
    return NextResponse.json({ success: true, data })
  } catch (error) {
    return errorResponse(error, 'Failed to update survey coverage')
  }
}
