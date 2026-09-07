import { CollectionPhase, type Prisma } from '@prisma/client'
import type { ResolvedEventLifecyclePhase } from '@/lib/events-home-groups'

/**
 * Canonical persisted evidence cohorts for an Event Intelligence view.
 * Unclassified legacy responses intentionally match no lifecycle view.
 */
export function collectionPhasesForLifecycle(
  lifecyclePhase: ResolvedEventLifecyclePhase | undefined,
): CollectionPhase[] {
  if (lifecyclePhase === 'PRE_EVENT') return [CollectionPhase.PRE]
  if (lifecyclePhase === 'IN_EVENT') return [CollectionPhase.DURING]
  if (lifecyclePhase === 'POST_EVENT') return [CollectionPhase.DURING, CollectionPhase.POST]
  return []
}

export function responseCollectionPhaseWhere(
  lifecyclePhase: ResolvedEventLifecyclePhase | undefined,
): Prisma.ResponseWhereInput {
  return {
    collectionPhase: {
      in: collectionPhasesForLifecycle(lifecyclePhase),
    },
  }
}

export function lifecycleForCollectionPhase(phase: CollectionPhase): Exclude<ResolvedEventLifecyclePhase, null> {
  if (phase === CollectionPhase.PRE) return 'PRE_EVENT'
  if (phase === CollectionPhase.DURING) return 'IN_EVENT'
  return 'POST_EVENT'
}
