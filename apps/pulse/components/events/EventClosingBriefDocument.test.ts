import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const source = fs.readFileSync(path.join(process.cwd(), 'components/events/EventClosingBriefDocument.tsx'), 'utf8')

describe('EventClosingBriefDocument', () => {
  it('renders a dedicated document with the canonical brand typography and report structure', () => {
    expect(source).toContain('data-testid="closing-brief-document"')
    expect(source).toContain('font-brand')
    for (const heading of ['Event Intelligence Brief', 'Executive summary', 'The verdict', 'Key findings', 'Recommendations']) {
      expect(source).toContain(heading)
    }
    expect(source).toContain('brief.editorial.copy.executiveSummary')
    expect(source).toContain('brief.editorial.copy.keyTakeaway')
    expect(source).toContain('findingNarratives.get(finding.id) || finding.statement')
    expect(source).toContain('grid-cols-[8px_minmax(0,1fr)]')
    expect(source).toContain('h-1.5 w-1.5 rounded-full bg-slate-400')
    expect(source).not.toContain('Representative attendee feedback')
  })

  it('uses document-only letter print rules and excludes browser-only controls from the PDF', () => {
    expect(source).toContain('@page { size: letter; margin: 0.58in 0.62in 0.68in; }')
    expect(source).toContain('[data-brief-document-controls] { display: none !important; }')
    expect(source).toContain('break-inside: avoid; page-break-inside: avoid;')
    expect(source).toContain('data-brief-document-controls')
    expect(source).toContain('pdfHref')
    expect(source).toContain('EventBriefPdfDownloadButton')
    expect(source).not.toContain('window.print()')
    expect(source).not.toContain('Review evidence')
    expect(source).not.toContain('Open Intelligence')
    expect(source).not.toContain('Hide evidence')
  })
})
