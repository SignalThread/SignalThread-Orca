import { NextRequest, NextResponse } from 'next/server'
import {
  EventStructureError,
  createEventStructureItem,
  listEventStructureItems,
} from '@/lib/event-structure'
import { requireAccountAdmin } from '@/lib/auth/require-account-admin'
import { withDevelopmentRouteTiming } from '@/lib/development-route-timing'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof EventStructureError) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: error.status },
    )
  }

  console.error('[Event Structure API]', error)
  return NextResponse.json(
    { success: false, error: fallback },
    { status: 500 },
  )
}

async function getStructure(
  request: NextRequest,
  { params }: { params: { eventId: string } },
) {
  const accountSlug = request.nextUrl.searchParams.get('account') ?? ''
  const admin = await requireAccountAdmin(accountSlug)
  if (!admin.ok) {
    return admin.response
  }

  try {
    const data = await listEventStructureItems({
      accountSlug,
      eventId: params.eventId,
    })

    return NextResponse.json({
      success: true,
      data,
    })
  } catch (error) {
    return errorResponse(error, 'Failed to load event structure')
  }
}

export function GET(request: NextRequest, context: { params: { eventId: string } }) {
  return withDevelopmentRouteTiming(
    {
      route: '/api/app/events/[eventId]/structure',
      account: request.nextUrl?.searchParams.get('account') ?? (request.url ? new URL(request.url).searchParams.get('account') : null),
      eventId: context.params.eventId,
    },
    () => getStructure(request, context),
  )
}

export async function POST(
  request: NextRequest,
  { params }: { params: { eventId: string } },
) {
  const accountSlug = request.nextUrl.searchParams.get('account') ?? ''
  const admin = await requireAccountAdmin(accountSlug)
  if (!admin.ok) {
    return admin.response
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400 },
    )
  }

  try {
    const data = await createEventStructureItem({
      accountSlug,
      eventId: params.eventId,
      kind: body.kind,
      name: body.name,
      description: body.description,
      parentId: body.parentId,
      locationId: body.locationId,
      startsAt: body.startsAt,
      endsAt: body.endsAt,
      timezone: body.timezone,
      sortOrder: body.sortOrder,
      metadata: body.metadata,
    })

    return NextResponse.json(
      {
        success: true,
        data,
      },
      { status: 201 },
    )
  } catch (error) {
    return errorResponse(error, 'Failed to create event structure item')
  }
}
