import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const intelligenceSource = fs.readFileSync(path.join(process.cwd(), 'components/events/EventInEventIntelligence.tsx'), 'utf8')
const dashboardSource = fs.readFileSync(path.join(process.cwd(), 'components/admin/Dashboard2.tsx'), 'utf8')
const workspaceSource = fs.readFileSync(path.join(process.cwd(), 'app/app/events/[eventId]/dashboard/page.tsx'), 'utf8')

describe('event Intelligence IA', () => {
  it('uses scope controls without separate top-level session or speaker views', () => {
    expect(workspaceSource).toContain("['event-areas', 'Event Areas']")
    expect(workspaceSource).toContain("['sessions', 'Sessions']")
    expect(workspaceSource).toContain("['speakers', 'Speakers']")
    expect(workspaceSource).not.toContain('Intelligence timeframe')
    expect(workspaceSource).not.toContain("intelligenceTimeframe")
    expect(workspaceSource).not.toContain("['sessions', 'Sessions'],\n              ['speakers', 'Speakers'],")
  })

  it('groups the existing findings into strengths, issues, and future opportunities', () => {
    for (const label of ['Strengths', 'Issues to review', 'Future opportunities']) expect(intelligenceSource).toContain(label)
    expect(dashboardSource).toContain('currentIssues={activeAttentionQueue}')
    expect(dashboardSource).toContain("finding.kind === 'positive'")
    expect(dashboardSource).toContain("finding.classification === 'next-event'")
    expect(dashboardSource).toContain("finding.classification === 'after-event'")
  })

  it('renders findings across action horizons and preserves query-backed scope selection', () => {
    expect(intelligenceSource).toContain('workingFindings.map(renderFinding)')
    expect(intelligenceSource).toContain('immediateItems.map(renderIssue)')
    expect(intelligenceSource).toContain('futureItems.map(renderFinding)')
    expect(workspaceSource).toContain("const intelligenceScope: IntelligenceScope")
    expect(workspaceSource).toContain("query.set('intelligenceScope', scope)")
  })

  it('preserves canonical review-evidence interactions', () => {
    expect(intelligenceSource).toContain('Review evidence')
    expect(intelligenceSource).toContain('selectedThemeKey === finding.evidenceThemeKey')
    expect(intelligenceSource).toContain('selectedIssue?.id === item.id')
    expect(dashboardSource).toContain('findingEvidenceHeading(finding.kind)')
    expect(dashboardSource).toContain('<ThemeEvidencePanel')
  })
})
