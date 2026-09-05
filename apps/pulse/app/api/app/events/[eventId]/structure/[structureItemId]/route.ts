import { NextRequest, NextResponse } from 'next/server'
import {
  EventStructureError,
  deleteEventStructureItem,
  updateEventStructureItem,
} from '@/lib/event-structure'
import { requireAccountAdmin } from '@/lib/auth/require-account-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof EventStructureError) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: error.status },
    )
  }

  console.error('[Event Structure Item API]', error)
  return NextResponse.json(
    { success: false, error: fallback },
    { status: 500 },
  )
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { eventId: string; structureItemId: string } },
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
    const data = await updateEventStructureItem({
      accountSlug,
      eventId: params.eventId,
      structureItemId: params.structureItemId,
      name: body.name,
      description: body.description,
      parentId: body.parentId,
      locationId: body.locationId,
      startsAt: body.startsAt,
      endsAt: body.endsAt,
      timezone: body.timezone,
      sortOrder: body.sortOrder,
      metadata: body.metadata,
      isActive: body.isActive,
    })

    return NextResponse.json({
      success: true,
      data,
    })
  } catch (error) {
    return errorResponse(error, 'Failed to update event structure item')
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { eventId: string; structureItemId: string } },
) {
  const accountSlug = request.nextUrl.searchParams.get('account') ?? ''
  const admin = await requireAccountAdmin(accountSlug)
  if (!admin.ok) {
    return admin.response
  }

  try {
    const data = await deleteEventStructureItem({
      accountSlug,
      eventId: params.eventId,
      structureItemId: params.structureItemId,
    })

    return NextResponse.json({
      success: true,
      data,
    })
  } catch (error) {
    return errorResponse(error, 'Failed to delete event structure item')
  }
}
