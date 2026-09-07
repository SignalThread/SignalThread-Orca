import type { Prisma } from '@prisma/client'
import { isPlannerManagedSurveyTarget } from '@/lib/event-survey-scope'

export type SurveyAssignmentState = 'CURRENT' | 'SUPERSEDED'

export type SurveyAssignmentRule = {
  kind: 'EVENT' | 'SESSION' | 'SPEAKER' | 'LOCATION' | 'CUSTOM'
  selection: 'ALL' | 'SELECTED'
}

export type SurveyTargetAssignmentLink = {
  metadata?: Prisma.JsonValue | null
}

export type SurveyAssignmentEntityType = 'SESSION' | 'SPEAKER' | 'AREA'

type EntitySurveyTarget = {
  id?: string | null
  eventId?: string | null
  category?: string | null
  eventStructureItemId?: string | null
  speakerId?: string | null
  isActive?: boolean | null
  metadata?: Prisma.JsonValue | null
}

export type EntitySurveyAssignmentLink = SurveyTargetAssignmentLink & {
  surveyTarget?: EntitySurveyTarget | null
}

export function surveyAssignmentState(link: SurveyTargetAssignmentLink): SurveyAssignmentState | null {
  if (!link.metadata || typeof link.metadata !== 'object' || Array.isArray(link.metadata)) return null
  const value = (link.metadata as Record<string, unknown>).assignmentState
  return value === 'CURRENT' || value === 'SUPERSEDED' ? value : null
}

export function surveyAssignmentMetadata(
  metadata: Prisma.JsonValue | null | undefined,
  state: SurveyAssignmentState,
  rule?: SurveyAssignmentRule,
): Prisma.InputJsonValue {
  const existing = metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? metadata as Record<string, Prisma.JsonValue>
    : {}
  return { ...existing, ...(rule ? { advancedAssignment: rule } : {}), assignmentState: state }
}

export function surveyAssignmentRule(link: SurveyTargetAssignmentLink): SurveyAssignmentRule | null {
  if (!link.metadata || typeof link.metadata !== 'object' || Array.isArray(link.metadata)) return null
  const value = (link.metadata as Record<string, unknown>).advancedAssignment
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const { kind, selection } = value as Record<string, unknown>
  if (!['EVENT', 'SESSION', 'SPEAKER', 'LOCATION', 'CUSTOM'].includes(String(kind))) return null
  if (selection !== 'ALL' && selection !== 'SELECTED') return null
  return { kind: kind as SurveyAssignmentRule['kind'], selection }
}

/**
 * Callers provide links in their legacy preference order (active/newest).
 * Explicit CURRENT metadata wins; SUPERSEDED links never become authoritative.
 * A link without metadata remains the backwards-compatible fallback.
 */
export function resolveCurrentSurveyAssignment<T extends SurveyTargetAssignmentLink>(links: T[]): T | null {
  return links.find((link) => surveyAssignmentState(link) === 'CURRENT')
    ?? links.find((link) => surveyAssignmentState(link) === null)
    ?? null
}

/**
 * Canonical Operations assignment lookup. A current PublicSurveyLink attached
 * to a planner-managed SurveyTarget is the sole authority; Survey.surveyTargetId
 * is only a legacy authoring pointer and must not decide Attach versus Swap.
 */
export function getAssignedSurveyForEntity<T extends EntitySurveyAssignmentLink>(
  eventId: string,
  entityType: SurveyAssignmentEntityType,
  entityId: string,
  links: T[],
): T | null {
  const matchingLinks = links.filter((link) => {
    const target = link.surveyTarget
    if (!target || target.eventId !== eventId || target.isActive === false || !isPlannerManagedSurveyTarget(target)) return false
    if (entityType === 'SESSION') return target.category === 'SESSION' && target.eventStructureItemId === entityId
    if (entityType === 'SPEAKER') return target.category === 'SPEAKER' && target.speakerId === entityId
    return ['EVENT', 'LOCATION', 'CUSTOM'].includes(target.category ?? '') && target.eventStructureItemId === entityId
  })
  return resolveCurrentSurveyAssignment(matchingLinks)
}
