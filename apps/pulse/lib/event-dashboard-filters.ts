import { EventStructureItemKind, type PrismaClient } from '@prisma/client'
import { requireEventsAccountType } from '@/lib/account-product-mode'
import { prisma } from '@/lib/prisma'
import { buildEffectiveResponseTargetWhere } from '@/lib/effective-response-target'

type PrismaLike = typeof prisma | PrismaClient

export interface EventDashboardFilters {
  surveyId?: string | null
  eventStructureItemId?: string | null
  structureKind?: EventStructureItemKind | null
}

export class EventDashboardFilterError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message)
    this.name = 'EventDashboardFilterError'
  }
}

function optionalTrimmed(value: string | null) {
  return value?.trim() || null
}

export function parseEventDashboardStructureFilters(searchParams: URLSearchParams): Pick<EventDashboardFilters, 'eventStructureItemId' | 'structureKind'> {
  const eventStructureItemId = optionalTrimmed(searchParams.get('eventStructureItemId'))
  const structureKindRaw = optionalTrimmed(searchParams.get('structureKind'))

  if (structureKindRaw && !(Object.values(EventStructureItemKind) as string[]).includes(structureKindRaw)) {
    throw new EventDashboardFilterError('structureKind is invalid', 400)
  }

  return {
    eventStructureItemId,
    structureKind: structureKindRaw as EventStructureItemKind | null,
  }
}

export async function validateEventDashboardFilters(
  input: {
    accountId: string
    accountType?: unknown
    eventId: string
    filters: EventDashboardFilters
  },
  db: PrismaLike = prisma,
) {
  const surveyId = input.filters.surveyId?.trim() || null
  const eventStructureItemId = input.filters.eventStructureItemId?.trim() || null
  const structureKind = input.filters.structureKind ?? null

  if (eventStructureItemId || structureKind) {
    try {
      requireEventsAccountType(
        input.accountType,
        'Event structure dashboard filters are only available for EVENTS accounts',
      )
    } catch (error) {
      if (error instanceof Error && 'status' in error && typeof error.status === 'number') {
        throw new EventDashboardFilterError(error.message, error.status)
      }
      throw error
    }
  }

  let structureItem: { id: string; kind: EventStructureItemKind } | null = null
  if (eventStructureItemId) {
    structureItem = await db.eventStructureItem.findFirst({
      where: {
        id: eventStructureItemId,
        eventId: input.eventId,
        event: {
          location: {
            accountId: input.accountId,
          },
        },
      },
      select: {
        id: true,
        kind: true,
      },
    })

    if (!structureItem) {
      throw new EventDashboardFilterError('Event structure item not found for this event', 404)
    }
  }

  if (structureItem && structureKind && structureItem.kind !== structureKind) {
    throw new EventDashboardFilterError('eventStructureItemId does not match structureKind', 400)
  }

  if (surveyId) {
    const survey = await db.survey.findFirst({
      where: {
        id: surveyId,
        eventId: input.eventId,
      },
      select: {
        id: true,
        surveyTarget: {
          select: {
            eventStructureItemId: true,
            eventStructureItem: {
              select: {
                kind: true,
              },
            },
          },
        },
        publicSurveyLinks: {
          select: {
            surveyTarget: {
              select: {
                eventStructureItemId: true,
                eventStructureItem: { select: { kind: true } },
              },
            },
          },
        },
      },
    })

    if (!survey) {
      throw new EventDashboardFilterError('Survey not found for this event', 404)
    }

    const deploymentTargets = [
      survey.surveyTarget,
      ...(survey.publicSurveyLinks ?? []).flatMap((link) => link.surveyTarget ? [link.surveyTarget] : []),
    ].filter((target): target is NonNullable<typeof target> => Boolean(target))

    if (eventStructureItemId && !deploymentTargets.some((target) => target.eventStructureItemId === eventStructureItemId)) {
      throw new EventDashboardFilterError('surveyId conflicts with eventStructureItemId', 400)
    }

    if (structureKind && !deploymentTargets.some((target) => target.eventStructureItem?.kind === structureKind)) {
      throw new EventDashboardFilterError('surveyId conflicts with structureKind', 400)
    }
  }

  return {
    surveyId,
    eventStructureItemId,
    structureKind,
  }
}

export function buildSurveyTargetStructureWhere(filters: EventDashboardFilters) {
  const eventStructureItemId = filters.eventStructureItemId?.trim() || null
  const structureKind = filters.structureKind ?? null

  if (!eventStructureItemId && !structureKind) return {}

  return {
    surveyTarget: {
      ...(eventStructureItemId ? { eventStructureItemId } : {}),
      ...(structureKind ? { eventStructureItem: { kind: structureKind } } : {}),
    },
  }
}

/** Response-scoped companion using PublicSurveyLink target precedence. */
export function buildEffectiveResponseStructureWhere(filters: EventDashboardFilters) {
  const eventStructureItemId = filters.eventStructureItemId?.trim() || null
  const structureKind = filters.structureKind ?? null
  if (!eventStructureItemId && !structureKind) return {}

  return buildEffectiveResponseTargetWhere({
    ...(eventStructureItemId ? { eventStructureItemId } : {}),
    ...(structureKind ? { eventStructureItem: { kind: structureKind } } : {}),
  })
}
