import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

/**
 * Canonical SignalThread Platform Core -> Pulse identity resolution.
 *
 * These helpers read ONLY the mapping columns stored in Pulse's own database
 * (User.platformUserId, Account.platformOrganizationId, Event.platformEventId).
 * They never query Platform Core, never cross a database boundary, and never fall
 * back to email, name, slug, contact email or domain: a caller-supplied identifier
 * must never become authority merely because it resembles a local value.
 *
 * Resolving a mapping is not authorization. It answers "which Pulse row is this
 * canonical id?" and nothing more. Access is still decided by the existing Pulse
 * helpers (requireAccountMembership, requireEventsEventAccess) from
 * AccountUserMembership and Pulse roles.
 *
 * See docs/PLATFORM_IDENTITY_MAPPING.md.
 */

type MappingDb = typeof prisma | Prisma.TransactionClient

export type PlatformMappingFailureReason =
  /** Not a canonical uuid. Rejected before the database is touched. */
  | 'INVALID_PLATFORM_ID'
  /** No Pulse row carries this canonical id. Never fall back to another attribute. */
  | 'NOT_MAPPED'
  /** More than one Pulse row carries it; the caller must disambiguate explicitly. */
  | 'AMBIGUOUS_MAPPING'
  /** The mapped row exists but is deactivated. */
  | 'INACTIVE'

export type PlatformMappingResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: PlatformMappingFailureReason }

/** Canonical 8-4-4-4-12 uuid, any version. Platform Core mints uuids for every canonical id. */
const CANONICAL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isCanonicalPlatformId(value: unknown): value is string {
  return typeof value === 'string' && CANONICAL_UUID.test(value.trim())
}

/**
 * Postgres compares uuid values, not their text form, so casing and surrounding
 * whitespace are normalized here rather than being treated as distinct ids.
 */
function normalize(value: unknown): string | null {
  return isCanonicalPlatformId(value) ? value.trim().toLowerCase() : null
}

const failure = (reason: PlatformMappingFailureReason) => ({ ok: false, reason }) as const

export const pulseUserMappingSelect = {
  id: true,
  email: true,
  role: true,
  accountId: true,
  isActive: true,
  platformUserId: true,
} satisfies Prisma.UserSelect

export const pulseAccountMappingSelect = {
  id: true,
  slug: true,
  name: true,
  accountType: true,
  isActive: true,
  platformOrganizationId: true,
} satisfies Prisma.AccountSelect

export const pulseEventMappingSelect = {
  id: true,
  name: true,
  status: true,
  isActive: true,
  platformEventId: true,
  location: {
    select: {
      accountId: true,
      account: { select: { id: true, slug: true, accountType: true, platformOrganizationId: true } },
    },
  },
} satisfies Prisma.EventSelect

export type PulseUserMapping = Prisma.UserGetPayload<{ select: typeof pulseUserMappingSelect }>
export type PulseAccountMapping = Prisma.AccountGetPayload<{ select: typeof pulseAccountMappingSelect }>
export type PulseEventMapping = Prisma.EventGetPayload<{ select: typeof pulseEventMappingSelect }>

/**
 * Canonical Platform user id -> Pulse User.
 * platformUserId is UNIQUE, so a match is never ambiguous.
 */
export async function resolvePulseUserByPlatformUserId(
  platformUserId: unknown,
  db: MappingDb = prisma,
): Promise<PlatformMappingResult<PulseUserMapping>> {
  const id = normalize(platformUserId)
  if (!id) return failure('INVALID_PLATFORM_ID')

  const user = await db.user.findUnique({
    where: { platformUserId: id },
    select: pulseUserMappingSelect,
  })
  if (!user) return failure('NOT_MAPPED')
  if (!user.isActive) return failure('INACTIVE')
  return { ok: true, value: user }
}

/**
 * Canonical Platform organization id -> Pulse Account.
 *
 * platformOrganizationId is intentionally not unique: an organization may own several
 * Pulse Accounts. Two matches are therefore a real possibility and are reported as
 * AMBIGUOUS_MAPPING; this never silently picks a row.
 */
export async function resolvePulseAccountByPlatformOrganizationId(
  platformOrganizationId: unknown,
  db: MappingDb = prisma,
): Promise<PlatformMappingResult<PulseAccountMapping>> {
  const id = normalize(platformOrganizationId)
  if (!id) return failure('INVALID_PLATFORM_ID')

  // Two rows are enough to prove ambiguity; there is no need to read the whole set.
  const accounts = await db.account.findMany({
    where: { platformOrganizationId: id },
    select: pulseAccountMappingSelect,
    orderBy: { id: 'asc' },
    take: 2,
  })
  if (accounts.length === 0) return failure('NOT_MAPPED')
  if (accounts.length > 1) return failure('AMBIGUOUS_MAPPING')
  if (!accounts[0].isActive) return failure('INACTIVE')
  return { ok: true, value: accounts[0] }
}

/**
 * Canonical Platform event id -> Pulse Event.
 *
 * Pulse Event is overloaded: Retail feedback campaigns share the table with Events-product
 * workspaces and are never mapped, so an unmapped event is a normal state, not an error
 * condition. platformEventId is UNIQUE, so a match is never ambiguous. The owning account
 * is returned with the event because the Platform contract treats the organization as the
 * authorization input while the event claim is only a provisioning record.
 */
export async function resolvePulseEventByPlatformEventId(
  platformEventId: unknown,
  db: MappingDb = prisma,
): Promise<PlatformMappingResult<PulseEventMapping>> {
  const id = normalize(platformEventId)
  if (!id) return failure('INVALID_PLATFORM_ID')

  const event = await db.event.findUnique({
    where: { platformEventId: id },
    select: pulseEventMappingSelect,
  })
  if (!event) return failure('NOT_MAPPED')
  if (!event.isActive) return failure('INACTIVE')
  return { ok: true, value: event }
}

/**
 * True when the Pulse Event resolved above belongs to the organization the caller was
 * authorized for. The next phase uses this to refuse an event claim that points outside
 * the caller's canonical organization, instead of trusting the event id on its own.
 */
export function eventBelongsToPlatformOrganization(
  event: PulseEventMapping,
  platformOrganizationId: unknown,
): boolean {
  const id = normalize(platformOrganizationId)
  const owner = event.location.account.platformOrganizationId
  return Boolean(id && owner && owner.toLowerCase() === id)
}
