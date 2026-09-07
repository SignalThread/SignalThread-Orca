import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const source = fs.readFileSync(path.join(process.cwd(), 'components/events/EventRawResponsesWorkspace.tsx'), 'utf8')

describe('EventRawResponsesWorkspace', () => {
  it('keeps the browser evidence-first with only the requested filters', () => {
    for (const label of ['Search transcripts', 'Scope', 'Survey', 'Question', 'Sentiment', 'Browse evidence']) expect(source).toContain(label)
    expect(source).not.toContain('Evidence strength')
    expect(source).not.toContain('Saved filters')
  })

  it('does not repeat the selected top-level tab name as a local heading', () => {
    expect(source).not.toContain('>Raw Responses</h2>')
    expect(source).toContain('>Browse evidence</h2>')
  })

  it('groups scope and categorical filters into one compact toolbar, then keeps search and date range together', () => {
    expect(source).toContain('data-testid="raw-response-filters"')
    expect(source).toContain('data-testid="raw-response-filter-categories"')
    expect(source).toContain("[['event-areas', 'Event Areas'], ['sessions', 'Sessions'], ['speakers', 'Speakers']]")
    expect(source).toContain('md:grid-cols-3 xl:grid-cols-[minmax(215px,1.2fr)_minmax(135px,.75fr)_minmax(180px,1fr)_minmax(150px,.9fr)_minmax(140px,.8fr)]')
    expect(source).toContain('data-testid="raw-response-date-range"')
    expect(source).toContain('<EventDateRangePicker')
    expect(source).toContain('md:grid-cols-[minmax(0,1fr)_auto_auto]')
    expect(source).not.toContain('type="date"')
  })

  it('loads paginated list data and lazily fetches detail for the drawer', () => {
    expect(source).toContain("raw-responses?${query}")
    expect(source).toContain("raw-responses/${encodeURIComponent(answerId)}")
    expect(source).toContain("pageSize: '25'")
    expect(source).toContain('Showing {data.pagination.from}–{data.pagination.to} of {data.pagination.total}')
    expect(source).toContain('raw-response-drawer')
    expect(source).toContain("params.set('eventStructureItemId', eventStructureItemId)")
    expect(source).toContain("params.set('structureKind', structureKind)")
    expect(source).toContain("params.set('surveyId', surveyId)")
  })

  it('uses the shared two-line full-text treatment for question and answer cells without changing the row drilldown', () => {
    expect(source).toContain("import { TruncatedTableText } from './TruncatedTableText'")
    expect(source).toContain('<TruncatedTableText className="text-xs font-semibold leading-5 text-slate-700">{row.question.label}</TruncatedTableText>')
    expect(source).toContain("row.answerType === 'STRUCTURED'")
    expect(source).toContain('{row.answerDisplay}</TruncatedTableText>')
    expect(source).toContain('grid-cols-[110px_150px_170px_minmax(240px,1fr)_110px_160px_36px]')
    expect(source).toContain('onClick={() => void openAnswer(row.id)}')
    expect(source).not.toContain('<span className="truncate text-xs font-semibold text-slate-700">{row.question.label}</span>')
  })

  it('keeps exact transcript, analysis, linked findings, and response context together in the drawer', () => {
    for (const label of ['Full transcript', 'Answer summary', 'Linked intelligence', 'Other answers from this response']) expect(source).toContain(label)
    expect(source).toContain('openAnswer(answer.id)')
    expect(source).toContain('Recorded answer')
    expect(source).toContain('{answer.answerDisplay}</span>')
  })
})
