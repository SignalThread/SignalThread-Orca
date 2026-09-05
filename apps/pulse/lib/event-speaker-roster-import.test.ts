import { describe, expect, it } from 'vitest'
import {
  discoverSpeakerRosterImportMapping,
  deriveSpeakerNameParts,
  eventSpeakerRosterImportMappingSchema,
  findSpeakerRosterDuplicates,
  normalizeSpeakerRosterImportRow,
} from './event-speaker-roster-import'
import { buildSpeakerRosterImportTemplateCsv, EVENT_SPEAKER_ROSTER_IMPORT_FIELDS, EVENT_SPEAKER_ROSTER_TEMPLATE_FILENAME } from './event-speaker-roster-import-template'

describe('speaker roster import', () => {
  it('preserves a full-name source while safely deriving a simple name', () => {
    const row = normalizeSpeakerRosterImportRow({
      mapping: { fullName: 'Name', email: 'Email' },
      row: { sourceRowNumber: 2, values: { Name: 'Dr. María de la Cruz', Email: 'maria@example.test' } },
    })
    expect(row.normalized).toMatchObject({ displayName: 'Dr. María de la Cruz', firstName: null, lastName: null })
    expect(deriveSpeakerNameParts('Avery Example')).toEqual({ firstName: 'Avery', lastName: 'Example' })
  })

  it('builds a display name from first and optional last name without requiring schedule fields', () => {
    const row = normalizeSpeakerRosterImportRow({
      mapping: { firstName: 'First', lastName: 'Last', organization: 'Company' },
      row: { sourceRowNumber: 2, values: { First: 'Prince', Last: '', Company: 'Example Co.' } },
    })
    expect(row.normalized).toMatchObject({ displayName: 'Prince', firstName: 'Prince', lastName: null, organization: 'Example Co.' })
  })

  it('requires one name mapping and disallows conflicting name styles', () => {
    expect(eventSpeakerRosterImportMappingSchema.safeParse({ email: 'Email' }).success).toBe(false)
    expect(eventSpeakerRosterImportMappingSchema.safeParse({ fullName: 'Name', firstName: 'First' }).success).toBe(false)
  })

  it('only merges exact email matches and flags name/context candidates for review', () => {
    const row = { displayName: 'Avery Example', firstName: 'Avery', lastName: 'Example', email: null, organization: 'Example Co.', title: 'Host', phone: null, biography: null, sessionTitle: null, externalSessionId: null, tags: [] }
    expect(findSpeakerRosterDuplicates(row, [{ id: 'speaker_1', normalizedName: 'avery example', normalizedEmail: null, organization: 'Example Co.', title: 'Host' }]))
      .toEqual({ exactId: null, candidateIds: ['speaker_1'], uncertain: true })
  })

  it('ships a roster-specific CSV template using only the supported roster fields', () => {
    const [header] = buildSpeakerRosterImportTemplateCsv().replace(/^\uFEFF/, '').trim().split('\r\n')
    expect(EVENT_SPEAKER_ROSTER_TEMPLATE_FILENAME).toBe('signalthread-speaker-roster-template.csv')
    expect(header.split(',')).toEqual(EVENT_SPEAKER_ROSTER_IMPORT_FIELDS.map((field) => field.label))
  })

  it('maps common contact and biography headers and warns about a malformed phone number', () => {
    expect(discoverSpeakerRosterImportMapping(['Speaker Name', 'Mobile', 'Bio']).mapping).toMatchObject({
      fullName: 'Speaker Name', phone: 'Mobile', biography: 'Bio',
    })
    const row = normalizeSpeakerRosterImportRow({
      mapping: { fullName: 'Name', phone: 'Mobile', biography: 'Bio' },
      row: { sourceRowNumber: 2, values: { Name: 'Avery Example', Mobile: 'call me maybe', Bio: 'Event host' } },
    })
    expect(row.normalized).toMatchObject({ phone: 'call me maybe', biography: 'Event host' })
    expect(row.issues).toContainEqual(expect.objectContaining({ code: 'INVALID_PHONE', severity: 'WARNING' }))
  })
})
