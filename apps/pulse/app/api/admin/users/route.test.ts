import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/auth/require-super-admin', () => ({ requireSuperAdminForApi: vi.fn() }))
vi.mock('@/lib/platform-users', () => ({ listPlatformUsers: vi.fn(), listPlatformAccounts: vi.fn() }))

import { requireSuperAdminForApi } from '@/lib/auth/require-super-admin'
import { listPlatformAccounts, listPlatformUsers } from '@/lib/platform-users'
import { GET } from './route'

const rows = [
  { key: 'u1', kind: 'USER', id: 'u1', name: 'Ava Admin', email: 'ava@ichi.test', account: { id: 'a1', name: 'Club Ichi', slug: 'club-ichi' }, accountIds: ['a1'], accountCount: 1, role: 'ADMIN', status: 'ACTIVE', inviteStatus: 'ACCEPTED', invitedAt: null, activatedAt: null, lastLoginAt: '2026-08-14T00:00:00Z', createdAt: '2026-08-01T00:00:00Z', hasActiveAccess: true },
  { key: 'i1', kind: 'INVITE', id: 'i1', name: 'New User', email: 'new@example.test', account: { id: 'a2', name: 'Other', slug: 'other' }, accountIds: ['a2'], accountCount: 1, role: 'VIEWER', status: 'INVITED', inviteStatus: 'PENDING', invitedAt: '2026-08-13T00:00:00Z', activatedAt: null, lastLoginAt: null, createdAt: '2026-08-13T00:00:00Z', hasActiveAccess: false },
] as never

describe('GET /api/admin/users', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(listPlatformUsers as ReturnType<typeof vi.fn>).mockResolvedValue(rows)
    ;(listPlatformAccounts as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'a1', name: 'Club Ichi', slug: 'club-ichi' }, { id: 'a2', name: 'Other', slug: 'other' },
    ])
  })

  it('rejects non-platform administrators before cross-account data is loaded', async () => {
    ;(requireSuperAdminForApi as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) })
    const response = await GET(new NextRequest('http://localhost/api/admin/users'))
    expect(response.status).toBe(403)
    expect(listPlatformUsers).not.toHaveBeenCalled()
  })

  it('supports name/email, account, role, and status filtering', async () => {
    ;(requireSuperAdminForApi as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, userId: 'platform-1' })
    const response = await GET(new NextRequest('http://localhost/api/admin/users?search=ava&account=a1&role=ADMIN&status=ACTIVE'))
    const body = await response.json()
    expect(body.data.rows).toHaveLength(1)
    expect(body.data.rows[0].email).toBe('ava@ichi.test')
    expect(body.data.summary).toMatchObject({ total: 2, active: 1, invited: 1 })
  })
})
