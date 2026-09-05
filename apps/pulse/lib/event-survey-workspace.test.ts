import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadEventSurveyWorkspacePackage } from './event-survey-workspace'

const legacyQuestions = [
  { id: 'legacy-q1', text: 'What worked best?', order: 0, required: true },
  { key: 'legacy-q2', label: 'What should improve?', order: 1, isRequired: false },
]

const eventRecord = {
  id: 'event_legacy',
  name: 'Legacy Customer Event',
  description: 'Existing customer survey',
  status: 'ACTIVE',
  eventType: 'SURVEY',
  isActive: true,
  startDate: new Date('2026-08-01T12:00:00.000Z'),
  endDate: new Date('2026-08-01T20:00:00.000Z'),
  responseMode: 'VOICE_ONLY',
  ttsProvider: 'google',
  ttsVoice: 'en-US-Neural2-F',
  ttsLocale: 'en-US',
  questionsJson: legacyQuestions,
  questions: [],
  _count: { responses: 4 },
  location: {
    id: 'location_1',
    name: 'Main venue',
    slug: 'main-venue',
    timezone: 'America/New_York',
    account: { accountType: 'EVENTS' },
  },
}

function createDb() {
  return {
    event: { findFirst: vi.fn().mockResolvedValue(eventRecord) },
    survey: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn(),
    },
    surveyTarget: { findMany: vi.fn() },
  }
}

describe('loadEventSurveyWorkspacePackage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('adapts a legacy Event questionsJson survey without writing normalized records', async () => {
    const db = createDb()
    const result = await loadEventSurveyWorkspacePackage('event_legacy', 'account_1', db as never)

    expect(result?.surveySource).toBe('LEGACY_EVENT')
    expect(result?.surveys).toHaveLength(1)
    expect(result?.surveys[0]).toMatchObject({
      id: 'legacy-event:event_legacy',
      name: 'Legacy Customer Event',
      surveyTarget: { category: 'EVENT', name: 'Overall Event' },
      questions: [
        { key: 'legacy-q1', label: 'What worked best?', responseTarget: 'GENERAL' },
        { key: 'legacy-q2', label: 'What should improve?', responseTarget: 'GENERAL' },
      ],
      publicSurveyLinks: [
        { kioskPath: '/kiosk?eventId=event_legacy' },
      ],
      _count: { responses: 4 },
    })
    expect(db.survey.findMany).not.toHaveBeenCalled()
    expect(db.surveyTarget.findMany).not.toHaveBeenCalled()
    expect(Object.keys(db)).toEqual(['event', 'survey', 'surveyTarget'])
  })

  it('uses normalized Survey records when both normalized and legacy data exist', async () => {
    const db = createDb()
    const normalizedSurvey = { id: 'survey_1', questions: [{ id: 'question_1', responseTarget: 'GENERAL' }] }
    db.survey.findFirst.mockResolvedValue({ id: 'survey_1' })
    db.surveyTarget.findMany.mockResolvedValue([{ id: 'target_1', metadata: null }])
    db.survey.findMany.mockResolvedValue([normalizedSurvey])

    const result = await loadEventSurveyWorkspacePackage('event_legacy', 'account_1', db as never)

    expect(result?.surveySource).toBe('NORMALIZED')
    expect(result?.surveys).toEqual([normalizedSurvey])
    expect(result?.surveys[0].id).not.toContain('legacy-event:')
  })

  it('includes unassigned drafts beside assigned surveys in the normalized event collection', async () => {
    const db = createDb()
    const assignedSurvey = { id: 'survey_assigned', surveyTargetId: 'target_1', surveyTarget: { id: 'target_1' }, questions: [] }
    const unassignedDraft = { id: 'survey_unassigned', surveyTargetId: null, surveyTarget: null, status: 'DRAFT', questions: [] }
    db.survey.findFirst.mockResolvedValue({ id: unassignedDraft.id })
    db.surveyTarget.findMany.mockResolvedValue([{ id: 'target_1', metadata: null }])
    db.survey.findMany.mockResolvedValue([assignedSurvey, unassignedDraft])

    const result = await loadEventSurveyWorkspacePackage('event_legacy', 'account_1', db as never)

    expect(db.survey.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        eventId: 'event_legacy',
        OR: [
          { surveyTargetId: null },
          { surveyTargetId: { in: ['target_1'] } },
          { publicSurveyLinks: { some: { surveyTargetId: { in: ['target_1'] } } } },
        ],
      },
    }))
    expect(result?.surveys.map((survey) => survey.id)).toEqual(['survey_assigned', 'survey_unassigned'])
    expect(result?.surveys[1]).toMatchObject({ surveyTargetId: null, surveyTarget: null, status: 'DRAFT' })
  })

  it('returns the legitimate empty state when neither normalized nor valid legacy questions exist', async () => {
    const db = createDb()
    db.event.findFirst.mockResolvedValue({ ...eventRecord, questionsJson: null, questions: [] })

    const result = await loadEventSurveyWorkspacePackage('event_empty', 'account_1', db as never)

    expect(result?.surveySource).toBe('EMPTY')
    expect(result?.surveys).toEqual([])
  })

  it('keeps the account-scoped event lookup authoritative', async () => {
    const db = createDb()
    db.event.findFirst.mockResolvedValue(null)

    await expect(loadEventSurveyWorkspacePackage('event_other', 'account_1', db as never)).resolves.toBeNull()
    expect(db.survey.findFirst).not.toHaveBeenCalled()
  })

  it('retries the normalized read without responseTarget when the rollout column is absent', async () => {
    const db = createDb()
    db.survey.findFirst.mockResolvedValue({ id: 'survey_1' })
    db.surveyTarget.findMany.mockResolvedValue([{ id: 'target_1', metadata: null }])
    db.survey.findMany
      .mockRejectedValueOnce({ code: 'P2022', meta: { column: 'Question.responseTarget' } })
      .mockResolvedValueOnce([{ id: 'survey_1', questions: [{ id: 'question_1', key: 'q1' }] }])

    const result = await loadEventSurveyWorkspacePackage('event_legacy', 'account_1', db as never)

    expect(db.survey.findMany).toHaveBeenCalledTimes(2)
    expect(result?.surveys[0].questions[0]).toMatchObject({ responseTarget: 'GENERAL' })
  })
})
