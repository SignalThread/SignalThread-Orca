import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { isSuperAdminActor } from './super-admin'

describe('isSuperAdminActor', () => {
  const prev = process.env.SUPER_ADMIN_EMAILS

  beforeEach(() => {
    process.env.SUPER_ADMIN_EMAILS = 'boss@example.com'
  })

  afterEach(() => {
    process.env.SUPER_ADMIN_EMAILS = prev
  })

  it('returns true when session email is in SUPER_ADMIN_EMAILS', () => {
    expect(isSuperAdminActor({ email: 'boss@example.com' }, { role: 'ADMIN' })).toBe(true)
  })

  it('returns true when Prisma role is SUPER_ADMIN', () => {
    expect(isSuperAdminActor({ email: 'any@x.com' }, { role: 'SUPER_ADMIN' })).toBe(true)
  })

  it('returns false for normal account admin', () => {
    expect(isSuperAdminActor({ email: 'member@biz.com' }, { role: 'ADMIN' })).toBe(false)
  })
})
