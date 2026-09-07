import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const schema = readFileSync('prisma/schema.prisma', 'utf8')
const migration = readFileSync(
  'test-fixtures/legacy-pulse-migrations/20260904120000_add_event_collection_phase/migration.sql',
  'utf8',
)

describe('collection phase schema migration', () => {
  it('adds nullable legacy-safe phase columns without a guessed default or data backfill', () => {
    expect(schema).toContain("enum CollectionPhase")
    expect(schema).toMatch(/model Survey[\s\S]*collectionPhase\s+CollectionPhase\?/)
    expect(schema).toMatch(/model Response[\s\S]*collectionPhase\s+CollectionPhase\?/)
    expect(migration).toContain('ALTER TABLE "Survey" ADD COLUMN "collectionPhase" "CollectionPhase";')
    expect(migration).toContain('ALTER TABLE "Response" ADD COLUMN "collectionPhase" "CollectionPhase";')
    expect(migration).not.toMatch(/ADD COLUMN "collectionPhase"[^;]*DEFAULT/)
    expect(migration).not.toMatch(/UPDATE\s+"(?:Survey|Response)"/)
  })

  it('makes a classified Response phase immutable while permitting later explicit legacy classification', () => {
    expect(migration).toContain('BEFORE UPDATE OF "collectionPhase" ON "Response"')
    expect(migration).toContain('OLD."collectionPhase" IS NOT NULL')
    expect(migration).toContain('OLD."collectionPhase" IS DISTINCT FROM NEW."collectionPhase"')
    expect(migration).toContain("RAISE EXCEPTION 'Response.collectionPhase is immutable after creation'")
  })
})
