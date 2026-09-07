import type { Prisma } from '@prisma/client'

/**
 * Minimum canonical target shape required to attribute captured feedback.
 * Callers may preload richer relations; the resolver returns the same record.
 */
export interface EffectiveResponseTargetRecord {
  id: string
  category: string
  name?: string | null
  eventStructureItemId?: string | null
  eventStructureItem?: unknown
}

export type EffectiveResponseTargetSource =
  | 'PUBLIC_SURVEY_LINK'
  | 'RESPONSE'
  | 'SURVEY'

export interface EffectiveResponseTargetContext<T extends EffectiveResponseTargetRecord> {
  targetId: string
  category: string
  label: string | null
  sessionId: string | null
  areaId: string | null
  source: EffectiveResponseTargetSource
  target: T
}

/**
 * Canonical target precedence for captured responses.
 *
 * Response.surveyTarget is the durable capture-time authority. A public-link
 * target is only a legacy fallback when an older response did not snapshot a
 * target. This lets a stable public token move to a new current assignment
 * without moving historical analytics with it. Survey.surveyTarget is the
 * final fallback for responses created before scoped links.
 * Display names are never used to infer identity.
 */
export function resolveEffectiveResponseTarget<T extends EffectiveResponseTargetRecord>(input: {
  publicSurveyLink?: { surveyTarget?: T | null } | null
  responseTarget?: T | null
  survey?: { surveyTarget?: T | null } | null
}): EffectiveResponseTargetContext<T> | null {
  const linkTarget = input.publicSurveyLink?.surveyTarget ?? null
  const target = input.responseTarget ?? linkTarget ?? input.survey?.surveyTarget ?? null
  if (!target) return null

  const source: EffectiveResponseTargetSource = input.responseTarget
    ? 'RESPONSE'
    : linkTarget
      ? 'PUBLIC_SURVEY_LINK'
      : 'SURVEY'
  const structureItem = target.eventStructureItem && typeof target.eventStructureItem === 'object'
    ? target.eventStructureItem as { id?: unknown; kind?: unknown }
    : null
  const structureId = target.eventStructureItemId
    ?? (typeof structureItem?.id === 'string' ? structureItem.id : null)

  return {
    targetId: target.id,
    category: target.category,
    label: target.name?.trim() || null,
    sessionId: target.category === 'SESSION' ? structureId : null,
    areaId: target.category === 'LOCATION' && structureItem?.kind === 'AREA' ? structureId : null,
    source,
    target,
  }
}

/**
 * Prisma predicate matching the same precedence without per-response queries.
 * Link and Survey fallbacks are only eligible when the response did not retain
 * a target, so a reassigned public link cannot rewrite historical attribution.
 */
export function buildEffectiveResponseTargetWhere(
  targetWhere: Prisma.SurveyTargetWhereInput,
): Prisma.ResponseWhereInput {
  return {
    OR: [
      { surveyTarget: targetWhere },
      { surveyTargetId: null, publicSurveyLink: { surveyTarget: targetWhere } },
      {
        surveyTargetId: null,
        publicSurveyLink: { surveyTargetId: null },
        survey: { surveyTarget: targetWhere },
      },
      {
        publicSurveyLinkId: null,
        surveyTargetId: null,
        survey: { surveyTarget: targetWhere },
      },
    ],
  }
}
