import { describe, expect, it } from 'vitest'
import {
  AccountProductModeError,
  getAccountProductMode,
  isEventsAccount,
  isRetailAccount,
  requireEventsAccountType,
} from './account-product-mode'

describe('account product mode', () => {
  it('treats only EVENTS as event mode', () => {
    expect(getAccountProductMode('EVENTS')).toBe('events')
    expect(getAccountProductMode('events')).toBe('events')
    expect(isEventsAccount('EVENTS')).toBe(true)
  })

  it('defaults missing and unknown account types to retail-safe mode', () => {
    for (const value of ['RETAIL', 'HOSPITALITY', 'EVENT', 'UNKNOWN', '', null, undefined]) {
      expect(getAccountProductMode(value)).toBe('retail')
      expect(isRetailAccount(value)).toBe(true)
      expect(isEventsAccount(value)).toBe(false)
    }
  })

  it('throws a reusable product-mode error for non-EVENTS-only features', () => {
    expect(() => requireEventsAccountType('EVENTS')).not.toThrow()
    for (const value of ['RETAIL', 'HOSPITALITY', 'EVENT', 'UNKNOWN', '', null, undefined]) {
      expect(() => requireEventsAccountType(value, 'Events only')).toThrow(AccountProductModeError)
      expect(() => requireEventsAccountType(value, 'Events only')).toThrow('Events only')
    }
  })
})
