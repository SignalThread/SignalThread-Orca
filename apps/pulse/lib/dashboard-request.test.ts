import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearPendingDashboardRequestsForTest, loadDashboardJson } from './dashboard-request'

describe('loadDashboardJson', () => {
  beforeEach(() => {
    clearPendingDashboardRequestsForTest()
    vi.restoreAllMocks()
  })

  it('coalesces duplicate in-flight GETs and allows a later refresh', async () => {
    let resolveResponse!: (value: Response) => void
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveResponse = resolve }))
      .mockResolvedValue(new Response(JSON.stringify({ success: true, data: 2 }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const first = loadDashboardJson<{ success: true; data: number }>('/api/intelligence?event=1')
    const duplicate = loadDashboardJson<{ success: true; data: number }>('/api/intelligence?event=1')
    expect(fetchMock).toHaveBeenCalledTimes(1)

    resolveResponse(new Response(JSON.stringify({ success: true, data: 1 }), { status: 200 }))
    await expect(Promise.all([first, duplicate])).resolves.toEqual([
      { success: true, data: 1 },
      { success: true, data: 1 },
    ])

    await loadDashboardJson('/api/intelligence?event=1')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('keeps abortable UI lifecycles independent and forwards their signals', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const first = new AbortController()
    const second = new AbortController()

    await Promise.all([
      loadDashboardJson('/api/intelligence?event=1', { signal: first.signal }),
      loadDashboardJson('/api/intelligence?event=1', { signal: second.signal }),
    ])

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ signal: first.signal })
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ signal: second.signal })
  })
})
