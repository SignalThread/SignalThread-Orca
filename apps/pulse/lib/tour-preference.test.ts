import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  dismissTour,
  getTourEnabled,
  shouldAutoStartTour,
  TOUR_DISMISSED_STORAGE_KEY,
  TOUR_STORAGE_KEY,
} from './tour-preference'

const getItem = vi.fn<[string], string | null>()
const setItem = vi.fn<[string, string], void>()

afterEach(() => {
  getItem.mockReset()
  setItem.mockReset()
  vi.unstubAllGlobals()
})

describe('product tour preference', () => {
  it('auto-starts only when the tour is enabled and has not been dismissed', () => {
    vi.stubGlobal('window', {})
    vi.stubGlobal('localStorage', { getItem })
    getItem.mockImplementation((key) => key === TOUR_STORAGE_KEY ? 'true' : null)
    expect(getTourEnabled()).toBe(true)
    expect(shouldAutoStartTour()).toBe(true)

    getItem.mockImplementation((key) => key === TOUR_DISMISSED_STORAGE_KEY ? 'true' : 'true')
    expect(shouldAutoStartTour()).toBe(false)
  })

  it('persists dismissal without disabling the manual tour entrypoint', () => {
    vi.stubGlobal('window', {})
    vi.stubGlobal('localStorage', { setItem })
    dismissTour()
    expect(setItem).toHaveBeenCalledWith(TOUR_DISMISSED_STORAGE_KEY, 'true')
  })
})
