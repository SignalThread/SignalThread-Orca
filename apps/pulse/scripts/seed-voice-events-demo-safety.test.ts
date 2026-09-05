import { describe, expect, it } from 'vitest'
import { assertSeedSafety } from './seed-voice-events-demo-safety.js'

type SeedSafetyInput = Parameters<typeof assertSeedSafety>[0]

function productionInput(overrides: Partial<SeedSafetyInput> = {}): SeedSafetyInput {
  return {
    env: {
      NODE_ENV: 'production',
      VOICE_EVENTS_DEMO_ALLOW_PROD: 'signalthread',
    },
    accountSlug: 'signalthread',
    eventId: null,
    eventName: '[DEMO] Advanced Events Intelligence Showcase',
    hasExplicitName: true,
    hasExplicitSeedKey: true,
    host: 'db.production.example.com',
    ...overrides,
  }
}

describe('Voice Events demo production safety', () => {
  it('blocks production without the exact opt-in', () => {
    expect(() => assertSeedSafety(productionInput({
      env: { NODE_ENV: 'production' },
    }))).toThrow('VOICE_EVENTS_DEMO_ALLOW_PROD=signalthread')
  })

  it('blocks production for the wrong account', () => {
    expect(() => assertSeedSafety(productionInput({ accountSlug: 'events-demo' })))
      .toThrow('--account=signalthread is required')
  })

  it('blocks production without an explicit deterministic seed key', () => {
    expect(() => assertSeedSafety(productionInput({ hasExplicitSeedKey: false })))
      .toThrow('explicit --seed-key=<deterministic key> is required')
  })

  it('blocks production without an explicit event name', () => {
    expect(() => assertSeedSafety(productionInput({ hasExplicitName: false })))
      .toThrow('explicit --name=<event name> is required')
  })

  it('allows the exact SignalThread account and production opt-in', () => {
    expect(assertSeedSafety(productionInput())).toEqual({
      environment: 'production',
      isLocal: false,
    })
  })

  it('does not require Supabase Auth configuration to seed application data', () => {
    expect(assertSeedSafety(productionInput({
      env: {
        NODE_ENV: 'production',
        VOICE_EVENTS_DEMO_ALLOW_PROD: 'signalthread',
        NEXT_PUBLIC_SUPABASE_URL: undefined,
      },
    }))).toEqual({ environment: 'production', isLocal: false })
  })

  it('requires the production event name to be visibly marked as demo or test data', () => {
    expect(() => assertSeedSafety(productionInput({ eventName: 'Advanced Events Intelligence Showcase' })))
      .toThrow('must clearly contain "demo" or "test"')
  })

  it('preserves the remote-development opt-in guard', () => {
    expect(() => assertSeedSafety({
      ...productionInput(),
      env: { NODE_ENV: 'development' },
      accountSlug: 'events-demo',
    })).toThrow('VOICE_EVENTS_DEMO_ALLOW_REMOTE_DEV=true')

    expect(assertSeedSafety({
      ...productionInput(),
      env: { NODE_ENV: 'development', VOICE_EVENTS_DEMO_ALLOW_REMOTE_DEV: 'true' },
      accountSlug: 'events-demo',
    })).toEqual({ environment: 'development', isLocal: false })
  })
})
