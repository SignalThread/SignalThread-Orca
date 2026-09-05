import { describe, expect, it, vi } from 'vitest'
import { applyAdvancedSurveyBuilderSnapshot, buildAdvancedSurveyBuilderSnapshot } from './advanced-survey-builder-snapshot'

function surveySnapshot(overrides: Record<string, unknown> = {}) {
  return {
    id: 'survey_1',
    status: 'DRAFT',
    _count: { responses: 0 },
    review: { issues: [] },
    publicSurveyLinks: [{
      surveyTarget: {
        id: 'target_1',
        category: 'SESSION',
        name: 'Opening Keynote',
        eventStructureItemId: 'session_1',
        eventStructureItem: {
          id: 'session_1',
          name: 'Opening Keynote',
          startsAt: '2026-08-31T09:00:00.000Z',
          endsAt: '2026-08-31T10:00:00.000Z',
          timezone: 'America/New_York',
          speakerAssignments: [{ speaker: { id: 'speaker_1', name: 'Alex Rivera', title: 'CEO', organization: 'Pulse' } }],
        },
      },
    }],
    ...overrides,
  }
}

describe('Advanced Survey builder server snapshots', () => {
  it('does not write state for an unchanged server snapshot', () => {
    const snapshot = buildAdvancedSurveyBuilderSnapshot(surveySnapshot())!
    const write = vi.fn()
    const first = applyAdvancedSurveyBuilderSnapshot(null, snapshot, write)
    const second = applyAdvancedSurveyBuilderSnapshot(first.fingerprint, snapshot, write)

    expect(first.applied).toBe(true)
    expect(second.applied).toBe(false)
    expect(write).toHaveBeenCalledTimes(1)
  })

  it('writes new assignment targets and session speakers when the server snapshot changes', () => {
    const firstSnapshot = buildAdvancedSurveyBuilderSnapshot(surveySnapshot())!
    const nextSnapshot = buildAdvancedSurveyBuilderSnapshot(surveySnapshot({
      publicSurveyLinks: [{
        surveyTarget: {
          id: 'target_2',
          category: 'SESSION',
          name: 'Closing Session',
          eventStructureItemId: 'session_2',
          eventStructureItem: {
            id: 'session_2',
            name: 'Closing Session',
            startsAt: '2026-08-31T16:00:00.000Z',
            endsAt: '2026-08-31T17:00:00.000Z',
            timezone: 'America/New_York',
            speakerAssignments: [{ speaker: { id: 'speaker_2', name: 'Sam Lee', title: 'Host', organization: 'Pulse' } }],
          },
        },
      }],
    }))!
    const write = vi.fn()
    const first = applyAdvancedSurveyBuilderSnapshot(null, firstSnapshot, write)
    const second = applyAdvancedSurveyBuilderSnapshot(first.fingerprint, nextSnapshot, write)

    expect(second.applied).toBe(true)
    expect(write).toHaveBeenCalledTimes(2)
    expect(write).toHaveBeenLastCalledWith(expect.objectContaining({
      assignmentTargets: [expect.objectContaining({ id: 'target_2', name: 'Closing Session' })],
      sessionSpeakers: [expect.objectContaining({ id: 'speaker_2', name: 'Sam Lee' })],
    }))
  })

  it('rehydrates an All sessions bulk rule and every concrete target after reload', () => {
    const publicSurveyLinks = ['a', 'b', 'c'].map((suffix) => ({
      metadata: { assignmentState: 'CURRENT', advancedAssignment: { kind: 'SESSION', selection: 'ALL' } },
      surveyTarget: {
        id: `target_${suffix}`,
        category: 'SESSION',
        name: `Session ${suffix.toUpperCase()}`,
        eventStructureItemId: `session_${suffix}`,
        eventStructureItem: {
          id: `session_${suffix}`,
          name: `Session ${suffix.toUpperCase()}`,
          startsAt: null,
          endsAt: null,
          timezone: 'America/New_York',
          speakerAssignments: [{ speaker: { id: `speaker_${suffix}`, name: `Speaker ${suffix.toUpperCase()}`, isArchived: false } }],
        },
      },
    }))

    const snapshot = buildAdvancedSurveyBuilderSnapshot(surveySnapshot({ publicSurveyLinks }))!

    expect(snapshot.assignmentTargets.map((target) => target.id)).toEqual(['target_a', 'target_b', 'target_c'])
    expect(snapshot.assignmentSpecs).toEqual([{ kind: 'SESSION', selection: 'ALL' }])
  })
})
