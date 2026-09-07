import { describe, expect, it } from 'vitest'
import { deriveCanonicalUserAccessState } from './user-access-state'

const auth = (lastLoginAt: string | null) => ({
  id: 'auth-1', email: 'person@example.com', invitedAt: null,
  activatedAt: '2026-08-01T10:00:00.000Z', lastLoginAt,
})

describe('canonical user access state', () => {
  it('derives pending and expired invite states without a duplicate status field', () => {
    expect(deriveCanonicalUserAccessState({ hasUser: false, auth: null }).status).toBe('INVITED')
    expect(deriveCanonicalUserAccessState({
      hasUser: false, auth: null, inviteExpiresAt: '2026-08-01T00:00:00.000Z', now: new Date('2026-08-02T00:00:00.000Z'),
    })).toMatchObject({ status: 'INVITE_EXPIRED', inviteStatus: 'EXPIRED' })
  })

  it('uses the authoritative authentication timestamp for active and never-logged-in states', () => {
    expect(deriveCanonicalUserAccessState({ hasUser: true, isActive: true, auth: auth(null) })).toMatchObject({ status: 'NEVER_LOGGED_IN', lastLoginAt: null })
    expect(deriveCanonicalUserAccessState({ hasUser: true, isActive: true, auth: auth('2026-08-14T12:00:00.000Z') })).toMatchObject({ status: 'ACTIVE', lastLoginAt: '2026-08-14T12:00:00.000Z' })
  })

  it('retains a valid pending invite on a never-logged-in membership for scoped resend actions', () => {
    expect(deriveCanonicalUserAccessState({
      hasUser: true,
      isActive: true,
      inviteCreatedAt: '2026-08-01T00:00:00.000Z',
      auth: auth(null),
    })).toMatchObject({ status: 'NEVER_LOGGED_IN', inviteStatus: 'PENDING' })
  })

  it('derives deactivation from access rather than deleting membership history', () => {
    expect(deriveCanonicalUserAccessState({ hasUser: true, isActive: false, auth: auth('2026-08-14T12:00:00.000Z') })).toMatchObject({ status: 'DEACTIVATED', hasActiveAccess: false })
  })
})
