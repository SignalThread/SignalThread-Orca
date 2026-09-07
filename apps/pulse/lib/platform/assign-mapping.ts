import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { isCanonicalPlatformId } from '@/lib/platform/identity-mapping'

/**
 * Deliberate, human-reviewed assignment of canonical Platform Core ids onto Pulse rows.
 *
 * This is administrative tooling, invoked from scripts/assign-platform-mapping.ts. It is
 * NOT part of the Pulse request path: no route imports it, and Pulse runtime never depends
 * on Platform Core being reachable.
 *
 * Both ids are always supplied explicitly by the operator. Nothing here looks a local row
 * up by email, name, slug, domain or contact address — the only accepted local selector is
 * the Pulse primary key. An existing mapping is never silently re-pointed and two
 * identities are never merged.
 */

type AssignDb = typeof prisma | Prisma.TransactionClient

export type AssignOutcome = 'ASSIGNED' | 'ALREADY_ASSIGNED'

export type AssignFailureReason =
  /** The canonical Platform id is not a uuid. */
  | 'INVALID_PLATFORM_ID'
  /** The Pulse primary key was not supplied. */
  | 'MISSING_PULSE_ID'
  /** No Pulse row has that primary key. */
  | 'PULSE_RECORD_NOT_FOUND'
  /** The row already carries a different canonical id. Re-pointing is never automatic. */
  | 'ALREADY_MAPPED_TO_DIFFERENT_ID'
  /** Another Pulse row already claims this canonical id (User and Event are unique). */
  | 'PLATFORM_ID_TAKEN'
  /** The Event belongs to a non-EVENTS account; Retail campaigns are never mapped. */
  | 'NOT_AN_EVENTS_ACCOUNT'
  /** The owning Account is mapped to a different organization than the Platform event's. */
  | 'ORGANIZATION_MISMATCH'
  /** The Platform event could not be read, so its organization could not be proven. */
  | 'PLATFORM_EVENT_UNVERIFIABLE'

export type AssignResult<T> =
  | { ok: true; outcome: AssignOutcome; value: T }
  | { ok: false; reason: AssignFailureReason; detail?: string }

const fail = (reason: AssignFailureReason, detail?: string) =>
  ({ ok: false, reason, ...(detail ? { detail } : {}) }) as const

function normalizePlatformId(value: unknown): string | null {
  return isCanonicalPlatformId(value) ? value.trim().toLowerCase() : null
}

function normalizeLocalId(value: unknown): string | null {
  const id = typeof value === 'string' ? value.trim() : ''
  return id.length > 0 ? id : null
}

export type AssignOptions = {
  /** Resolve everything and report the outcome without writing. */
  dryRun?: boolean
}

// ---------------------------------------------------------------------------- User

export type AssignedUser = { id: string; email: string; platformUserId: string | null }

export async function assignPlatformUserMapping(
  input: { pulseUserId: unknown; platformUserId: unknown },
  options: AssignOptions = {},
  db: AssignDb = prisma,
): Promise<AssignResult<AssignedUser>> {
  const platformUserId = normalizePlatformId(input.platformUserId)
  if (!platformUserId) return fail('INVALID_PLATFORM_ID')
  const pulseUserId = normalizeLocalId(input.pulseUserId)
  if (!pulseUserId) return fail('MISSING_PULSE_ID')

  // Selected by primary key only. There is deliberately no email/name lookup here.
  const user = await db.user.findUnique({
    where: { id: pulseUserId },
    select: { id: true, email: true, platformUserId: true },
  })
  if (!user) return fail('PULSE_RECORD_NOT_FOUND', pulseUserId)

  if (user.platformUserId) {
    if (user.platformUserId.toLowerCase() === platformUserId) {
      return { ok: true, outcome: 'ALREADY_ASSIGNED', value: user }
    }
    return fail('ALREADY_MAPPED_TO_DIFFERENT_ID', user.platformUserId)
  }

  const holder = await db.user.findUnique({
    where: { platformUserId },
    select: { id: true },
  })
  if (holder) return fail('PLATFORM_ID_TAKEN', holder.id)

  if (options.dryRun) return { ok: true, outcome: 'ASSIGNED', value: { ...user, platformUserId } }

  const updated = await db.user.update({
    where: { id: pulseUserId },
    data: { platformUserId },
    select: { id: true, email: true, platformUserId: true },
  })
  return { ok: true, outcome: 'ASSIGNED', value: updated }
}

// ------------------------------------------------------------------------- Account

export type AssignedAccount = { id: string; slug: string; platformOrganizationId: string | null }

/**
 * platformOrganizationId is intentionally not unique: one Platform organization may own
 * several Pulse Accounts. A second Account pointing at the same organization is therefore
 * allowed, and no PLATFORM_ID_TAKEN check applies here.
 */
export async function assignPlatformOrganizationMapping(
  input: { pulseAccountId: unknown; platformOrganizationId: unknown },
  options: AssignOptions = {},
  db: AssignDb = prisma,
): Promise<AssignResult<AssignedAccount>> {
  const platformOrganizationId = normalizePlatformId(input.platformOrganizationId)
  if (!platformOrganizationId) return fail('INVALID_PLATFORM_ID')
  const pulseAccountId = normalizeLocalId(input.pulseAccountId)
  if (!pulseAccountId) return fail('MISSING_PULSE_ID')

  const account = await db.account.findUnique({
    where: { id: pulseAccountId },
    select: { id: true, slug: true, platformOrganizationId: true },
  })
  if (!account) return fail('PULSE_RECORD_NOT_FOUND', pulseAccountId)

  if (account.platformOrganizationId) {
    if (account.platformOrganizationId.toLowerCase() === platformOrganizationId) {
      return { ok: true, outcome: 'ALREADY_ASSIGNED', value: account }
    }
    return fail('ALREADY_MAPPED_TO_DIFFERENT_ID', account.platformOrganizationId)
  }

  if (options.dryRun) return { ok: true, outcome: 'ASSIGNED', value: { ...account, platformOrganizationId } }

  const updated = await db.account.update({
    where: { id: pulseAccountId },
    data: { platformOrganizationId },
    select: { id: true, slug: true, platformOrganizationId: true },
  })
  return { ok: true, outcome: 'ASSIGNED', value: updated }
}

// --------------------------------------------------------------------------- Event

export type AssignedEvent = { id: string; name: string; platformEventId: string | null }

/**
 * Reads one canonical Platform event during administrative assignment only. Supplied by
 * the caller so Pulse runtime never links against Platform Core, and so tests do not need
 * network access. Returning null means "could not be proven" and refuses the assignment.
 */
export type PlatformEventLookup = (
  platformEventId: string,
) => Promise<{ id: string; organization_id: string } | null>

export async function assignPlatformEventMapping(
  input: { pulseEventId: unknown; platformEventId: unknown; lookupPlatformEvent: PlatformEventLookup },
  options: AssignOptions = {},
  db: AssignDb = prisma,
): Promise<AssignResult<AssignedEvent>> {
  const platformEventId = normalizePlatformId(input.platformEventId)
  if (!platformEventId) return fail('INVALID_PLATFORM_ID')
  const pulseEventId = normalizeLocalId(input.pulseEventId)
  if (!pulseEventId) return fail('MISSING_PULSE_ID')

  const event = await db.event.findUnique({
    where: { id: pulseEventId },
    select: {
      id: true,
      name: true,
      platformEventId: true,
      location: { select: { account: { select: { id: true, slug: true, accountType: true, platformOrganizationId: true } } } },
    },
  })
  if (!event) return fail('PULSE_RECORD_NOT_FOUND', pulseEventId)

  // Pulse Event is overloaded. Retail feedback campaigns share the table and are never
  // mapped to a canonical Platform event.
  const account = event.location.account
  if (account.accountType !== 'EVENTS') {
    return fail('NOT_AN_EVENTS_ACCOUNT', `${account.slug} is ${account.accountType}`)
  }

  if (event.platformEventId) {
    if (event.platformEventId.toLowerCase() === platformEventId) {
      return { ok: true, outcome: 'ALREADY_ASSIGNED', value: { id: event.id, name: event.name, platformEventId: event.platformEventId } }
    }
    return fail('ALREADY_MAPPED_TO_DIFFERENT_ID', event.platformEventId)
  }

  const holder = await db.event.findUnique({ where: { platformEventId }, select: { id: true } })
  if (holder) return fail('PLATFORM_ID_TAKEN', holder.id)

  // When the owning Account already carries a canonical organization, the Platform event
  // must belong to that same organization. An unprovable relationship refuses the mapping.
  if (account.platformOrganizationId) {
    const platformEvent = await input.lookupPlatformEvent(platformEventId)
    if (!platformEvent) return fail('PLATFORM_EVENT_UNVERIFIABLE', platformEventId)
    if (platformEvent.organization_id.toLowerCase() !== account.platformOrganizationId.toLowerCase()) {
      return fail('ORGANIZATION_MISMATCH', `event org ${platformEvent.organization_id} != account org ${account.platformOrganizationId}`)
    }
  }

  if (options.dryRun) return { ok: true, outcome: 'ASSIGNED', value: { id: event.id, name: event.name, platformEventId } }

  const updated = await db.event.update({
    where: { id: pulseEventId },
    data: { platformEventId },
    select: { id: true, name: true, platformEventId: true },
  })
  return { ok: true, outcome: 'ASSIGNED', value: updated }
}
