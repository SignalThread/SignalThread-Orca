import { describe, expect, it } from 'vitest'
import {
  EVENT_ISSUE_CLUSTER_STATUSES,
  EVENT_OPERATIONS_TAXONOMY,
  EVENT_PRIORITY_LEVELS,
  canTransitionEventIssueCluster,
  classifyEventOperationsTaxonomy,
  deriveActionWindowForPriority,
  deriveEventPriorityLevel,
  getEventTaxonomyLabel,
  isActiveEventIssueClusterStatus,
  isEventIssueClusterStatus,
  isEventOperationsTaxonomyKey,
  isEventPriorityLevel,
  mapEventPriorityToLegacyUrgency,
  priorityLevelToActionPriority,
} from './contract'

describe('event intelligence command-center contract', () => {
  it('constrains event operations taxonomy values', () => {
    expect(EVENT_OPERATIONS_TAXONOMY).toEqual([
      'access_checkin',
      'session_content_speakers',
      'room_environment_av',
      'wayfinding',
      'food_beverage',
      'networking_expo',
      'staff_process',
      'safety_accessibility',
      'sponsor_exhibitor_experience',
      'general_positive',
      'general_other',
    ])
    expect(isEventOperationsTaxonomyKey('access_checkin')).toBe(true)
    expect(isEventOperationsTaxonomyKey('registration')).toBe(false)
    expect(getEventTaxonomyLabel('access_checkin')).toBe('Access and check-in')
  })

  it('constrains normalized priority levels', () => {
    expect(EVENT_PRIORITY_LEVELS).toEqual([
      'Immediate',
      'Soon',
      'Watch',
      'Informational',
    ])
    expect(isEventPriorityLevel('Immediate')).toBe(true)
    expect(isEventPriorityLevel('HIGH')).toBe(false)
    expect(priorityLevelToActionPriority('Immediate')).toBe('High')
    expect(priorityLevelToActionPriority('Watch')).toBe('Low')
  })

  it('constrains event issue cluster queue statuses', () => {
    expect(EVENT_ISSUE_CLUSTER_STATUSES).toEqual([
      'NEW',
      'ACKNOWLEDGED',
      'ACTING',
      'RESOLVED',
      'DISMISSED',
    ])
    expect(isEventIssueClusterStatus('ACKNOWLEDGED')).toBe(true)
    expect(isEventIssueClusterStatus('ROUTED')).toBe(false)
    expect(isActiveEventIssueClusterStatus('NEW')).toBe(true)
    expect(isActiveEventIssueClusterStatus('ACKNOWLEDGED')).toBe(true)
    expect(isActiveEventIssueClusterStatus('ACTING')).toBe(true)
    expect(isActiveEventIssueClusterStatus('RESOLVED')).toBe(false)
    expect(isActiveEventIssueClusterStatus('DISMISSED')).toBe(false)
  })

  it('enforces the lightweight alert lifecycle', () => {
    expect(canTransitionEventIssueCluster('NEW', 'ACKNOWLEDGED')).toBe(true)
    expect(canTransitionEventIssueCluster('ACKNOWLEDGED', 'ACTING')).toBe(true)
    expect(canTransitionEventIssueCluster('ACTING', 'RESOLVED')).toBe(true)
    expect(canTransitionEventIssueCluster('NEW', 'DISMISSED')).toBe(true)
    expect(canTransitionEventIssueCluster('RESOLVED', 'NEW')).toBe(true)
    expect(canTransitionEventIssueCluster('DISMISSED', 'NEW')).toBe(true)
    expect(canTransitionEventIssueCluster('NEW', 'RESOLVED')).toBe(false)
    expect(canTransitionEventIssueCluster('RESOLVED', 'ACTING')).toBe(false)
  })

  it('maps free-form event feedback into controlled taxonomy', () => {
    expect(classifyEventOperationsTaxonomy({
      themes: ['Long registration lines'],
      transcriptText: 'Badge pickup was slow and the entry queue wrapped around the lobby.',
      sentimentScore: -0.45,
    })).toBe('access_checkin')

    expect(classifyEventOperationsTaxonomy({
      themes: ['Loved the keynote'],
      transcriptText: 'The keynote speaker and content were excellent.',
      sentimentScore: 0.8,
    })).toBe('session_content_speakers')

    expect(classifyEventOperationsTaxonomy({
      themes: ['Overall experience'],
      transcriptText: 'I had a great time overall.',
      sentimentScore: 0.7,
    })).toBe('general_positive')
  })

  it('does not let negative sentiment alone become Immediate', () => {
    expect(deriveEventPriorityLevel({
      sentimentScore: -0.9,
      frictionCategory: 'session_content_speakers',
      evidenceCount: 2,
      hasAction: false,
    })).toBe('Watch')

    expect(deriveEventPriorityLevel({
      sentimentScore: -0.75,
      frictionCategory: 'access_checkin',
      evidenceCount: 2,
      hasAction: false,
    })).toBe('Soon')
  })

  it('allows clearly time-sensitive operational issues to become Immediate or Soon', () => {
    const immediate = deriveEventPriorityLevel({
      sentimentScore: -0.4,
      actionPriority: 'High',
      frictionCategory: 'safety_accessibility',
      evidenceCount: 2,
      hasAction: true,
    })
    const soon = deriveEventPriorityLevel({
      sentimentScore: -0.35,
      actionPriority: 'Medium',
      frictionCategory: 'room_environment_av',
      evidenceCount: 2,
      hasAction: true,
    })

    expect(immediate).toBe('Immediate')
    expect(mapEventPriorityToLegacyUrgency(immediate)).toBe('HIGH')
    expect(deriveActionWindowForPriority(immediate, true)).toBe('IMMEDIATE')
    expect(soon).toBe('Soon')
    expect(mapEventPriorityToLegacyUrgency(soon)).toBe('MEDIUM')
    expect(deriveActionWindowForPriority(soon, true)).toBe('THIS_WEEK')
  })
})
