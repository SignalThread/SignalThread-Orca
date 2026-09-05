import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearPendingAccountContextsForTest, loadAccountContext } from './account-context-client'

const successPayload = {
  success: true,
  account: {
    id: 'account-1',
    name: 'Events Demo',
    slug: 'events-demo',
    accountType: 'EVENTS',
    tier: 'starter',
    branding: { logoUrl: null, primaryColor: null, primaryButtonColor: null },
  },
}

function successResponse() {
  return new Response(JSON.stringify(successPayload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

function stubWindowTimers() {
  vi.stubGlobal('window', {
    setTimeout: (...args: Parameters<typeof setTimeout>) => setTimeout(...args),
    clearTimeout: (...args: Parameters<typeof clearTimeout>) => clearTimeout(...args),
  })
}

describe('loadAccountContext', () => {
  afterEach(() => {
    clearPendingAccountContextsForTest()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('coalesces concurrent consumers onto one lightweight account request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(successResponse())
    vi.stubGlobal('fetch', fetchMock)
    stubWindowTimers()

    const first = loadAccountContext('events-demo')
    const second = loadAccountContext('events-demo')

    expect(second).toBe(first)
    await expect(first).resolves.toMatchObject({ accountType: 'EVENTS' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/app/account?account=events-demo&scope=context',
      expect.objectContaining({ credentials: 'include', cache: 'no-store' }),
    )
  })

  it('serves repeat consumers from the short-lived success cache without refetching', async () => {
    const fetchMock = vi.fn().mockResolvedValue(successResponse())
    vi.stubGlobal('fetch', fetchMock)
    stubWindowTimers()

    await expect(loadAccountContext('events-demo')).resolves.toMatchObject({ accountType: 'EVENTS' })
    await expect(loadAccountContext('events-demo')).resolves.toMatchObject({ accountType: 'EVENTS' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('retries a transient server failure once before failing, then recovers on the next call', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: false, error: 'Temporary failure' }), { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: false, error: 'Temporary failure' }), { status: 503 }))
      .mockResolvedValueOnce(successResponse())
    vi.stubGlobal('fetch', fetchMock)
    stubWindowTimers()

    await expect(loadAccountContext('events-demo')).rejects.toThrow('Temporary failure')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await new Promise((resolve) => setTimeout(resolve, 0))
    await expect(loadAccountContext('events-demo')).resolves.toMatchObject({ accountType: 'EVENTS' })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('does not burn the bounded retry on non-transient authorization failures', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: false, error: 'Forbidden' }), { status: 403 }))
    vi.stubGlobal('fetch', fetchMock)
    stubWindowTimers()

    await expect(loadAccountContext('events-demo')).rejects.toThrow('Forbidden')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('forceRefresh issues a real new request instead of joining a stale hung one', async () => {
    let resolveHung: ((response: Response) => void) | undefined
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveHung = resolve }))
      .mockResolvedValueOnce(successResponse())
    vi.stubGlobal('fetch', fetchMock)
    stubWindowTimers()

    const hung = loadAccountContext('events-demo')
    const retried = loadAccountContext('events-demo', { forceRefresh: true })

    expect(retried).not.toBe(hung)
    await expect(retried).resolves.toMatchObject({ accountType: 'EVENTS' })
    expect(fetchMock).toHaveBeenCalledTimes(2)

    resolveHung?.(successResponse())
    await expect(hung).resolves.toMatchObject({ accountType: 'EVENTS' })
  })

  it('cannot hang indefinitely: stalled requests abort at the bounded timeout', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
      }))
    vi.stubGlobal('fetch', fetchMock)
    stubWindowTimers()

    const pending = loadAccountContext('events-demo')
    const assertion = expect(pending).rejects.toThrow('Account context request timed out. Please retry.')
    // Two bounded attempts of 10s each; nothing is left pending afterwards.
    await vi.advanceTimersByTimeAsync(10_000)
    await vi.advanceTimersByTimeAsync(10_000)
    await assertion
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
