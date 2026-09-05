import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const agenda = readFileSync('components/events/EventAgendaWorkspace.tsx', 'utf8')
const eventWorkspace = readFileSync('app/app/events/[eventId]/page.tsx', 'utf8')
const templateSurveys = readFileSync('components/events/EventTemplateSurveyWorkspace.tsx', 'utf8')
const deployment = readFileSync('components/events/EventDeploymentWorkspace.tsx', 'utf8')
const surveyPicker = readFileSync('components/events/EventSurveyLibraryPicker.tsx', 'utf8')

describe('Event Workspace status-pill reconciliation', () => {
  it('keeps Agenda session and speaker state in their compact, context-specific rows', () => {
    expect(agenda).toContain('OperationsSearchToolbar entityLabel="sessions"')
    expect(agenda).toContain('OperationsSearchToolbar entityLabel="speakers"')
    expect(agenda).toContain('listening?.survey && <span>{listening.survey.name} · {listening.responseCount} response')
    expect(agenda).toContain("speaker.profileState === 'MISSING_DETAILS' && missingDetailsLabel")
    expect(agenda).toContain('EventSurveyAssignmentControl')
    expect(agenda).toContain("assignedSurvey={listening?.survey ? { ...listening.survey, targetType: 'SESSION', eventId } : null}")
    expect(agenda).not.toContain("import { EventRowStatus } from '@/components/events/EventRowStatus'")
  })

  it('uses the dedicated Event Areas workspace and renders Surveys as survey management', () => {
    expect(eventWorkspace).toContain("import { EventAreasWorkspace } from '@/components/events/EventAreasWorkspace'")
    expect(eventWorkspace).toContain("activeOperationsSection === 'event-areas'")
    expect(eventWorkspace).toContain('<EventAreasWorkspace')
    expect(templateSurveys).toContain('data-testid="survey-management-list"')
    expect(templateSurveys).toContain('aria-label="Assign survey drawer"')
    expect(templateSurveys).toContain('Where do you want to assign this survey?')
    expect(templateSurveys).not.toContain('CoverageStatus')
    expect(eventWorkspace).not.toContain("import { EventRowStatus } from '@/components/events/EventRowStatus'")
  })

  it('keeps deployment rows explicit about active links and response readiness', () => {
    expect(deployment).toContain('function DeploymentRosterRow')
    expect(deployment).toContain('const statusPresentation = deploymentStatusPresentation(survey, status)')
    expect(deployment).toContain('data-testid="deployment-survey-row"')
    expect(deployment).toContain("if (!survey.publicLink.isActive) return { label: 'Inactive', detail: 'Public survey link is inactive'")
    expect(deployment).toContain("if (survey.readiness.responseEligible && survey.availability.state === 'OPEN') return { label: 'Accepting responses'")
    expect(deployment).not.toContain("import { EventRowStatus } from '@/components/events/EventRowStatus'")
  })

  it('routes survey-library lifecycle state through the same renderer instead of a status dot', () => {
    expect(surveyPicker).toContain("import { EventRowStatus } from '@/components/events/EventRowStatus'")
    expect(surveyPicker).toContain('<EventRowStatus statuses={rowActions.statuses} />')
    expect(surveyPicker).not.toContain('statusDot')
  })
})
