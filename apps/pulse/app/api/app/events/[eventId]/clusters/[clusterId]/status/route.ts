import { NextRequest, NextResponse } from 'next/server'
import { requireEventsEventAccess } from '@/lib/auth/require-events-event-access'
import {
  addEventAlertNote,
  assignEventAlert,
  EventAlertError,
  getEventAlert,
  transitionEventAlert,
} from '@/lib/event-intelligence/alerts'
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
  return {
    accountId: access.account.id,
    actorUserId: access.userId,
    accountSlug: access.account.slug,
    event: access.event,
  }
}
function failure(error: unknown) {
  if (error instanceof EventAlertError) {
    return NextResponse.json({ success: false, error: error.message }, { status: error.status })
  }
  console.error('[event alert workflow]', error)
  return NextResponse.json({ success: false, error: 'Failed to update event alert' }, { status: 500 })
}

export async function GET(
  request: NextRequest,
  { params }: { params: { eventId: string; clusterId: string } },
) {
  const auth = await context(request, params.eventId)
  if (auth.response) return auth.response
  try {
    const data = await getEventAlert({
      accountId: auth.accountId!,
      eventId: params.eventId,
      clusterId: params.clusterId,
      lifecyclePhase: resolveLocalAdvancedDemoLifecycleOverride({
        eventId: params.eventId,
        accountSlug: auth.accountSlug!,
        hostname: request.nextUrl.hostname,
        value: request.nextUrl.searchParams.get('devLifecycle'),
      }) ?? resolveEventLifecyclePhase({ ...auth.event!, timezone: auth.event!.location?.timezone }),
    })
    return NextResponse.json({ success: true, data })
  } catch (error) {
    return failure(error)
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { eventId: string; clusterId: string } },
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
    const base = {
      accountId: auth.accountId!,
      actorUserId: auth.actorUserId!,
      eventId: params.eventId,
      clusterId: params.clusterId,
    }
    const data = 'ownerUserId' in body
      ? await assignEventAlert({ ...base, ownerUserId: body.ownerUserId })
      : await transitionEventAlert({ ...base, status: body.status, reason: body.reason })
    return NextResponse.json({ success: true, data })
  } catch (error) {
    return failure(error)
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { eventId: string; clusterId: string } },
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
    const data = await addEventAlertNote({
      accountId: auth.accountId!,
      actorUserId: auth.actorUserId!,
      eventId: params.eventId,
      clusterId: params.clusterId,
      body: body.body,
    })
    return NextResponse.json({ success: true, data }, { status: 201 })
  } catch (error) {
    return failure(error)
  }
}
