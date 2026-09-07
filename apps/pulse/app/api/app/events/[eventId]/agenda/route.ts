import { NextRequest, NextResponse } from 'next/server'
import { CollectionPhase } from '@prisma/client'
import { withDevelopmentRouteTiming } from '@/lib/development-route-timing'
import { ZodError } from 'zod'
import { requireAccountAdmin } from '@/lib/auth/require-account-admin'
import {
  EventAgendaServiceError,
  addSpeakerToEvent,
  archiveAgendaSession,
  archiveEventSpeakerProfile,
  assignSpeakerToAgendaSession,
  assignSpeakersToAgendaSession,
  createAgendaSession,
  createEventSpeakerProfile,
  createSpeakerForAgendaSession,
  getEventAgendaWorkspace,
  removeSpeakerFromAgendaSession,
  updateAgendaSession,
  updateAgendaSessionWithSpeakerAssignments,
  updateEventSpeakerProfile,
} from '@/lib/event-agenda-service'
import {
  addSessionsToListeningPlan,
  attachSurveyToListeningSessions,
  bulkAssignExistingSurvey,
  clearExistingSurveyAssignment,
  createSurveyForListeningSessions,
  getEventListeningPlan,
  getEventListeningPlanSummary,
  removeSessionsFromListeningPlan,
} from '@/lib/event-listening-plan'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof EventAgendaServiceError) {
    return NextResponse.json({
      success: false,
      error: error.message,
      code: error.code,
      details: error.details,
    }, { status: error.status })
  }
  if (error instanceof ZodError) {
    return NextResponse.json({
      success: false,
      error: 'Validation failed',
      code: 'VALIDATION_FAILED',
      details: error.issues,
    }, { status: 400 })
  }
  console.error('[Event Agenda API]', error)
  return NextResponse.json({ success: false, error: fallback }, { status: 500 })
}

async function readBody(request: NextRequest) {
  try {
    return await request.json() as Record<string, unknown>
  } catch {
    throw new EventAgendaServiceError('Invalid JSON body', 400, 'INVALID_JSON')
  }
}

async function requireAgendaAdmin(request: NextRequest) {
  return requireAccountAdmin(request.nextUrl.searchParams.get('account'))
}

async function getAgenda(request: NextRequest, { params }: { params: { eventId: string } }) {
  const admin = await requireAgendaAdmin(request)
  if (!admin.ok) return admin.response
  try {
    if (request.nextUrl.searchParams.get('summary') === '1') {
      const summary = await getEventListeningPlanSummary({ accountId: admin.account.id, eventId: params.eventId })
      return NextResponse.json({ success: true, data: { listeningPlan: { summary } } })
    }
    const [agenda, listeningPlan] = await Promise.all([
      getEventAgendaWorkspace({ accountId: admin.account.id, eventId: params.eventId }),
      getEventListeningPlan({ accountId: admin.account.id, eventId: params.eventId }),
    ])
    return NextResponse.json({ success: true, data: { ...agenda, listeningPlan } })
  } catch (error) {
    return errorResponse(error, 'Failed to load agenda workspace')
  }
}

export function GET(request: NextRequest, context: { params: { eventId: string } }) {
  return withDevelopmentRouteTiming(
    {
      route: '/api/app/events/[eventId]/agenda',
      account: request.nextUrl?.searchParams.get('account') ?? (request.url ? new URL(request.url).searchParams.get('account') : null),
      eventId: context.params.eventId,
    },
    () => getAgenda(request, context),
  )
}

export async function POST(request: NextRequest, { params }: { params: { eventId: string } }) {
  const admin = await requireAgendaAdmin(request)
  if (!admin.ok) return admin.response
  try {
    const body = await readBody(request)
    if (body.action === 'CREATE_SESSION') {
      const data = await createAgendaSession({ accountId: admin.account.id, eventId: params.eventId, session: body.session })
      return NextResponse.json({ success: true, data }, { status: 201 })
    }
    if (body.action === 'CREATE_SPEAKER') {
      const data = await createEventSpeakerProfile({
        accountId: admin.account.id,
        eventId: params.eventId,
        profile: body.profile,
        confirmDuplicate: body.confirmDuplicate === true,
      })
      return NextResponse.json({ success: true, data }, { status: 201 })
    }
    if (body.action === 'CREATE_AND_ASSIGN_SPEAKER') {
      const data = await createSpeakerForAgendaSession({
        accountId: admin.account.id,
        eventId: params.eventId,
        sessionId: String(body.sessionId ?? ''),
        profile: body.profile,
        assignment: body.assignment,
        confirmDuplicate: body.confirmDuplicate === true,
      })
      return NextResponse.json({ success: true, data }, { status: 201 })
    }
    if (body.action === 'ADD_EXISTING_SPEAKER') {
      const data = await addSpeakerToEvent({
        accountId: admin.account.id,
        eventId: params.eventId,
        speakerId: String(body.speakerId ?? ''),
      })
      return NextResponse.json({ success: true, data })
    }
    if (body.action === 'ASSIGN_SPEAKER') {
      const data = await assignSpeakerToAgendaSession({
        accountId: admin.account.id,
        eventId: params.eventId,
        sessionId: String(body.sessionId ?? ''),
        assignment: body.assignment,
      })
      return NextResponse.json({ success: true, data })
    }
    if (body.action === 'ASSIGN_SPEAKERS') {
      const data = await assignSpeakersToAgendaSession({
        accountId: admin.account.id,
        eventId: params.eventId,
        sessionId: String(body.sessionId ?? ''),
        speakerIds: body.speakerIds,
        assignment: body.assignment,
      })
      return NextResponse.json({ success: true, data })
    }
    if (body.action === 'ADD_LISTENING_POINTS') {
      const data = await addSessionsToListeningPlan({ accountId: admin.account.id, eventId: params.eventId, sessionIds: body.sessionIds })
      return NextResponse.json({ success: true, data }, { status: 201 })
    }
    if (body.action === 'ATTACH_LISTENING_SURVEY') {
      const data = await attachSurveyToListeningSessions({ accountId: admin.account.id, eventId: params.eventId, sessionIds: body.sessionIds, surveyId: String(body.surveyId ?? ''), availability: body.availability as never })
      return NextResponse.json({ success: true, data })
    }
    if (body.action === 'CREATE_LISTENING_SURVEY') {
      const data = await createSurveyForListeningSessions({ accountId: admin.account.id, eventId: params.eventId, sessionIds: body.sessionIds, surveyName: String(body.surveyName ?? ''), questionPrompt: String(body.questionPrompt ?? ''), collectionPhase: body.collectionPhase as CollectionPhase, publish: body.publish === true, availability: body.availability as never })
      return NextResponse.json({ success: true, data }, { status: 201 })
    }
    throw new EventAgendaServiceError('Agenda action is invalid', 400, 'INVALID_ACTION')
  } catch (error) {
    return errorResponse(error, 'Failed to update agenda')
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { eventId: string } }) {
  const admin = await requireAgendaAdmin(request)
  if (!admin.ok) return admin.response
  try {
    const body = await readBody(request)
    if (body.action === 'UPDATE_SESSION') {
      const data = await updateAgendaSession({ accountId: admin.account.id, eventId: params.eventId, session: body.session })
      return NextResponse.json({ success: true, data })
    }
    if (body.action === 'UPDATE_SESSION_WITH_SPEAKER_ASSIGNMENTS') {
      const data = await updateAgendaSessionWithSpeakerAssignments({
        accountId: admin.account.id,
        eventId: params.eventId,
        session: body.session,
        speakerIds: body.speakerIds,
        assignment: body.assignment,
      })
      return NextResponse.json({ success: true, data })
    }
    if (body.action === 'UPDATE_SPEAKER') {
      const data = await updateEventSpeakerProfile({
        accountId: admin.account.id,
        eventId: params.eventId,
        speakerId: String(body.speakerId ?? ''),
        profile: body.profile,
        confirmDuplicate: body.confirmDuplicate === true,
      })
      return NextResponse.json({ success: true, data })
    }
    if (body.action === 'BULK_ASSIGN_EXISTING_SURVEY') {
      if (body.targetType !== 'SESSION' && body.targetType !== 'SPEAKER' && body.targetType !== 'AREA') {
        throw new EventAgendaServiceError('Target type is invalid', 400, 'INVALID_ASSIGNMENT_TARGET_TYPE')
      }
      const data = await bulkAssignExistingSurvey({
        accountId: admin.account.id,
        eventId: params.eventId,
        targetType: body.targetType,
        targetIds: body.targetIds,
        surveyId: String(body.surveyId ?? ''),
        conflictMode: body.conflictMode === 'REPLACE_EXISTING' ? 'REPLACE_EXISTING' : body.conflictMode === 'SKIP_EXISTING' ? 'SKIP_EXISTING' : undefined,
      })
      return NextResponse.json({ success: true, data })
    }
    if (body.action === 'CLEAR_EXISTING_SURVEY_ASSIGNMENT') {
      if (body.targetType !== 'SESSION' && body.targetType !== 'SPEAKER' && body.targetType !== 'AREA') {
        throw new EventAgendaServiceError('Target type is invalid', 400, 'INVALID_ASSIGNMENT_TARGET_TYPE')
      }
      const data = await clearExistingSurveyAssignment({
        accountId: admin.account.id,
        eventId: params.eventId,
        targetType: body.targetType,
        targetIds: body.targetIds,
      })
      return NextResponse.json({ success: true, data })
    }
    throw new EventAgendaServiceError('Agenda action is invalid', 400, 'INVALID_ACTION')
  } catch (error) {
    return errorResponse(error, 'Failed to update agenda')
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { eventId: string } }) {
  const admin = await requireAgendaAdmin(request)
  if (!admin.ok) return admin.response
  try {
    const body = await readBody(request)
    if (body.action === 'ARCHIVE_SESSION') {
      const data = await archiveAgendaSession({
        accountId: admin.account.id,
        eventId: params.eventId,
        sessionId: String(body.sessionId ?? ''),
        confirmLiveEdit: body.confirmLiveEdit === true,
      })
      return NextResponse.json({ success: true, data })
    }
    if (body.action === 'ARCHIVE_SPEAKER') {
      const data = await archiveEventSpeakerProfile({
        accountId: admin.account.id,
        eventId: params.eventId,
        speakerId: String(body.speakerId ?? ''),
      })
      return NextResponse.json({ success: true, data })
    }
    if (body.action === 'REMOVE_ASSIGNMENT') {
      const data = await removeSpeakerFromAgendaSession({
        accountId: admin.account.id,
        eventId: params.eventId,
        sessionId: String(body.sessionId ?? ''),
        speakerId: String(body.speakerId ?? ''),
      })
      return NextResponse.json({ success: true, data })
    }
    if (body.action === 'REMOVE_LISTENING_POINTS') {
      const data = await removeSessionsFromListeningPlan({ accountId: admin.account.id, eventId: params.eventId, sessionIds: body.sessionIds })
      return NextResponse.json({ success: true, data })
    }
    throw new EventAgendaServiceError('Agenda action is invalid', 400, 'INVALID_ACTION')
  } catch (error) {
    return errorResponse(error, 'Failed to update agenda')
  }
}
