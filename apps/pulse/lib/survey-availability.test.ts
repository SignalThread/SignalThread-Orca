import { SurveyAvailabilityMode, SurveyAvailabilityOverride } from '@prisma/client'
import { describe, expect, it } from 'vitest'
import { getEventsHomeTimeBucket } from './events-home-groups'
import { resolveSurveyAvailability } from './survey-availability'

const alwaysOpenSurvey = {
  availabilityMode: SurveyAvailabilityMode.OPEN_IMMEDIATELY,
  availabilityTimezone: null,
  availabilityOpensAt: null,
  availabilityClosesAt: null,
  availabilityOpenAnchor: null,
  availabilityCloseAnchor: null,
  availabilityOpenOffsetMinutes: null,
  availabilityCloseOffsetMinutes: null,
  availabilityOverride: null,
}

describe('canonical survey availability', () => {
  it.each([
    '2026-07-31T12:00:00.000Z',
    '2026-08-01T12:00:00.000Z',
    '2026-08-03T12:00:00.000Z',
  ])('keeps an always-open published survey open before, during, and after Event dates (%s)', (now) => {
    expect(resolveSurveyAvailability({ survey: alwaysOpenSurvey, now: new Date(now) })).toMatchObject({
      state: 'OPEN',
      effectiveOpensAt: null,
      effectiveClosesAt: null,
    })
  })

  it('closes an exact survey window at its own close time, independent of the Event lifecycle', () => {
    expect(resolveSurveyAvailability({
      survey: {
        ...alwaysOpenSurvey,
        availabilityMode: SurveyAvailabilityMode.CUSTOM_WINDOW,
        availabilityTimezone: 'America/New_York',
        availabilityOpensAt: new Date('2026-08-01T13:00:00.000Z'),
        availabilityClosesAt: new Date('2026-08-02T13:00:00.000Z'),
      },
      now: new Date('2026-08-03T12:00:00.000Z'),
    })).toMatchObject({ state: 'CLOSED' })
  })

  it('does not infer closure from an Event end date or mutate an always-open setting', () => {
    expect(resolveSurveyAvailability({
      survey: { ...alwaysOpenSurvey, availabilityOverride: SurveyAvailabilityOverride.FORCE_OPEN },
      eventTiming: {
        startsAt: new Date('2026-08-01T13:00:00.000Z'),
        endsAt: new Date('2026-08-02T13:00:00.000Z'),
        timezone: 'America/New_York',
      },
      now: new Date('2026-08-03T12:00:00.000Z'),
    })).toMatchObject({ state: 'OPEN', effectiveClosesAt: null })
  })

  it('keeps Events Home past while the independent always-open survey resolver remains open', () => {
    const now = new Date('2026-08-03T12:00:00.000Z')
    expect(getEventsHomeTimeBucket({
      status: 'COMPLETED',
      isActive: true,
      startDate: new Date('2026-08-01T13:00:00.000Z'),
      endDate: new Date('2026-08-02T13:00:00.000Z'),
      timezone: 'America/New_York',
    }, now)).toBe('past')
    expect(resolveSurveyAvailability({ survey: alwaysOpenSurvey, now })).toMatchObject({ state: 'OPEN' })
  })
})
