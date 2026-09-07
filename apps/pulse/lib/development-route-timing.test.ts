import { afterEach, describe, expect, it, vi } from 'vitest'
import { withDevelopmentRouteTiming } from './development-route-timing'

describe('withDevelopmentRouteTiming', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('marks overlapping identical requests as duplicates and completes both', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const context = { route: '/api/app/events/[eventId]/agenda', account: 'events-demo', eventId: 'event-1' }

    const first = withDevelopmentRouteTiming(context, async () => {
      await gate
      return new Response(null, { status: 200 })
    })
    const second = withDevelopmentRouteTiming(context, async () => new Response(null, { status: 200 }))
    await second
    release()
    await first

    const starts = info.mock.calls.map(([label, payload]) => ({ label, payload: payload as Record<string, unknown> }))
      .filter((entry) => entry.payload.phase === 'start')
    expect(starts).toHaveLength(2)
    expect(starts[0].payload).toMatchObject({ duplicate: false, coalesced: false })
    expect(starts[1].payload).toMatchObject({ duplicate: true, coalesced: false })
  })

  it('does not log in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    await withDevelopmentRouteTiming(
      { route: '/api/app/account', account: 'events-demo' },
      async () => new Response(null, { status: 200 }),
    )
    expect(info).not.toHaveBeenCalled()
  })
})
