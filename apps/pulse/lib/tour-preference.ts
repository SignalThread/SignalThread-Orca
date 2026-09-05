export const TOUR_STORAGE_KEY = 'booth-audio-tour-enabled'
export const TOUR_DISMISSED_STORAGE_KEY = 'booth-audio-tour-dismissed'

export function getTourEnabled(): boolean {
  if (typeof window === 'undefined') return true
  const stored = localStorage.getItem(TOUR_STORAGE_KEY)
  if (stored === null) return true // default on
  return stored === 'true'
}

export function setTourEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(TOUR_STORAGE_KEY, String(enabled))
}

export function shouldAutoStartTour(): boolean {
  if (typeof window === 'undefined') return false
  return getTourEnabled() && localStorage.getItem(TOUR_DISMISSED_STORAGE_KEY) !== 'true'
}

export function dismissTour(): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(TOUR_DISMISSED_STORAGE_KEY, 'true')
}
