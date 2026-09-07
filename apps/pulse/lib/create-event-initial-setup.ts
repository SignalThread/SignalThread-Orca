export interface CreateEventInitialSetupResult {
  eventId: string
  eventCreatedNow: boolean
  importJobId: string | null
  createdAreaNames: string[]
  failedAreaNames: string[]
  failedStage: 'EVENT_AREAS' | 'AGENDA' | null
  error: string | null
}

type Fetcher = typeof fetch

async function responseBody(response: Response) {
  return response.json().catch(() => ({})) as Promise<Record<string, any>>
}

/**
 * Coordinates the Create Event UI over the existing canonical write routes.
 * Event creation happens at most once per call chain; retries receive the
 * already-created eventId and only resume unfinished initial setup work.
 */
export async function createEventWithInitialSetup(input: {
  accountSlug: string
  eventPayload: Record<string, unknown>
  eventAreaNames: string[]
  existingEventId?: string | null
  fetcher?: Fetcher
}): Promise<CreateEventInitialSetupResult> {
  const fetcher = input.fetcher ?? fetch
  let eventId = input.existingEventId?.trim() || ''
  let eventCreatedNow = false

  if (!eventId) {
    const eventResponse = await fetcher(`/api/app/events?account=${encodeURIComponent(input.accountSlug)}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input.eventPayload),
    })
    const body = await responseBody(eventResponse)
    if (!eventResponse.ok || !body.event?.id) {
      throw new Error(typeof body.error === 'string' ? body.error : 'Failed to create event')
    }
    eventId = body.event.id
    eventCreatedNow = true
  }

  const createdAreaNames: string[] = []
  const failedAreaNames: string[] = []
  let firstAreaError: string | null = null
  for (const name of input.eventAreaNames) {
    try {
      const areaResponse = await fetcher(`/api/app/events/${encodeURIComponent(eventId)}/survey-coverage?account=${encodeURIComponent(input.accountSlug)}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'CREATE_EVENT_AREA', name }),
      })
      const body = await responseBody(areaResponse)
      // A retry may encounter the exact area created before a lost response.
      // The canonical service's normalized-name conflict means the requested
      // end state already exists, so a 409 is a successful idempotent replay.
      if (areaResponse.ok || areaResponse.status === 409) createdAreaNames.push(name)
      else {
        failedAreaNames.push(name)
        if (!firstAreaError) firstAreaError = typeof body.error === 'string' ? body.error : `Failed to add ${name}`
      }
    } catch (error) {
      failedAreaNames.push(name)
      if (!firstAreaError) firstAreaError = error instanceof Error ? error.message : `Failed to add ${name}`
    }
  }

  if (failedAreaNames.length > 0) {
    return {
      eventId,
      eventCreatedNow,
      importJobId: null,
      createdAreaNames,
      failedAreaNames,
      failedStage: 'EVENT_AREAS',
      error: firstAreaError || 'Some Event Areas could not be added',
    }
  }

  return {
    eventId,
    eventCreatedNow,
    importJobId: null,
    createdAreaNames,
    failedAreaNames: [],
    failedStage: null,
    error: null,
  }
}

export function normalizeInitialEventAreaName(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

export function appendInitialEventArea(current: string[], value: string) {
  const normalized = normalizeInitialEventAreaName(value)
  if (!normalized) return { areas: current, added: false, reason: 'EMPTY' as const }
  if (current.some((area) => area.toLocaleLowerCase('en-US') === normalized.toLocaleLowerCase('en-US'))) {
    return { areas: current, added: false, reason: 'DUPLICATE' as const }
  }
  return { areas: [...current, normalized], added: true, reason: null }
}
