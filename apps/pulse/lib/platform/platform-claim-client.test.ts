import { describe, expect, it, vi } from 'vitest'
import { buildPlatformLaunchUrl, claimPlatformHandoff, resolvePlatformAppUrl } from './platform-claim-client'

const USER = 'bfccbd09-700c-4146-992f-8827f32aa6fd'
const ORG = '7437a82f-bdc9-425d-9f1c-5525930b43bd'
const EVENT = 'ae9942ba-5759-486b-b591-f1b5ed223370'
const TOKEN = 'pkce_0123456789abcdef0123456789abcdef'

const env = (o: Record<string, string | undefined> = {}) => ({ PLATFORM_APP_URL: 'https://app.signalthread.ai', ...o }) as unknown as NodeJS.ProcessEnv

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('resolvePlatformAppUrl', () => {
  it('accepts an https origin and trims a trailing slash', () => {
    expect(resolvePlatformAppUrl(env({ PLATFORM_APP_URL: 'https://app.signalthread.ai/' }))).toBe('https://app.signalthread.ai')
    expect(resolvePlatformAppUrl(env({ PLATFORM_APP_URL: ' https://app.signalthread.ai/platform ' }))).toBe('https://app.signalthread.ai/platform')
  })

  it('refuses plain http in production but allows it elsewhere for local verification', () => {
    expect(resolvePlatformAppUrl(env({ PLATFORM_APP_URL: 'http://platform.localtest.me:3001', NODE_ENV: 'production' }))).toBeNull()
    expect(resolvePlatformAppUrl(env({ PLATFORM_APP_URL: 'http://platform.localtest.me:3001', NODE_ENV: 'development' }))).toBe('http://platform.localtest.me:3001')
  })

  it('refuses missing, malformed, non-http, or query-bearing values', () => {
    for (const value of [undefined, '', 'app.signalthread.ai', 'ftp://x', 'https://x/?a=1', 'https://x/#f']) {
      expect(resolvePlatformAppUrl(env({ PLATFORM_APP_URL: value }))).toBeNull()
    }
  })
})

describe('claimPlatformHandoff', () => {
  it('posts only the token and the event id to Platform and returns the canonical context', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, {
      platform_user_id: USER.toUpperCase(), organization_id: ORG, event_id: EVENT, product: 'pulse',
    }))
    const result = await claimPlatformHandoff({ handoff: TOKEN, eventId: EVENT }, { fetch: fetchMock, env: env() })
    expect(result).toEqual({ ok: true, context: { platformUserId: USER, platformOrganizationId: ORG, platformEventId: EVENT } })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://app.signalthread.ai/api/launch/pulse/claim')
    expect(init.method).toBe('POST')
    expect(init.redirect).toBe('error')
    expect(JSON.parse(String(init.body))).toEqual({ handoff: TOKEN, event_id: EVENT })
  })

  it('does not contact Platform when it is not configured', async () => {
    const fetchMock = vi.fn()
    const result = await claimPlatformHandoff({ handoff: TOKEN, eventId: EVENT }, { fetch: fetchMock, env: { PLATFORM_APP_URL: '' } as unknown as NodeJS.ProcessEnv })
    expect(result).toEqual({ ok: false, reason: 'PLATFORM_NOT_CONFIGURED' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('maps an invalid, consumed or expired token to a 401-class failure', async () => {
    const invalid = await claimPlatformHandoff({ handoff: TOKEN, eventId: EVENT }, {
      fetch: vi.fn(async () => jsonResponse(401, { error: 'Forbidden', reason: 'HANDOFF_INVALID' })), env: env(),
    })
    expect(invalid).toEqual({ ok: false, reason: 'HANDOFF_INVALID', platformReason: 'HANDOFF_INVALID' })
    const expired = await claimPlatformHandoff({ handoff: TOKEN, eventId: EVENT }, {
      fetch: vi.fn(async () => jsonResponse(401, { reason: 'HANDOFF_EXPIRED' })), env: env(),
    })
    expect(expired).toEqual({ ok: false, reason: 'HANDOFF_EXPIRED', platformReason: 'HANDOFF_EXPIRED' })
  })

  it('carries Platform authorization denials through with their stable reason code', async () => {
    const result = await claimPlatformHandoff({ handoff: TOKEN, eventId: EVENT }, {
      fetch: vi.fn(async () => jsonResponse(403, { error: 'Forbidden', reason: 'PRODUCT_NOT_ENTITLED', hint: 'x' })), env: env(),
    })
    expect(result).toEqual({ ok: false, reason: 'PLATFORM_DENIED', platformReason: 'PRODUCT_NOT_ENTITLED' })
  })

  it('drops reason codes that are not stable identifiers', async () => {
    const result = await claimPlatformHandoff({ handoff: TOKEN, eventId: EVENT }, {
      fetch: vi.fn(async () => jsonResponse(403, { reason: '<script>alert(1)</script>' })), env: env(),
    })
    expect(result).toEqual({ ok: false, reason: 'PLATFORM_DENIED' })
  })

  it('treats network failures, 5xx and malformed bodies as unavailable, never as context', async () => {
    const down = await claimPlatformHandoff({ handoff: TOKEN, eventId: EVENT }, { fetch: vi.fn(async () => { throw new Error('ECONNREFUSED') }), env: env() })
    expect(down).toEqual({ ok: false, reason: 'PLATFORM_UNAVAILABLE' })
    const gateway = await claimPlatformHandoff({ handoff: TOKEN, eventId: EVENT }, { fetch: vi.fn(async () => new Response('bad gateway', { status: 502 })), env: env() })
    expect(gateway).toEqual({ ok: false, reason: 'PLATFORM_UNAVAILABLE' })
    const html = await claimPlatformHandoff({ handoff: TOKEN, eventId: EVENT }, { fetch: vi.fn(async () => new Response('<html>', { status: 200 })), env: env() })
    expect(html).toEqual({ ok: false, reason: 'PLATFORM_UNAVAILABLE' })
  })

  it('refuses a 200 that names another product or carries non-canonical ids', async () => {
    const wrongProduct = await claimPlatformHandoff({ handoff: TOKEN, eventId: EVENT }, {
      fetch: vi.fn(async () => jsonResponse(200, { platform_user_id: USER, organization_id: ORG, event_id: EVENT, product: 'orca' })), env: env(),
    })
    expect(wrongProduct).toEqual({ ok: false, reason: 'PLATFORM_UNAVAILABLE' })
    const emailAsId = await claimPlatformHandoff({ handoff: TOKEN, eventId: EVENT }, {
      fetch: vi.fn(async () => jsonResponse(200, { platform_user_id: 'organizer@example.com', organization_id: ORG, event_id: EVENT, product: 'pulse' })), env: env(),
    })
    expect(emailAsId).toEqual({ ok: false, reason: 'PLATFORM_UNAVAILABLE' })
    const missing = await claimPlatformHandoff({ handoff: TOKEN, eventId: EVENT }, {
      fetch: vi.fn(async () => jsonResponse(200, { platform_user_id: USER, event_id: EVENT, product: 'pulse' })), env: env(),
    })
    expect(missing).toEqual({ ok: false, reason: 'PLATFORM_UNAVAILABLE' })
  })
})

describe('claimPlatformHandoff timeout', () => {
  it('aborts when Platform returns headers but stalls the body, with a controlled failure', async () => {
    // Headers arrive at once; the body never does.
    const stalledBody = new ReadableStream<Uint8Array>({ start() { /* never enqueue, never close */ } })
    const fetchMock = vi.fn(async () => new Response(stalledBody, { status: 200, headers: { 'content-type': 'application/json' } }))
    const started = Date.now()
    const result = await claimPlatformHandoff({ handoff: TOKEN, eventId: EVENT }, { fetch: fetchMock, env: env(), timeoutMs: 50 })
    const elapsed = Date.now() - started
    expect(result).toEqual({ ok: false, reason: 'PLATFORM_UNAVAILABLE' })
    expect(elapsed).toBeGreaterThanOrEqual(45)
    expect(elapsed).toBeLessThan(2_000)
  })

  it('aborts when Platform never answers the request at all', async () => {
    const fetchMock = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    }))
    const result = await claimPlatformHandoff({ handoff: TOKEN, eventId: EVENT }, { fetch: fetchMock, env: env(), timeoutMs: 30 })
    expect(result).toEqual({ ok: false, reason: 'PLATFORM_UNAVAILABLE' })
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(init.signal?.aborted).toBe(true)
  })

  it('a body that arrives within the budget is still parsed normally', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { platform_user_id: USER, organization_id: ORG, event_id: EVENT, product: 'pulse' }))
    const result = await claimPlatformHandoff({ handoff: TOKEN, eventId: EVENT }, { fetch: fetchMock, env: env(), timeoutMs: 1_000 })
    expect(result.ok).toBe(true)
  })
})

describe('buildPlatformLaunchUrl', () => {
  const CORRELATOR = 'a'.repeat(64)

  it('targets the configured Platform launch for a canonical event only', () => {
    expect(buildPlatformLaunchUrl(EVENT.toUpperCase(), null, env())).toBe(`https://app.signalthread.ai/api/launch/pulse?event_id=${EVENT}`)
    expect(buildPlatformLaunchUrl('acme-2026', null, env())).toBeNull()
    expect(buildPlatformLaunchUrl(EVENT, null, { PLATFORM_APP_URL: '' } as unknown as NodeJS.ProcessEnv)).toBeNull()
  })

  it('carries the browser correlator to Platform as an opaque `state`', () => {
    expect(buildPlatformLaunchUrl(EVENT, CORRELATOR, env())).toBe(
      `https://app.signalthread.ai/api/launch/pulse?event_id=${EVENT}&state=${CORRELATOR}`,
    )
  })

  it('refuses to build a launch URL for a correlator that is not a SHA-256 digest', () => {
    for (const bad of ['short', `${CORRELATOR}0`, 'nothex'.padEnd(64, 'z'), '../../evil']) {
      expect(buildPlatformLaunchUrl(EVENT, bad, env()), bad).toBeNull()
    }
  })
})
