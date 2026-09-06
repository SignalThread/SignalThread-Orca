import { describe, expect, it } from 'vitest'
import {
  ADVANCED_EVENTS_DEMO_EVENT_ID,
  PRODUCTION_EVENTS_DEMO_EVENT_ID,
  getAdvancedDemoLifecycleMode,
  isAdvancedDemoLifecycleEnvironment,
  parseAdvancedDemoLifecycleOverride,
  resolveAdvancedDemoLifecycleOverride,
} from './advanced-events-demo-lifecycle'

const localDemo = {
  eventId: ADVANCED_EVENTS_DEMO_EVENT_ID,
  accountSlug: 'events-demo',
  hostname: 'localhost',
  environment: 'development',
}

const productionDemo = {
  eventId: PRODUCTION_EVENTS_DEMO_EVENT_ID,
  accountSlug: 'signalthread',
  hostname: 'app.signalthread.ai',
  environment: 'production',
}

describe('allowlisted Advanced Events lifecycle presentation override', () => {
  it('maps only the supported local demo values', () => {
    expect(parseAdvancedDemoLifecycleOverride('pre')).toBe('pre')
    expect(parseAdvancedDemoLifecycleOverride('during')).toBe('during')
    expect(parseAdvancedDemoLifecycleOverride('post')).toBe('post')
    expect(parseAdvancedDemoLifecycleOverride('AUTO')).toBeNull()
    expect(resolveAdvancedDemoLifecycleOverride({ ...localDemo, value: 'pre' })).toBe('PRE_EVENT')
    expect(resolveAdvancedDemoLifecycleOverride({ ...localDemo, value: 'during' })).toBe('IN_EVENT')
    expect(resolveAdvancedDemoLifecycleOverride({ ...localDemo, value: 'post' })).toBe('POST_EVENT')
    expect(resolveAdvancedDemoLifecycleOverride({ ...localDemo, value: null })).toBeNull()
  })

  it('does not present lifecycle controls for the legacy unclassified audit fixture', () => {
    const legacyAuditFixture = { ...localDemo, eventId: 'event_advanced_demo_audit_20260901' }
    expect(isAdvancedDemoLifecycleEnvironment(legacyAuditFixture)).toBe(false)
    expect(resolveAdvancedDemoLifecycleOverride({ ...legacyAuditFixture, value: 'pre' })).toBeNull()
  })

  it('allows the exact production demo tuple through the existing resolver', () => {
    expect(getAdvancedDemoLifecycleMode(productionDemo)).toBe('production-demo')
    expect(resolveAdvancedDemoLifecycleOverride({ ...productionDemo, value: 'pre' })).toBe('PRE_EVENT')
    expect(resolveAdvancedDemoLifecycleOverride({ ...productionDemo, value: 'during' })).toBe('IN_EVENT')
    expect(resolveAdvancedDemoLifecycleOverride({ ...productionDemo, value: 'post' })).toBe('POST_EVENT')
  })

  it('rejects normal production events, the wrong account, and cross-environment demo IDs', () => {
    expect(isAdvancedDemoLifecycleEnvironment({ ...productionDemo, eventId: 'event_other' })).toBe(false)
    expect(isAdvancedDemoLifecycleEnvironment({ ...productionDemo, accountSlug: 'customer' })).toBe(false)
    expect(isAdvancedDemoLifecycleEnvironment({ ...productionDemo, environment: 'development' })).toBe(false)
    expect(isAdvancedDemoLifecycleEnvironment({ ...localDemo, environment: 'production' })).toBe(false)
    expect(isAdvancedDemoLifecycleEnvironment({ ...localDemo, hostname: 'demo.example.com' })).toBe(false)
    expect(resolveAdvancedDemoLifecycleOverride({ ...productionDemo, eventId: 'event_other', value: 'post' })).toBeNull()
  })
})
