import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const schema = readFileSync('prisma/schema.prisma', 'utf8')
const migration = readFileSync(
  'test-fixtures/legacy-pulse-migrations/20260730130000_add_event_agenda_foundation/migration.sql',
  'utf8',
)
const rosterMigration = readFileSync(
  'test-fixtures/legacy-pulse-migrations/20260817120000_add_event_speaker_roster_membership/migration.sql',
  'utf8',
)

describe('event agenda schema foundation', () => {
  it('keeps EventStructureItem as agenda authority and does not repurpose legacy Session', () => {
    expect(schema).toContain('model EventStructureItem {')
    expect(schema).toContain('speakerAssignments EventSessionSpeakerAssignment[]')
    expect(schema).toContain('model Session {')
    expect(migration).not.toContain('ALTER TABLE "Session"')
    expect(migration).not.toContain('CREATE TABLE "EventAgendaSession"')
  })

  it('defines account-scoped speakers and duplicate-safe session assignments', () => {
    expect(schema).toContain('model EventSpeakerProfile {')
    expect(schema).toContain('@@index([accountId, normalizedName])')
    expect(schema).toContain('@@index([accountId, normalizedEmail])')
    expect(schema).toContain('model EventSessionSpeakerAssignment {')
    expect(schema).toContain('@@unique([sessionId, speakerId])')
    expect(migration).toContain('FOREIGN KEY ("eventId", "sessionId") REFERENCES "EventStructureItem"("eventId", "id")')
    expect(migration).toContain('FOREIGN KEY ("accountId", "speakerId") REFERENCES "EventSpeakerProfile"("accountId", "id")')
  })

  it('uses the existing assignment table for duplicate-safe event roster membership', () => {
    expect(schema).toContain('sessionId String?')
    expect(schema).toMatch(/session\s+EventStructureItem\?/)
    expect(rosterMigration).toContain('ALTER COLUMN "sessionId" DROP NOT NULL')
    expect(rosterMigration).toContain('FOREIGN KEY ("eventId") REFERENCES "Event"("id")')
    expect(rosterMigration).toContain('WHERE "sessionId" IS NULL')
    expect(rosterMigration).toContain('ON CONFLICT DO NOTHING')
    expect(rosterMigration).not.toContain('CREATE TABLE')
  })

  it('persists import identity, review decisions, snapshots, and explicit results', () => {
    for (const field of [
      'idempotencyKey',
      'sourceChecksumSha256',
      'worksheetName',
      'mappingSnapshot',
      'stableSourceKey',
      'normalizedRowSnapshot',
      'validationIssues',
      'conflictType',
      'resolution',
      'speakerResolutionSnapshot',
      'resultSessionId',
      'failureMessage',
    ]) {
      expect(schema).toContain(field)
    }
    expect(schema).toContain('@@unique([eventId, idempotencyKey])')
    expect(schema).toContain('@@unique([importJobId, stableSourceKey])')
    expect(schema).toContain('status                    EventAgendaImportRowStatus')
  })

  it('uses an additive production-safe migration', () => {
    expect(migration).not.toMatch(/\bDROP\s+(TABLE|COLUMN|TYPE)\b/i)
    expect(migration).not.toContain('TRUNCATE')
    expect(migration).not.toContain('DELETE FROM')
    expect(migration).toContain('CREATE TABLE "EventAgendaImportJob"')
    expect(migration).toContain('CREATE TABLE "EventAgendaImportRow"')
  })
})
