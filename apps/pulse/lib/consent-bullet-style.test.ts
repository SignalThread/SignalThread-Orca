import { describe, expect, it } from 'vitest'
import {
  CONSENT_BULLET_STYLES,
  DEFAULT_CONSENT_BULLET_STYLE,
  getConsentBulletGlyph,
  normalizeConsentBulletStyle,
} from './consent-bullet-style'

describe('consent bullet styles', () => {
  it('preserves legacy consent settings as checkmarks', () => {
    expect(normalizeConsentBulletStyle(undefined)).toBe(DEFAULT_CONSENT_BULLET_STYLE)
    expect(getConsentBulletGlyph(undefined)).toBe('✓')
  })

  it('resolves every supported bullet style deterministically', () => {
    expect(CONSENT_BULLET_STYLES.map((style) => [style, getConsentBulletGlyph(style)])).toEqual([
      ['CHECKMARK', '✓'],
      ['CIRCLE', '○'],
      ['ARROW', '→'],
      ['STAR', '★'],
      ['NONE', null],
    ])
  })
})
