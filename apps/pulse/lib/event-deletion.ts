import { prisma } from '@/lib/prisma'

export class EventDeletionError extends Error {
  constructor(public readonly code: 'NOT_FOUND' | 'CONFIRMATION_REQUIRED' | 'DELETE_FAILED', message: string) {
    super(message)
  }
}

type EventDeletionDb = Pick<typeof prisma, '$transaction'>

/**
 * Canonical hard deletion for an Event. Most Event-owned modern records use
 * schema cascades. PublicSurveyLink must be removed first because its optional
 * SurveyTarget relation is intentionally RESTRICTed, while its owning Survey
 * is Event-cascaded. Legacy Session records have only a string eventId and are
 * also removed explicitly in the same transaction.
 */
export async function deleteEventForAccount(input: {
  accountId: string
  eventId: string
  confirmationName: string
}, db: EventDeletionDb = prisma) {
  return db.$transaction(async (transaction) => {
    const event = await transaction.event.findFirst({
      where: { id: input.eventId, location: { accountId: input.accountId } },
      select: { id: true, name: true },
    })
    if (!event) throw new EventDeletionError('NOT_FOUND', 'Event not found or access denied.')
    if (input.confirmationName.trim() !== event.name) {
      throw new EventDeletionError('CONFIRMATION_REQUIRED', 'Type the exact event name to permanently delete it.')
    }

    await transaction.publicSurveyLink.deleteMany({
      where: { survey: { eventId: event.id } },
    })
    await transaction.session.deleteMany({ where: { eventId: event.id } })
    await transaction.event.delete({ where: { id: event.id } })

    const remaining = await transaction.event.findUnique({ where: { id: event.id }, select: { id: true } })
    if (remaining) throw new EventDeletionError('DELETE_FAILED', 'The Event could not be removed. No changes were committed.')
    return { eventId: event.id, eventName: event.name }
  })
}
