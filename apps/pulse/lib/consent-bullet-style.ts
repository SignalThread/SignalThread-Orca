export const CONSENT_BULLET_STYLES = ['CHECKMARK', 'CIRCLE', 'ARROW', 'STAR', 'NONE'] as const

export type ConsentBulletStyle = typeof CONSENT_BULLET_STYLES[number]

export const DEFAULT_CONSENT_BULLET_STYLE: ConsentBulletStyle = 'CHECKMARK'

export const CONSENT_BULLET_STYLE_LABELS: Record<ConsentBulletStyle, string> = {
  CHECKMARK: 'Checkmark',
  CIRCLE: 'Circle',
  ARROW: 'Arrow',
  STAR: 'Star',
  NONE: 'None',
}

const CONSENT_BULLET_GLYPHS: Record<ConsentBulletStyle, string | null> = {
  CHECKMARK: '✓',
  CIRCLE: '○',
  ARROW: '→',
  STAR: '★',
  NONE: null,
}

export function isConsentBulletStyle(value: unknown): value is ConsentBulletStyle {
  return typeof value === 'string' && (CONSENT_BULLET_STYLES as readonly string[]).includes(value)
}

/** Keeps existing consent settings visually compatible when bulletStyle is absent. */
export function normalizeConsentBulletStyle(value: unknown): ConsentBulletStyle {
  return isConsentBulletStyle(value) ? value : DEFAULT_CONSENT_BULLET_STYLE
}

export function getConsentBulletGlyph(value: unknown): string | null {
  return CONSENT_BULLET_GLYPHS[normalizeConsentBulletStyle(value)]
}
