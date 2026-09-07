import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { isSuperAdminActor } from '@/lib/auth/super-admin'
import { canUserAccessAccount } from '@/lib/auth/account-access'

export type LegacyEventReportingAccessResult =
  | { ok: true; userId: string; accountId: string; isSuperAdmin: boolean }
  | { ok: false; status: 401 | 404; response: NextResponse }

/**
 * Organizer guard for the legacy eventId-based reporting routes under
 * /api/events/[eventId]/*.
 *
 * These routes predate account scoping and used to be fully public. They are
 * read by the super-admin /admin/events pages, so the boundary is: a signed-in
 * platform super admin, or an active Pulse user with canonical membership in
 * the account that owns the event. Anything else is denied. An event that
 * does not exist and an event the caller may not see both answer 404 so the
 * route cannot be used to enumerate event IDs.
 *
 * Attendee/kiosk capabilities never use this guard. The only legacy route the
 * kiosk touches is the response poll, which serves a separate, narrowly scoped
 * attendee payload when this guard does not pass.
 */
export async function requireLegacyEventReportingAccess(
  eventId: string | null | undefined,
): Promise<LegacyEventReportingAccessResult> {
  const normalizedEventId = eventId?.trim()
  const supabase = createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return {
      ok: false,
      status: 401,
      response: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }),
    }
  }

  const notFound = (): LegacyEventReportingAccessResult => ({
    ok: false,
    status: 404,
    response: NextResponse.json(
      { success: false, error: 'Event not found or access denied' },
      { status: 404 },
    ),
  })

  if (!normalizedEventId) return notFound()

  const [dbUser, event] = await Promise.all([
    prisma.user.findUnique({ where: { id: user.id }, select: { role: true, isActive: true } }),
    prisma.event.findUnique({
      where: { id: normalizedEventId },
      select: { id: true, location: { select: { accountId: true } } },
    }),
  ])

  if (!event) return notFound()

  if (isSuperAdminActor(user, dbUser)) {
    return { ok: true, userId: user.id, accountId: event.location.accountId, isSuperAdmin: true }
  }

  if (dbUser && dbUser.isActive && await canUserAccessAccount(user.id, event.location.accountId)) {
    return { ok: true, userId: user.id, accountId: event.location.accountId, isSuperAdmin: false }
  }

  return notFound()
}
