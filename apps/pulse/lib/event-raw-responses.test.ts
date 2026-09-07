import { describe, expect, it, vi } from 'vitest'
import { formatStructuredAnswer, getEventRawResponseDetail, listEventRawResponses } from './event-raw-responses'

function db() {
  return {
    answer: { count: vi.fn().mockResolvedValue(2), findMany: vi.fn().mockResolvedValue([]) },
    surveyTarget: { findMany: vi.fn().mockResolvedValue([]) },
    question: { findMany: vi.fn().mockResolvedValue([]) },
  }
}

describe('event raw responses', () => {
  it('lists completed transcript or structured answers scoped to the account and event', async () => {
    const client = db()
    await listEventRawResponses({ accountId: 'account_1', eventId: 'event_1', page: 2, pageSize: 25 }, client as never)

    expect(client.answer.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        status: 'COMPLETED',
        AND: expect.arrayContaining([{ OR: [
          { answerTranscript: { is: { text: { not: '' } } } },
          { numericValue: { not: null } },
        ] }]),
        response: expect.objectContaining({ eventId: 'event_1', status: 'COMPLETED', event: { location: { accountId: 'account_1' } } }),
      }),
    })
    expect(client.answer.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 25, take: 25, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }))
  })

  it('uses server-side transcript, summary, question, and theme search', async () => {
    const client = db()
    await listEventRawResponses({ accountId: 'account_1', eventId: 'event_1', search: 'networking' }, client as never)

    expect(client.answer.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        AND: expect.arrayContaining([expect.objectContaining({ OR: expect.arrayContaining([
          { promptLabel: { contains: 'networking', mode: 'insensitive' } },
          { answerTranscript: { is: { text: { contains: 'networking', mode: 'insensitive' } } } },
          { answerAnalysis: { is: { summary: { contains: 'networking', mode: 'insensitive' } } } },
          { answerEventThemes: { some: { label: { contains: 'networking', mode: 'insensitive' } } } },
        ]) })]),
      }),
    }))
  })

  it('passes the simple listening-point, question, sentiment, and date filters to the authoritative query', async () => {
    const client = db()
    await listEventRawResponses({ accountId: 'account_1', eventId: 'event_1', surveyTargetId: 'target_1', questionId: 'question_1', sentiment: 'positive', dateFrom: '2026-08-01', dateTo: '2026-08-12' }, client as never)
    expect(client.answer.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      questionId: 'question_1',
      answerAnalysis: { is: { sentimentLabel: 'POSITIVE' } },
      createdAt: { gte: new Date('2026-08-01T00:00:00.000Z'), lte: new Date('2026-08-12T23:59:59.999Z') },
      response: expect.objectContaining({
        AND: [expect.objectContaining({ OR: expect.arrayContaining([{ surveyTarget: { id: 'target_1' } }]) })],
      }),
    }) }))
  })

  it('honors dashboard listening-point deep links with the same capture-time target precedence as the inline filter', async () => {
    const client = db()
    await listEventRawResponses({ accountId: 'account_1', eventId: 'event_1', structureKind: 'SESSION' }, client as never)

    expect(client.answer.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      response: expect.objectContaining({
        AND: [expect.objectContaining({ OR: expect.arrayContaining([
          { surveyTarget: { eventStructureItem: { kind: 'SESSION' } } },
        ]) })],
      }),
    }) }))
  })

  it('does not accept unsupported sentiment values', async () => {
    await expect(listEventRawResponses({ accountId: 'account_1', eventId: 'event_1', sentiment: 'urgent' }, db() as never)).rejects.toMatchObject({ status: 400 })
  })

  it('formats every persisted structured answer type without inventing NPS semantics', () => {
    expect(formatStructuredAnswer({ questionType: 'RATING_1_TO_5', numericValue: 4 })).toBe('4 / 5')
    expect(formatStructuredAnswer({ questionType: 'RECOMMENDATION_0_TO_10', numericValue: 8 })).toBe('8 / 10')
    expect(formatStructuredAnswer({ questionType: 'YES_NO', numericValue: 1 })).toBe('Yes')
    expect(formatStructuredAnswer({ questionType: 'YES_NO', numericValue: 0 })).toBe('No')
    expect(formatStructuredAnswer({ questionType: 'SPEAKER_FEEDBACK', numericValue: 5, speakerName: 'Ada Lovelace' })).toBe('5 / 5 for Ada Lovelace')
    expect(formatStructuredAnswer({ questionType: 'SINGLE_CHOICE', numericValue: 1, configurationJson: { options: ['Talk', 'Workshop'] } })).toBe('Workshop')
  })

  it('returns structured values and speaker context alongside free-text answers', async () => {
    const client = db() as ReturnType<typeof db> & { eventSpeakerProfile: { findMany: ReturnType<typeof vi.fn> } }
    client.answer.count.mockResolvedValue(2)
    client.eventSpeakerProfile = { findMany: vi.fn().mockResolvedValue([{ id: 'speaker_ada', name: 'Ada Lovelace' }]) }
    const response = {
      startedAt: new Date('2026-08-18T11:59:00.000Z'), completedAt: new Date('2026-08-18T12:01:00.000Z'),
      surveyTarget: null, publicSurveyLink: null, survey: { surveyTarget: null },
    }
    client.answer.findMany.mockResolvedValue([
      {
        id: 'answer_rating', responseId: 'response_1', questionId: 'question_speaker', promptLabel: 'Rate this speaker', numericValue: 5, speakerId: 'speaker_ada', createdAt: new Date('2026-08-18T12:00:00.000Z'), response,
        question: { id: 'question_speaker', label: 'Rate this speaker', type: 'SPEAKER_FEEDBACK', configurationJson: null },
        answerTranscript: null, answerAnalysis: null, answerEventThemes: [],
      },
      {
        id: 'answer_text', responseId: 'response_1', questionId: 'question_text', promptLabel: 'What worked?', numericValue: null, speakerId: null, createdAt: new Date('2026-08-18T12:00:00.000Z'), response,
        question: { id: 'question_text', label: 'What worked?', type: 'OPEN_RESPONSE', configurationJson: null },
        answerTranscript: { text: 'Useful examples.' }, answerAnalysis: { summary: 'Useful', sentimentLabel: 'POSITIVE' }, answerEventThemes: [],
      },
    ])

    const result = await listEventRawResponses({ accountId: 'account_1', eventId: 'event_1' }, client as never)

    expect(result.items).toEqual([
      expect.objectContaining({ question: expect.objectContaining({ label: 'Rate this speaker' }), answerType: 'STRUCTURED', answerDisplay: '5 / 5 for Ada Lovelace', numericValue: 5 }),
      expect.objectContaining({ question: expect.objectContaining({ label: 'What worked?' }), answerType: 'TEXT', answerDisplay: 'Useful examples.', transcriptExcerpt: 'Useful examples.' }),
    ])
    expect(client.eventSpeakerProfile.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { accountId: 'account_1', id: { in: ['speaker_ada'] }, sessionAssignments: { some: { eventId: 'event_1' } } },
    }))
  })

  it('labels Raw Responses from the immutable capture-time target after a public link is reassigned', async () => {
    const client = db()
    client.answer.count.mockResolvedValue(1)
    client.answer.findMany.mockResolvedValue([{
      id: 'answer_1', responseId: 'response_1', questionId: 'question_1', promptLabel: 'How was it?', createdAt: new Date('2026-08-18T12:00:00.000Z'),
      response: {
        startedAt: new Date('2026-08-18T11:59:00.000Z'), completedAt: new Date('2026-08-18T12:01:00.000Z'),
        surveyTarget: { id: 'target_opening', name: 'Opening Keynote', category: 'SESSION', eventStructureItemId: 'session_opening', eventStructureItem: { id: 'session_opening', name: 'Opening Keynote', kind: 'SESSION' }, speakerAssignment: null },
        publicSurveyLink: { surveyTarget: { id: 'target_breakout_b', name: 'Breakout B', category: 'SESSION', eventStructureItemId: 'session_breakout_b', eventStructureItem: { id: 'session_breakout_b', name: 'Breakout B', kind: 'SESSION' }, speakerAssignment: null } },
        survey: { surveyTarget: { id: 'target_breakout_a', name: 'Breakout A', category: 'SESSION', eventStructureItemId: 'session_breakout_a', eventStructureItem: { id: 'session_breakout_a', name: 'Breakout A', kind: 'SESSION' }, speakerAssignment: null } },
      },
      question: { id: 'question_1', label: 'How was it?' },
      answerTranscript: { text: 'Useful session.' }, answerAnalysis: { summary: 'Useful', sentimentLabel: 'POSITIVE' }, answerEventThemes: [],
    }])

    const result = await listEventRawResponses({ accountId: 'account_1', eventId: 'event_1' }, client as never)
    expect(result.items[0].source).toMatchObject({
      id: 'target_opening',
      name: 'Opening Keynote',
      category: 'SESSION',
      session: { id: 'session_opening' },
    })
  })

  it('labels Event Area and Overall Event responses from their canonical link targets', async () => {
    const client = db()
    client.answer.count.mockResolvedValue(2)
    const answer = (id: string, surveyTarget: Record<string, unknown>) => ({
      id, responseId: `response_${id}`, questionId: 'question_1', promptLabel: 'How was it?', createdAt: new Date('2026-08-18T12:00:00.000Z'),
      response: {
        startedAt: new Date('2026-08-18T11:59:00.000Z'), completedAt: new Date('2026-08-18T12:01:00.000Z'),
        surveyTarget: null,
        publicSurveyLink: { surveyTarget },
        survey: { surveyTarget: null },
      },
      question: { id: 'question_1', label: 'How was it?' },
      answerTranscript: { text: 'Useful feedback.' }, answerAnalysis: { summary: 'Useful', sentimentLabel: 'POSITIVE' }, answerEventThemes: [],
    })
    client.answer.findMany.mockResolvedValue([
      answer('area', { id: 'target_registration', name: 'Registration', category: 'LOCATION', eventStructureItemId: 'area_registration', eventStructureItem: { id: 'area_registration', name: 'Registration', kind: 'AREA' }, speakerAssignment: null }),
      answer('overall', { id: 'target_overall', name: 'Overall Event', category: 'EVENT', eventStructureItemId: null, eventStructureItem: null, speakerAssignment: null }),
    ])

    const result = await listEventRawResponses({ accountId: 'account_1', eventId: 'event_1' }, client as never)
    expect(result.items[0].source).toMatchObject({ id: 'target_registration', name: 'Registration', category: 'LOCATION' })
    expect(result.items[1].source).toMatchObject({ id: 'target_overall', name: 'Overall Event', category: 'EVENT' })
  })

  it('scopes an answer detail query to the authorized account and event', async () => {
    const client = db()
    client.answer.findMany = vi.fn()
    const findFirst = vi.fn().mockResolvedValue(null)
    const detailClient = { ...client, answer: { ...client.answer, findFirst } }
    await expect(getEventRawResponseDetail({ accountId: 'account_1', eventId: 'event_1', answerId: 'answer_other' }, detailClient as never)).rejects.toMatchObject({ status: 404 })
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: {
      id: 'answer_other', response: { eventId: 'event_1', event: { location: { accountId: 'account_1' } } },
    } }))
  })

  it('returns a structured selected answer and preserves text siblings in response detail', async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: 'answer_rating', responseId: 'response_1', questionId: 'question_speaker', promptLabel: 'Rate this speaker',
      createdAt: new Date('2026-08-18T12:00:00.000Z'), durationMs: null, mimeType: null, objectKey: null,
      numericValue: 4, speakerId: 'speaker_ada',
      question: { id: 'question_speaker', label: 'Rate this speaker', key: 'speaker_rating', type: 'SPEAKER_FEEDBACK', configurationJson: null },
      answerTranscript: null, answerAnalysis: null, answerEventThemes: [], answerEventIntelligence: null,
      response: {
        id: 'response_1', startedAt: new Date('2026-08-18T11:59:00.000Z'), completedAt: new Date('2026-08-18T12:01:00.000Z'),
        survey: { id: 'survey_1', name: 'Session pulse', surveyTarget: null }, surveyTarget: null, publicSurveyLink: null,
        answers: [
          { id: 'answer_rating', promptLabel: 'Rate this speaker', numericValue: 4, speakerId: 'speaker_ada', question: { type: 'SPEAKER_FEEDBACK', configurationJson: null }, answerTranscript: null },
          { id: 'answer_text', promptLabel: 'What worked?', numericValue: null, speakerId: null, question: { type: 'OPEN_RESPONSE', configurationJson: null }, answerTranscript: { text: 'Clear examples.' } },
        ],
      },
    })
    const client = {
      answer: { findFirst },
      eventSpeakerProfile: { findMany: vi.fn().mockResolvedValue([{ id: 'speaker_ada', name: 'Ada Lovelace' }]) },
    }

    const result = await getEventRawResponseDetail({ accountId: 'account_1', eventId: 'event_1', answerId: 'answer_rating' }, client as never)

    expect(result).toMatchObject({
      answerType: 'STRUCTURED', answerDisplay: '4 / 5 for Ada Lovelace', numericValue: 4,
      question: { label: 'Rate this speaker', type: 'SPEAKER_FEEDBACK' },
      responseAnswers: [
        { id: 'answer_rating', answerType: 'STRUCTURED', answerDisplay: '4 / 5 for Ada Lovelace', selected: true },
        { id: 'answer_text', answerType: 'TEXT', answerDisplay: 'Clear examples.', selected: false },
      ],
    })
  })

  it('surfaces the honest insufficient-feedback state for sparse Event answers', async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: 'answer_sparse', responseId: 'response_1', questionId: 'question_text', promptLabel: 'What stood out?',
      createdAt: new Date('2026-08-18T12:00:00.000Z'), durationMs: null, mimeType: 'text/plain', objectKey: 'text',
      numericValue: null, speakerId: null,
      question: { id: 'question_text', label: 'What stood out?', key: 'stood_out', type: 'OPEN_RESPONSE', configurationJson: null },
      answerTranscript: { text: 'Lancaster PA' },
      answerAnalysis: {
        summary: '', sentimentLabel: null, sentimentScore: null,
        themesJson: { evidenceState: 'INSUFFICIENT_EVIDENCE', themes: [] },
      },
      answerEventThemes: [], answerEventIntelligence: null,
      response: {
        id: 'response_1', startedAt: new Date('2026-08-18T11:59:00.000Z'), completedAt: new Date('2026-08-18T12:01:00.000Z'),
        survey: { id: 'survey_1', name: 'Event feedback', surveyTarget: null }, surveyTarget: null, publicSurveyLink: null,
        answers: [{
          id: 'answer_sparse', promptLabel: 'What stood out?', numericValue: null, speakerId: null,
          question: { type: 'OPEN_RESPONSE', configurationJson: null }, answerTranscript: { text: 'Lancaster PA' },
        }],
      },
    })
    const client = { answer: { findFirst }, eventSpeakerProfile: { findMany: vi.fn() } }

    const result = await getEventRawResponseDetail({
      accountId: 'account_1', eventId: 'event_1', answerId: 'answer_sparse',
    }, client as never)

    expect(result.analysis).toEqual({
      summary: 'Not enough substantive feedback to analyze.',
      sentiment: null,
      sentimentScore: null,
      evidenceState: 'INSUFFICIENT_EVIDENCE',
    })
    expect(result.themes).toEqual([])
    expect(result.linkedFindings).toEqual([])
  })
})
