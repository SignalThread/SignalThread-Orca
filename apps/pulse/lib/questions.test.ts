import { describe, expect, it, vi } from 'vitest'
import { normalizeEventQuestions, syncEventQuestions } from './questions'

describe('normalizeEventQuestions', () => {
  it('normalizes create-flow questions into key/label/order/required/ttsText', () => {
    expect(
      normalizeEventQuestions([
        { id: 'q-1', text: 'How was your visit?', order: 0 },
        { key: 'q-2', label: 'What did we do well?', order: 1, required: false, ttsText: 'Tell us what we did well.' },
      ]),
    ).toEqual([
      {
        key: 'q-1',
        label: 'How was your visit?',
        ttsText: null,
        order: 0,
        required: true,
      },
      {
        key: 'q-2',
        label: 'What did we do well?',
        ttsText: 'Tell us what we did well.',
        order: 1,
        required: false,
      },
    ])
  })

  it('rejects duplicate keys or duplicate orders in a payload', () => {
    expect(() =>
      normalizeEventQuestions([
        { key: 'q-1', label: 'A', order: 0 },
        { key: 'q-1', label: 'B', order: 1 },
      ]),
    ).toThrow('Duplicate question key')

    expect(() =>
      normalizeEventQuestions([
        { key: 'q-1', label: 'A', order: 0 },
        { key: 'q-2', label: 'B', order: 0 },
      ]),
    ).toThrow('Duplicate question order')
  })
})

describe('syncEventQuestions', () => {
  it('dual-writes create/edit payloads and deletes removed event questions', async () => {
    const findMany = vi.fn().mockResolvedValue([{ key: 'obsolete' }])
    const updateMany = vi.fn().mockResolvedValue({ count: 1 })
    const upsert = vi.fn().mockResolvedValue(undefined)
    const deleteMany = vi.fn().mockResolvedValue({ count: 1 })

    const db = {
      question: {
        findMany,
        updateMany,
        upsert,
        deleteMany,
      },
    }

    await syncEventQuestions(db as never, 'evt_123', [
      { id: 'q-1', text: 'How was your visit?', order: 0 },
      { key: 'q-2', label: 'What should we improve?', order: 1, required: false, ttsText: 'What should we improve next time?' },
    ])

    expect(findMany).toHaveBeenCalledWith({
      where: { eventId: 'evt_123', surveyId: null },
      select: { key: true },
    })

    expect(updateMany).toHaveBeenCalledWith({
      where: { eventId: 'evt_123', surveyId: null },
      data: {
        order: {
          increment: 1_000_000,
        },
      },
    })

    expect(upsert).toHaveBeenNthCalledWith(1, {
      where: {
        eventId_key: {
          eventId: 'evt_123',
          key: 'q-1',
        },
      },
      update: {
        label: 'How was your visit?',
        ttsText: null,
        order: 0,
        required: true,
      },
      create: {
        eventId: 'evt_123',
        surveyId: null,
        key: 'q-1',
        label: 'How was your visit?',
        ttsText: null,
        order: 0,
        required: true,
      },
    })

    expect(upsert).toHaveBeenNthCalledWith(2, {
      where: {
        eventId_key: {
          eventId: 'evt_123',
          key: 'q-2',
        },
      },
      update: {
        label: 'What should we improve?',
        ttsText: 'What should we improve next time?',
        order: 1,
        required: false,
      },
      create: {
        eventId: 'evt_123',
        surveyId: null,
        key: 'q-2',
        label: 'What should we improve?',
        ttsText: 'What should we improve next time?',
        order: 1,
        required: false,
      },
    })

    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        eventId: 'evt_123',
        surveyId: null,
        key: {
          notIn: ['q-1', 'q-2'],
        },
      },
    })
  })
})
