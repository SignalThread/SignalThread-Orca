import { readFileSync } from 'fs'
import { describe, expect, it } from 'vitest'
import { filterWorkspaceSurveys, formatSurveyCount, surveyWorkspaceStatus } from './EventTemplateSurveyWorkspace'

const source = readFileSync(new URL('./EventTemplateSurveyWorkspace.tsx', import.meta.url), 'utf8')

const surveys = [
  { id: 'active', name: 'Opening feedback', status: 'ACTIVE', isPaused: false, needsContext: false, questionCount: 1, responseCount: 4, assignment: { kind: 'SESSION', label: 'Session · Opening' }, publicLink: null, deployment: {} },
  { id: 'paused', name: 'Hospitality', status: 'ACTIVE', isPaused: true, needsContext: false, questionCount: 1, responseCount: 2, assignment: { kind: 'AREA', label: 'Area · Lobby' }, publicLink: null, deployment: {} },
  { id: 'draft', name: 'Untitled survey', status: 'DRAFT', isPaused: false, needsContext: true, questionCount: 0, responseCount: 0, assignment: { kind: 'UNASSIGNED', label: 'Unassigned' }, publicLink: null, deployment: {} },
] as never

describe('Advanced Surveys workspace', () => {
  it('pluralizes zero, singular, and multiple counts', () => {
    for (const noun of ['question', 'response', 'session', 'speaker', 'area']) {
      expect(formatSurveyCount(0, noun)).toBe(`0 ${noun}s`)
      expect(formatSurveyCount(1, noun)).toBe(`1 ${noun}`)
      expect(formatSurveyCount(2, noun)).toBe(`2 ${noun}s`)
    }
  })

  it('uses authoritative persisted lifecycle fields for status presentation', () => {
    expect(surveyWorkspaceStatus(surveys[0])).toMatchObject({ label: 'Active' })
    expect(surveyWorkspaceStatus(surveys[1])).toMatchObject({ label: 'Paused' })
    expect(surveyWorkspaceStatus(surveys[2])).toMatchObject({ label: 'Draft' })
  })

  it('filters All, Active, Drafts, and Unassigned and searches title or assignment context', () => {
    expect(filterWorkspaceSurveys(surveys, 'ALL', '').map((survey) => survey.id)).toEqual(['active', 'paused', 'draft'])
    expect(filterWorkspaceSurveys(surveys, 'ACTIVE', '').map((survey) => survey.id)).toEqual(['active'])
    expect(filterWorkspaceSurveys(surveys, 'DRAFTS', '').map((survey) => survey.id)).toEqual(['draft'])
    expect(filterWorkspaceSurveys(surveys, 'UNASSIGNED', '').map((survey) => survey.id)).toEqual(['draft'])
    expect(filterWorkspaceSurveys(surveys, 'ALL', 'lobby').map((survey) => survey.id)).toEqual(['paused'])
  })

  it('maps the approved workspace hierarchy and compact survey-row contract', () => {
    expect(source).toContain('responses collected so far.')
    expect(source).toContain("['ALL', 'All', surveys.length]")
    expect(source).toContain("['ACTIVE', 'Active', summary.active]")
    expect(source).toContain("['DRAFTS', 'Drafts', summary.drafts]")
    expect(source).toContain("['UNASSIGNED', 'Unassigned', summary.unassigned]")
    expect(source).toContain('placeholder="Search surveys"')
    expect(source).toContain('data-testid="survey-management-row"')
    expect(source).toContain('item.assignment.label')
    expect(source).toContain('Needs context')
    expect(source).toContain("previewLoading ? 'Loading…' : 'Preview'")
    expect(source).toContain('>Edit</button>')
    expect(source).toContain('EventRowActionOverflow')
  })

  it('uses the shared compact Events typography roles directly in the list', () => {
    expect(source).toContain('event-workspace-type')
    expect(source).toContain('event-type-page-title')
    expect(source).toContain('event-type-summary')
    expect(source).toContain('event-type-row-title')
    expect(source).toContain('event-type-meta')
    expect(source).toContain('event-type-control')
    expect(source).toContain('event-type-pill')
    expect(source).toContain('min-h-[112px]')
    expect(source).not.toContain('text-[32px]')
    expect(source).not.toContain('text-[19px]')
  })

  it('uses the shared entity-card treatment for each survey', () => {
    expect(source).toContain("import { EventEntityCard, EventEntityListShell } from '@/components/events/EventEntityCard'")
    expect(source).toContain('<EventEntityListShell className="mt-4">')
    expect(source).toContain('<EventEntityCard')
    expect(source).toContain('className="flex min-h-[112px] flex-col gap-4')
  })

  it('uses the shared non-recording attendee experience for Preview', () => {
    expect(source).toContain('advanced-survey-builder?')
    expect(source).toContain('<SurveyQuestionExperience')
    expect(source).toContain('preview />')
    expect(source).toContain('Preview only — responses are not recorded.')
    expect(source).not.toContain("'/api/response/create'")
    expect(source).not.toContain("'/api/answer/text'")
  })

  it('keeps assignment forward-only through one canonical server mutation and confirms response history', () => {
    expect(source).toContain("action: 'SET_SURVEY_DEPLOYMENT'")
    expect(source).toContain('survey.responseCount > 0')
    expect(source).toContain('Changing its assignment will affect future responses only.')
    expect(source).toContain('confirmLabel="Change assignment"')
  })

  it('exposes context-aware menu actions through canonical lifecycle and QR primitives', () => {
    expect(source).toContain("action: 'SET_SURVEY_COLLECTION_STATE'")
    expect(source).toContain("action: 'DUPLICATE_ADVANCED_SURVEY'")
    expect(source).toContain("item.isPaused ? 'Resume collection' : 'Pause collection'")
    expect(source).toContain('<SurveyQrCard')
    expect(source).toContain('Copy kiosk link')
    expect(source).toContain('Download QR')
    expect(source).toContain('canDelete && <SurveyMenuAction destructive')
    expect(source).toContain('title="Delete survey?"')
  })

  it('keeps Delete survey as the final destructive menu action after Download QR', () => {
    const menuBlock = source.match(/<EventRowActionOverflow[\s\S]*?<\/EventRowActionOverflow>/)?.[0] || ''

    expect(menuBlock).toContain('Download QR')
    expect(menuBlock).toContain('destructive')
    expect(menuBlock).toContain('canDelete && <SurveyMenuAction destructive')
    expect(menuBlock).toContain('setPendingDelete(item)')
    expect(menuBlock.indexOf('Download QR')).toBeLessThan(menuBlock.indexOf('canDelete && <SurveyMenuAction destructive'))
    expect(source).toContain("const label = destructive ? 'Delete survey' : children")
    expect(source).toContain('role="separator"')
    expect(source).toContain("const canDelete = item.responseCount === 0")
    expect(source).toContain('confirmLabel="Delete survey"')
    expect(source).toContain('onConfirm={() => { void deleteSurvey() }}')
  })

  it('connects every Survey-card mutation to its existing canonical flow and updates the list state', () => {
    expect(source).toContain('<SurveyMenuAction onClick={() => openAssign(item)}>Change assignment</SurveyMenuAction>')
    expect(source).toContain('const openAssign = (nextSurvey: DeploymentSurvey) =>')
    expect(source).toContain('nextTargets.filter((target) => target.surveyIds.includes(nextSurvey.id)).map((target) => target.id)')
    expect(source).toContain('await performCoverageAction({ action: \'SET_SURVEY_DEPLOYMENT\'')
    expect(source).toContain('survey.responseCount > 0')
    expect(source).toContain('Changing its assignment will affect future responses only.')
    expect(source).toContain('<SurveyMenuAction onClick={() => void duplicateSurvey(item)}>Duplicate</SurveyMenuAction>')
    expect(source).toContain("action: 'DUPLICATE_ADVANCED_SURVEY'")
    expect(source).toContain('await load(); onChanged?.(); if (copy?.id) router.push(editPath(copy.id))')
    expect(source).toContain('setCoverage((current) => current ? { ...current, surveyDeployments: current.surveyDeployments.filter((item) => item.id !== deleted.id) } : current)')
    expect(source).toContain("method: 'DELETE'")
    expect(source).toContain('setError(currentError instanceof Error ? currentError.message : \'Failed to delete survey\')')
  })

  it('keeps the survey overflow menu compact without changing its shared menu behavior', () => {
    expect(source).toContain('!w-[min(20rem,calc(100vw-1rem))]')
    expect(source).toContain('!gap-0')
    expect(source).toContain('!p-2.5')
    expect(source).toContain('h-11 w-full rounded-xl px-5 text-left text-base font-semibold')
    expect(source).not.toContain('!w-[min(26rem,calc(100vw-1rem))]')
    expect(source).not.toContain('px-5 py-3.5 text-left text-[17px]')
  })

  it('keeps assignment inside the existing right-side drawer', () => {
    expect(source).toContain('Assign survey drawer')
    expect(source).toContain('Where do you want to assign this survey?')
    expect(source).toContain("label: 'Overall event'")
    expect(source).toContain("label: 'Sessions'")
    expect(source).toContain("label: 'Speakers'")
    expect(source).toContain("label: 'Event areas'")
    expect(source).toContain("label: 'Custom'")
  })
})
