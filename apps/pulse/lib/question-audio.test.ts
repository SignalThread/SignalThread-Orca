import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildQuestionAudioObjectKey,
  ensureQuestionAudioAsset,
  getEventQuestionsForRuntime,
  getSurveyQuestionsForRuntime,
  generateQuestionAudioTextHash,
  getDefaultEventTtsSettings,
  getQuestionAudioSourceText,
  previewQuestionAudio,
  resolveEventTtsSettings,
  resolveSurveyQuestionVoiceSettings,
} from './question-audio'
import { CURATED_TTS_VOICE_OPTIONS, DEFAULT_TTS_VOICE_LITERAL, QUESTION_AUDIO_PREVIEW_TEXT } from './tts-voices'

const QUESTION = {
  id: 'question_123',
  key: 'q-1',
  label: 'How was your visit?',
  ttsText: null,
  order: 1,
  required: true,
}

function createDbMock() {
  return {
    questionAudioAsset: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  }
}

function createEventDbMock() {
  return {
    event: {
      findUnique: vi.fn(),
    },
  }
}

describe('question audio helpers', () => {
  it('uses ttsText when present and otherwise falls back to label', () => {
    expect(
      getQuestionAudioSourceText({
        label: 'Displayed label',
        ttsText: 'Spoken override',
      }),
    ).toBe('Spoken override')

    expect(
      getQuestionAudioSourceText({
        label: 'Displayed label',
        ttsText: null,
      }),
    ).toBe('Displayed label')
  })

  it('resolves event-level TTS settings with request overrides and env-backed defaults', () => {
    expect(getDefaultEventTtsSettings()).toEqual({
      provider: 'google',
      voice: process.env.TTS_DEFAULT_VOICE || DEFAULT_TTS_VOICE_LITERAL,
      locale: process.env.TTS_DEFAULT_LOCALE || 'en-US',
    })

    expect(
      resolveEventTtsSettings({
        event: {
          ttsProvider: 'google',
          ttsVoice: 'en-US-Neural2-D',
          ttsLocale: 'en-GB',
        },
        override: {
          voice: 'en-AU-Neural2-A',
        },
      }),
    ).toEqual({
      provider: 'google',
      voice: 'en-AU-Neural2-A',
      locale: 'en-AU',
    })
  })

  it('resolves token survey voice before event and app defaults', () => {
    expect(
      resolveSurveyQuestionVoiceSettings({
        survey: {
          ttsProvider: 'google',
          ttsVoice: 'en-GB-Studio-C',
          ttsLocale: 'en-US',
        },
        event: {
          ttsProvider: 'google',
          ttsVoice: 'en-US-Neural2-F',
          ttsLocale: 'en-US',
        },
      }),
    ).toEqual({
      provider: 'google',
      voice: 'en-GB-Studio-C',
      locale: 'en-GB',
    })
  })

  it('generates preview audio without touching cached assets', async () => {
    const generateSpeech = vi.fn().mockResolvedValue({
      buffer: Buffer.from('preview'),
      mimeType: 'audio/mpeg',
      durationMs: null,
    })

    const result = await previewQuestionAudio(
      {
        provider: 'google',
        voice: 'en-US-Neural2-J',
        locale: 'en-US',
        text: QUESTION_AUDIO_PREVIEW_TEXT,
      },
      { generateSpeech },
    )

    expect(generateSpeech).toHaveBeenCalledWith({
      provider: 'google',
      voice: 'en-US-Neural2-J',
      locale: 'en-US',
      text: QUESTION_AUDIO_PREVIEW_TEXT,
    })
    expect(result.mimeType).toBe('audio/mpeg')
    expect(result.buffer.toString()).toBe('preview')
  })

  it('derives en-GB locale from the selected voice for preview', async () => {
    const generateSpeech = vi.fn().mockResolvedValue({
      buffer: Buffer.from('preview-gb'),
      mimeType: 'audio/mpeg',
      durationMs: null,
    })

    await previewQuestionAudio(
      {
        provider: 'google',
        voice: 'en-GB-Neural2-A',
        locale: 'en-US',
        text: QUESTION_AUDIO_PREVIEW_TEXT,
      },
      { generateSpeech },
    )

    expect(generateSpeech).toHaveBeenCalledWith({
      provider: 'google',
      voice: 'en-GB-Neural2-A',
      locale: 'en-GB',
      text: QUESTION_AUDIO_PREVIEW_TEXT,
    })
  })

  it('derives en-AU locale from the selected voice for preview', async () => {
    const generateSpeech = vi.fn().mockResolvedValue({
      buffer: Buffer.from('preview-au'),
      mimeType: 'audio/mpeg',
      durationMs: null,
    })

    await previewQuestionAudio(
      {
        provider: 'google',
        voice: 'en-AU-Neural2-A',
        locale: 'en-US',
        text: QUESTION_AUDIO_PREVIEW_TEXT,
      },
      { generateSpeech },
    )

    expect(generateSpeech).toHaveBeenCalledWith({
      provider: 'google',
      voice: 'en-AU-Neural2-A',
      locale: 'en-AU',
      text: QUESTION_AUDIO_PREVIEW_TEXT,
    })
  })

  it('supports preview generation for every curated voice', async () => {
    const generateSpeech = vi.fn().mockResolvedValue({
      buffer: Buffer.from('preview-all'),
      mimeType: 'audio/mpeg',
      durationMs: null,
    })

    for (const voice of CURATED_TTS_VOICE_OPTIONS) {
      await previewQuestionAudio(
        {
          provider: voice.provider,
          voice: voice.value,
          locale: 'en-US',
          text: QUESTION_AUDIO_PREVIEW_TEXT,
        },
        { generateSpeech },
      )
    }

    expect(generateSpeech).toHaveBeenCalledTimes(CURATED_TTS_VOICE_OPTIONS.length)
    for (const [index, voice] of CURATED_TTS_VOICE_OPTIONS.entries()) {
      expect(generateSpeech.mock.calls[index][0]).toMatchObject({
        provider: 'google',
        voice: voice.value,
        locale: voice.locale,
      })
    }
  })
})

describe('ensureQuestionAudioAsset', () => {
  let generateSpeech: ReturnType<typeof vi.fn>
  let uploadAudio: ReturnType<typeof vi.fn>
  let verifyAudioExists: ReturnType<typeof vi.fn>
  let buildStorageUrl: ReturnType<typeof vi.fn>

  beforeEach(() => {
    generateSpeech = vi.fn().mockResolvedValue({
      buffer: Buffer.from('audio'),
      mimeType: 'audio/mpeg',
      durationMs: 1200,
    })
    uploadAudio = vi.fn().mockResolvedValue(undefined)
    verifyAudioExists = vi.fn().mockResolvedValue(true)
    buildStorageUrl = vi.fn().mockImplementation((_bucket, key) => `https://storage.example/${key}`)
  })

  it('returns a cache hit without regenerating when a matching asset exists', async () => {
    const db = createDbMock()
    const sourceText = QUESTION.label
    const textHash = generateQuestionAudioTextHash({
      provider: 'google',
      voice: 'en-US-Neural2-F',
      locale: 'en-US',
      sourceText,
    })
    const asset = {
      id: 'asset_1',
      questionId: QUESTION.id,
      provider: 'google',
      voice: 'en-US-Neural2-F',
      language: 'en',
      locale: 'en-US',
      textHash,
      sourceText,
      objectKey: buildQuestionAudioObjectKey(QUESTION.id, textHash, 'audio/mpeg'),
      storageUrl: 'https://storage.example/existing.mp3',
      mimeType: 'audio/mpeg',
      durationMs: 1200,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    }
    db.questionAudioAsset.findUnique.mockResolvedValue(asset)

    const result = await ensureQuestionAudioAsset(
      { question: QUESTION, provider: 'google', voice: 'en-US-Neural2-F', locale: 'en-US' },
      {
        db: db as never,
        bucket: 'uploads',
        generateSpeech: generateSpeech as never,
        uploadAudio: uploadAudio as never,
        verifyAudioExists: verifyAudioExists as never,
        buildStorageUrl: buildStorageUrl as never,
      },
    )

    expect(result.cached).toBe(true)
    expect(result.asset).toBe(asset)
    expect(generateSpeech).not.toHaveBeenCalled()
    expect(uploadAudio).not.toHaveBeenCalled()
    expect(db.questionAudioAsset.upsert).not.toHaveBeenCalled()
  })

  it('generates, uploads, and creates a new asset on cache miss', async () => {
    const db = createDbMock()
    db.questionAudioAsset.findUnique.mockResolvedValue(null)
    const createdAsset = {
      id: 'asset_2',
      questionId: QUESTION.id,
      provider: 'google',
      voice: 'en-US-Neural2-F',
      language: 'en',
      locale: 'en-US',
      textHash: 'hash',
      sourceText: QUESTION.label,
      objectKey: 'question-audio/question_123/hash.mp3',
      storageUrl: 'https://storage.example/question-audio/question_123/hash.mp3',
      mimeType: 'audio/mpeg',
      durationMs: 1200,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    }
    db.questionAudioAsset.upsert.mockResolvedValue(createdAsset)

    const result = await ensureQuestionAudioAsset(
      { question: QUESTION, provider: 'google', voice: 'en-US-Neural2-F', locale: 'en-US' },
      {
        db: db as never,
        bucket: 'uploads',
        generateSpeech: generateSpeech as never,
        uploadAudio: uploadAudio as never,
        verifyAudioExists: verifyAudioExists as never,
        buildStorageUrl: buildStorageUrl as never,
      },
    )

    expect(result.cached).toBe(false)
    expect(generateSpeech).toHaveBeenCalledWith({
      provider: 'google',
      voice: 'en-US-Neural2-F',
      locale: 'en-US',
      text: QUESTION.label,
    })
    expect(uploadAudio).toHaveBeenCalledTimes(1)
    expect(db.questionAudioAsset.upsert).toHaveBeenCalledTimes(1)
  })

  it('creates a new asset when the voice or source text changes', async () => {
    const db = createDbMock()
    db.questionAudioAsset.findUnique.mockResolvedValue(null)
    db.questionAudioAsset.upsert.mockImplementation(async ({ create }) => ({
      id: `${create.voice}-${create.textHash}`,
      ...create,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    }))

    await ensureQuestionAudioAsset(
      {
        question: QUESTION,
        provider: 'google',
        voice: 'en-US-Neural2-F',
        locale: 'en-US',
      },
      {
        db: db as never,
        bucket: 'uploads',
        generateSpeech: generateSpeech as never,
        uploadAudio: uploadAudio as never,
        verifyAudioExists: verifyAudioExists as never,
        buildStorageUrl: buildStorageUrl as never,
      },
    )

    await ensureQuestionAudioAsset(
      {
        question: { ...QUESTION, ttsText: 'Tell us how your visit went.' },
        provider: 'google',
        voice: 'en-US-Neural2-D',
        locale: 'en-US',
      },
      {
        db: db as never,
        bucket: 'uploads',
        generateSpeech: generateSpeech as never,
        uploadAudio: uploadAudio as never,
        verifyAudioExists: verifyAudioExists as never,
        buildStorageUrl: buildStorageUrl as never,
      },
    )

    expect(db.questionAudioAsset.findUnique).toHaveBeenCalledTimes(2)

    const firstWhere = db.questionAudioAsset.findUnique.mock.calls[0][0].where
    const secondWhere = db.questionAudioAsset.findUnique.mock.calls[1][0].where

    expect(firstWhere.questionId_provider_voice_language_locale_textHash.voice).toBe('en-US-Neural2-F')
    expect(secondWhere.questionId_provider_voice_language_locale_textHash.voice).toBe('en-US-Neural2-D')
    expect(
      firstWhere.questionId_provider_voice_language_locale_textHash.textHash,
    ).not.toBe(secondWhere.questionId_provider_voice_language_locale_textHash.textHash)
  })
})

describe('getEventQuestionsForRuntime', () => {
  it('returns playable audio URLs backed by the selected event voice settings', async () => {
    const eventDb = createEventDbMock()
    eventDb.event.findUnique.mockResolvedValue({
      id: 'evt_123',
      ttsProvider: 'google',
      ttsVoice: 'en-GB-Neural2-A',
      ttsLocale: 'en-GB',
      questionsJson: null,
      questions: [QUESTION],
    })

    const db = createDbMock()
    db.questionAudioAsset.findUnique.mockResolvedValue({
      id: 'asset_1',
      questionId: QUESTION.id,
      provider: 'google',
      voice: 'en-GB-Neural2-A',
      language: 'en',
      locale: 'en-GB',
      textHash: 'hash',
      sourceText: QUESTION.label,
      objectKey: 'question-audio/question_123/hash.mp3',
      storageUrl: 'https://storage.example/question-audio/question_123/hash.mp3',
      mimeType: 'audio/mpeg',
      durationMs: 1200,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    })

    const questions = await getEventQuestionsForRuntime(
      'evt_123',
      {},
      {
        eventDb: eventDb as never,
        db: db as never,
        bucket: 'uploads',
        generateSpeech: vi.fn() as never,
        uploadAudio: vi.fn() as never,
        verifyAudioExists: vi.fn().mockResolvedValue(true) as never,
        buildStorageUrl: vi.fn().mockReturnValue('https://storage.example/question-audio/question_123/hash.mp3') as never,
        getPlayableUrl: vi.fn().mockResolvedValue('https://signed.example/question-audio/question_123/hash.mp3'),
      },
    )

    expect(questions).toEqual([
      expect.objectContaining({
        id: 'question_123',
        key: 'q-1',
        audioUrl: 'https://signed.example/question-audio/question_123/hash.mp3',
        ttsProvider: 'google',
        ttsVoice: 'en-GB-Neural2-A',
        ttsLocale: 'en-GB',
        fallbackReason: null,
      }),
    ])
  })

  it('falls back to text-only runtime questions when Question rows are missing', async () => {
    const eventDb = createEventDbMock()
    eventDb.event.findUnique.mockResolvedValue({
      id: 'evt_123',
      ttsProvider: 'google',
      ttsVoice: 'en-US-Neural2-F',
      ttsLocale: 'en-US',
      questions: [],
      questionsJson: [
        {
          key: 'q-fallback',
          label: 'Fallback question',
          order: 0,
          required: true,
        },
      ],
    })

    const questions = await getEventQuestionsForRuntime('evt_123', {}, {
      eventDb: eventDb as never,
    })

    expect(questions).toEqual([
      {
        id: 'q-fallback',
        key: 'q-fallback',
        label: 'Fallback question',
        ttsText: null,
        order: 0,
        required: true,
        audioUrl: null,
        ttsProvider: 'google',
        ttsVoice: 'en-US-Neural2-F',
        ttsLocale: 'en-US',
        fallbackReason: 'missing-question-rows',
        type: 'VOICE',
        responseTarget: 'GENERAL',
      },
    ])
  })

  it('falls back to text-only runtime questions when cached audio generation fails', async () => {
    const eventDb = createEventDbMock()
    eventDb.event.findUnique.mockResolvedValue({
      id: 'evt_123',
      ttsProvider: 'google',
      ttsVoice: 'en-US-Neural2-F',
      ttsLocale: 'en-US',
      questionsJson: null,
      questions: [QUESTION],
    })

    const questions = await getEventQuestionsForRuntime(
      'evt_123',
      {},
      {
        eventDb: eventDb as never,
        db: createDbMock() as never,
        bucket: 'uploads',
        generateSpeech: vi.fn().mockRejectedValue(new Error('tts unavailable')) as never,
        uploadAudio: vi.fn() as never,
        verifyAudioExists: vi.fn().mockResolvedValue(false) as never,
        buildStorageUrl: vi.fn().mockReturnValue(null) as never,
        getPlayableUrl: vi.fn().mockResolvedValue('https://signed.example/question-audio/q1.mp3'),
      },
    )

    expect(questions).toEqual([
      expect.objectContaining({
        id: 'q-1',
        audioUrl: null,
        ttsVoice: 'en-US-Neural2-F',
        ttsLocale: 'en-US',
        fallbackReason: 'question-audio-generation-failed',
      }),
    ])
  })

  it('falls back to text-only when an audio asset is missing instead of crashing the launch', async () => {
    const eventDb = createEventDbMock()
    eventDb.event.findUnique.mockResolvedValue({
      id: 'evt_123',
      ttsProvider: 'google',
      ttsVoice: 'en-US-Neural2-F',
      ttsLocale: 'en-US',
      questionsJson: null,
      questions: [QUESTION],
    })

    const db = createDbMock()
    db.questionAudioAsset.findUnique.mockResolvedValue(null)
    // Upsert resolves without returning a row, so the ensured result has no asset.
    db.questionAudioAsset.upsert.mockResolvedValue(undefined as never)

    const questions = await getEventQuestionsForRuntime(
      'evt_123',
      {},
      {
        eventDb: eventDb as never,
        db: db as never,
        bucket: 'uploads',
        generateSpeech: vi.fn().mockResolvedValue({
          buffer: Buffer.from('audio'),
          mimeType: 'audio/mpeg',
          durationMs: 800,
        }) as never,
        uploadAudio: vi.fn().mockResolvedValue(undefined) as never,
        verifyAudioExists: vi.fn().mockResolvedValue(false) as never,
        buildStorageUrl: vi.fn().mockReturnValue(null) as never,
        getPlayableUrl: vi.fn().mockResolvedValue('https://signed.example/question-audio/q1.mp3'),
      },
    )

    expect(questions).toEqual([
      expect.objectContaining({
        id: 'q-1',
        audioUrl: null,
        fallbackReason: 'question-audio-generation-failed',
      }),
    ])
  })
})

describe('getSurveyQuestionsForRuntime', () => {
  it('loads and generates audio only for questions attached to the selected Survey', async () => {
    const questionDb = {
      question: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'survey_question_1',
            key: 'survey-q1',
            label: 'How was this session?',
            ttsText: null,
            order: 0,
            required: true,
          },
        ]),
      },
    }
    const db = createDbMock()
    db.questionAudioAsset.findUnique.mockResolvedValue(null)
    db.questionAudioAsset.upsert.mockImplementation(async ({ create }) => ({
      id: 'asset_survey_1',
      ...create,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    }))

    const questions = await getSurveyQuestionsForRuntime(
      'survey_123',
      {
        survey: {
          ttsProvider: 'google',
          ttsVoice: 'en-GB-Studio-C',
          ttsLocale: 'en-GB',
        },
        event: {
          ttsProvider: 'google',
          ttsVoice: 'en-US-Neural2-F',
          ttsLocale: 'en-US',
        },
      },
      {
        questionDb: questionDb as never,
        db: db as never,
        bucket: 'uploads',
        generateSpeech: vi.fn().mockResolvedValue({
          buffer: Buffer.from('survey-audio'),
          mimeType: 'audio/mpeg',
          durationMs: 900,
        }) as never,
        uploadAudio: vi.fn() as never,
        verifyAudioExists: vi.fn().mockResolvedValue(false) as never,
        buildStorageUrl: vi.fn().mockReturnValue('https://storage.example/question-audio/survey_question_1/hash.mp3') as never,
        getPlayableUrl: vi.fn().mockResolvedValue('https://signed.example/question-audio/survey_question_1/hash.mp3'),
      },
    )

    expect(questionDb.question.findMany).toHaveBeenCalledWith({
      where: { surveyId: 'survey_123' },
      select: {
        id: true,
        key: true,
        label: true,
        ttsText: true,
        order: true,
        required: true,
        type: true,
        responseTarget: true,
        configurationJson: true,
      },
      orderBy: { order: 'asc' },
    })
    expect(questions).toEqual([
      expect.objectContaining({
        id: 'survey_question_1',
        key: 'survey-q1',
        ttsVoice: 'en-GB-Studio-C',
        ttsLocale: 'en-GB',
        audioUrl: 'https://signed.example/question-audio/survey_question_1/hash.mp3',
      }),
    ])
  })
})
