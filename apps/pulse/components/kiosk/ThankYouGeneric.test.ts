import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { resolveThankYouGenericViewState } from './ThankYouGeneric'

const thankYouSource = readFileSync('components/kiosk/ThankYouGeneric.tsx', 'utf8')
const summaryPollingSource = readFileSync('lib/hooks/useSummaryPolling.ts', 'utf8')

describe('ThankYouGeneric summary attribution', () => {
  it('labels analysis summaries as AI-generated prose instead of attendee quotations', () => {
    expect(summaryPollingSource).toContain('.map((answer) => answer.analysis?.summary)')
    expect(thankYouSource).toContain('AI-generated feedback summary')
    expect(thankYouSource).toContain('>{finalSummary}</p>')
    expect(thankYouSource).not.toContain('&ldquo;')
    expect(thankYouSource).not.toContain('&rdquo;')
  })

  it('does not use quotation markup when no verified verbatim field is provided', () => {
    expect(thankYouSource).not.toContain('<blockquote')
    expect(thankYouSource).not.toContain('<q')
    expect(thankYouSource).not.toContain('transcript')
  })

  it('shows the regular confirmation card when polling completes without an analysable answer', () => {
    expect(resolveThankYouGenericViewState('success', null)).toBe('confirmation')
    expect(resolveThankYouGenericViewState('loading', null)).toBe('loading')
    expect(resolveThankYouGenericViewState('success', 'A concise synopsis.')).toBe('summary')
    expect(resolveThankYouGenericViewState('error', null)).toBe('error')
  })
})
