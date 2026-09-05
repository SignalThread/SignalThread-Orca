import fs from 'fs'
import path from 'path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { EventSignageSheets, type EventSignageSheetSign } from './EventSignageSheets'
import type { CanonicalQrSignConfiguration } from '@/lib/event-signage'

const compositorSource = fs.readFileSync(path.join(process.cwd(), 'components/events/EventSignageSheets.tsx'), 'utf8')
const workspaceSource = fs.readFileSync(path.join(process.cwd(), 'components/events/EventDeploymentWorkspace.tsx'), 'utf8')
const printPageSource = fs.readFileSync(path.join(process.cwd(), 'app/print/event-signage/page.tsx'), 'utf8')
const canonicalSignSource = fs.readFileSync(path.join(process.cwd(), 'components/events/CanonicalQrSign.tsx'), 'utf8')

const canonicalConfiguration: CanonicalQrSignConfiguration = {
  templateId: 'tabletop',
  orientation: 'portrait',
  qrUrl: 'https://example.com/surveys/one',
  headline: 'We value your feedback',
  supportingText: 'Share your thoughts.',
  buttonLabel: 'Scan to take the survey',
  primaryColor: '#0b2344',
  showLogo: true,
  logoSrc: '/brand/logov2.png',
  footerText: null,
}

function signs(count: number): EventSignageSheetSign[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `survey-${index + 1}`,
    configuration: { ...canonicalConfiguration, qrUrl: `https://example.com/surveys/${index + 1}` },
  }))
}

function renderSheet(count: number, cardsPerPage: 1 | 2 | 4, orientation: 'portrait' | 'landscape' = 'portrait') {
  const orientedSigns = signs(count).map((sign) => ({
    ...sign,
    configuration: { ...sign.configuration, orientation },
  }))
  return renderToStaticMarkup(
    <EventSignageSheets signs={orientedSigns} configuration={{ cardsPerPage, orientation }} mode="print" />,
  )
}

function occurrences(source: string, token: string) {
  return source.split(token).length - 1
}

describe('EventSignageSheets', () => {
  it.each([1, 2, 4] as const)('renders %i complete CanonicalQrSign instances on a full portrait sheet', (cardsPerPage) => {
    const markup = renderSheet(cardsPerPage, cardsPerPage)
    expect(occurrences(markup, 'data-testid="event-signage-page"')).toBe(1)
    expect(occurrences(markup, 'data-testid="canonical-qr-sign"')).toBe(cardsPerPage)
    expect(markup).toContain(`data-sign-count="${cardsPerPage}"`)
  })

  it('uses the physical 8.5:11 and 11:8.5 page aspect ratios', () => {
    expect(renderSheet(1, 1, 'portrait')).toContain('aspect-ratio:8.5 / 11')
    expect(renderSheet(1, 1, 'landscape')).toContain('aspect-ratio:11 / 8.5')
  })

  it('positions portrait four-up as an explicit equal 2 by 2 cell matrix', () => {
    const markup = renderSheet(4, 4, 'portrait')
    expect(markup).toContain('data-row="0" data-column="0"')
    expect(markup).toContain('data-row="0" data-column="1"')
    expect(markup).toContain('data-row="1" data-column="0"')
    expect(markup).toContain('data-row="1" data-column="1"')
    expect(markup).toContain('data-cell-width-in="3.730"')
    expect(markup).toContain('data-cell-height-in="4.980"')
  })

  it.each(['tabletop', 'clean', 'bold_event'] as const)('uses identical compositor geometry for the %s template', (templateId) => {
    const templateSigns = signs(4).map((sign) => ({
      ...sign,
      configuration: { ...sign.configuration, templateId },
    }))
    const markup = renderToStaticMarkup(<EventSignageSheets signs={templateSigns} configuration={{ cardsPerPage: 4, orientation: 'portrait' }} mode="preview" />)
    expect(occurrences(markup, `data-template-id="${templateId}"`)).toBe(4)
    expect(markup).toContain('data-sign-width-in="3.557"')
    expect(markup).toContain('data-sign-height-in="4.980"')
  })

  it('paginates five signs at four per page as 4 + 1 without changing sign scale', () => {
    const markup = renderSheet(5, 4)
    expect(occurrences(markup, 'data-testid="event-signage-page"')).toBe(2)
    expect(markup).toContain('data-sign-count="4"')
    expect(markup).toContain('data-sign-count="1"')
    expect(occurrences(markup, 'data-sign-width-in="3.557"')).toBe(2)
  })

  it('passes every survey-specific QR destination through unchanged', () => {
    const markup = renderSheet(4, 4)
    for (let index = 1; index <= 4; index += 1) {
      expect(markup).toContain(`data-qr-destination="https://example.com/surveys/${index}"`)
    }
  })

  it('does not mutate internal sign configuration between page layouts', () => {
    const before = JSON.stringify(canonicalConfiguration)
    const oneUp = renderToStaticMarkup(<EventSignageSheets signs={[{ id: 'one', configuration: canonicalConfiguration }]} configuration={{ cardsPerPage: 1, orientation: 'portrait' }} mode="preview" />)
    const twoUp = renderToStaticMarkup(<EventSignageSheets signs={[{ id: 'one', configuration: canonicalConfiguration }, { id: 'two', configuration: canonicalConfiguration }]} configuration={{ cardsPerPage: 2, orientation: 'landscape' }} mode="preview" />)
    expect(oneUp).toContain(canonicalConfiguration.headline)
    expect(twoUp).toContain(canonicalConfiguration.headline)
    expect(JSON.stringify(canonicalConfiguration)).toBe(before)
  })

  it('recalculates landscape four-up and renders it when its QR remains scanner-safe', () => {
    const markup = renderSheet(4, 4, 'landscape')
    expect(markup).not.toContain('below the scanner-safe minimum')
    expect(occurrences(markup, 'data-testid="canonical-qr-sign"')).toBe(4)
    expect(markup).toContain('data-sign-orientation="landscape"')
  })

  it('uses the same compositor component and layout contract for preview and print', () => {
    expect(workspaceSource).toContain('<EventSignageSheets signs={signs} configuration={previewConfiguration} mode="preview" />')
    expect(printPageSource).toContain('<EventSignageSheets signs={signs} configuration={payload.pageConfiguration} mode="print" />')
    expect(compositorSource).toContain('<CanonicalQrSign configuration={{ ...sign.configuration, orientation: layout.orientation }} />')
    expect(printPageSource).not.toContain('<CanonicalQrSign')
    expect(printPageSource).toContain('if (initialized.current) return')
  })

  it('scales only the complete orientation-aware sign and owns no internal sign positioning', () => {
    expect(compositorSource).toContain('aspectRatio: String(layout.signAspectRatio)')
    expect(compositorSource).not.toContain('headline')
    expect(compositorSource).not.toContain('buttonLabel')
    expect(compositorSource).not.toContain('QRCodeSVG')
    expect(compositorSource).not.toContain('slot-')
  })

  it('keeps the canonical QR error correction, quiet zone, and contrast unchanged', () => {
    expect(canonicalSignSource).toContain('level="H"')
    expect(canonicalSignSource).toContain('marginSize={4}')
    expect(canonicalSignSource).toContain('bgColor="#FFFFFF"')
    expect(canonicalSignSource).toContain('fgColor="#08111f"')
  })
})
