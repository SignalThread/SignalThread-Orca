import { describe, expect, it } from 'vitest'
import {
  DEFAULT_EVENT_SIGNAGE_CONFIGURATION,
  DEFAULT_EVENT_SIGNAGE_VISUAL_CONFIGURATION,
  EVENT_SIGNAGE_PRESETS,
  EVENT_SIGNAGE_TEMPLATES,
  LANDSCAPE_SIGN_ASPECT_RATIO,
  PORTRAIT_SIGN_ASPECT_RATIO,
  MINIMUM_PRINTED_QR_SIZE_IN,
  getEventSignageTemplateVisualDefaults,
  isEventSignageLayoutSupported,
  paginateEventSignageItems,
  readEventSignageVisualConfiguration,
  resolveCanonicalQrSignConfiguration,
  resolveEventSignageBranding,
  resolveEventSignagePageLayout,
  resolveEventSignageQrUrl,
  resolveEventSignageViewModel,
  withEventSignageCardsPerPage,
  mergeEventSignageSettings,
  toEventSignageVisualConfiguration,
  withEventSignageVisualConfiguration,
} from './event-signage'

describe('canonical event signage configuration', () => {
  it('exposes three stable production template IDs including the approved Tabletop Sign', () => {
    expect(EVENT_SIGNAGE_PRESETS).toEqual(['tabletop', 'clean', 'bold_event'])
    expect(EVENT_SIGNAGE_TEMPLATES.map(({ id, name }) => ({ id, name }))).toEqual([
      { id: 'tabletop', name: 'Tabletop Sign' },
      { id: 'clean', name: 'Clean QR' },
      { id: 'bold_event', name: 'Bold Event' },
    ])
    expect(DEFAULT_EVENT_SIGNAGE_CONFIGURATION).toMatchObject({
      preset: 'tabletop',
      headline: 'We value your feedback',
      supportingLine: 'Share your thoughts in under 2 minutes.',
      buttonLabel: 'Scan to take the survey',
    })
  })

  it('resolves Event branding before Account branding and neutral fallback', () => {
    expect(resolveEventSignageBranding({
      useEventBranding: true,
      eventBranding: { logoUrl: '/event.svg', primaryColor: '#123456' },
      accountBranding: { logoUrl: '/account.svg', primaryColor: '#abcdef' },
    })).toEqual({ source: 'event', logoUrl: '/event.svg', accentColor: '#123456' })

    expect(resolveEventSignageBranding({ useEventBranding: true })).toEqual({
      source: 'neutral', logoUrl: '/brand/logov2.png', accentColor: '#2563eb',
    })
  })

  it('derives the canonical renderer contract from the designer configuration', () => {
    const configuration = {
      ...DEFAULT_EVENT_SIGNAGE_CONFIGURATION,
      headline: 'A new headline',
      supportingLine: 'A new supporting line',
      buttonLabel: 'Scan this code',
      accent: 'amber' as const,
      useEventBranding: false,
    }
    const viewModel = resolveEventSignageViewModel({
      configuration,
      eventName: 'Summit',
      survey: { id: 'survey-1', name: 'Pulse', eventArea: 'Expo', qrPath: '/kiosk?token=survey-1', availabilityMessage: 'Open' },
      branding: resolveEventSignageBranding({ useEventBranding: false }),
    })

    expect(resolveCanonicalQrSignConfiguration({ viewModel, qrUrl: 'https://example.com/kiosk?token=survey-1' })).toEqual({
      templateId: 'tabletop',
      orientation: 'portrait',
      qrUrl: 'https://example.com/kiosk?token=survey-1',
      headline: 'A new headline',
      supportingText: 'A new supporting line',
      buttonLabel: 'Scan this code',
      primaryColor: '#B45309',
      showLogo: false,
      logoSrc: '/brand/logov2.png',
      footerText: null,
    })
  })

  it('restores the selected template defaults without changing the persisted contract shape', () => {
    expect(getEventSignageTemplateVisualDefaults('clean')).toEqual({
      version: 1,
      preset: 'clean',
      useEventBranding: true,
      logoSource: 'event-branding',
      headline: 'Your feedback matters',
      supportingLine: 'Scan the code to share your experience.',
      buttonLabel: 'Scan to give feedback',
      accent: 'event',
      orientation: 'portrait',
    })
    expect(getEventSignageTemplateVisualDefaults('bold_event').headline).toBe('Tell us what you think')
  })

  it('reads every template ID and migrates the original branded key to Tabletop', () => {
    for (const preset of EVENT_SIGNAGE_PRESETS) {
      const visual = { ...DEFAULT_EVENT_SIGNAGE_VISUAL_CONFIGURATION, preset }
      expect(readEventSignageVisualConfiguration({ qrSignage: visual })?.preset).toBe(preset)
    }
    expect(readEventSignageVisualConfiguration({
      qrSignage: { ...DEFAULT_EVENT_SIGNAGE_VISUAL_CONFIGURATION, preset: 'branded' },
    })?.preset).toBe('tabletop')
  })

  it('keeps survey QR destinations distinct and resolves relative paths safely', () => {
    expect(resolveEventSignageQrUrl('/kiosk?token=survey-a', 'https://voice.signalthread.ai')).toBe('https://voice.signalthread.ai/kiosk?token=survey-a')
    expect(resolveEventSignageQrUrl('/kiosk?token=survey-b', 'https://voice.signalthread.ai')).toBe('https://voice.signalthread.ai/kiosk?token=survey-b')
    expect(resolveEventSignageQrUrl('https://other.example/kiosk?token=survey-c', 'https://voice.signalthread.ai')).toBe('https://other.example/kiosk?token=survey-c')
  })

  it('persists sign orientation with the visual contract without QR or sheet density data', () => {
    const visual = toEventSignageVisualConfiguration({
      ...DEFAULT_EVENT_SIGNAGE_CONFIGURATION,
      headline: 'Shared visual design',
      orientation: 'landscape',
      cardsPerPage: 2,
    })
    expect(visual).toEqual({
      ...DEFAULT_EVENT_SIGNAGE_VISUAL_CONFIGURATION,
      headline: 'Shared visual design',
      orientation: 'landscape',
    })
    expect(visual).not.toHaveProperty('qrUrl')
    expect(visual).not.toHaveProperty('cardsPerPage')
    const settings = mergeEventSignageSettings({ templateRecommendation: { key: 'keep' } }, visual)
    expect(readEventSignageVisualConfiguration(settings)).toEqual(visual)
    expect(settings).toMatchObject({ templateRecommendation: { key: 'keep' } })
  })

  it('combines saved visuals with the current print layout without mutating either', () => {
    const visual = { ...DEFAULT_EVENT_SIGNAGE_VISUAL_CONFIGURATION, headline: 'Saved survey design' }
    const combined = withEventSignageVisualConfiguration({ orientation: 'landscape', cardsPerPage: 2 }, visual)
    expect(combined).toMatchObject({ headline: 'Saved survey design', orientation: 'portrait', cardsPerPage: 2 })
    expect(visual).toEqual({ ...DEFAULT_EVENT_SIGNAGE_VISUAL_CONFIGURATION, headline: 'Saved survey design' })
  })

  it('calculates physical Letter grids for portrait 1, 2, and 4-up sheets', () => {
    expect(resolveEventSignagePageLayout({ orientation: 'portrait', cardsPerPage: 1 })).toMatchObject({
      pageSize: 'letter', pageWidthIn: 8.5, pageHeightIn: 11, columns: 1, rows: 1, isScannerSafe: true,
    })
    expect(resolveEventSignagePageLayout({ orientation: 'portrait', cardsPerPage: 2 })).toMatchObject({
      pageWidthIn: 8.5, pageHeightIn: 11, columns: 1, rows: 2, isScannerSafe: true,
    })
    expect(resolveEventSignagePageLayout({ orientation: 'portrait', cardsPerPage: 4 })).toMatchObject({
      pageWidthIn: 8.5, pageHeightIn: 11, columns: 2, rows: 2, isScannerSafe: true,
    })
  })

  it('fits complete 5:7 portrait and 7:5 landscape signs without stretching', () => {
    for (const input of [
      { orientation: 'portrait' as const, cardsPerPage: 1 as const },
      { orientation: 'portrait' as const, cardsPerPage: 2 as const },
      { orientation: 'portrait' as const, cardsPerPage: 4 as const },
      { orientation: 'landscape' as const, cardsPerPage: 1 as const },
      { orientation: 'landscape' as const, cardsPerPage: 2 as const },
      { orientation: 'landscape' as const, cardsPerPage: 4 as const },
    ]) {
      const layout = resolveEventSignagePageLayout(input)
      expect(layout.signWidthIn / layout.signHeightIn).toBeCloseTo(
        input.orientation === 'portrait' ? PORTRAIT_SIGN_ASPECT_RATIO : LANDSCAPE_SIGN_ASPECT_RATIO,
        10,
      )
      expect(layout.signWidthIn).toBeLessThanOrEqual(layout.cellWidthIn)
      expect(layout.signHeightIn).toBeLessThanOrEqual(layout.cellHeightIn)
    }
  })

  it('paginates deterministically without changing a partial final sheet', () => {
    expect(paginateEventSignageItems(['a'], 1)).toEqual([['a']])
    expect(paginateEventSignageItems(['a', 'b'], 2)).toEqual([['a', 'b']])
    expect(paginateEventSignageItems(['a', 'b', 'c', 'd'], 4)).toEqual([['a', 'b', 'c', 'd']])
    expect(paginateEventSignageItems(['a', 'b', 'c', 'd', 'e'], 4)).toEqual([['a', 'b', 'c', 'd'], ['e']])
  })

  it('keeps one signage configuration object as page density changes', () => {
    const configuration = withEventSignageCardsPerPage(DEFAULT_EVENT_SIGNAGE_CONFIGURATION, 4)
    expect(configuration).toEqual({ ...DEFAULT_EVENT_SIGNAGE_CONFIGURATION, cardsPerPage: 4 })
    expect(configuration.headline).toBe(DEFAULT_EVENT_SIGNAGE_CONFIGURATION.headline)
    expect(configuration.supportingLine).toBe(DEFAULT_EVENT_SIGNAGE_CONFIGURATION.supportingLine)
    expect(configuration.buttonLabel).toBe(DEFAULT_EVENT_SIGNAGE_CONFIGURATION.buttonLabel)
  })

  it('changes both canonical sign ratio and automatically selected paper orientation', () => {
    const portrait = resolveEventSignagePageLayout({ orientation: 'portrait', cardsPerPage: 2 })
    const landscape = resolveEventSignagePageLayout({ orientation: 'landscape', cardsPerPage: 2 })
    expect(portrait).toMatchObject({ pageWidthIn: 8.5, pageHeightIn: 11, paperOrientation: 'portrait', signAspectRatio: PORTRAIT_SIGN_ASPECT_RATIO, columns: 1, rows: 2 })
    expect(landscape).toMatchObject({ pageWidthIn: 11, pageHeightIn: 8.5, paperOrientation: 'landscape', signAspectRatio: LANDSCAPE_SIGN_ASPECT_RATIO, columns: 2, rows: 1 })
  })

  it('recalculates four-up safety from each orientation-specific sign geometry', () => {
    const portraitFour = resolveEventSignagePageLayout({ orientation: 'portrait', cardsPerPage: 4 })
    const landscapeFour = resolveEventSignagePageLayout({ orientation: 'landscape', cardsPerPage: 4 })
    expect(portraitFour.qrSizeIn).toBeGreaterThanOrEqual(MINIMUM_PRINTED_QR_SIZE_IN)
    expect(landscapeFour.qrSizeIn).toBeGreaterThanOrEqual(MINIMUM_PRINTED_QR_SIZE_IN)
    expect(isEventSignageLayoutSupported({ orientation: 'portrait', cardsPerPage: 4 })).toBe(true)
    expect(isEventSignageLayoutSupported({ orientation: 'landscape', cardsPerPage: 4 })).toBe(true)
  })
})
