import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('components/events/PreCreationAgendaWorkspace.tsx', 'utf8')

describe('pre-creation agenda review workspace', () => {
  it('owns mapping and review before the final Create Event mutation', () => {
    expect(source).toContain('Adjust interpretation')
    expect(source).toContain('Nothing has been created yet.')
    expect(source).toContain('Source preview')
    expect(source).toContain('Review agenda')
    expect(source).toContain('Review agenda</h1>')
    expect(source).toContain("busy ? 'Creating Event…' : 'Create Event'")
    expect(source).not.toContain('Confirm ${counts.ready} sessions')
  })

  it('preserves mapping controls, review statuses, corrections, and discard actions', () => {
    expect(source).toContain('onDraftChange({')
    expect(source).toContain('...draft.mapping,')
    expect(source).toContain('Change mapping')
    expect(source).toContain('Discard import')
    expect(source).toContain("['Ready', counts.ready")
    expect(source).toContain("['Needs review', counts.needsReview")
    expect(source).toContain("['Invalid', counts.invalid")
    expect(source).toContain("accepted.has(row.id)")
    expect(source).toContain("skipped.has(row.id)")
    expect(source).toContain('Resolve or skip')
  })

  it('keeps the mapping tool compact without changing its mapping or preview controls', () => {
    expect(source).toContain('max-w-5xl pb-8')
    expect(source).toContain('p-4 shadow-sm sm:p-6')
    expect(source).toContain('md:grid-cols-[minmax(0,1fr)_auto_220px]')
    expect(source).toContain('h-9 w-full rounded-lg')
    expect(source).toContain('px-3 py-2.5 text-slate-700')
    expect(source).toContain("worksheet?.rows.slice(0, 5)")
  })
})
