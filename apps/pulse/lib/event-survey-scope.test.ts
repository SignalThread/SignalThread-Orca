import { describe, expect, it } from 'vitest'
import { isPlannerManagedSurveyTarget, isResultOnlySurveyTargetMetadata } from './event-survey-scope'

describe('event survey scope', () => {
  it('keeps legacy and explicit listening-point targets in planner workflows', () => {
    expect(isPlannerManagedSurveyTarget({ metadata: null })).toBe(true)
    expect(isPlannerManagedSurveyTarget({ metadata: { listeningPoint: true } })).toBe(true)
    expect(isPlannerManagedSurveyTarget({ metadata: { resultScope: 'SESSION' } })).toBe(true)
  })

  it('excludes only explicit result-only session and speaker targets', () => {
    expect(isResultOnlySurveyTargetMetadata({ listeningPoint: false, resultScope: 'SESSION' })).toBe(true)
    expect(isResultOnlySurveyTargetMetadata({ listeningPoint: false, resultScope: 'SPEAKER_ASSIGNMENT' })).toBe(true)
    expect(isResultOnlySurveyTargetMetadata({ listeningPoint: false, resultScope: 'EVENT' })).toBe(false)
  })
})
