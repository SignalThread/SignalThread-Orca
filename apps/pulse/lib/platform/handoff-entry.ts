import { canUserAccessAccount } from '@/lib/auth/account-access'
import {
  eventBelongsToPlatformOrganization,
  isCanonicalPlatformId,
  resolvePulseAccountByPlatformOrganizationId,
  resolvePulseEventByPlatformEventId,
  resolvePulseUserByPlatformUserId,
  type PlatformMappingFailureReason,
} from '@/lib/platform/identity-mapping'
import { claimPlatformHandoff, type ClaimResult } from '@/lib/platform/platform-claim-client'

/**
 * Platform -> Pulse entry: from a one-time handoff to a Pulse workspace.
 *
 *   1. claim the handoff from Platform      -> canonical user / organization / event
 *   2. resolve each id through Pulse's own mapping columns (all three required)
 *   3. prove the mapped Event belongs to the mapped Account
 *   4. apply Pulse's own access model to the mapped User and Account
 *   5. only then report where to land and which Pulse user to open a session for
 *
 * Steps 2-3 are resolution, not authorization: a mapping proves which local rows
 * the canonical ids name, nothing more. Step 4 is the same `canUserAccessAccount`
 * every organizer route relies on (AccountUserMembership, or SUPER_ADMIN). There
 * is no fallback anywhere in this chain: not email, not name, not slug, not the
 * account's contact address, not demo data. A canonical id that does not map
 * ends the request.
 *
 * Session establishment is deliberately *not* here. It is the last step of the
 * route handler, after this function has said yes, so a session is never opened
 * for a user who is then refused.
 */

export type EntryDenial =
  | 'INVALID_REQUEST'
  | 'PLATFORM_NOT_CONFIGURED'
  | 'HANDOFF_INVALID'
  | 'HANDOFF_EXPIRED'
  | 'PLATFORM_DENIED'
  | 'PLATFORM_UNAVAILABLE'
  | 'PLATFORM_USER_NOT_MAPPED'
  | 'PULSE_USER_INACTIVE'
  | 'PLATFORM_ORGANIZATION_NOT_MAPPED'
  | 'PLATFORM_ORGANIZATION_AMBIGUOUS'
  | 'PULSE_ACCOUNT_INACTIVE'
  | 'PLATFORM_EVENT_NOT_MAPPED'
  | 'PULSE_EVENT_INACTIVE'
  | 'NOT_AN_EVENTS_ACCOUNT'
  | 'EVENT_ACCOUNT_MISMATCH'
  | 'PULSE_ACCESS_DENIED'

export type EntryResult =
  | {
      ok: true
      pulseUserId: string
      accountId: string
      accountSlug: string
      eventId: string
      redirectPath: string
    }
  | { ok: false; status: number; reason: EntryDenial; hint: string; platformReason?: string }

const HINTS: Record<EntryDenial, string> = {
  INVALID_REQUEST: 'A Platform handoff and a canonical event id are required.',
  PLATFORM_NOT_CONFIGURED: 'Platform launch is not configured for this Pulse deployment.',
  HANDOFF_INVALID: 'This Platform handoff is invalid, has expired, or was already used. Open Pulse from Platform again.',
  HANDOFF_EXPIRED: 'This Platform handoff has expired. Open Pulse from Platform again.',
  PLATFORM_DENIED: 'Platform did not authorize this launch.',
  PLATFORM_UNAVAILABLE: 'Platform could not confirm this launch. Try again from Platform.',
  PLATFORM_USER_NOT_MAPPED: 'Your Platform account is not linked to a Pulse user yet.',
  PULSE_USER_INACTIVE: 'The linked Pulse user is deactivated.',
  PLATFORM_ORGANIZATION_NOT_MAPPED: 'This organization is not linked to a Pulse account yet.',
  PLATFORM_ORGANIZATION_AMBIGUOUS: 'This organization is linked to more than one Pulse account; an administrator must disambiguate it.',
  PULSE_ACCOUNT_INACTIVE: 'The linked Pulse account is inactive.',
  PLATFORM_EVENT_NOT_MAPPED: 'This event is not linked to a Pulse event workspace yet.',
  PULSE_EVENT_INACTIVE: 'The linked Pulse event workspace is inactive.',
  NOT_AN_EVENTS_ACCOUNT: 'The linked Pulse account is not an Events account.',
  EVENT_ACCOUNT_MISMATCH: 'The linked Pulse event does not belong to the linked Pulse account.',
  PULSE_ACCESS_DENIED: 'Your Pulse user does not have access to this Pulse account.',
}

const STATUS: Record<EntryDenial, number> = {
  INVALID_REQUEST: 400,
  PLATFORM_NOT_CONFIGURED: 503,
  HANDOFF_INVALID: 401,
  HANDOFF_EXPIRED: 401,
  PLATFORM_DENIED: 403,
  PLATFORM_UNAVAILABLE: 502,
  PLATFORM_USER_NOT_MAPPED: 403,
  PULSE_USER_INACTIVE: 403,
  PLATFORM_ORGANIZATION_NOT_MAPPED: 403,
  PLATFORM_ORGANIZATION_AMBIGUOUS: 403,
  PULSE_ACCOUNT_INACTIVE: 403,
  PLATFORM_EVENT_NOT_MAPPED: 403,
  PULSE_EVENT_INACTIVE: 403,
  NOT_AN_EVENTS_ACCOUNT: 403,
  EVENT_ACCOUNT_MISMATCH: 403,
  PULSE_ACCESS_DENIED: 403,
}

function deny(reason: EntryDenial, platformReason?: string): EntryResult {
  return { ok: false, status: STATUS[reason], reason, hint: HINTS[reason], ...(platformReason ? { platformReason } : {}) }
}

function mappingDenial(
  reason: PlatformMappingFailureReason,
  notMapped: EntryDenial,
  inactive: EntryDenial,
  ambiguous: EntryDenial,
): EntryDenial {
  if (reason === 'NOT_MAPPED') return notMapped
  if (reason === 'INACTIVE') return inactive
  if (reason === 'AMBIGUOUS_MAPPING') return ambiguous
  return 'INVALID_REQUEST'
}

export type EntryDeps = {
  claim: (input: { handoff: string; eventId: string }) => Promise<ClaimResult>
  resolveUser: typeof resolvePulseUserByPlatformUserId
  resolveAccount: typeof resolvePulseAccountByPlatformOrganizationId
  resolveEvent: typeof resolvePulseEventByPlatformEventId
  canAccessAccount: (userId: string, accountId: string) => Promise<boolean>
}

const defaultDeps: EntryDeps = {
  claim: (input) => claimPlatformHandoff(input),
  resolveUser: resolvePulseUserByPlatformUserId,
  resolveAccount: resolvePulseAccountByPlatformOrganizationId,
  resolveEvent: resolvePulseEventByPlatformEventId,
  canAccessAccount: canUserAccessAccount,
}

export function buildEventWorkspacePath(eventId: string, accountSlug: string): string {
  return `/app/events/${encodeURIComponent(eventId)}?account=${encodeURIComponent(accountSlug)}`
}

export async function resolvePlatformEntry(
  input: { handoff: string | null; eventId: string | null },
  deps: EntryDeps = defaultDeps,
): Promise<EntryResult> {
  const handoff = input.handoff?.trim() ?? ''
  if (!handoff || handoff.length > 512 || !/^[A-Za-z0-9._~-]+$/.test(handoff)) return deny('INVALID_REQUEST')
  if (!isCanonicalPlatformId(input.eventId)) return deny('INVALID_REQUEST')

  // 1. Platform verifies the token and re-derives the canonical context.
  const claim = await deps.claim({ handoff, eventId: input.eventId.trim().toLowerCase() })
  if (!claim.ok) return deny(claim.reason, claim.platformReason)
  const { platformUserId, platformOrganizationId, platformEventId } = claim.context

  // 2. Mapping resolution, by canonical id only. All three must exist.
  const user = await deps.resolveUser(platformUserId)
  if (!user.ok) return deny(mappingDenial(user.reason, 'PLATFORM_USER_NOT_MAPPED', 'PULSE_USER_INACTIVE', 'INVALID_REQUEST'))

  const account = await deps.resolveAccount(platformOrganizationId)
  if (!account.ok) {
    return deny(mappingDenial(account.reason, 'PLATFORM_ORGANIZATION_NOT_MAPPED', 'PULSE_ACCOUNT_INACTIVE', 'PLATFORM_ORGANIZATION_AMBIGUOUS'))
  }

  const event = await deps.resolveEvent(platformEventId)
  if (!event.ok) return deny(mappingDenial(event.reason, 'PLATFORM_EVENT_NOT_MAPPED', 'PULSE_EVENT_INACTIVE', 'INVALID_REQUEST'))

  // 3. Structural consistency between the mapped rows. Both checks must hold:
  //    the event's owning account is the mapped account, and that account's own
  //    mapping points back at the organization Platform authorized.
  if (account.value.accountType !== 'EVENTS') return deny('NOT_AN_EVENTS_ACCOUNT')
  if (event.value.location.accountId !== account.value.id) return deny('EVENT_ACCOUNT_MISMATCH')
  if (!eventBelongsToPlatformOrganization(event.value, platformOrganizationId)) return deny('EVENT_ACCOUNT_MISMATCH')

  // 4. Pulse's own authorization. Mapping granted nothing; this does.
  if (!(await deps.canAccessAccount(user.value.id, account.value.id))) return deny('PULSE_ACCESS_DENIED')

  return {
    ok: true,
    pulseUserId: user.value.id,
    accountId: account.value.id,
    accountSlug: account.value.slug,
    eventId: event.value.id,
    redirectPath: buildEventWorkspacePath(event.value.id, account.value.slug),
  }
}
