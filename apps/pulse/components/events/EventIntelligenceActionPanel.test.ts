import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('components/events/EventIntelligenceActionPanel.tsx', 'utf8')

describe('EventIntelligenceActionPanel', () => {
  it('uses the canonical actions API instead of cluster owner or status as action state', () => {
    expect(source).toContain('data.actions.find')
    expect(source).toContain('human can turn this into an action')
    expect(source).toContain('Create action')
    expect(source).not.toContain('Linked follow-up')
  })

  it('uses the shared compact human composer without reintroducing legacy workflow fields', () => {
    expect(source).toContain('EventActionComposer')
    expect(source).toContain('source={{ clusterId: finding.id')
    expect(source).toContain('Open action')
    expect(source).not.toContain('Create another action')
    expect(source).not.toContain('Classification')
  })
})
