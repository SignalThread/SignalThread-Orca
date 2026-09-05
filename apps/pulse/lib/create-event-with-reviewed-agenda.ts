import { randomUUID } from 'node:crypto'
import { EventStructureItemKind, EventType, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { normalizeSpeakerEmail, normalizeSpeakerName } from '@/lib/event-agenda-contract'
import { reviewedInitialAgendaSchema, type ReviewedInitialAgenda } from '@/lib/pre-creation-agenda'
import { createAccountSpeakerProfileRecord } from '@/lib/event-agenda-service'

type CreationDb = Pick<typeof prisma, '$transaction' | 'event'>

function slugBase(value: string) {
  return value.toLocaleLowerCase('en-US').trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/g, '') || 'item'
}

function uniqueSlug(value: string, used: Set<string>) {
  const base = slugBase(value)
  let slug = base
  let suffix = 1
  while (used.has(slug)) { suffix += 1; slug = `${base}-${suffix}` }
  used.add(slug)
  return slug
}

function json(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

/**
 * Canonical final mutation for Create Event + reviewed agenda. The Event,
 * areas, sessions, account speaker profiles, and assignments commit together.
 * A stable client request ID is also the Event ID, making retries idempotent.
 */
export async function createEventWithReviewedAgenda(input: {
  accountId: string
  requestId: string
  eventData: Omit<Prisma.EventUncheckedCreateInput, 'id'>
  eventAreaNames: string[]
  agenda: ReviewedInitialAgenda
}, db: CreationDb = prisma) {
  const agenda = reviewedInitialAgendaSchema.parse(input.agenda)
  const requestId = input.requestId.trim()
  if (!/^[a-zA-Z0-9_-]{16,100}$/.test(requestId)) throw new Error('Invalid creation request ID')

  const existing = await db.event.findFirst({
    where: { id: requestId, location: { accountId: input.accountId } },
    select: { id: true },
  })
  if (existing) return { eventId: existing.id, idempotentReplay: true, sessionCount: agenda.rows.length }

  return db.$transaction(async (tx) => {
    const replay = await tx.event.findFirst({
      where: { id: requestId, location: { accountId: input.accountId } },
      select: { id: true },
    })
    if (replay) return { eventId: replay.id, idempotentReplay: true, sessionCount: agenda.rows.length }

    const event = await tx.event.create({ data: { id: requestId, ...input.eventData } })
    const usedSlugs = new Set<string>()
    const normalizedAreas = [...new Map(input.eventAreaNames.map((name) => {
      const normalized = name.trim().replace(/\s+/g, ' ')
      return [normalized.toLocaleLowerCase('en-US'), normalized] as const
    }).filter(([, name]) => Boolean(name))).values()]
    if (normalizedAreas.length) await tx.eventStructureItem.createMany({
      data: normalizedAreas.map((name, index) => ({
        id: randomUUID(), eventId: event.id, kind: EventStructureItemKind.AREA,
        name, slug: uniqueSlug(name, usedSlugs), sortOrder: index, isActive: true,
      })),
    })

    const importedSpeakers = agenda.rows.flatMap((row) => row.normalized.speakers)
    const speakerByIdentity = new Map<string, string>()
    for (const speaker of importedSpeakers) {
      const normalizedEmail = normalizeSpeakerEmail(speaker.email)
      const identity = normalizedEmail ? `email:${normalizedEmail}` : `name:${normalizeSpeakerName(speaker.name)}`
      if (speakerByIdentity.has(identity)) continue
      const profile = await createAccountSpeakerProfileRecord({
        accountId: input.accountId,
        profile: speaker,
        // Name-only matches are ambiguous and intentionally create a distinct
        // profile; exact email matches are safely reused by the canonical helper.
        confirmDuplicate: true,
      }, tx as never)
      speakerByIdentity.set(identity, profile.id)
    }
    const resolveSpeaker = (speaker: (typeof importedSpeakers)[number]) => speakerByIdentity.get(
      normalizeSpeakerEmail(speaker.email) ? `email:${normalizeSpeakerEmail(speaker.email)}` : `name:${normalizeSpeakerName(speaker.name)}`,
    )!

    const sessions = agenda.rows.map((row, index) => {
      const sessionId = randomUUID()
      return {
        id: sessionId,
        eventId: event.id,
        kind: EventStructureItemKind.SESSION,
        name: row.normalized.title,
        slug: uniqueSlug(row.normalized.title, usedSlugs),
        description: row.normalized.description ?? null,
        startsAt: row.normalized.startsAt ? new Date(row.normalized.startsAt) : null,
        endsAt: row.normalized.endsAt ? new Date(row.normalized.endsAt) : null,
        timezone: row.normalized.timezone ?? null,
        sortOrder: index,
        metadata: json({
          schemaVersion: 1,
          room: row.normalized.room ?? null,
          track: row.normalized.track ?? null,
          format: row.normalized.format ?? null,
          externalId: row.normalized.externalId ?? null,
          capacity: row.normalized.capacity ?? null,
          tags: row.normalized.tags,
          initialAgendaSource: { sourceFileName: agenda.sourceFileName, sourceRowNumber: row.sourceRowNumber },
        }),
        isActive: true,
        speakers: row.normalized.speakers.map((speaker, sortOrder) => ({ speakerId: resolveSpeaker(speaker), sortOrder })),
      }
    })
    if (sessions.length) await tx.eventStructureItem.createMany({ data: sessions.map(({ speakers: _speakers, ...session }) => session) })

    const speakerIds = [...new Set(sessions.flatMap((session) => session.speakers.map((speaker) => speaker.speakerId)))]
    const sessionDrivenSpeakers = input.eventData.eventType === EventType.TEMPLATE
    if (!sessionDrivenSpeakers && speakerIds.length) await tx.eventSessionSpeakerAssignment.createMany({
      data: speakerIds.map((speakerId) => ({ accountId: input.accountId, eventId: event.id, sessionId: null, speakerId, metadata: json({ eventRosterMembership: true }) })),
    })
    const assignments = sessions.flatMap((session) => session.speakers.map((speaker) => ({
      accountId: input.accountId,
      eventId: event.id,
      sessionId: session.id,
      speakerId: speaker.speakerId,
      sortOrder: speaker.sortOrder,
    })))
    if (assignments.length) await tx.eventSessionSpeakerAssignment.createMany({ data: assignments, skipDuplicates: true })

    return {
      eventId: event.id,
      idempotentReplay: false,
      sessionCount: sessions.length,
      speakerCount: speakerIds.length,
      eventAreaCount: normalizedAreas.length,
    }
  }, { maxWait: 5_000, timeout: 120_000 })
}
