export const EVENT_WORKSPACE_NAVIGATION_COLLAPSED_STORAGE_KEY = 'voice-events-navigation-collapsed'

export function getEventWorkspaceNavigationCollapsed(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(EVENT_WORKSPACE_NAVIGATION_COLLAPSED_STORAGE_KEY) === 'true'
}

export function setEventWorkspaceNavigationCollapsed(collapsed: boolean): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(EVENT_WORKSPACE_NAVIGATION_COLLAPSED_STORAGE_KEY, String(collapsed))
}
