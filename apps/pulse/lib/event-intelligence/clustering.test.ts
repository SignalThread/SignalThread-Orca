import { describe, expect, it, vi } from 'vitest'
import {
  buildEventIssueClusterKey,
  buildTranscriptSnippet,
  shouldWriteEventIssueCluster,
  writeEventIssueClusterEvidence,
} from './clustering'

function createTxMock() {
  return {
    eventIssueCluster: {
      upsert: vi.fn().mockResolvedValue({
        id: 'cluster_123',
        firstSeenAt: new Date('2026-06-03T09:00:00.000Z'),
      }),
      update: vi.fn().mockResolvedValue({}),
    },
    eventIssueEvidence: {
      upsert: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([
        { priorityLevel: 'Soon', createdAt: new Date('2026-06-03T09:00:00.000Z') },
        { priorityLevel: 'Immediate', createdAt: new Date('2026-06-03T10:00:00.000Z') },
      ]),
    },
  }
}

const baseInput = {
  accountId: 'account_123',
  locationId: 'location_123',
  eventId: 'event_123',
  surveyId: 'survey_123',
  surveyTargetId: 'target_123',
  responseId: 'response_123',
  collectionPhase: 'DURING' as const,
  answerId: 'answer_123',
  questionId: 'question_123',
  taxonomyKey: 'access_checkin' as const,
  recommendedAction: 'Shorten registration lines',
  transcriptText: 'The check-in line was long and badge pickup needs more stations.',
  sentimentScore: -0.45,
  priorityLevel: 'Immediate' as const,
  legacyUrgency: 'HIGH',
  confidence: 0.9,
  now: new Date('2026-06-03T10:00:00.000Z'),
}

describe('event issue clustering', () => {
  it('creates deterministic cluster keys from event, taxonomy, scope, and title', () => {
    expect(buildEventIssueClusterKey(baseInput)).toBe(
      'event_123:DURING:access_checkin:target_123:question_123:shorten_registration_lines',
    )
  })

  it('cannot merge otherwise identical findings or actions across collection phases', () => {
    const preKey = buildEventIssueClusterKey({ ...baseInput, collectionPhase: 'PRE' })
    const duringKey = buildEventIssueClusterKey({ ...baseInput, collectionPhase: 'DURING' })
    const postKey = buildEventIssueClusterKey({ ...baseInput, collectionPhase: 'POST' })

    expect(new Set([preKey, duringKey, postKey]).size).toBe(3)
  })

  it('requires actionable operational taxonomy before writing a cluster', () => {
    expect(shouldWriteEventIssueCluster(baseInput)).toBe(true)
    expect(shouldWriteEventIssueCluster({
      taxonomyKey: 'general_positive',
      recommendedAction: 'Share positive feedback',
      priorityLevel: 'Informational',
    })).toBe(false)
    expect(shouldWriteEventIssueCluster({
      taxonomyKey: 'access_checkin',
      recommendedAction: null,
      priorityLevel: 'Watch',
    })).toBe(false)
  })

  it('builds bounded transcript snippets for evidence', () => {
    const snippet = buildTranscriptSnippet(` ${'Registration was slow. '.repeat(40)} `, 80)
    expect(snippet.length).toBeLessThanOrEqual(80)
    expect(snippet.endsWith('…')).toBe(true)
  })

  it('upserts a cluster and dedupe-safe evidence, then rolls up priority and counts', async () => {
    const tx = createTxMock()

    const result = await writeEventIssueClusterEvidence(tx, baseInput)

    expect(result).toEqual({
      wrote: true,
      clusterId: 'cluster_123',
      clusterKey: 'event_123:DURING:access_checkin:target_123:question_123:shorten_registration_lines',
    })
    expect(tx.eventIssueCluster.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          clusterKey: 'event_123:DURING:access_checkin:target_123:question_123:shorten_registration_lines',
        },
      }),
    )
    expect(tx.eventIssueEvidence.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          clusterId_answerId: {
            clusterId: 'cluster_123',
            answerId: 'answer_123',
          },
        },
        create: expect.objectContaining({
          responseId: 'response_123',
          answerId: 'answer_123',
          questionId: 'question_123',
          surveyTargetId: 'target_123',
          priorityLevel: 'Immediate',
        }),
      }),
    )
    expect(tx.eventIssueCluster.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'cluster_123' },
        data: expect.objectContaining({
          priorityLevel: 'Immediate',
          evidenceCount: 2,
          firstSeenAt: new Date('2026-06-03T09:00:00.000Z'),
          lastSeenAt: new Date('2026-06-03T10:00:00.000Z'),
        }),
      }),
    )
  })

  it('prefers representative snippets when writing evidence', async () => {
    const tx = createTxMock()

    await writeEventIssueClusterEvidence(tx, {
      ...baseInput,
      representativeSnippet: 'Exact attendee evidence about the badge queue.',
      transcriptText: 'Longer transcript that should not be used when the event extraction supplies better evidence.',
    })

    expect(tx.eventIssueEvidence.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          transcriptSnippet: 'Exact attendee evidence about the badge queue.',
        }),
      }),
    )
  })
})
