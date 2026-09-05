import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'
import {
  buildAnswerCreateData,
  buildResponseCreateData,
  parseArgs,
} from './seedVoiceResponses'

const scriptSource = fs.readFileSync(
  path.join(process.cwd(), 'scripts/seedVoiceResponses.ts'),
  'utf8',
)

describe('seedVoiceResponses script contract', () => {
  it('parses eventId and token launch modes as mutually exclusive', () => {
    expect(parseArgs(['--eventId=evt_123', '--count=5'])).toMatchObject({
      mode: 'eventId',
      eventId: 'evt_123',
      token: '',
      count: 5,
      runAnalysis: false,
    })

    expect(parseArgs(['--token=public-token', '--count=30', '--runAnalysis'])).toMatchObject({
      mode: 'token',
      eventId: '',
      token: 'public-token',
      count: 30,
      runAnalysis: true,
    })

    expect(() => parseArgs([])).toThrow('Provide exactly one of --eventId or --token')
    expect(() => parseArgs(['--eventId=evt_123', '--token=public-token'])).toThrow('Provide exactly one of --eventId or --token')
  })

  it('writes survey linkage only for token-mode responses', () => {
    const startedAt = new Date('2026-06-02T10:00:00.000Z')
    const completedAt = new Date('2026-06-02T10:03:00.000Z')

    expect(buildResponseCreateData({
      mode: 'token',
      eventId: 'evt_123',
      surveyId: 'survey_123',
      surveyTargetId: 'target_123',
      publicSurveyLinkId: 'link_123',
      collectionPhase: 'PRE',
      questions: [],
    }, 0, startedAt, completedAt)).toMatchObject({
      eventId: 'evt_123',
      surveyId: 'survey_123',
      surveyTargetId: 'target_123',
      publicSurveyLinkId: 'link_123',
      collectionPhase: 'PRE',
      status: 'COMPLETED',
      metadata: {
        source: 'seedVoiceResponses',
        voiceSeed: true,
        launchMode: 'token',
      },
    })

    expect(buildResponseCreateData({
      mode: 'eventId',
      eventId: 'evt_legacy',
      questions: [],
    }, 0, startedAt, completedAt)).not.toEqual(expect.objectContaining({
      surveyId: expect.any(String),
      surveyTargetId: expect.any(String),
      publicSurveyLinkId: expect.any(String),
    }))
  })

  it('writes Answer.questionId only for token-mode answers', () => {
    const generatedAnswer = {
      questionKey: 'survey-q1',
      promptLabel: 'What was valuable?',
      transcript: 'The panels were practical and memorable.',
    }

    expect(buildAnswerCreateData({
      mode: 'token',
      eventId: 'evt_123',
      surveyId: 'survey_123',
      surveyTargetId: 'target_123',
      publicSurveyLinkId: 'link_123',
      collectionPhase: 'PRE',
      questions: [],
    }, 'response_123', {
      id: 'question_123',
      key: 'survey-q1',
      label: 'What was valuable?',
    }, generatedAnswer, 'voice-seed/key.webm', 'What was valuable?')).toMatchObject({
      responseId: 'response_123',
      questionId: 'question_123',
      questionKey: 'survey-q1',
      promptLabel: 'What was valuable?',
      status: 'COMPLETED',
    })

    expect(buildAnswerCreateData({
      mode: 'eventId',
      eventId: 'evt_legacy',
      questions: [],
    }, 'response_legacy', {
      id: 'question_legacy',
      key: 'q1',
      label: 'Legacy question',
    }, {
      ...generatedAnswer,
      questionKey: 'q1',
    }, 'voice-seed/legacy.webm', 'Legacy question')).not.toEqual(expect.objectContaining({
      questionId: expect.any(String),
    }))
  })

  it('uses token resolution and the canonical event intelligence write path', () => {
    expect(scriptSource).toContain('resolvePublicSurveyLaunchContext')
    expect(scriptSource).toContain("where: {\n        surveyId: launch.survey.id")
    expect(scriptSource).toContain('writeEventIntelligenceForAnalyzedAnswer')
    expect(scriptSource).toContain('OPENAI_API_KEY is required when --runAnalysis is passed')
    expect(scriptSource).not.toContain('sk-proj-')
  })
})
