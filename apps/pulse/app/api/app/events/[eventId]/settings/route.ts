import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { AccountProductModeError, requireEventsAccountType } from '@/lib/account-product-mode'
import { requireAccountAdmin } from '@/lib/auth/require-account-admin'
import { EventDateInputError, parseEventDateInput, type EventDateField } from '@/lib/event-dates'
import { prisma } from '@/lib/prisma'
import { validateEventListeningWindow } from '@/lib/event-listening-window'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const updateEventSettingsSchema = z.object({
  name: z.string().trim().min(1, 'Event name is required').optional(),
  description: z.string().trim().min(1).nullable().optional(),
  venue: z.string().trim().min(1).nullable().optional(),
  startDate: z.string().trim().min(1).nullable().optional(),
  endDate: z.string().trim().min(1).nullable().optional(),
  listeningWindowOpensAt: z.string().datetime().nullable().optional(),
  listeningWindowClosesAt: z.string().datetime().nullable().optional(),
})

/** Human labels for validation copy; raw field keys never reach the operator. */
const SETTINGS_FIELD_LABELS: Record<string, string> = {
  name: 'Event name',
  description: 'Description',
  venue: 'Venue',
  startDate: 'Start date',
  endDate: 'End date',
  listeningWindowOpensAt: 'Listening window opening time',
  listeningWindowClosesAt: 'Listening window closing time',
}

function parseSettingsDate(value: string | null | undefined, field: EventDateField): Date | null | undefined {
  if (value === undefined) return undefined
  return parseEventDateInput(value, field)
}

/**
 * PATCH /api/app/events/[eventId]/settings
 *
 * EVENTS-only event metadata settings. Updates only safe, EVENTS-owned
 * Event fields (name, description, start/end date). This route is gated to
 * Account.accountType === "EVENTS" and is intentionally separate from the
 * shared retail-facing /api/app/events/[eventId] route so retail survey edit
 * behavior is never affected.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { eventId: string } },
) {
  const accountSlug = request.nextUrl.searchParams.get('account')
  const admin = await requireAccountAdmin(accountSlug)
  if (!admin.ok) {
    return admin.response
  }

  const eventId = params.eventId?.trim()
  if (!eventId) {
    return NextResponse.json({ success: false, error: 'eventId is required' }, { status: 400 })
  }

  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = updateEventSettingsSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: 'Validation failed',
        message: parsed.error.errors
          .map((err) => {
            const key = err.path.join('.')
            return `${SETTINGS_FIELD_LABELS[key] ?? key}: ${err.message}`
          })
          .join(', '),
      },
      { status: 400 },
    )
  }

  const event = await prisma.event.findFirst({
    where: {
      id: eventId,
      location: {
        accountId: admin.account.id,
      },
    },
    select: {
      id: true,
      startDate: true,
      endDate: true,
      listeningWindowOpensAt: true,
      listeningWindowClosesAt: true,
      location: {
        select: {
          account: {
            select: {
              accountType: true,
            },
          },
        },
      },
    },
  })

  if (!event) {
    return NextResponse.json({ success: false, error: 'Event not found' }, { status: 404 })
  }

  try {
    requireEventsAccountType(
      event.location.account.accountType,
      'Event settings are only available for EVENTS accounts',
    )
  } catch (error) {
    if (error instanceof AccountProductModeError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    }
    throw error
  }

  let startDate: Date | null | undefined
  let endDate: Date | null | undefined
  let listeningWindowOpensAt: Date | null | undefined
  let listeningWindowClosesAt: Date | null | undefined
  try {
    startDate = parseSettingsDate(parsed.data.startDate, 'startDate')
    endDate = parseSettingsDate(parsed.data.endDate, 'endDate')
    listeningWindowOpensAt = parsed.data.listeningWindowOpensAt === undefined ? undefined : parsed.data.listeningWindowOpensAt === null ? null : new Date(parsed.data.listeningWindowOpensAt)
    listeningWindowClosesAt = parsed.data.listeningWindowClosesAt === undefined ? undefined : parsed.data.listeningWindowClosesAt === null ? null : new Date(parsed.data.listeningWindowClosesAt)
    validateEventListeningWindow(
      listeningWindowOpensAt === undefined ? event.listeningWindowOpensAt : listeningWindowOpensAt,
      listeningWindowClosesAt === undefined ? event.listeningWindowClosesAt : listeningWindowClosesAt,
    )
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof EventDateInputError ? error.message : 'Invalid date' },
      { status: 400 },
    )
  }

  const resolvedStart = startDate === undefined ? event.startDate : startDate
  const resolvedEnd = endDate === undefined ? event.endDate : endDate
  if (resolvedStart && resolvedEnd && resolvedEnd.getTime() < resolvedStart.getTime()) {
    return NextResponse.json(
      { success: false, error: 'End date cannot be before the start date' },
      { status: 400 },
    )
  }

  const updated = await prisma.event.update({
    where: { id: event.id },
    data: {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
      ...(parsed.data.venue !== undefined ? { venue: parsed.data.venue } : {}),
      ...(startDate !== undefined ? { startDate } : {}),
      ...(endDate !== undefined ? { endDate } : {}),
      ...(listeningWindowOpensAt !== undefined ? { listeningWindowOpensAt } : {}),
      ...(listeningWindowClosesAt !== undefined ? { listeningWindowClosesAt } : {}),
    },
    select: {
      id: true,
      name: true,
      description: true,
      venue: true,
      status: true,
      startDate: true,
      endDate: true,
      listeningWindowOpensAt: true,
      listeningWindowClosesAt: true,
    },
  })

  return NextResponse.json({ success: true, event: updated })
}
