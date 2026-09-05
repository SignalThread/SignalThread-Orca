import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  EVENT_WORKSPACE_NAVIGATION_COLLAPSED_STORAGE_KEY,
  getEventWorkspaceNavigationCollapsed,
  setEventWorkspaceNavigationCollapsed,
} from './event-workspace-navigation-preference'

const getItem = vi.fn<[string], string | null>()
const setItem = vi.fn<[string, string], void>()

afterEach(() => {
  getItem.mockReset()
  setItem.mockReset()
  vi.unstubAllGlobals()
})

describe('Event workspace navigation preference', () => {
  it('defaults to expanded and restores only an explicit collapsed preference', () => {
    vi.stubGlobal('window', {})
    vi.stubGlobal('localStorage', { getItem })

    getItem.mockReturnValue(null)
    expect(getEventWorkspaceNavigationCollapsed()).toBe(false)

    getItem.mockReturnValue('true')
    expect(getEventWorkspaceNavigationCollapsed()).toBe(true)
  })

  it('persists the desktop preference using the dedicated local key', () => {
    vi.stubGlobal('window', {})
    vi.stubGlobal('localStorage', { setItem })

    setEventWorkspaceNavigationCollapsed(true)
    setEventWorkspaceNavigationCollapsed(false)

    expect(setItem).toHaveBeenNthCalledWith(1, EVENT_WORKSPACE_NAVIGATION_COLLAPSED_STORAGE_KEY, 'true')
    expect(setItem).toHaveBeenNthCalledWith(2, EVENT_WORKSPACE_NAVIGATION_COLLAPSED_STORAGE_KEY, 'false')
  })
})
