import { CollectionPhase } from '@prisma/client'
import { describe, expect, it } from 'vitest'
import {
  collectionPhasesForLifecycle,
  lifecycleForCollectionPhase,
  responseCollectionPhaseWhere,
} from './collection-phase'

describe('Event Intelligence collection phase boundary', () => {
  it('keeps PRE responses out of both During and Post cohorts', () => {
    expect(collectionPhasesForLifecycle('PRE_EVENT')).toEqual([CollectionPhase.PRE])
    expect(collectionPhasesForLifecycle('IN_EVENT')).not.toContain(CollectionPhase.PRE)
    expect(collectionPhasesForLifecycle('POST_EVENT')).not.toContain(CollectionPhase.PRE)
  })

  it('includes DURING responses in During and Post, and POST responses only in Post', () => {
    expect(collectionPhasesForLifecycle('IN_EVENT')).toEqual([CollectionPhase.DURING])
    expect(collectionPhasesForLifecycle('POST_EVENT')).toEqual([CollectionPhase.DURING, CollectionPhase.POST])
    expect(collectionPhasesForLifecycle('PRE_EVENT')).not.toContain(CollectionPhase.POST)
    expect(collectionPhasesForLifecycle('IN_EVENT')).not.toContain(CollectionPhase.POST)
  })

  it('excludes nullable legacy responses instead of guessing from timestamps', () => {
    expect(responseCollectionPhaseWhere(undefined)).toEqual({ collectionPhase: { in: [] } })
  })

  it('maps persisted response provenance to lifecycle-appropriate AI context', () => {
    expect(lifecycleForCollectionPhase(CollectionPhase.PRE)).toBe('PRE_EVENT')
    expect(lifecycleForCollectionPhase(CollectionPhase.DURING)).toBe('IN_EVENT')
    expect(lifecycleForCollectionPhase(CollectionPhase.POST)).toBe('POST_EVENT')
  })
})
