import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { resolveEventRowActions } from '@/lib/event-row-actions'
import { EventRowStatus } from './EventRowStatus'

const source = readFileSync('components/events/EventRowStatus.tsx', 'utf8')

describe('EventRowStatus', () => {
  it('renders only the resolver-selected pills and exposes remaining states through +n', () => {
    expect(source).toContain('visibleStatuses.map')
    expect(source).toContain('statuses.additionalCount > 1')
    expect(source).toContain('statuses.additionalCount === 1')
    expect(source).toContain('Show ${statuses.additionalCount} additional status')
    expect(source).toContain('statuses.hidden.map')
    expect(source).toContain('role="tooltip"')
  })

  it.each([
    ['MISSING_DETAILS', 'MISSING DETAILS', 'bg-[#FEF3F2]', 'text-[#B42318]'],
    ['TIME_CONFLICT', 'TIME CONFLICT', 'bg-[#FEF6E7]', 'text-[#9A5B00]'],
    ['DRAFT', 'DRAFT', 'bg-[#F1F4F9]', 'text-[#5B6880]'],
  ] as const)('renders %s through the exact shared filled pill', (id, label, background, foreground) => {
    const statuses = resolveEventRowActions({ statusIds: [id], survey: 'active', surveysAvailable: true }).statuses
    const markup = renderToStaticMarkup(createElement(EventRowStatus, { statuses }))

    expect(markup).toContain(label)
    expect(markup).toContain(background)
    expect(markup).toContain(foreground)
    expect(markup).toContain('h-8')
    expect(markup).toContain('rounded-md')
    expect(markup).toContain('tracking-[0.12em]')
  })

  it('renders one main-workspace pill with a compact +n control only for three or more states', () => {
    const statuses = resolveEventRowActions({
      statusIds: ['DRAFT', 'TIME_CONFLICT', 'MISSING_DETAILS'],
      survey: 'active',
      surveysAvailable: true,
    }).statuses
    const markup = renderToStaticMarkup(createElement(EventRowStatus, { statuses }))

    expect(markup.match(/MISSING DETAILS/g)).toHaveLength(1)
    expect(markup).toContain('+2')
    expect(markup).toContain('border-slate-200')
  })

  it('renders two actual status pills rather than +1 for exactly two states', () => {
    const statuses = resolveEventRowActions({
      statusIds: ['MISSING_DETAILS', 'DRAFT'],
      survey: 'active',
      surveysAvailable: true,
    }).statuses
    const markup = renderToStaticMarkup(createElement(EventRowStatus, { statuses }))

    expect(markup).toContain('MISSING DETAILS')
    expect(markup).toContain('DRAFT')
    expect(markup).not.toContain('+1')
  })

  it('defensively expands a stale one-hidden-status summary instead of rendering +1', () => {
    const statuses = resolveEventRowActions({
      statusIds: ['MISSING_DETAILS', 'DRAFT'],
      survey: 'active',
      surveysAvailable: true,
    }).statuses
    const staleSummary = { ...statuses, visible: [statuses.visible[0]], hidden: [statuses.visible[1]], additionalCount: 1, maxPills: 1 }
    const markup = renderToStaticMarkup(createElement(EventRowStatus, { statuses: staleSummary }))

    expect(markup).toContain('MISSING DETAILS')
    expect(markup).toContain('DRAFT')
    expect(markup).not.toContain('+1')
  })
})
