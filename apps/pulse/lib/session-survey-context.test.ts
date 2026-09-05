import { QuestionResponseTarget, SurveyTargetCategory } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { resolveSessionSurveyContext } from './session-survey-context'

describe('session survey kiosk context', () => {
  it('uses the canonical session assignments and preserves their sort order', async () => {
    const db = {
      eventStructureItem: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'session_1', name: 'Building Better Workshops',
          speakerAssignments: [
            { speakerId: 'speaker_jane', speaker: { name: 'Jane Doe', isArchived: false } },
            { speakerId: 'speaker_john', speaker: { name: 'John Doe', isArchived: false } },
            { speakerId: 'speaker_archived', speaker: { name: 'Former Presenter', isArchived: true } },
          ],
        }),
      },
    }

    await expect(resolveSessionSurveyContext({
      eventId: 'event_1',
      target: { category: SurveyTargetCategory.SESSION, eventStructureItemId: 'session_1' },
      questions: [{ id: 'overall' }, { id: 'presenters', responseTarget: QuestionResponseTarget.SPEAKERS }],
    }, db as never)).resolves.toEqual({
      session: { id: 'session_1', name: 'Building Better Workshops' },
      speakers: [{ id: 'speaker_jane', name: 'Jane Doe' }, { id: 'speaker_john', name: 'John Doe' }],
      presenterRatingQuestionId: 'presenters',
    })
    expect(db.eventStructureItem.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ eventId: 'event_1', id: 'session_1', kind: 'SESSION' }),
    }))
  })

  it('does not fabricate context for a non-session survey', async () => {
    const db = { eventStructureItem: { findFirst: vi.fn() } }
    await expect(resolveSessionSurveyContext({
      eventId: 'event_1', target: { category: SurveyTargetCategory.EVENT, eventStructureItemId: null }, questions: [],
    }, db as never)).resolves.toBeNull()
    expect(db.eventStructureItem.findFirst).not.toHaveBeenCalled()
  })

  it('supports a one-speaker session without placeholders', async () => {
    const db = { eventStructureItem: { findFirst: vi.fn().mockResolvedValue({ id: 'session_1', name: 'Single Presenter', speakerAssignments: [{ speakerId: 'speaker_1', speaker: { name: 'Avery Lee', isArchived: false } }] }) } }
    await expect(resolveSessionSurveyContext({
      eventId: 'event_1', target: { category: SurveyTargetCategory.SESSION, eventStructureItemId: 'session_1' }, questions: [],
    }, db as never)).resolves.toMatchObject({ speakers: [{ id: 'speaker_1', name: 'Avery Lee' }] })
  })

  it('resolves the same survey questions against each launch session and the current agenda roster', async () => {
    const sessions = new Map([
      ['session_1', { id: 'session_1', name: 'Opening Keynote', speakerAssignments: [
        { speakerId: 'jane', speaker: { name: 'Jane Smith', isArchived: false } },
        { speakerId: 'marcus', speaker: { name: 'Marcus Lee', isArchived: false } },
      ] }],
      ['session_2', { id: 'session_2', name: 'Future of Events', speakerAssignments: [
        { speakerId: 'sarah', speaker: { name: 'Sarah Jones', isArchived: false } },
      ] }],
    ])
    const db = { eventStructureItem: { findFirst: vi.fn().mockImplementation(({ where }) => sessions.get(where.id) ?? null) } }
    const questions = [{ id: 'speaker_rating', responseTarget: QuestionResponseTarget.SPEAKERS }]

    await expect(resolveSessionSurveyContext({
      eventId: 'event_1', target: { category: SurveyTargetCategory.SESSION, eventStructureItemId: 'session_1' }, questions,
    }, db as never)).resolves.toMatchObject({
      session: { name: 'Opening Keynote' },
      speakers: [{ name: 'Jane Smith' }, { name: 'Marcus Lee' }],
      presenterRatingQuestionId: 'speaker_rating',
    })
    await expect(resolveSessionSurveyContext({
      eventId: 'event_1', target: { category: SurveyTargetCategory.SESSION, eventStructureItemId: 'session_2' }, questions,
    }, db as never)).resolves.toMatchObject({
      session: { name: 'Future of Events' }, speakers: [{ name: 'Sarah Jones' }],
    })

    sessions.set('session_2', { id: 'session_2', name: 'Future of Events — Updated', speakerAssignments: [
      { speakerId: 'jane', speaker: { name: 'Jane Smith', isArchived: false } },
    ] })
    await expect(resolveSessionSurveyContext({
      eventId: 'event_1', target: { category: SurveyTargetCategory.SESSION, eventStructureItemId: 'session_2' }, questions,
    }, db as never)).resolves.toMatchObject({
      session: { name: 'Future of Events — Updated' }, speakers: [{ name: 'Jane Smith' }],
    })
  })
})
