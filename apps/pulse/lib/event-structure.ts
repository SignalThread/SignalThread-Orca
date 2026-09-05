import { AccountType, EventStructureItemKind, Prisma, type PrismaClient } from '@prisma/client'
import { AccountProductModeError, requireEventsAccountType } from '@/lib/account-product-mode'
import { prisma } from '@/lib/prisma'

type PrismaLike = typeof prisma | PrismaClient

export class EventStructureError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message)
    this.name = 'EventStructureError'
  }
}

export interface EventStructureItemPayload {
  id: string
  eventId: string
  kind: EventStructureItemKind
  name: string
  slug: string
  description: string | null
  parentId: string | null
  locationId: string | null
  startsAt: string | null
  endsAt: string | null
  timezone: string | null
  sortOrder: number
  metadata: Prisma.JsonValue | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

const STRUCTURE_ITEM_SELECT = {
  id: true,
  eventId: true,
  kind: true,
  name: true,
  slug: true,
  description: true,
  parentId: true,
  locationId: true,
  startsAt: true,
  endsAt: true,
  timezone: true,
  sortOrder: true,
  metadata: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.EventStructureItemSelect

type SelectedStructureItem = Prisma.EventStructureItemGetPayload<{ select: typeof STRUCTURE_ITEM_SELECT }>

interface ScopedEvent {
  account: {
    id: string
    accountType: AccountType
  }
  event: {
    id: string
  }
}

interface CreateEventStructureItemInput {
  accountSlug: string
  eventId: string
  kind: unknown
  name: unknown
  description?: unknown
  parentId?: unknown
  locationId?: unknown
  startsAt?: unknown
  endsAt?: unknown
  timezone?: unknown
  sortOrder?: unknown
  metadata?: unknown
}

interface UpdateEventStructureItemInput {
  accountSlug: string
  eventId: string
  structureItemId: string
  name?: unknown
  description?: unknown
  parentId?: unknown
  locationId?: unknown
  startsAt?: unknown
  endsAt?: unknown
  timezone?: unknown
  sortOrder?: unknown
  metadata?: unknown
  isActive?: unknown
}

interface DeleteEventStructureItemInput {
  accountSlug: string
  eventId: string
  structureItemId: string
}

function trimOptional(value: unknown): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value !== 'string') {
    throw new EventStructureError('Expected a string value', 400)
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function trimRequired(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new EventStructureError(`${fieldName} is required`, 400)
  }
  return value.trim()
}

function parseKind(value: unknown): EventStructureItemKind {
  if (typeof value !== 'string' || !(Object.values(EventStructureItemKind) as string[]).includes(value)) {
    throw new EventStructureError('Type is invalid', 400)
  }
  return value as EventStructureItemKind
}

function parseDate(value: unknown, fieldName: string): Date | null | undefined {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  if (typeof value !== 'string' && !(value instanceof Date)) {
    throw new EventStructureError(`${fieldName} must be a valid date and time`, 400)
  }
  const parsed = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    throw new EventStructureError(`${fieldName} must be a valid date and time`, 400)
  }
  return parsed
}

function parseSortOrder(value: unknown): number | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new EventStructureError('Order must be a whole number', 400)
  }
  return value
}

function parseBoolean(value: unknown, fieldName: string): boolean | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'boolean') {
    throw new EventStructureError(`${fieldName} must be a boolean`, 400)
  }
  return value
}

function parseMetadata(value: unknown): Prisma.InputJsonValue | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  return value as Prisma.InputJsonValue
}

function toNullableJsonInput(value: Prisma.InputJsonValue | null | undefined) {
  if (value === undefined) return undefined
  if (value === null) return Prisma.JsonNull
  return value
}

function slugFromName(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '')
}

/**
 * Canonical normalized name used for duplicate detection: trimmed,
 * whitespace-collapsed, case-insensitive.
 */
export function normalizeStructureName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

const KIND_CONFLICT_LABELS: Record<EventStructureItemKind, string> = {
  EVENT: 'event-wide area',
  SESSION: 'session',
  AREA: 'location',
  SPONSOR_ACTIVATION: 'sponsor activation',
  CUSTOM_TOUCHPOINT: 'custom touchpoint',
}

/**
 * Rejects a duplicate normalized name within the same event and structure
 * kind. SESSION is exempt: schedules legitimately repeat titles (for example a
 * recurring "Networking Break"), and the agenda review flow already surfaces
 * session duplication as a warning. Enforced in this one canonical service so
 * create and rename share the rule; names in other events are unaffected.
 */
async function ensureUniqueStructureName(
  db: PrismaLike,
  eventId: string,
  kind: EventStructureItemKind,
  name: string,
  excludeItemId?: string,
) {
  if (kind === EventStructureItemKind.SESSION) return

  const normalized = normalizeStructureName(name)
  const siblings = await db.eventStructureItem.findMany({
    where: { eventId, kind, isActive: true },
    select: { id: true, name: true },
  })
  const conflict = siblings.find(
    (item) => item.id !== excludeItemId && normalizeStructureName(item.name) === normalized,
  )
  if (conflict) {
    throw new EventStructureError(
      `A ${KIND_CONFLICT_LABELS[kind]} named "${conflict.name}" already exists in this event. Use a different name.`,
      409,
    )
  }
}

function serializeItem(item: SelectedStructureItem): EventStructureItemPayload {
  return {
    ...item,
    startsAt: item.startsAt?.toISOString() ?? null,
    endsAt: item.endsAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  }
}

async function resolveScopedEvent(
  input: { accountSlug: string; eventId: string },
  db: PrismaLike,
): Promise<ScopedEvent> {
  const accountSlug = input.accountSlug.trim()
  const eventId = input.eventId.trim()

  if (!accountSlug) {
    throw new EventStructureError('Account parameter required', 400)
  }
  if (!eventId) {
    throw new EventStructureError('eventId is required', 400)
  }

  const account = await db.account.findUnique({
    where: { slug: accountSlug },
    select: { id: true, accountType: true },
  })

  if (!account) {
    throw new EventStructureError('Account not found', 404)
  }
  try {
    requireEventsAccountType(
      account.accountType,
      'Event structure is only available for EVENTS accounts',
    )
  } catch (error) {
    if (error instanceof AccountProductModeError) {
      throw new EventStructureError(error.message, error.status)
    }
    throw error
  }

  const event = await db.event.findFirst({
    where: {
      id: eventId,
      location: {
        accountId: account.id,
      },
    },
    select: { id: true },
  })

  if (!event) {
    throw new EventStructureError('Event not found or access denied', 404)
  }

  return { account, event }
}

async function createUniqueStructureSlug(
  db: PrismaLike,
  eventId: string,
  name: string,
) {
  const base = slugFromName(name) || 'structure-item'
  let slug = base
  let suffix = 1

  while (
    await db.eventStructureItem.findUnique({
      where: {
        eventId_slug: {
          eventId,
          slug,
        },
      },
      select: { id: true },
    })
  ) {
    suffix += 1
    slug = `${base}-${suffix}`
  }

  return slug
}

async function validateParent(
  db: PrismaLike,
  eventId: string,
  parentId: string | null | undefined,
  itemId?: string,
) {
  if (parentId === undefined || parentId === null) return parentId
  if (!parentId) return null
  if (parentId === itemId) {
    throw new EventStructureError('Structure item cannot be its own parent', 400)
  }

  const parent = await db.eventStructureItem.findFirst({
    where: {
      id: parentId,
      eventId,
    },
    select: {
      id: true,
      parentId: true,
    },
  })

  if (!parent) {
    throw new EventStructureError('Parent structure item not found for this event', 400)
  }

  if (!itemId) return parentId

  let nextParentId = parent.parentId
  const seen = new Set<string>([itemId, parentId])
  while (nextParentId) {
    if (seen.has(nextParentId)) {
      throw new EventStructureError('Parent structure loop detected', 400)
    }
    seen.add(nextParentId)

    const ancestor = await db.eventStructureItem.findFirst({
      where: {
        id: nextParentId,
        eventId,
      },
      select: {
        id: true,
        parentId: true,
      },
    })
    nextParentId = ancestor?.parentId ?? null
  }

  return parentId
}

async function validateLocation(
  db: PrismaLike,
  accountId: string,
  locationId: string | null | undefined,
) {
  if (locationId === undefined || locationId === null) return locationId
  if (!locationId) return null

  const location = await db.location.findFirst({
    where: {
      id: locationId,
      accountId,
    },
    select: { id: true },
  })

  if (!location) {
    throw new EventStructureError('Location not found for this account', 400)
  }

  return locationId
}

export async function listEventStructureItems(
  input: { accountSlug: string; eventId: string },
  db: PrismaLike = prisma,
) {
  await resolveScopedEvent(input, db)

  const items = await db.eventStructureItem.findMany({
    where: {
      eventId: input.eventId.trim(),
      isActive: true,
    },
    select: STRUCTURE_ITEM_SELECT,
    orderBy: [
      { sortOrder: 'asc' },
      { startsAt: 'asc' },
      { name: 'asc' },
    ],
  })

  return {
    eventId: input.eventId.trim(),
    items: items.map(serializeItem),
  }
}

export async function createEventStructureItem(
  input: CreateEventStructureItemInput,
  db: PrismaLike = prisma,
) {
  const scoped = await resolveScopedEvent(input, db)
  const eventId = scoped.event.id
  const kind = parseKind(input.kind)
  const name = trimRequired(input.name, 'Name')
  await ensureUniqueStructureName(db, eventId, kind, name)
  const description = trimOptional(input.description)
  const parentId = await validateParent(db, eventId, trimOptional(input.parentId))
  const locationId = await validateLocation(db, scoped.account.id, trimOptional(input.locationId))
  const startsAt = parseDate(input.startsAt, 'Start time')
  const endsAt = parseDate(input.endsAt, 'End time')
  const timezone = trimOptional(input.timezone)
  const sortOrder = parseSortOrder(input.sortOrder) ?? 0
  const metadata = toNullableJsonInput(parseMetadata(input.metadata))
  const slug = await createUniqueStructureSlug(db, eventId, name)

  const item = await db.eventStructureItem.create({
    data: {
      eventId,
      kind,
      name,
      slug,
      description,
      parentId,
      locationId,
      startsAt,
      endsAt,
      timezone,
      sortOrder,
      metadata,
      isActive: true,
    },
    select: STRUCTURE_ITEM_SELECT,
  })

  return serializeItem(item)
}

export async function updateEventStructureItem(
  input: UpdateEventStructureItemInput,
  db: PrismaLike = prisma,
) {
  const scoped = await resolveScopedEvent(input, db)
  const eventId = scoped.event.id
  const structureItemId = input.structureItemId.trim()
  if (!structureItemId) {
    throw new EventStructureError('structureItemId is required', 400)
  }

  const existing = await db.eventStructureItem.findFirst({
    where: {
      id: structureItemId,
      eventId,
      event: {
        location: {
          accountId: scoped.account.id,
        },
      },
    },
    select: {
      id: true,
      eventId: true,
      slug: true,
      kind: true,
    },
  })

  if (!existing) {
    throw new EventStructureError('Structure item not found or access denied', 404)
  }

  const data: Prisma.EventStructureItemUpdateInput = {}
  if (input.name !== undefined) {
    const name = trimRequired(input.name, 'Name')
    await ensureUniqueStructureName(db, eventId, existing.kind, name, existing.id)
    data.name = name
  }
  if (input.description !== undefined) data.description = trimOptional(input.description)
  if (input.parentId !== undefined) {
    data.parent = {
      ...(await validateParent(db, eventId, trimOptional(input.parentId), existing.id))
        ? { connect: { id: trimOptional(input.parentId) as string } }
        : { disconnect: true },
    }
  }
  if (input.locationId !== undefined) {
    const locationId = await validateLocation(db, scoped.account.id, trimOptional(input.locationId))
    data.location = locationId ? { connect: { id: locationId } } : { disconnect: true }
  }
  if (input.startsAt !== undefined) data.startsAt = parseDate(input.startsAt, 'Start time')
  if (input.endsAt !== undefined) data.endsAt = parseDate(input.endsAt, 'End time')
  if (input.timezone !== undefined) data.timezone = trimOptional(input.timezone)
  if (input.sortOrder !== undefined) data.sortOrder = parseSortOrder(input.sortOrder)
  if (input.metadata !== undefined) data.metadata = toNullableJsonInput(parseMetadata(input.metadata))
  if (input.isActive !== undefined) data.isActive = parseBoolean(input.isActive, 'Active')

  const updated = await db.eventStructureItem.update({
    where: { id: existing.id },
    data,
    select: STRUCTURE_ITEM_SELECT,
  })

  return serializeItem(updated)
}

export async function deleteEventStructureItem(
  input: DeleteEventStructureItemInput,
  db: PrismaLike = prisma,
) {
  const scoped = await resolveScopedEvent(input, db)
  const eventId = scoped.event.id
  const structureItemId = input.structureItemId.trim()
  if (!structureItemId) {
    throw new EventStructureError('structureItemId is required', 400)
  }

  const existing = await db.eventStructureItem.findFirst({
    where: {
      id: structureItemId,
      eventId,
      event: {
        location: {
          accountId: scoped.account.id,
        },
      },
    },
    select: {
      id: true,
      surveyTargets: {
        select: { id: true },
      },
    },
  })

  if (!existing) {
    throw new EventStructureError('Structure item not found or access denied', 404)
  }

  const updated = await db.eventStructureItem.update({
    where: { id: existing.id },
    data: { isActive: false },
    select: STRUCTURE_ITEM_SELECT,
  })

  return {
    item: serializeItem(updated),
    softDeleted: true,
    linkedSurveyTargetCount: existing.surveyTargets.length,
  }
}
