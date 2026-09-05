import { describe, expect, it } from 'vitest'
import { normalizeQuestionsJsonForBackfill } from './question-backfill'

describe('normalizeQuestionsJsonForBackfill', () => {
  it('skips invalid rows, preserves the first valid duplicate key deterministically, and reassigns unique sequential order', () => {
    expect(
      normalizeQuestionsJsonForBackfill([
        { key: 'q-2', label: 'Second question', order: 3, required: false },
        { key: 'q-1', text: 'First question', order: 1 },
        { key: 'q-1', label: 'Duplicate question', order: 2 },
        { key: '', label: 'Missing key', order: 4 },
        { key: 'q-3', label: '  ', order: 5 },
        { key: 'q-4', label: 'Fallback order question' },
      ]),
    ).toEqual([
      {
        key: 'q-1',
        label: 'First question',
        ttsText: null,
        order: 1,
        required: true,
      },
      {
        key: 'q-2',
        label: 'Second question',
        ttsText: null,
        order: 2,
        required: false,
      },
      {
        key: 'q-4',
        label: 'Fallback order question',
        ttsText: null,
        order: 3,
        required: true,
      },
    ])
  })

  it('returns an empty list when no valid questions exist', () => {
    expect(
      normalizeQuestionsJsonForBackfill([
        null,
        {},
        { key: 'q-1' },
        { label: 'Missing key' },
      ]),
    ).toEqual([])
  })
})
