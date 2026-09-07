import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const migration = fs.readFileSync(path.join(
  process.cwd(),
  'test-fixtures/legacy-pulse-migrations/20260818110000_add_advanced_event_creation_type/migration.sql',
), 'utf8')

describe('ADVANCED EventType migration', () => {
  it('adds the compatibility type idempotently without rewriting historical events', () => {
    expect(migration).toContain('ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS \'ADVANCED\';')
    expect(migration).not.toMatch(/UPDATE\s+"?Event"?/i)
  })
})
