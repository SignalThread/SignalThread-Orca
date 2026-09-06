import type { EventLifecyclePhase } from '@/lib/events-home-groups'

export const ADVANCED_EVENTS_DEMO_EVENT_ID = 'event_advanced_demo_20260902031540_6c81e383'
export const ADVANCED_EVENTS_DEMO_ACCOUNT_SLUG = 'events-demo'
export const PRODUCTION_EVENTS_DEMO_EVENT_ID = 'cln_event_fe22efc9c0d34a21a47135167f'
export const PRODUCTION_EVENTS_DEMO_ACCOUNT_SLUG = 'signalthread'
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

export type AdvancedDemoLifecycleMode = 'local-development' | 'production-demo'

export function parseAdvancedDemoLifecycleOverride(value: string | null | undefined): AdvancedDemoLifecycleOverride | null {
  return value === 'pre' || value === 'during' || value === 'post' ? value : null
}

export function getAdvancedDemoLifecycleMode(input: {
  eventId: string
  accountSlug: string | null | undefined
  hostname: string | null | undefined
  environment?: string | undefined
}): AdvancedDemoLifecycleMode | null {
  const environment = input.environment ?? process.env.NODE_ENV
  const isLocalDevelopmentDemo = environment === 'development'
    && LOCAL_ADVANCED_DEMO_EVENT_IDS.has(input.eventId)
    && input.accountSlug === ADVANCED_EVENTS_DEMO_ACCOUNT_SLUG
    && (input.hostname === 'localhost' || input.hostname === '127.0.0.1' || input.hostname === '::1')
  if (isLocalDevelopmentDemo) return 'local-development'

  const isProductionDemo = environment === 'production'
    && input.eventId === PRODUCTION_EVENTS_DEMO_EVENT_ID
    && input.accountSlug === PRODUCTION_EVENTS_DEMO_ACCOUNT_SLUG
  return isProductionDemo ? 'production-demo' : null
}

export function isAdvancedDemoLifecycleEnvironment(input: {
  eventId: string
  accountSlug: string | null | undefined
  hostname: string | null | undefined
  environment?: string | undefined
}) {
  return getAdvancedDemoLifecycleMode(input) !== null
}

// Backwards-compatible name retained for existing API routes. The canonical
// allowlist is owned by getAdvancedDemoLifecycleMode above.
export const isLocalAdvancedDemoLifecycleEnvironment = isAdvancedDemoLifecycleEnvironment

// This is deliberately narrower than the canonical lifecycle resolver. It is
// only a presentation override for the explicitly allowlisted demo events.
export function resolveAdvancedDemoLifecycleOverride(input: {
  eventId: string
  accountSlug: string | null | undefined
  hostname: string | null | undefined
  value: string | null | undefined
  environment?: string | undefined
}): EventLifecyclePhase | null {
  if (!isAdvancedDemoLifecycleEnvironment(input)) return null
  const override = parseAdvancedDemoLifecycleOverride(input.value)
  return override ? lifecycleByOverride[override] : null
}

// Backwards-compatible name retained so every dashboard API continues to use
// the same override resolver rather than growing a second lifecycle path.
export const resolveLocalAdvancedDemoLifecycleOverride = resolveAdvancedDemoLifecycleOverride
