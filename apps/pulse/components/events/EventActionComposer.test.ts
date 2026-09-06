import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { resolveEventActionSource } from './EventActionComposer'

const source = readFileSync('components/events/EventActionComposer.tsx', 'utf8')
const duringOverviewSource = readFileSync('components/events/EventInEventOverview.tsx', 'utf8')
const duringIntelligenceSource = readFileSync('components/events/EventInEventIntelligence.tsx', 'utf8')
const sessionSource = readFileSync('components/events/EventSessionsIntelligence.tsx', 'utf8')
const speakerSource = readFileSync('components/events/EventSpeakersIntelligence.tsx', 'utf8')
const postSource = readFileSync('components/events/EventPostEventClosingBrief.tsx', 'utf8')
const preSource = readFileSync('components/events/EventPreEventSignals.tsx', 'utf8')

describe('shared event intelligence action affordance', () => {
  it('reserves a fixed action slot with no layout shift', () => {
    expect(source).toContain("actionSlotAlign = 'top'")
    expect(source).toContain("centeredControls ? 'items-center' : 'items-start'")
    expect(source).toContain("'mt-0.5 self-start '")
    expect(source).toContain('flex size-7 shrink-0 items-center justify-center')
  })

  it('reveals the During plus on hover or keyboard focus', () => {
    expect(source).toContain('opacity-0 pointer-events-none')
    expect(source).toContain('group-hover/actionable:pointer-events-auto')
    expect(source).toContain('group-focus-within/actionable:pointer-events-auto')
    expect(duringOverviewSource).toContain('<EventActionableItem')
    expect(duringIntelligenceSource).toContain('<EventActionableItem')
  })

  it('reveals the Post plus through the same shared primitive', () => {
    expect(postSource).toContain('<EventActionableItem')
    expect(postSource).toContain('actioned={actionReference.actioned}')
  })

  it('opens the shared compact composer when the plus is clicked', () => {
    expect(source).toContain('onCreate={() => { if (!isActioned) setOpen(true) }}')
    expect(source).toContain("data-testid=\"event-action-compact-composer\"")
    expect(source).toContain('<EventActionComposer compact')
    expect(source).toContain("{actioned ? '✓' : '+'}")
  })

  it('uses EventActionableItem in During, Post, session, and speaker finding rows while retaining Pre', () => {
    expect(duringOverviewSource).toContain('<EventActionableItem')
    expect(duringIntelligenceSource).toContain('<EventActionableItem')
    expect(sessionSource).toContain('<EventActionableItem')
    expect(speakerSource).toContain('<EventActionableItem')
    expect(postSource).toContain('<EventActionableItem')
    expect(preSource).toContain('<EventActionableItem')
  })

  it('wires every Keep, Improve, Revisit, and Verdict item through the shared resolver', () => {
    expect(duringOverviewSource).toContain('return <EventActionableItem key={item.key}')
    expect(duringOverviewSource).toContain('clusterId: item.clusterId')
    expect(duringOverviewSource).toContain('themeKeys: item.themeKeys')
    expect(postSource).toContain('brief.whatWorked.slice(0, 4).map((item) =>')
    expect(postSource).toContain('brief.friction.slice(0, 4).map((item) =>')
    expect(postSource).toContain('nextEventItems.slice(0, 4).map((item) =>')
    expect(postSource).toContain('clusterId: item.clusterId')
  })

  it('resolves the exact canonical cluster relation and renders linked actions as actioned', () => {
    const action = { id: 'cluster_1', title: 'Fix signage', summary: null, taxonomyKey: 'wayfinding', actionStatus: 'OPEN' }
    const exact = resolveEventActionSource(
      { actions: [action], availableFindings: [] },
      { clusterId: 'cluster_1', title: 'Venue signs need review', themeKeys: ['wayfinding'] },
    )
    const taxonomy = resolveEventActionSource(
      { actions: [action], availableFindings: [] },
      { title: 'Venue signs need review', themeKeys: ['wayfinding'] },
    )

    expect(exact).toMatchObject({ source: { clusterId: 'cluster_1' }, actioned: true })
    expect(taxonomy).toMatchObject({ source: { clusterId: 'cluster_1' }, actioned: true })
  })

  it('links an unconverted finding to its canonical cluster without claiming AI created an action', () => {
    const result = resolveEventActionSource(
      {
        actions: [],
        availableFindings: [{ id: 'cluster_2', title: 'Registration queues', summary: null, taxonomyKey: 'access_checkin' }],
      },
      { title: 'Registration queues need attention', themeKeys: ['access_checkin'] },
    )

    expect(result).toEqual({
      source: { clusterId: 'cluster_2', title: 'Registration queues need attention', evidenceLabel: undefined },
      actioned: false,
    })
    expect(source).toContain("...(source?.clusterId ? { clusterId: source.clusterId } : {})")
  })
})
