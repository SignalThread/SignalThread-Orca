import type { EventLifecyclePhase } from '@/lib/events-home-groups'

export const ADVANCED_EVENTS_DEMO_EVENT_ID = 'event_advanced_demo_20260902031540_6c81e383'
export const ADVANCED_EVENTS_DEMO_ACCOUNT_SLUG = 'events-demo'
export const DEV_LIFECYCLE_QUERY_PARAM = 'devLifecycle'

export type AdvancedDemoLifecycleOverride = 'pre' | 'during' | 'post'

const lifecycleByOverride: Record<AdvancedDemoLifecycleOverride, EventLifecyclePhase> = {
  pre: 'PRE_EVENT',
  during: 'IN_EVENT',
  post: 'POST_EVENT',
}

const LOCAL_ADVANCED_DEMO_EVENT_IDS = new Set([
  ADVANCED_EVENTS_DEMO_EVENT_ID,
])

export function parseAdvancedDemoLifecycleOverride(value: string | null | undefined): AdvancedDemoLifecycleOverride | null {
  return value === 'pre' || value === 'during' || value === 'post' ? value : null
}

export function isLocalAdvancedDemoLifecycleEnvironment(input: {
  eventId: string
  accountSlug: string | null | undefined
  hostname: string | null | undefined
  environment?: string | undefined
}) {
  const environment = input.environment ?? process.env.NODE_ENV
  return environment === 'development'
    && LOCAL_ADVANCED_DEMO_EVENT_IDS.has(input.eventId)
    && input.accountSlug === ADVANCED_EVENTS_DEMO_ACCOUNT_SLUG
    && (input.hostname === 'localhost' || input.hostname === '127.0.0.1' || input.hostname === '::1')
}

// This is deliberately narrower than the canonical lifecycle resolver. It is
// only a local QA presentation override for the one deterministic demo event.
export function resolveLocalAdvancedDemoLifecycleOverride(input: {
  eventId: string
  accountSlug: string | null | undefined
  hostname: string | null | undefined
  value: string | null | undefined
  environment?: string | undefined
}): EventLifecyclePhase | null {
  if (!isLocalAdvancedDemoLifecycleEnvironment(input)) return null
  const override = parseAdvancedDemoLifecycleOverride(input.value)
  return override ? lifecycleByOverride[override] : null
}
