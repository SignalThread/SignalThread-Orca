import { NextRequest, NextResponse } from 'next/server'
import { requireEventsEventAccess } from '@/lib/auth/require-events-event-access'
import {
  convertEventFindingToAction,
  EventActionError,
  listEventActions,
} from '@/lib/event-actions/service'
import { resolveEventLifecyclePhase } from '@/lib/events-home-groups'
import { resolveLocalAdvancedDemoLifecycleOverride } from '@/lib/advanced-events-demo-lifecycle'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function context(request: NextRequest, eventId: string) {
  const accountSlug = request.nextUrl.searchParams.get('account')
  if (!accountSlug) {
    return { response: NextResponse.json({ success: false, error: 'Account parameter required' }, { status: 400 }) }
  }
  const access = await requireEventsEventAccess(accountSlug, eventId)
  if (!access.ok) return { response: access.response }
  return { accountId: access.account.id, actorUserId: access.userId, accountSlug: access.account.slug, event: access.event }
}

function failure(error: unknown) {
  if (error instanceof EventActionError) {
    return NextResponse.json({ success: false, error: error.message }, { status: error.status })
  }
  console.error('[event actions]', error)
  return NextResponse.json({ success: false, error: 'Failed to process event action' }, { status: 500 })
}

export async function GET(
  request: NextRequest,
  { params }: { params: { eventId: string } },
) {
  const auth = await context(request, params.eventId)
  if (auth.response) return auth.response
  try {
    const data = await listEventActions({
      accountId: auth.accountId!,
      eventId: params.eventId,
      lifecyclePhase: resolveLocalAdvancedDemoLifecycleOverride({
        eventId: params.eventId,
        accountSlug: auth.accountSlug!,
        hostname: request.nextUrl.hostname,
        value: request.nextUrl.searchParams.get('devLifecycle'),
      }) ?? resolveEventLifecyclePhase({ ...auth.event!, timezone: auth.event!.location?.timezone }),
    })
    return NextResponse.json({ success: true, data: { ...data, currentUserId: auth.actorUserId } })
  } catch (error) {
    return failure(error)
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { eventId: string } },
) {
  const auth = await context(request, params.eventId)
  if (auth.response) return auth.response
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }
  const clusterId = typeof body.clusterId === 'string' ? body.clusterId.trim() : ''
  if (!clusterId) {
    return NextResponse.json({ success: false, error: 'clusterId is required' }, { status: 400 })
  }
  try {
    const data = await convertEventFindingToAction({
      accountId: auth.accountId!,
      eventId: params.eventId,
      clusterId,
      actorUserId: auth.actorUserId!,
      classification: body.classification,
      title: body.title,
      ownerUserId: body.ownerUserId,
      priority: body.priority,
      dueAt: body.dueAt,
      initialUpdate: body.initialUpdate,
      idempotencyKey: body.idempotencyKey,
    })
    return NextResponse.json({ success: true, data }, { status: 201 })
  } catch (error) {
    return failure(error)
  }
}
