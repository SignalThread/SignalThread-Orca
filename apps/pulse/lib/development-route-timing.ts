type RouteTimingContext = {
  route: string
  account: string | null
  eventId?: string | null
  coalesced?: boolean
}

type RouteTimingState = {
  nextId: number
  inFlight: Map<string, number>
}

const globalWithRouteTiming = globalThis as typeof globalThis & {
  __voiceEventsRouteTiming?: RouteTimingState
}

function state() {
  globalWithRouteTiming.__voiceEventsRouteTiming ??= { nextId: 1, inFlight: new Map() }
  return globalWithRouteTiming.__voiceEventsRouteTiming
}

/** Bounded development diagnostics for correlating browser and server requests. */
export async function withDevelopmentRouteTiming(
  context: RouteTimingContext,
  run: () => Promise<Response>,
): Promise<Response> {
  if (process.env.NODE_ENV !== 'development') return run()

  const timing = state()
  const key = `${context.route}:${context.account ?? ''}:${context.eventId ?? ''}`
  const concurrent = timing.inFlight.get(key) ?? 0
  timing.inFlight.set(key, concurrent + 1)
  const requestId = timing.nextId++
  const startedAt = new Date()
  const startedMs = performance.now()
  const duplicate = concurrent > 0
  console.info('[voice-events-route]', {
    phase: 'start', requestId, route: context.route, account: context.account,
    eventId: context.eventId ?? null, startedAt: startedAt.toISOString(),
    duplicate, coalesced: context.coalesced ?? false,
  })

  try {
    const response = await run()
    console.info('[voice-events-route]', {
      phase: 'complete', requestId, route: context.route, account: context.account,
      eventId: context.eventId ?? null, startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(), durationMs: Math.round(performance.now() - startedMs),
      status: response.status, duplicate, coalesced: context.coalesced ?? false,
    })
    return response
  } catch (error) {
    console.error('[voice-events-route]', {
      phase: 'failure', requestId, route: context.route, account: context.account,
      eventId: context.eventId ?? null, startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(), durationMs: Math.round(performance.now() - startedMs),
      duplicate, coalesced: context.coalesced ?? false,
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  } finally {
    const remaining = (timing.inFlight.get(key) ?? 1) - 1
    if (remaining > 0) timing.inFlight.set(key, remaining)
    else timing.inFlight.delete(key)
  }
}
