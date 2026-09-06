import { beforeEach, describe, expect, it, vi } from 'vitest'

const { adminMock, createAdminClientMock, createRouteHandlerClientMock, verifyOtpMock } = vi.hoisted(() => {
  const adminMock = {
    auth: { admin: { getUserById: vi.fn(), generateLink: vi.fn() } },
  }
  const verifyOtpMock = vi.fn()
  return {
    adminMock,
    createAdminClientMock: vi.fn(() => adminMock),
    createRouteHandlerClientMock: vi.fn(() => ({ auth: { verifyOtp: verifyOtpMock } })),
    verifyOtpMock,
  }
})

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: createAdminClientMock }))
vi.mock('@/lib/supabase/server', () => ({ createRouteHandlerClient: createRouteHandlerClientMock }))

import { establishPulseSessionForUser } from './establish-session'

const USER_ID = '88bbd88d-ca23-40d1-8d63-a7d3d312f783'
const OTHER_ID = '11111111-2222-4333-8444-555555555555'
const HASHED = 'pkce_0123456789abcdef0123456789abcdef'
const request = {} as never
const response = {} as never

describe('establishPulseSessionForUser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    adminMock.auth.admin.getUserById.mockResolvedValue({ data: { user: { id: USER_ID, email: 'organizer@example.com', banned_until: null } }, error: null })
    adminMock.auth.admin.generateLink.mockResolvedValue({ data: { user: { id: USER_ID }, properties: { hashed_token: HASHED } }, error: null })
    verifyOtpMock.mockResolvedValue({ data: { session: { access_token: 'x' }, user: { id: USER_ID } }, error: null })
  })

  it('opens a session for exactly the requested Auth user, server-side, by minting and spending a magiclink', async () => {
    await expect(establishPulseSessionForUser(USER_ID, request, response)).resolves.toEqual({ ok: true, userId: USER_ID })
    // Identity fixed by id first; the address used is the one read back from Auth.
    expect(adminMock.auth.admin.getUserById).toHaveBeenCalledWith(USER_ID)
    expect(adminMock.auth.admin.generateLink).toHaveBeenCalledWith({ type: 'magiclink', email: 'organizer@example.com' })
    // The token is exchanged with the anon SSR client bound to this request/response.
    // …with Secure whenever the deployment is HTTPS.
    expect(createRouteHandlerClientMock).toHaveBeenCalledWith(request, response, { secure: expect.any(Boolean) })
    expect(verifyOtpMock).toHaveBeenCalledWith({ type: 'magiclink', token_hash: HASHED })
  })

  it('fails closed when Auth admin access is not configured', async () => {
    createAdminClientMock.mockImplementationOnce(() => { throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY') })
    await expect(establishPulseSessionForUser(USER_ID, request, response)).resolves.toEqual({ ok: false, reason: 'AUTH_NOT_CONFIGURED' })
    expect(adminMock.auth.admin.generateLink).not.toHaveBeenCalled()
  })

  it('refuses when no Auth identity exists for the id, without minting anything', async () => {
    adminMock.auth.admin.getUserById.mockResolvedValue({ data: { user: null }, error: { message: 'User not found' } })
    await expect(establishPulseSessionForUser(USER_ID, request, response)).resolves.toEqual({ ok: false, reason: 'AUTH_IDENTITY_MISSING' })
    expect(adminMock.auth.admin.generateLink).not.toHaveBeenCalled()
    expect(verifyOtpMock).not.toHaveBeenCalled()
  })

  it('refuses a banned Auth identity', async () => {
    adminMock.auth.admin.getUserById.mockResolvedValue({ data: { user: { id: USER_ID, email: 'organizer@example.com', banned_until: new Date(Date.now() + 60_000).toISOString() } }, error: null })
    await expect(establishPulseSessionForUser(USER_ID, request, response)).resolves.toEqual({ ok: false, reason: 'AUTH_IDENTITY_BANNED' })
    expect(adminMock.auth.admin.generateLink).not.toHaveBeenCalled()
  })

  it('refuses an Auth identity without an email address rather than inventing one', async () => {
    adminMock.auth.admin.getUserById.mockResolvedValue({ data: { user: { id: USER_ID, email: null } }, error: null })
    await expect(establishPulseSessionForUser(USER_ID, request, response)).resolves.toEqual({ ok: false, reason: 'AUTH_IDENTITY_NO_EMAIL' })
  })

  it('refuses a token minted for a different user than the one requested', async () => {
    // Guards against mailbox collisions and against generateLink ever creating a user.
    adminMock.auth.admin.generateLink.mockResolvedValue({ data: { user: { id: OTHER_ID }, properties: { hashed_token: HASHED } }, error: null })
    await expect(establishPulseSessionForUser(USER_ID, request, response)).resolves.toEqual({ ok: false, reason: 'SESSION_IDENTITY_MISMATCH' })
    expect(verifyOtpMock).not.toHaveBeenCalled()
  })

  it('reports a minting failure without exchanging anything', async () => {
    adminMock.auth.admin.generateLink.mockResolvedValue({ data: null, error: { message: 'rate limited' } })
    await expect(establishPulseSessionForUser(USER_ID, request, response)).resolves.toEqual({ ok: false, reason: 'SESSION_MINT_FAILED' })
    expect(verifyOtpMock).not.toHaveBeenCalled()
  })

  it('refuses when the exchanged session is not for the requested user', async () => {
    verifyOtpMock.mockResolvedValue({ data: { session: { access_token: 'x' }, user: { id: OTHER_ID } }, error: null })
    await expect(establishPulseSessionForUser(USER_ID, request, response)).resolves.toEqual({ ok: false, reason: 'SESSION_ESTABLISH_FAILED' })
    verifyOtpMock.mockResolvedValue({ data: { session: null, user: null }, error: { message: 'Token has expired or is invalid' } })
    await expect(establishPulseSessionForUser(USER_ID, request, response)).resolves.toEqual({ ok: false, reason: 'SESSION_ESTABLISH_FAILED' })
  })
})
