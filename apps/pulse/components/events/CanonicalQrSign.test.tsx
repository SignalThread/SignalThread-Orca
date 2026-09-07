import fs from 'fs'
import path from 'path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CanonicalQrSign } from './CanonicalQrSign'
import type { CanonicalQrSignConfiguration, EventSignagePreset } from '@/lib/event-signage'

const source = fs.readFileSync(path.join(process.cwd(), 'components/events/CanonicalQrSign.tsx'), 'utf8')

function configuration(templateId: EventSignagePreset, orientation: 'portrait' | 'landscape' = 'portrait', qrUrl = `https://example.com/${templateId}`): CanonicalQrSignConfiguration {
  return {
    templateId,
    orientation,
    qrUrl,
    headline: 'Operator-authored headline',
    supportingText: 'Operator-authored supporting copy',
    buttonLabel: 'Operator-authored CTA',
    primaryColor: '#28439A',
    showLogo: true,
    logoSrc: '/brand/logov2.png',
    footerText: null,
  }
}

describe('CanonicalQrSign templates', () => {
  it.each(['tabletop', 'clean', 'bold_event'] as const)('renders %s through the canonical renderer contract', (templateId) => {
    const markup = renderToStaticMarkup(<CanonicalQrSign configuration={configuration(templateId)} />)
    expect(markup).toContain('data-testid="canonical-qr-sign"')
    expect(markup).toContain(`data-template-id="${templateId}"`)
    expect(markup).toContain(`data-qr-destination="https://example.com/${templateId}"`)
    expect(markup).toContain('Operator-authored headline')
    expect(markup).toContain('Operator-authored supporting copy')
    expect(markup).toContain('Operator-authored CTA')
  })

  it.each(['tabletop', 'clean', 'bold_event'] as const)('renders a deliberate 5:7 portrait and 7:5 landscape %s sign', (templateId) => {
    const portrait = renderToStaticMarkup(<CanonicalQrSign configuration={configuration(templateId, 'portrait')} />)
    const landscape = renderToStaticMarkup(<CanonicalQrSign configuration={configuration(templateId, 'landscape')} />)
    expect(portrait).toContain('data-sign-orientation="portrait"')
    expect(portrait).toContain('aspect-[5/7]')
    expect(landscape).toContain('data-sign-orientation="landscape"')
    expect(landscape).toContain('aspect-[7/5]')
    expect(landscape).toContain('grid-cols-')
    expect(landscape).toContain(`data-qr-destination="https://example.com/${templateId}"`)
  })

  it('uses structurally distinct compositions rather than color-only variants', () => {
    const tabletop = renderToStaticMarkup(<CanonicalQrSign configuration={configuration('tabletop')} />)
    const clean = renderToStaticMarkup(<CanonicalQrSign configuration={configuration('clean')} />)
    const bold = renderToStaticMarkup(<CanonicalQrSign configuration={configuration('bold_event')} />)
    expect(tabletop).toContain('viewBox="0 0 100 28"')
    expect(clean).toContain('rounded-full')
    expect(clean).not.toContain('viewBox="0 0 100 28"')
    expect(bold).toContain('Share your experience')
    expect(bold).toContain('Scan the code')
  })

  it('centralizes scanner-safe QR rendering for every template', () => {
    expect(source.match(/<QRCodeSVG/g)).toHaveLength(1)
    expect(source).toContain('level="H"')
    expect(source).toContain('marginSize={4}')
    expect(source).toContain('bgColor="#FFFFFF"')
    expect(source).toContain('fgColor="#08111f"')
    expect(source).toContain('value={qrUrl}')
  })
})
