import { describe, expect, it } from 'vitest'
import { getAssignedSurveyForEntity } from './survey-target-assignment'

describe('getAssignedSurveyForEntity', () => {
  const eventId = 'event_1'
  const current = (id: string, target: Record<string, unknown>) => ({ id, metadata: { assignmentState: 'CURRENT' }, surveyTarget: { eventId, isActive: true, ...target } })

  it.each([
    ['SESSION', 'session_1', { category: 'SESSION', eventStructureItemId: 'session_1' }],
    ['SPEAKER', 'speaker_1', { category: 'SPEAKER', speakerId: 'speaker_1' }],
    ['AREA', 'area_1', { category: 'LOCATION', eventStructureItemId: 'area_1' }],
  ] as const)('returns the current persisted assignment for a %s entity', (entityType, entityId, target) => {
    const assigned = current(`${entityType.toLowerCase()}_current`, target)
    const superseded = { ...assigned, id: `${entityType.toLowerCase()}_old`, metadata: { assignmentState: 'SUPERSEDED' } }

    expect(getAssignedSurveyForEntity(eventId, entityType, entityId, [superseded, assigned])).toBe(assigned)
  })

  it('never treats a result-only target as an Operations assignment', () => {
    const resultOnly = current('result_only', {
      category: 'SESSION', eventStructureItemId: 'session_1', metadata: { listeningPoint: false, resultScope: 'SESSION' },
    })

    expect(getAssignedSurveyForEntity(eventId, 'SESSION', 'session_1', [resultOnly])).toBeNull()
  })
})
