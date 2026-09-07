import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const schema = readFileSync('prisma/schema.prisma', 'utf8')
/** The active migration chain: the clean baseline plus everything shipped after it. */
const migrationsDir = 'prisma/migrations'
/** The pre-baseline chain is historical evidence and test fixtures only. */
const legacyMigrationsDir = 'test-fixtures/legacy-pulse-migrations'
const lockdown = readFileSync(
  join(legacyMigrationsDir, '20260905180000_lock_down_data_api_access/migration.sql'),
  'utf8',
)

const modelTables = [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((match) => match[1])

/**
 * Every active migration (the clean baseline carries the lockdown forward), so a later
 * migration may enable RLS for a table it introduces.
 */
const allMigrationSql = readdirSync(migrationsDir)
  .filter((entry) => /^\d{14}_/.test(entry))
  .map((entry) => readFileSync(join(migrationsDir, entry, 'migration.sql'), 'utf8'))
  .join('\n')

describe('Data API lockdown migration', () => {
  it('revokes every anon/authenticated privilege on the public schema, including future defaults', () => {
    for (const target of ['ALL TABLES IN SCHEMA public', 'ALL SEQUENCES IN SCHEMA public', 'ALL FUNCTIONS IN SCHEMA public', 'SCHEMA public']) {
      expect(lockdown).toContain(`REVOKE ALL PRIVILEGES ON ${target} FROM %s`)
    }
    for (const target of ['TABLES', 'SEQUENCES', 'FUNCTIONS']) {
      expect(lockdown).toContain(`ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON ${target} FROM %s`)
    }
    expect(lockdown).toMatch(/WHERE rolname IN \('anon', 'authenticated'\)/)
  })

  it('never touches service_role and never grants anything back', () => {
    expect(lockdown).not.toMatch(/REVOKE[^;]*service_role/)
    expect(lockdown).not.toMatch(/\bGRANT\b/)
    expect(lockdown).not.toMatch(/CREATE POLICY/i)
  })

  it('stays valid on plain PostgreSQL where the Supabase API roles do not exist', () => {
    expect(lockdown).toContain('FROM pg_roles')
    expect(lockdown).toContain('IF api_roles IS NULL THEN')
    expect(lockdown).toContain('RETURN;')
  })

  it('enables row level security, with no policies, on every Prisma model table', () => {
    expect(modelTables.length).toBeGreaterThan(40)
    for (const table of modelTables) {
      expect(lockdown, `${table} must have RLS enabled`).toContain(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY;`)
    }
  })

  it('keeps RLS enabled for every model that any migration introduces', () => {
    // A new model must ship with its own ENABLE ROW LEVEL SECURITY statement, in
    // this migration or a later one. Default privileges are already revoked, but
    // RLS is the second, independent control and must not be forgotten.
    // The clean baseline is a native dump and schema-qualifies its tables (`public."T"`);
    // hand-written migrations use the bare Prisma form. Both spellings are the same DDL.
    const enablesRls = (table: string) =>
      new RegExp(`ALTER TABLE (?:public\\.)?"${table}" ENABLE ROW LEVEL SECURITY;`).test(allMigrationSql)
    const missing = modelTables.filter((table) => !enablesRls(table))
    expect(missing).toEqual([])
    expect(allMigrationSql).not.toMatch(/DISABLE ROW LEVEL SECURITY/i)
    expect(allMigrationSql).not.toMatch(/FORCE ROW LEVEL SECURITY/i)
  })
})
