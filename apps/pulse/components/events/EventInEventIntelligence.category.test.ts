import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const source = fs.readFileSync(
  path.join(process.cwd(), 'components/events/EventInEventIntelligence.tsx'),
  'utf8',
)

describe('EventInEventIntelligence action-horizon visibility', () => {
  it('shows current and future evidence together instead of selecting a timeframe bucket', () => {
    expect(source).toContain('workingFindings.map(renderFinding)')
    expect(source).toContain('immediateItems.map(renderIssue)')
    expect(source).toContain('futureItems.map(renderFinding)')
    expect(source).not.toContain('resolveIntelligenceTimeframe')
    expect(source).not.toContain('showImmediate')
  })
})
