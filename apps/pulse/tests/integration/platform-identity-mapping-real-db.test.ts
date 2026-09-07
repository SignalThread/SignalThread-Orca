import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AccountType, PrismaClient } from '@prisma/client'
import { randomUUID } from 'node:crypto'

/**
 * Proves the identity mapping constraints against a migrated Postgres: existing rows keep
 * working with every mapping null, the unique columns reject a duplicate canonical id, and
 * the Account column deliberately permits an organization to own several Pulse Accounts.
 */
const describeRealDatabase = process.env.REAL_DATABASE_TESTS === '1' ? describe : describe.skip

const PREFIX = 'platform-mapping-probe'

describeRealDatabase('Platform identity mapping against migrated Postgres', () => {
  const db = new PrismaClient()
  let accountId: string
  let locationId: string
  let eventsEventId: string
  let retailEventId: string

  beforeAll(async () => {
    const account = await db.account.create({
      data: { id: `${PREFIX}-account`, name: 'Mapping Probe', slug: `${PREFIX}-account`, accountType: AccountType.EVENTS },
    })
    accountId = account.id
    const location = await db.location.create({
      data: { id: `${PREFIX}-location`, accountId, name: 'Probe Location', slug: `${PREFIX}-location` },
    })
    locationId = location.id
    eventsEventId = (await db.event.create({ data: { id: `${PREFIX}-event-events`, locationId, name: 'Events workspace' } })).id
    retailEventId = (await db.event.create({ data: { id: `${PREFIX}-event-retail`, locationId, name: 'Retail campaign' } })).id
  }, 60_000)

  afterAll(async () => {
    await db.event.deleteMany({ where: { id: { startsWith: PREFIX } } })
    await db.location.deleteMany({ where: { id: { startsWith: PREFIX } } })
    await db.user.deleteMany({ where: { id: { startsWith: PREFIX } } })
    await db.account.deleteMany({ where: { id: { startsWith: PREFIX } } })
    await db.$disconnect()
  })

  it('creates rows with every mapping null, exactly as existing production rows are', async () => {
    const [account, event] = await Promise.all([
      db.account.findUniqueOrThrow({ where: { id: accountId }, select: { platformOrganizationId: true } }),
      db.event.findUniqueOrThrow({ where: { id: eventsEventId }, select: { platformEventId: true } }),
    ])
    expect(account.platformOrganizationId).toBeNull()
    expect(event.platformEventId).toBeNull()
  })

  it('permits unlimited unmapped rows on the unique columns', async () => {
    // Postgres treats NULLs as distinct, which is what lets every existing row and every
    // Retail campaign stay unmapped under a UNIQUE constraint.
    const unmappedEvents = await db.event.count({ where: { id: { startsWith: PREFIX }, platformEventId: null } })
    expect(unmappedEvents).toBe(2)
  })

  it('rejects two Pulse events claiming the same canonical event id', async () => {
    const canonical = randomUUID()
    await db.event.update({ where: { id: eventsEventId }, data: { platformEventId: canonical } })
    await expect(
      db.event.update({ where: { id: retailEventId }, data: { platformEventId: canonical } }),
    ).rejects.toThrow(/[Uu]nique constraint/)

    const retail = await db.event.findUniqueOrThrow({ where: { id: retailEventId }, select: { platformEventId: true } })
    expect(retail.platformEventId).toBeNull()
  })

  it('rejects two Pulse users claiming the same canonical user id', async () => {
    const canonical = randomUUID()
    await db.user.create({ data: { id: `${PREFIX}-user-a`, email: `${PREFIX}-a@probe.test`, platformUserId: canonical } })
    await expect(
      db.user.create({ data: { id: `${PREFIX}-user-b`, email: `${PREFIX}-b@probe.test`, platformUserId: canonical } }),
    ).rejects.toThrow(/[Uu]nique constraint/)
  })

  it('deliberately allows one organization to own several Pulse Accounts', async () => {
    const organization = randomUUID()
    await db.account.update({ where: { id: accountId }, data: { platformOrganizationId: organization } })
    const second = await db.account.create({
      data: { id: `${PREFIX}-account-2`, name: 'Mapping Probe Retail', slug: `${PREFIX}-account-2`, accountType: AccountType.RETAIL, platformOrganizationId: organization },
    })
    expect(second.platformOrganizationId).toBe(organization)
    expect(await db.account.count({ where: { platformOrganizationId: organization } })).toBe(2)
  })

  it('rejects a non-uuid canonical id at the database level', async () => {
    await expect(
      db.$executeRawUnsafe(`UPDATE "Event" SET "platformEventId" = 'not-a-uuid' WHERE id = '${retailEventId}'`),
    ).rejects.toThrow()
  })

  it('leaves local primary keys and operational relationships unchanged', async () => {
    const event = await db.event.findUniqueOrThrow({
      where: { id: eventsEventId },
      select: { id: true, locationId: true, location: { select: { accountId: true } } },
    })
    expect(event.id).toBe(eventsEventId)
    expect(event.locationId).toBe(locationId)
    expect(event.location.accountId).toBe(accountId)
  })
})
