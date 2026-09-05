import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('components/events/EventSurveyRowActions.tsx', 'utf8')

describe('EventSurveyRowActions', () => {
  it('keeps all six deployment actions in one compact icon-only row', () => {
    expect(source).toContain('data-testid="survey-row-actions"')
    expect(source).toContain('flex-nowrap')
    expect(source).toContain('justify-end')
    expect(source).toContain('whitespace-nowrap')
    expect(source).toContain('h-8 w-8')
    expect(source).toContain('Open kiosk')
    expect(source).toContain('View QR')
    expect(source).toContain('Copy link')
    expect(source).toContain('Download PNG')
    expect(source).toContain('Design')
    expect(source).toContain('Print')
  })

  it('uses the shared focusable tooltip with matching accessible labels for every icon action', () => {
    expect(source).toContain("import { InfoTooltip } from '@/components/ui/InfoTooltip'")
    expect(source.match(/<InfoTooltip/g)).toHaveLength(6)
    for (const label of ['Open kiosk', 'View QR', 'Copy link', 'Download PNG', 'Design', 'Print']) {
      expect(source).toContain(`content="${label}"`)
      expect(source).toContain(`ariaLabel="${label}"`)
    }
  })

  it('preserves kiosk, QR, copy, PNG, design, and print callbacks without overflow duplication', () => {
    expect(source).toContain('onAction={openQr}')
    expect(source).toContain('onAction={() => void copyLink()}')
    expect(source).toContain('href={kioskPath}')
    expect(source).toContain('onAction={() => void downloadPng()}')
    expect(source).toContain('onAction={onDesign}')
    expect(source).toContain('onAction={onPrint}')
    expect(source).toContain('Download className')
    expect(source).not.toContain('More survey actions')
    expect(source).not.toContain('EventRowActionButton')
  })
})
