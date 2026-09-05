import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAccountMembership, type AccountForMembership } from '@/lib/auth/require-account-membership'

export type EventAccessResult =
  | {
      ok: true
      userId: string
      account: AccountForMembership
      event: {
        id: string
        name: string
        status: string
        eventType: string
        isActive: boolean
        startDate: Date | null
        endDate: Date | null
        location: { timezone: string | null }
      }
    }
  | { ok: false; response: NextResponse }

async function findAccountEvent(accountId: string, eventId: string) {
  return prisma.event.findFirst({
    where: {
      id: eventId,
      location: { accountId },
    },
    select: {
      id: true,
      name: true,
      status: true,
      eventType: true,
      isActive: true,
      startDate: true,
      endDate: true,
      location: { select: { timezone: true } },
    },
  })
}

/**
 * Canonical guard for API routes shared by Events and SMB: authenticate the
 * actor, authorize account membership, and scope the Event to that account.
 * Product-specific routes should layer their product check on top of this.
 */
export async function requireEventAccess(
  accountSlug: string | null,
  eventId: string | null,
): Promise<EventAccessResult> {
  const normalizedEventId = eventId?.trim()
  if (!normalizedEventId) {
    return {
      ok: false,
      response: NextResponse.json({ success: false, error: 'Event parameter required' }, { status: 400 }),
    }
  }

  const membership = await requireAccountMembership(accountSlug, { allowSuperAdmin: true })
  if (!membership.ok) return membership

  const event = await findAccountEvent(membership.account.id, normalizedEventId)

  if (!event) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: 'Event not found or access denied' },
        { status: 404 },
      ),
    }
  }

  return {
    ok: true,
    userId: membership.userId,
    account: membership.account,
    event,
  }
}

export type EventsEventAccessResult = EventAccessResult

/**
 * Canonical Events route guard: authenticate the actor, authorize account
 * access (including approved platform admins), then scope the Event to that
 * account before any intelligence or workflow service runs.
 */
export async function requireEventsEventAccess(
  accountSlug: string | null,
  eventId: string | null,
): Promise<EventsEventAccessResult> {
  const normalizedEventId = eventId?.trim()
  if (!normalizedEventId) {
    return {
      ok: false,
      response: NextResponse.json({ success: false, error: 'Event parameter required' }, { status: 400 }),
    }
  }

  const membership = await requireAccountMembership(accountSlug, { allowSuperAdmin: true })
  if (!membership.ok) return membership

  if (membership.account.accountType !== 'EVENTS') {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: 'Event intelligence is only available for EVENTS accounts' },
        { status: 403 },
      ),
    }
  }

  const event = await findAccountEvent(membership.account.id, normalizedEventId)
  if (!event) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: 'Event not found or access denied' },
        { status: 404 },
      ),
    }
  }

  return {
    ok: true,
    userId: membership.userId,
    account: membership.account,
    event,
  }
}
