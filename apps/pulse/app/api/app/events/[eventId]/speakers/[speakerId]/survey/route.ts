import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAccountAdmin } from '@/lib/auth/require-account-admin'
import { EventAgendaServiceError } from '@/lib/event-agenda-service'
import {
  attachExistingSurveyToEventSpeaker,
  getEventSpeakerSurvey,
  removeEventSpeakerSurveyAttachment,
} from '@/lib/event-speaker-surveys'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function adminFor(request: NextRequest) {
  return requireAccountAdmin(request.nextUrl.searchParams.get('account'))
}

const attachSchema = z.object({
  surveyId: z.string().trim().min(1),
  speakerAssignmentId: z.string().trim().min(1).optional().nullable(),
})

function errorResponse(error: unknown) {
  if (error instanceof EventAgendaServiceError) {
    return NextResponse.json(
      { success: false, error: error.message, code: error.code, details: error.details },
      { status: error.status },
    )
  }
  console.error('[Event speaker survey API]', error)
  return NextResponse.json({ success: false, error: 'Failed to update speaker survey' }, { status: 500 })
}

export async function GET(request: NextRequest, { params }: { params: { eventId: string; speakerId: string } }) {
  const admin = await adminFor(request)
  if (!admin.ok) return admin.response
  try {
    const data = await getEventSpeakerSurvey({
      accountId: admin.account.id,
      eventId: params.eventId,
      speakerId: params.speakerId,
    })
    return NextResponse.json({ success: true, data })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: NextRequest, { params }: { params: { eventId: string; speakerId: string } }) {
  const admin = await adminFor(request)
  if (!admin.ok) return admin.response
  const parsed = attachSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: 'Validation failed', code: 'VALIDATION_FAILED', details: parsed.error.issues },
      { status: 400 },
    )
  }
  try {
    const data = await attachExistingSurveyToEventSpeaker({
      accountId: admin.account.id,
      eventId: params.eventId,
      speakerId: params.speakerId,
      surveyId: parsed.data.surveyId,
      speakerAssignmentId: parsed.data.speakerAssignmentId,
    })
    return NextResponse.json({ success: true, data })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { eventId: string; speakerId: string } }) {
  const admin = await adminFor(request)
  if (!admin.ok) return admin.response
  try {
    const data = await removeEventSpeakerSurveyAttachment({
      accountId: admin.account.id,
      eventId: params.eventId,
      speakerId: params.speakerId,
    })
    return NextResponse.json({ success: true, data })
  } catch (error) {
    return errorResponse(error)
  }
}
