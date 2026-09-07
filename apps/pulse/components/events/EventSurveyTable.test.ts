import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const source = fs.readFileSync(path.join(process.cwd(), 'components/events/EventSurveyTable.tsx'), 'utf8')

describe('EventSurveyTable', () => {
  it('uses one shared four-column table grid and compact rows', () => {
    expect(source).toContain("const SURVEY_TABLE_GRID = 'lg:grid-cols-[minmax(0,30fr)_minmax(0,24fr)_minmax(0,26fr)_minmax(12rem,20fr)]'")
    expect(source).toContain('<span>Survey</span><span>Target</span><span>Status &amp; window</span><span className="text-right">Actions</span>')
    expect(source).toContain('min-h-[78px]')
    expect(source).toContain('h-10 w-10')
  })

  it('uses a single non-wrapping, equal-width action rail for launchable and managed surveys', () => {
    expect(source).toContain("const ACTION_RAIL_CLASS = 'grid shrink-0 grid-cols-[10rem_2rem] items-center justify-end gap-2'")
    expect(source).toContain('data-testid="event-survey-action-rail"')
    expect(source).toContain('className="w-40 min-w-40 gap-1.5"')
    expect(source).toContain('className="w-40 min-w-40">Manage</EventRowActionButton>')
    expect(source).toContain('<EventRowActionOverflow label="More survey actions">')
  })

  it('links the survey title and first overflow action to the canonical editor path', () => {
    expect(source).toContain('surveyEditPath: (surveyId: string) => string')
    expect(source).toContain('<a href={editPath}')
    expect(source).toContain('>Edit survey</EventRowActionButton><EventRowActionButton onClick={open}')
    expect(source).toContain('<EventRowActionButton href={editPath} className="w-full justify-start">Edit survey</EventRowActionButton>')
  })

  it('keeps QR, copy, and PNG actions accessible in launchable overflow', () => {
    expect(source).toContain('>View QR</EventRowActionButton>')
    expect(source).toContain("{copied ? 'Copied' : 'Copy link'}")
    expect(source).toContain('>Download PNG</EventRowActionButton>')
  })

  it('maps canonical availability and lifecycle data to compact table status presentations', () => {
    expect(source).toContain("survey.availability.state === 'NOT_YET_OPEN'")
    expect(source).toContain("statusPresentation('Scheduled'")
    expect(source).toContain("statusPresentation('Open'")
    expect(source).toContain("survey.status === 'COMPLETED'")
    expect(source).toContain("statusPresentation('Complete', 'Collection complete'")
  })
})
