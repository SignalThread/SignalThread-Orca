import { describe, expect, it } from 'vitest'
import {
  ADVANCED_EVENTS_DEMO_EVENT_ID,
  isLocalAdvancedDemoLifecycleEnvironment,
  parseAdvancedDemoLifecycleOverride,
  resolveLocalAdvancedDemoLifecycleOverride,
} from './advanced-events-demo-lifecycle'

const localDemo = {
  eventId: ADVANCED_EVENTS_DEMO_EVENT_ID,
  accountSlug: 'events-demo',
  hostname: 'localhost',
  environment: 'development',
}

describe('local Advanced Events lifecycle QA override', () => {
  it('maps only the supported local demo values', () => {
    expect(parseAdvancedDemoLifecycleOverride('pre')).toBe('pre')
    expect(parseAdvancedDemoLifecycleOverride('during')).toBe('during')
    expect(parseAdvancedDemoLifecycleOverride('post')).toBe('post')
    expect(parseAdvancedDemoLifecycleOverride('AUTO')).toBeNull()
    expect(resolveLocalAdvancedDemoLifecycleOverride({ ...localDemo, value: 'pre' })).toBe('PRE_EVENT')
    expect(resolveLocalAdvancedDemoLifecycleOverride({ ...localDemo, value: 'during' })).toBe('IN_EVENT')
    expect(resolveLocalAdvancedDemoLifecycleOverride({ ...localDemo, value: 'post' })).toBe('POST_EVENT')
    expect(resolveLocalAdvancedDemoLifecycleOverride({ ...localDemo, value: null })).toBeNull()
  })

  it('does not present lifecycle controls for the legacy unclassified audit fixture', () => {
    const legacyAuditFixture = { ...localDemo, eventId: 'event_advanced_demo_audit_20260901' }
    expect(isLocalAdvancedDemoLifecycleEnvironment(legacyAuditFixture)).toBe(false)
    expect(resolveLocalAdvancedDemoLifecycleOverride({ ...legacyAuditFixture, value: 'pre' })).toBeNull()
  })

  it('is unavailable in production, away from localhost, and for normal events', () => {
    expect(isLocalAdvancedDemoLifecycleEnvironment({ ...localDemo, environment: 'production' })).toBe(false)
    expect(isLocalAdvancedDemoLifecycleEnvironment({ ...localDemo, hostname: 'demo.example.com' })).toBe(false)
    expect(isLocalAdvancedDemoLifecycleEnvironment({ ...localDemo, eventId: 'event_other' })).toBe(false)
    expect(resolveLocalAdvancedDemoLifecycleOverride({ ...localDemo, environment: 'production', value: 'post' })).toBeNull()
  })
})
