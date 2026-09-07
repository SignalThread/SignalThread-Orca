export interface EventListeningWindowSource {
  startDate: Date | null
  endDate: Date | null
  listeningWindowOpensAt?: Date | null
  listeningWindowClosesAt?: Date | null
}

export interface EventListeningWindow {
  opensAt: Date | null
  closesAt: Date | null
  source: 'SAVED' | 'DEFAULT' | 'UNAVAILABLE'
}

/** The event-wide survey window is independent of all session schedules. */
export function resolveEventListeningWindow(event: EventListeningWindowSource): EventListeningWindow {
  if (event.listeningWindowOpensAt && event.listeningWindowClosesAt) {
    return { opensAt: event.listeningWindowOpensAt, closesAt: event.listeningWindowClosesAt, source: 'SAVED' }
  }
  if (!event.startDate || !event.endDate) return { opensAt: null, closesAt: null, source: 'UNAVAILABLE' }
  const opensAt = new Date(event.startDate)
  opensAt.setUTCDate(opensAt.getUTCDate() - 5)
  const closesAt = new Date(event.endDate)
  closesAt.setUTCDate(closesAt.getUTCDate() + 5)
  return { opensAt, closesAt, source: 'DEFAULT' }
}

export function validateEventListeningWindow(opensAt: Date | null | undefined, closesAt: Date | null | undefined) {
  if (!opensAt && !closesAt) return
  if (!opensAt || !closesAt || Number.isNaN(opensAt.getTime()) || Number.isNaN(closesAt.getTime()) || opensAt >= closesAt) {
    throw new Error('Listening window opening time must be before its closing time')
  }
}
