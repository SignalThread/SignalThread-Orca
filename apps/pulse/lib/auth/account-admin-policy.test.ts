import { describe, it, expect } from 'vitest'
import { isAccountAdminForAccount } from './account-admin-policy'

describe('isAccountAdminForAccount', () => {
  it('allows account contact email even without db user row', () => {
    expect(
      isAccountAdminForAccount({
        accountEmail: 'owner@biz.com',
        sessionEmail: 'owner@biz.com',
        dbUser: null,
        hasAccountAccess: true,
      })
    ).toBe(true)
  })

  it('allows ADMIN on the same account', () => {
    expect(
      isAccountAdminForAccount({
        accountEmail: 'owner@biz.com',
        sessionEmail: 'admin@biz.com',
        dbUser: { role: 'ADMIN' },
        hasAccountAccess: true,
      })
    ).toBe(true)
  })

  it('denies MANAGER on the same account', () => {
    expect(
      isAccountAdminForAccount({
        accountEmail: 'owner@biz.com',
        sessionEmail: 'mgr@biz.com',
        dbUser: { role: 'MANAGER' },
        hasAccountAccess: true,
      })
    ).toBe(false)
  })

  it('denies VIEWER on the same account', () => {
    expect(
      isAccountAdminForAccount({
        accountEmail: 'owner@biz.com',
        sessionEmail: 'v@biz.com',
        dbUser: { role: 'VIEWER' },
        hasAccountAccess: true,
      })
    ).toBe(false)
  })

  it('denies ADMIN without canonical account access', () => {
    expect(
      isAccountAdminForAccount({
        accountEmail: 'owner@biz.com',
        sessionEmail: 'other@biz.com',
        dbUser: { role: 'ADMIN' },
        hasAccountAccess: false,
      })
    ).toBe(false)
  })

  it('does not expose platform SUPER_ADMIN via account email mismatch', () => {
    expect(
      isAccountAdminForAccount({
        accountEmail: 'owner@biz.com',
        sessionEmail: 'platform@co.com',
        dbUser: { role: 'SUPER_ADMIN' },
        hasAccountAccess: false,
      })
    ).toBe(false)
  })
})
