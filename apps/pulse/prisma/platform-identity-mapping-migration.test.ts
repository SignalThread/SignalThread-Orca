import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const schema = readFileSync('prisma/schema.prisma', 'utf8')
/** The pre-baseline chain is historical evidence and test fixtures only. */
const LEGACY_MIGRATIONS_DIR = 'test-fixtures/legacy-pulse-migrations'
const MIGRATION_DIR = `${LEGACY_MIGRATIONS_DIR}/20260906120000_add_platform_identity_mapping`
const migration = readFileSync(join(MIGRATION_DIR, 'migration.sql'), 'utf8')

const model = (name: string) =>
  new RegExp(`^model ${name} \\{[\\s\\S]*?^\\}`, 'm').exec(schema)?.[0] ?? ''

describe('Platform identity mapping schema', () => {
  it('adds exactly three canonical uuid mapping columns, all nullable', () => {
    expect(model('User')).toMatch(/platformUserId\s+String\?\s+@unique @db\.Uuid/)
    expect(model('Account')).toMatch(/platformOrganizationId\s+String\?\s+@db\.Uuid/)
    expect(model('Event')).toMatch(/platformEventId\s+String\?\s+@unique @db\.Uuid/)
  })

  it('keeps every local primary key untouched, so public ids never change', () => {
    // Pulse URLs, QR codes, storage keys, survey ids and response ids are all derived from
    // these. A canonical id is additive metadata; it never becomes the primary key.
    expect(model('User')).toMatch(/^\s*id\s+String\s+@id \/\/ Supabase user\.id \(uuid\)/m)
    expect(model('Account')).toMatch(/^\s*id\s+String @id @default\(cuid\(\)\)/m)
    expect(model('Event')).toMatch(/^\s*id\s+String\s+@id @default\(cuid\(\)\)/m)
  })

  it('leaves the Account organization mapping deliberately non-unique but indexed', () => {
    // An organization may own several Pulse Accounts (RETAIL and EVENTS are separate
    // account types, and production has one contact email across 12 RETAIL accounts), so a
    // unique constraint here would be unrecoverable. Ambiguity is resolved in code instead.
    expect(model('Account')).not.toMatch(/platformOrganizationId[^\n]*@unique/)
    expect(model('Account')).toContain('@@index([platformOrganizationId])')
  })

  it('does not add a second index where @unique already provides one', () => {
    expect(model('User')).not.toContain('@@index([platformUserId])')
    expect(model('Event')).not.toContain('@@index([platformEventId])')
  })
})

describe('Platform identity mapping migration', () => {
  it('is additive: three nullable uuid columns and their indexes, nothing else', () => {
    const statements = migration
      .split('\n')
      .filter((line) => !line.trim().startsWith('--') && line.trim().length > 0)
      .join(' ')
    expect(statements).toContain('ALTER TABLE "User" ADD COLUMN     "platformUserId" UUID;')
    expect(statements).toContain('ALTER TABLE "Account" ADD COLUMN     "platformOrganizationId" UUID;')
    expect(statements).toContain('ALTER TABLE "Event" ADD COLUMN     "platformEventId" UUID;')
    expect(statements).toContain('CREATE UNIQUE INDEX "User_platformUserId_key"')
    expect(statements).toContain('CREATE UNIQUE INDEX "Event_platformEventId_key"')
    expect(statements).toContain('CREATE INDEX "Account_platformOrganizationId_idx"')
    // exactly three ALTER TABLE statements and three indexes
    expect(statements.match(/ALTER TABLE/g)).toHaveLength(3)
    expect(statements.match(/CREATE (UNIQUE )?INDEX/g)).toHaveLength(3)
  })

  it('never writes data, never backfills, and performs no destructive DDL', () => {
    for (const forbidden of [/\bUPDATE\b/i, /\bINSERT\b/i, /\bDELETE\b/i, /\bDROP\b/i, /\bTRUNCATE\b/i, /SET NOT NULL/i, /ALTER COLUMN/i, /DEFAULT/i]) {
      expect(migration.replace(/^--.*$/gm, '')).not.toMatch(forbidden)
    }
  })

  it('carries no unrelated production drift', () => {
    // Event.conversationMode and the Event.ttsVoice default are known production-only
    // differences and are explicitly out of scope for this migration.
    for (const unrelated of ['conversationMode', 'ttsVoice', 'AccountUserMembership', 'collectionPhase', 'lifecyclePhase']) {
      expect(migration).not.toContain(unrelated)
    }
  })

  it('is the only legacy migration that introduces the mapping columns', () => {
    // The clean baseline (prisma/migrations) carries the columns forward by construction;
    // within the historical chain exactly this migration introduced them.
    const others = readdirSync(LEGACY_MIGRATIONS_DIR)
      .filter((entry) => /^\d{14}_/.test(entry) && !MIGRATION_DIR.endsWith(entry))
      .map((entry) => readFileSync(join(LEGACY_MIGRATIONS_DIR, entry, 'migration.sql'), 'utf8'))
      .join('\n')
    for (const column of ['platformUserId', 'platformOrganizationId', 'platformEventId']) {
      expect(others).not.toContain(column)
    }
  })
})

describe('public attendee flows stay independent of Platform mappings', () => {
  const ATTENDEE_SURFACES = [
    'app/api/response/create/route.ts',
    'app/api/response/[responseId]/complete/route.ts',
    'app/api/kiosk/event-details/route.ts',
    'app/api/answer/presign/route.ts',
    'app/api/answer/complete/route.ts',
    'app/api/answer/confirm/route.ts',
    'app/api/answer/text/route.ts',
    'app/api/answer/structured/route.ts',
    'app/api/tts/route.ts',
    'app/api/app/logo/route.ts',
    'lib/event.ts',
  ]

  it.each(ATTENDEE_SURFACES)('%s does not depend on the identity mapping layer', (file) => {
    const source = readFileSync(file, 'utf8')
    expect(source).not.toContain('@/lib/platform/identity-mapping')
    for (const column of ['platformUserId', 'platformOrganizationId', 'platformEventId']) {
      expect(source).not.toContain(column)
    }
  })
})
