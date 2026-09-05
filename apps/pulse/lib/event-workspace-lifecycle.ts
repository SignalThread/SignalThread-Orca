import type { EventLifecyclePhase } from './events-home-groups'

export const EVENT_WORKSPACE_LIFECYCLE_VIEWS = ['pre-event', 'in-event', 'post-event'] as const

export type EventWorkspaceLifecycleView = (typeof EVENT_WORKSPACE_LIFECYCLE_VIEWS)[number]

const lifecyclePhaseByView: Record<EventWorkspaceLifecycleView, EventLifecyclePhase> = {
  'pre-event': 'PRE_EVENT',
  'in-event': 'IN_EVENT',
  'post-event': 'POST_EVENT',
}

const lifecycleViewByPhase: Record<EventLifecyclePhase, EventWorkspaceLifecycleView> = {
  PRE_EVENT: 'pre-event',
  IN_EVENT: 'in-event',
  POST_EVENT: 'post-event',
}

/** Legacy URL parser retained only so older links remain harmless. */
export function parseEventWorkspaceLifecycleView(value: string | null | undefined): EventWorkspaceLifecycleView | null {
  return EVENT_WORKSPACE_LIFECYCLE_VIEWS.includes(value as EventWorkspaceLifecycleView)
    ? value as EventWorkspaceLifecycleView
    : null
}

export function getEventLifecyclePhaseForWorkspaceView(view: EventWorkspaceLifecycleView): EventLifecyclePhase {
  return lifecyclePhaseByView[view]
}

export function getEventWorkspaceLifecycleView(phase: EventLifecyclePhase): EventWorkspaceLifecycleView {
  return lifecycleViewByPhase[phase]
}

export function resolveEventWorkspaceLifecycle(
  _requestedView: string | null | undefined,
  defaultPhase: EventLifecyclePhase | null,
) {
  const defaultView = defaultPhase ? getEventWorkspaceLifecycleView(defaultPhase) : null
  return {
    defaultView,
    view: defaultView,
    lifecyclePhase: defaultPhase,
    isOverride: false,
  }
}
