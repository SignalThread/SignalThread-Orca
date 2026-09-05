import { describe, expect, it } from 'vitest'
import { resolveEventRowActions } from './event-row-actions'

describe('resolveEventRowActions', () => {
  it('caps a dense main workspace row at NO ROOM +2', () => {
    const actions = resolveEventRowActions({
      blockers: ['Missing room'],
      attention: ['Time conflict'],
      survey: 'draft',
      surveysAvailable: true,
    })

    expect(actions.primary).toMatchObject({ id: 'complete-setup' })
    expect(actions.statuses).toMatchObject({
      maxPills: 1,
      visible: [{ id: 'NO_ROOM', label: 'NO ROOM', tone: 'blocking' }],
      additionalCount: 2,
    })
    expect(actions.statuses.hidden.map((status) => status.id)).toEqual(['TIME_CONFLICT', 'DRAFT'])
  })

  it('ranks Blocking above Attention above Lifecycle independent of caller order', () => {
    const actions = resolveEventRowActions({
      statusIds: ['DRAFT', 'LOW_RESPONSE', 'MISSING_DETAILS', 'TIME_CONFLICT'],
      survey: 'active',
      surveysAvailable: true,
    })

    expect(actions.statuses.all.map((status) => status.id)).toEqual([
      'MISSING_DETAILS',
      'TIME_CONFLICT',
      'LOW_RESPONSE',
      'DRAFT',
    ])
    expect(actions.statuses.visible.map((status) => status.id)).toEqual(['MISSING_DETAILS'])
    expect(actions.statuses.additionalCount).toBe(3)
  })

  it('shows both actual status pills for exactly two main-row states and never produces +1', () => {
    const actions = resolveEventRowActions({
      statusIds: ['DRAFT', 'MISSING_DETAILS'],
      survey: 'active',
      surveysAvailable: true,
    })

    expect(actions.statuses.maxPills).toBe(2)
    expect(actions.statuses.visible.map((status) => status.id)).toEqual(['MISSING_DETAILS', 'DRAFT'])
    expect(actions.statuses.additionalCount).toBe(0)
    expect(actions.statuses.hidden).toEqual([])
  })

  it('suppresses a directly remedied state before applying the display cap', () => {
    const actions = resolveEventRowActions({
      statusIds: ['MISSING_DETAILS', 'DRAFT'],
      remediedStatusIds: ['MISSING_DETAILS'],
      survey: 'active',
      surveysAvailable: true,
    })

    expect(actions.statuses.visible.map((status) => status.id)).toEqual(['DRAFT'])
    expect(actions.statuses.additionalCount).toBe(0)
  })

  it('keeps the approved lifecycle pill visible beside its primary action', () => {
    const actions = resolveEventRowActions({ survey: 'draft', surveysAvailable: true })

    expect(actions.primary).toMatchObject({ id: 'finish-survey' })
    expect(actions.statuses.visible).toEqual([{ id: 'DRAFT', label: 'DRAFT', tone: 'lifecycle' }])
  })

  it('does not create pills for healthy or non-inventory states', () => {
    expect(resolveEventRowActions({ survey: 'active', surveysAvailable: true }).statuses.all).toEqual([])
    expect(resolveEventRowActions({ attention: ['Possible duplicate'], survey: 'active', surveysAvailable: true }).statuses.all).toEqual([])
  })

  it('treats informational missing metadata as a warning instead of a blocker', () => {
    const actions = resolveEventRowActions({ blockers: ['Missing info'], survey: 'none', surveysAvailable: true })

    expect(actions.primary).toMatchObject({ id: 'attach-survey' })
    expect(actions.statuses.visible).toEqual([{ id: 'MISSING_INFO', label: 'MISSING INFO', tone: 'attention' }])
  })

  it('allows detail and Needs Attention variants to render every remaining status explicitly', () => {
    for (const variant of ['detail', 'needs-attention'] as const) {
      const actions = resolveEventRowActions({
        statusIds: ['NO_ROOM', 'TIME_CONFLICT', 'DRAFT'],
        survey: 'active',
        surveysAvailable: true,
        variant,
      })

      expect(actions.statuses.maxPills).toBe(3)
      expect(actions.statuses.visible.map((status) => status.id)).toEqual(['NO_ROOM', 'TIME_CONFLICT', 'DRAFT'])
      expect(actions.statuses.additionalCount).toBe(0)
    }
  })

  it('keeps the one-primary, one-secondary, and overflow grammar for every row', () => {
    const actions = resolveEventRowActions({ blockers: ['Missing room'], survey: 'none', surveysAvailable: true })
    expect(actions.primary).toMatchObject({ id: 'complete-setup' })
    expect(actions.secondary).toEqual({ id: 'edit', label: 'Edit' })
    expect(actions.overflow).toBe(true)
  })
})
