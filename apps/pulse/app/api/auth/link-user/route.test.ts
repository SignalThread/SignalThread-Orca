import { beforeEach, describe, expect, it, vi } from 'vitest'

const createRouteHandlerClientMock = vi.fn()
const linkAuthenticatedUserMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createRouteHandlerClient: createRouteHandlerClientMock,
}))

vi.mock('@/lib/prisma', () => ({ prisma: {} }))

vi.mock('@/lib/auth/link-user-identity', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/link-user-identity')>()
  return { ...actual, linkAuthenticatedUser: linkAuthenticatedUserMock }
})

describe('POST /api/auth/link-user', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    process.env.SUPER_ADMIN_EMAILS = 'boss@example.com'
  })

  it('normalizes the session email and redirects the linked user into their account', async () => {
    createRouteHandlerClientMock.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user_123', email: '  Owner@Example.com ' } },
        }),
      },
    })
    linkAuthenticatedUserMock.mockResolvedValue({
      id: 'user_123',
      email: 'owner@example.com',
      role: 'ADMIN',
      account: { slug: 'events-demo' },
    })

    const { POST } = await import('@/app/api/auth/link-user/route')
    const response = await POST({
      nextUrl: new URL('http://localhost/api/auth/link-user'),
      url: 'http://localhost/api/auth/link-user',
    } as never)

    expect(response.status).toBe(200)
    expect(linkAuthenticatedUserMock).toHaveBeenCalledWith(expect.anything(), {
      authUserId: 'user_123',
      email: 'owner@example.com',
      isSuperAdmin: false,
    })
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      redirectUrl: '/app?account=events-demo',
    })
  })

  it('routes super admins to /admin', async () => {
    createRouteHandlerClientMock.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user_admin', email: 'Boss@Example.com' } },
        }),
      },
    })
    linkAuthenticatedUserMock.mockResolvedValue({
      id: 'user_admin',
      email: 'boss@example.com',
      role: 'SUPER_ADMIN',
      account: null,
    })

    const { POST } = await import('@/app/api/auth/link-user/route')
    const response = await POST({
      nextUrl: new URL('http://localhost/api/auth/link-user'),
      url: 'http://localhost/api/auth/link-user',
    } as never)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ redirectUrl: '/admin' })
  })

  it('returns a stable 409 for separate ID and email rows', async () => {
    const { AuthIdentityConflictError } = await import('@/lib/auth/link-user-identity')
    createRouteHandlerClientMock.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'auth_user', email: 'owner@example.com' } },
        }),
      },
    })
    linkAuthenticatedUserMock.mockRejectedValue(new AuthIdentityConflictError())

    const { POST } = await import('@/app/api/auth/link-user/route')
    const response = await POST({
      nextUrl: new URL('http://localhost/api/auth/link-user'),
      url: 'http://localhost/api/auth/link-user',
    } as never)

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: 'Identity conflict',
      code: 'AUTH_IDENTITY_CONFLICT',
    })
  })
})
