import { describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import {
  applyEventSurveySignageConfiguration,
} from './event-signage-service'
import { DEFAULT_EVENT_SIGNAGE_VISUAL_CONFIGURATION } from './event-signage'

function createDb(surveys: Array<{ id: string; settingsJson?: unknown }> = [{ id: 'survey-1' }]) {
  const update = vi.fn(async ({ where }: { where: { id: string } }) => ({ id: where.id }))
  const findSurveys = async ({ where }: { where: { id: { in: string[] } } }) => surveys
    .filter((survey) => where.id.in.includes(survey.id))
    .map((survey) => ({ id: survey.id, settingsJson: survey.settingsJson ?? null }))
  const tx = { survey: { findMany: vi.fn(findSurveys), update } }
  const db = {
    event: { findFirst: vi.fn(async () => ({ id: 'event-1' })) },
    surveyTarget: { findMany: vi.fn(async () => [{ id: 'target-1', metadata: null }]) },
    survey: {
      findMany: vi.fn(findSurveys),
    },
    $transaction: vi.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)),
  }
  return { db: db as unknown as PrismaClient, rawDb: db, update }
}

describe('applyEventSurveySignageConfiguration', () => {
  it('applies One through the canonical update service without creating a Survey', async () => {
    const { db, rawDb, update } = createDb([{ id: 'survey-1', settingsJson: { templateRecommendation: { key: 'existing' } } }])
    const result = await applyEventSurveySignageConfiguration({
      accountId: 'account-1', eventId: 'event-1', surveyIds: ['survey-1'], configuration: DEFAULT_EVENT_SIGNAGE_VISUAL_CONFIGURATION,
    }, db)

    expect(result.updatedSurveyIds).toEqual(['survey-1'])
    expect(rawDb.event.findFirst).toHaveBeenCalledWith({
      where: { id: 'event-1', location: { accountId: 'account-1' } }, select: { id: true },
    })
    expect(update).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'survey-1' },
      data: { settingsJson: { templateRecommendation: { key: 'existing' }, qrSignage: DEFAULT_EVENT_SIGNAGE_VISUAL_CONFIGURATION } },
    }))
    expect((rawDb as unknown as { survey: { create?: unknown } }).survey.create).toBeUndefined()
  })

  it('applies Multiple and All as the exact explicit authorized survey ID list', async () => {
    const { db, update } = createDb([{ id: 'survey-1' }, { id: 'survey-2' }, { id: 'survey-3' }])
    const result = await applyEventSurveySignageConfiguration({
      accountId: 'account-1', eventId: 'event-1', surveyIds: ['survey-1', 'survey-2', 'survey-3'], configuration: DEFAULT_EVENT_SIGNAGE_VISUAL_CONFIGURATION,
    }, db)
    expect(result.updatedSurveyIds).toEqual(['survey-1', 'survey-2', 'survey-3'])
    expect(update.mock.calls.map(([args]) => args.where.id)).toEqual(['survey-1', 'survey-2', 'survey-3'])
  })

  it('persists one selected template across a bulk apply without adding QR runtime data', async () => {
    const configuration = { ...DEFAULT_EVENT_SIGNAGE_VISUAL_CONFIGURATION, preset: 'bold_event' as const }
    const { db, update } = createDb([{ id: 'survey-1' }, { id: 'survey-2' }])
    await applyEventSurveySignageConfiguration({
      accountId: 'account-1', eventId: 'event-1', surveyIds: ['survey-1', 'survey-2'], configuration,
    }, db)
    for (const [args] of update.mock.calls) {
      expect(args).toEqual(expect.objectContaining({ data: { settingsJson: { qrSignage: configuration } } }))
      expect(configuration).not.toHaveProperty('qrUrl')
    }
  })

  it('deduplicates repeated IDs without duplicating writes or records', async () => {
    const { db, update } = createDb([{ id: 'survey-1' }])
    const result = await applyEventSurveySignageConfiguration({
      accountId: 'account-1', eventId: 'event-1', surveyIds: ['survey-1', 'survey-1'], configuration: DEFAULT_EVENT_SIGNAGE_VISUAL_CONFIGURATION,
    }, db)
    expect(result.updatedSurveyIds).toEqual(['survey-1'])
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('rejects cross-event or unknown survey IDs before any mutation', async () => {
    const { db, rawDb, update } = createDb([{ id: 'survey-1' }])
    await expect(applyEventSurveySignageConfiguration({
      accountId: 'account-1', eventId: 'event-1', surveyIds: ['survey-1', 'survey-other-event'], configuration: DEFAULT_EVENT_SIGNAGE_VISUAL_CONFIGURATION,
    }, db)).rejects.toMatchObject({ code: 'SURVEY_SCOPE_MISMATCH', status: 400 })
    expect(rawDb.$transaction).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  it('rejects an event outside the authenticated account scope', async () => {
    const { db, rawDb } = createDb()
    rawDb.event.findFirst.mockResolvedValueOnce(null as never)
    await expect(applyEventSurveySignageConfiguration({
      accountId: 'account-other', eventId: 'event-1', surveyIds: ['survey-1'], configuration: DEFAULT_EVENT_SIGNAGE_VISUAL_CONFIGURATION,
    }, db)).rejects.toMatchObject({ code: 'EVENT_NOT_FOUND', status: 404 })
    expect(rawDb.survey.findMany).not.toHaveBeenCalled()
  })
})
