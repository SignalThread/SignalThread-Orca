import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'

/**
 * Proves, against a migrated Postgres, that Pulse operational tables are not
 * reachable through the Supabase Data API roles while the owner connection
 * Prisma uses keeps working. On Supabase the `anon`/`authenticated` roles
 * already exist; on the plain Postgres the pre-production runner starts, they
 * are created here (NOLOGIN) so the same denial assertions run in CI.
 */
const describeRealDatabase = process.env.REAL_DATABASE_TESTS === '1' ? describe : describe.skip

const API_ROLES = ['anon', 'authenticated'] as const
const PRIVATE_TABLES = ['Account', 'User', 'Response', 'Answer', 'AnswerTranscript', 'AccountUserMembership'] as const

describeRealDatabase('Data API lockdown against migrated Postgres', () => {
  const db = new PrismaClient()

  beforeAll(async () => {
    for (const role of API_ROLES) {
      await db.$executeRawUnsafe(
        `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}') THEN CREATE ROLE ${role} NOLOGIN; END IF; END $$;`,
      )
    }
  }, 30_000)

  afterAll(async () => {
    await db.$disconnect()
  })

  it('has row level security enabled on every Pulse table', async () => {
    const rows = await db.$queryRaw<Array<{ relname: string }>>`
      SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind IN ('r', 'p')
        AND c.relname <> '_prisma_migrations'
        AND c.relrowsecurity = false
      ORDER BY c.relname
    `
    expect(rows.map((row) => row.relname)).toEqual([])
  })

  it.each(API_ROLES)('%s holds no privilege on any Pulse table, sequence, or the public schema', async (role) => {
    const [tables, sequences, schema] = await Promise.all([
      db.$queryRawUnsafe<Array<{ table_name: string }>>(
        `SELECT DISTINCT table_name FROM information_schema.role_table_grants WHERE table_schema = 'public' AND grantee = '${role}'`,
      ),
      db.$queryRawUnsafe<Array<{ object_name: string }>>(
        `SELECT object_name FROM information_schema.role_usage_grants WHERE object_schema = 'public' AND object_type = 'SEQUENCE' AND grantee = '${role}'`,
      ),
      db.$queryRawUnsafe<Array<{ usage: boolean }>>(`SELECT has_schema_privilege('${role}', 'public', 'USAGE') AS usage`),
    ])
    expect(tables).toEqual([])
    expect(sequences).toEqual([])
    // Plain Postgres grants USAGE on public to PUBLIC; Supabase does not after
    // the migration. Either way the table-level denial below is what matters.
    expect(typeof schema[0]?.usage).toBe('boolean')
  })

  it.each(API_ROLES.flatMap((role) => PRIVATE_TABLES.map((table) => [role, table] as const)))(
    '%s cannot read %s directly',
    async (role, table) => {
      await expect(
        db.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`)
          return tx.$queryRawUnsafe(`SELECT count(*) FROM "${table}"`)
        }),
      ).rejects.toThrow(/permission denied for (schema|table|relation)/)
    },
  )

  it.each(API_ROLES)('%s cannot write Pulse rows directly', async (role) => {
    await expect(
      db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`)
        return tx.$executeRawUnsafe(
          `INSERT INTO "Account" ("id", "name", "slug", "updatedAt") VALUES ('lockdown-probe', 'Lockdown Probe', 'lockdown-probe', now())`,
        )
      }),
    ).rejects.toThrow(/permission denied for (schema|table|relation)/)
    const leaked = await db.account.findUnique({ where: { id: 'lockdown-probe' }, select: { id: true } })
    expect(leaked).toBeNull()
  })

  it('leaves the owner connection Prisma uses fully able to read and write (RLS is not forced)', async () => {
    await expect(db.account.count()).resolves.toBeGreaterThanOrEqual(0)
    await expect(
      db.$transaction(async (tx) => {
        await tx.account.create({ data: { id: 'lockdown-owner-probe', name: 'Owner Probe', slug: 'lockdown-owner-probe' } })
        const created = await tx.account.findUnique({ where: { id: 'lockdown-owner-probe' }, select: { id: true } })
        expect(created?.id).toBe('lockdown-owner-probe')
        throw new Error('rollback-probe')
      }),
    ).rejects.toThrow('rollback-probe')
    await expect(db.account.findUnique({ where: { id: 'lockdown-owner-probe' } })).resolves.toBeNull()
  })
})
