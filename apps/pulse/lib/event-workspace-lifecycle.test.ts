import { describe, expect, it } from 'vitest'
import {
  getEventLifecyclePhaseForWorkspaceView,
  getEventWorkspaceLifecycleView,
  parseEventWorkspaceLifecycleView,
  resolveEventWorkspaceLifecycle,
} from './event-workspace-lifecycle'

describe('event workspace lifecycle view', () => {
  it('uses the date-derived lifecycle even when an old URL contains a lifecycle view', () => {
    expect(resolveEventWorkspaceLifecycle(null, 'PRE_EVENT')).toEqual({
      defaultView: 'pre-event', view: 'pre-event', lifecyclePhase: 'PRE_EVENT', isOverride: false,
    })
    expect(resolveEventWorkspaceLifecycle('post-event', 'PRE_EVENT')).toEqual({
      defaultView: 'pre-event', view: 'pre-event', lifecyclePhase: 'PRE_EVENT', isOverride: false,
    })
  })

  it('keeps missing/TBD dates neutral instead of inventing a lifecycle view', () => {
    expect(resolveEventWorkspaceLifecycle('post-event', null)).toEqual({
      defaultView: null, view: null, lifecyclePhase: null, isOverride: false,
    })
  })

  it('rejects invalid URL values safely and maps each supported view exactly once', () => {
    expect(parseEventWorkspaceLifecycleView('during-event')).toBeNull()
    expect(parseEventWorkspaceLifecycleView('PRE_EVENT')).toBeNull()
    expect(getEventLifecyclePhaseForWorkspaceView('in-event')).toBe('IN_EVENT')
    expect(getEventWorkspaceLifecycleView('POST_EVENT')).toBe('post-event')
  })
})
