import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('components/events/EventIntelligenceActionPanel.tsx', 'utf8')

describe('EventIntelligenceActionPanel', () => {
  it('uses the canonical actions API instead of cluster owner or status as action state', () => {
    expect(source).toContain('data.actions.find')
    expect(source).toContain('No action has been created')
    expect(source).toContain('Create action')
    expect(source).not.toContain('Linked follow-up')
  })

  it('offers only one conversion and sends editable fields through the canonical endpoint', () => {
    expect(source).toContain('title,')
    expect(source).toContain("operation: 'ASSIGN'")
    expect(source).toContain('ownerUserId, idempotencyKey: idempotencyKey()')
    expect(source).toContain('initialUpdate')
    expect(source).toContain('Open action')
    expect(source).not.toContain('Create another action')
  })
})
