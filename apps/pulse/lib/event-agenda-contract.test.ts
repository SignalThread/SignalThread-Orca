import { describe, expect, it } from 'vitest'
import {
  EventAgendaContractError,
  buildAgendaImportIdempotencyKey,
  buildAgendaImportStableRowKey,
  eventAgendaImportMappingSchema,
  eventAgendaImportRowDecisionSchema,
  eventAgendaNormalizedRowSchema,
  eventAgendaSessionInputSchema,
  eventAgendaSpeakerResolutionSchema,
  eventSpeakerAssignmentInputSchema,
  normalizeSpeakerEmail,
  normalizeSpeakerName,
  parseEventAgendaSessionMetadata,
} from './event-agenda-contract'

describe('event agenda runtime contracts', () => {
  it('normalizes versioned EventStructureItem session metadata while retaining legacy keys', () => {
    expect(parseEventAgendaSessionMetadata({
      room: 'Hall A',
      capacity: 300,
      tags: ['AI', 'AI', 'Leadership'],
      legacySource: 'seed',
    })).toEqual({
      schemaVersion: 1,
      room: 'Hall A',
      capacity: 300,
      tags: ['AI', 'Leadership'],
      legacySource: 'seed',
    })
  })

  it('rejects invalid session metadata without affecting non-session metadata', () => {
    expect(() => parseEventAgendaSessionMetadata({ capacity: -1 })).toThrow(EventAgendaContractError)
  })

  it('defines the supported speaker roles and matching normalization', () => {
    expect(eventSpeakerAssignmentInputSchema.parse({ speakerId: 'speaker_1', role: 'MODERATOR' })).toEqual({
      speakerId: 'speaker_1',
      role: 'MODERATOR',
      sortOrder: 0,
    })
    expect(eventSpeakerAssignmentInputSchema.safeParse({ speakerId: 'speaker_1', role: 'GUEST' }).success).toBe(false)
    expect(normalizeSpeakerName('  José  O’Neil ')).toBe('jose o neil')
    expect(normalizeSpeakerEmail(' Speaker@Example.COM ')).toBe('speaker@example.com')
  })

  it('requires a title mapping while allowing intentionally unscheduled agenda rows', () => {
    expect(eventAgendaImportMappingSchema.safeParse({
      title: 'Session Name',
      startDate: 'Date',
      startTime: 'Start',
      endTime: 'End',
    }).success).toBe(true)
    expect(eventAgendaImportMappingSchema.safeParse({ title: 'Session Name' }).success).toBe(true)
    expect(eventAgendaNormalizedRowSchema.safeParse({
      title: 'Opening Keynote',
      startsAt: '2026-09-17T09:00:00-04:00',
      endsAt: '2026-09-17T10:00:00-04:00',
      timezone: 'America/New_York',
    }).success).toBe(true)
    expect(eventAgendaNormalizedRowSchema.safeParse({
      title: 'Unscheduled conversation', startsAt: null, endsAt: null, timezone: null,
    }).success).toBe(true)
  })

  it('validates complete manual session input without allowing legacy recording fields', () => {
    const parsed = eventAgendaSessionInputSchema.parse({
      title: 'Opening Keynote',
      startsAt: '2026-09-17T09:00:00-04:00',
      endsAt: '2026-09-17T10:00:00-04:00',
      timezone: 'America/New_York',
      room: 'Main stage',
      track: 'Leadership',
      format: 'Keynote',
      capacity: 800,
      tags: ['opening'],
    })
    expect(parsed).toMatchObject({ title: 'Opening Keynote', confirmWarnings: false, confirmLiveEdit: false })
    expect(eventAgendaSessionInputSchema.safeParse({
      title: 'Bad session',
      startsAt: 'not-a-date',
      endsAt: '2026-09-17T10:00:00-04:00',
      timezone: 'America/New_York',
      consentVersion: 'legacy-recording-field',
    }).success).toBe(false)
  })

  it('keeps explicit speaker reconciliation decisions durable and unambiguous', () => {
    expect(eventAgendaSpeakerResolutionSchema.safeParse({
      sourceName: 'Ali Example',
      sourceEmail: 'ali@example.com',
      decision: 'LINK_EXISTING',
      matchedSpeakerId: 'speaker_1',
    }).success).toBe(true)
    expect(eventAgendaSpeakerResolutionSchema.safeParse({
      sourceName: 'Ali Example',
      decision: 'SILENT_MERGE',
    }).success).toBe(false)
    expect(eventAgendaImportRowDecisionSchema.parse({
      rowId: 'row_1',
      resolution: 'KEEP_BOTH',
      speakerResolutions: [{ sourceName: 'Ali Example', decision: null, candidateSpeakerIds: ['speaker_1'] }],
    })).toMatchObject({ rowId: 'row_1', resolution: 'KEEP_BOTH' })
  })

  it('builds stable job and row identities without using mutable mapped values', () => {
    const jobKey = buildAgendaImportIdempotencyKey({
      eventId: 'event_1',
      sourceChecksumSha256: 'ABC123',
      worksheetName: 'Agenda',
      worksheetIndex: 0,
    })
    const sameJobKey = buildAgendaImportIdempotencyKey({
      eventId: 'event_1',
      sourceChecksumSha256: 'abc123',
      worksheetName: 'Agenda',
      worksheetIndex: 0,
    })
    const rowKey = buildAgendaImportStableRowKey({
      sourceChecksumSha256: 'abc123',
      worksheetName: 'Agenda',
      worksheetIndex: 0,
      sourceRowNumber: 2,
    })

    expect(jobKey).toBe(sameJobKey)
    expect(jobKey).toMatch(/^[a-f0-9]{64}$/)
    expect(rowKey).toMatch(/^[a-f0-9]{64}$/)
    expect(rowKey).not.toBe(jobKey)
    expect(() => buildAgendaImportStableRowKey({
      sourceChecksumSha256: 'abc123',
      sourceRowNumber: 0,
    })).toThrow('sourceRowNumber must be a positive integer')
  })
})
