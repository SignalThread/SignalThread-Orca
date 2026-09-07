import { NextRequest, NextResponse } from 'next/server'
import { requireEventsEventAccess } from '@/lib/auth/require-events-event-access'
import { getAppUrl } from '@/lib/app-url'
import {
  addEventActionUpdate,
  assignEventAction,
  EventActionError,
  getEventAction,
  retryEventActionAssignmentDelivery,
  transitionEventAction,
  updateEventActionField,
} from '@/lib/event-actions/service'
import { resolveEventLifecyclePhase } from '@/lib/events-home-groups'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function context(request: NextRequest, eventId: string) {
  const accountSlug = request.nextUrl.searchParams.get('account')
  if (!accountSlug) {
    return { response: NextResponse.json({ success: false, error: 'Account parameter required' }, { status: 400 }) }
  }
  const access = await requireEventsEventAccess(accountSlug, eventId)
  if (!access.ok) return { response: access.response }
  return { accountId: access.account.id, actorUserId: access.userId, event: access.event }
}

function failure(error: unknown) {
  if (error instanceof EventActionError) {
    return NextResponse.json({ success: false, error: error.message }, { status: error.status })
  }
  console.error('[event action detail]', error)
  return NextResponse.json({ success: false, error: 'Failed to process event action' }, { status: 500 })
}

export async function GET(
  request: NextRequest,
  { params }: { params: { eventId: string; actionId: string } },
) {
  const auth = await context(request, params.eventId)
  if (auth.response) return auth.response
  try {
    const data = await getEventAction({
      accountId: auth.accountId!,
      eventId: params.eventId,
      clusterId: params.actionId,
      lifecyclePhase: resolveEventLifecyclePhase({ ...auth.event!, timezone: auth.event!.location?.timezone }),
    })
    return NextResponse.json({ success: true, data })
  } catch (error) {
    return failure(error)
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { eventId: string; actionId: string } },
) {
  const auth = await context(request, params.eventId)
  if (auth.response) return auth.response
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }
  const base = {
    accountId: auth.accountId!,
    eventId: params.eventId,
    clusterId: params.actionId,
    actorUserId: auth.actorUserId!,
    idempotencyKey: body.idempotencyKey,
  }
  const accountSlug = request.nextUrl.searchParams.get('account')!
  const actionPath = `/app/events/${encodeURIComponent(params.eventId)}/dashboard?account=${encodeURIComponent(accountSlug)}&tab=actions&actionView=my&actionId=${encodeURIComponent(params.actionId)}`
  const deepLink = `${getAppUrl()}/login?next=${encodeURIComponent(actionPath)}`
  try {
    const data = body.operation === 'ASSIGN'
      ? await assignEventAction({ ...base, ownerUserId: body.ownerUserId, deepLink })
      : body.operation === 'RETRY_ASSIGNMENT_EMAIL'
        ? await retryEventActionAssignmentDelivery({ ...base, deliveryId: body.deliveryId })
      : body.operation === 'TRANSITION'
        ? await transitionEventAction({
          ...base,
          status: body.status,
          blockedReason: body.blockedReason,
          resolution: body.resolution,
        })
        : body.operation === 'SET_DUE_DATE'
          ? await updateEventActionField({ ...base, field: 'DUE_DATE', value: body.dueAt })
          : body.operation === 'SET_PRIORITY'
            ? await updateEventActionField({ ...base, field: 'PRIORITY', value: body.priority })
            : body.operation === 'SET_CLASSIFICATION'
              ? await updateEventActionField({ ...base, field: 'CLASSIFICATION', value: body.classification })
              : null
    if (!data) {
      return NextResponse.json({ success: false, error: 'Invalid action operation' }, { status: 400 })
    }
    return NextResponse.json({ success: true, data })
  } catch (error) {
    return failure(error)
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { eventId: string; actionId: string } },
) {
  const auth = await context(request, params.eventId)
  if (auth.response) return auth.response
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }
  try {
    const data = await addEventActionUpdate({
      accountId: auth.accountId!,
      eventId: params.eventId,
      clusterId: params.actionId,
      actorUserId: auth.actorUserId!,
      kind: body.kind,
      body: body.body,
      voice: body.voice as { objectKey?: unknown; mimeType?: unknown; durationMs?: unknown } | undefined,
      idempotencyKey: body.idempotencyKey,
    })
    return NextResponse.json({ success: true, data }, { status: 201 })
  } catch (error) {
    return failure(error)
  }
}
