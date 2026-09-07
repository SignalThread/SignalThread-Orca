import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const schema = fs.readFileSync(path.join(process.cwd(), 'prisma/schema.prisma'), 'utf8')
const migration = fs.readFileSync(path.join(
  process.cwd(),
  'test-fixtures/legacy-pulse-migrations/20260817160000_add_account_user_memberships/migration.sql',
), 'utf8')

describe('AccountUserMembership migration', () => {
  it('defines relational uniqueness and both foreign keys', () => {
    expect(schema).toContain('model AccountUserMembership')
    expect(schema).toContain('@@unique([userId, accountId])')
    expect(migration).toContain('AccountUserMembership_userId_fkey')
    expect(migration).toContain('AccountUserMembership_accountId_fkey')
    expect(migration).toContain('ON DELETE SET NULL ON UPDATE CASCADE')
  })

  it('backfills every existing non-platform default account idempotently', () => {
    expect(migration).toContain('u."accountId" IS NOT NULL')
    expect(migration).toContain('u."role" <> \'SUPER_ADMIN\'')
    expect(migration).toContain('ON CONFLICT ("userId", "accountId") DO NOTHING')
    expect(migration).toContain("'aum_' || md5")
  })
})
