import { vi } from 'vitest'

export function mockObjectStorage(overrides: Partial<{
  presignPut: ReturnType<typeof vi.fn>
  verifyObjectExists: ReturnType<typeof vi.fn>
  getPlayableObjectUrl: ReturnType<typeof vi.fn>
  uploadObject: ReturnType<typeof vi.fn>
  generateObjectKey: ReturnType<typeof vi.fn>
  getStorageConfig: ReturnType<typeof vi.fn>
}> = {}) {
  return {
    presignPut: overrides.presignPut ?? vi.fn().mockResolvedValue('https://storage.example/presigned-put'),
    verifyObjectExists: overrides.verifyObjectExists ?? vi.fn().mockResolvedValue(true),
    getPlayableObjectUrl: overrides.getPlayableObjectUrl ?? vi.fn().mockResolvedValue('https://storage.example/playable.mp3'),
    uploadObject: overrides.uploadObject ?? vi.fn().mockResolvedValue(undefined),
    generateObjectKey: overrides.generateObjectKey ?? vi.fn().mockReturnValue('recordings/test-answer.webm'),
    getStorageConfig: overrides.getStorageConfig ?? vi.fn().mockReturnValue({ provider: 'test-storage' }),
  }
}

export function mockOpenAITranscription(text = 'This is a deterministic transcript.') {
  return {
    transcribeAudio: vi.fn().mockResolvedValue({
      text,
      language: 'en',
      duration: 1.25,
    }),
  }
}

export function mockOpenAIAnalysis(overrides: Record<string, unknown> = {}) {
  return {
    analyzeTranscript: vi.fn().mockResolvedValue({
      summary: 'Deterministic analysis summary.',
      sentiment: 'POSITIVE',
      sentimentScore: 0.7,
      themes: ['Service'],
      actionItems: [{ text: 'Keep staffing level steady', priority: 'Low' }],
      keyQuote: 'The team helped quickly.',
      ...overrides,
    }),
  }
}

export function mockTTS() {
  return {
    synthesizeSpeech: vi.fn().mockResolvedValue({
      buffer: Buffer.from('test-audio'),
      mimeType: 'audio/mpeg',
      durationMs: 900,
    }),
    previewQuestionAudio: vi.fn().mockResolvedValue({
      buffer: Buffer.from('test-audio'),
      mimeType: 'audio/mpeg',
      durationMs: 900,
    }),
  }
}

export function mockStripePortal() {
  return {
    billingPortal: {
      sessions: {
        create: vi.fn().mockResolvedValue({ url: 'https://billing.example/session' }),
      },
    },
    checkout: {
      sessions: {
        create: vi.fn().mockResolvedValue({ url: 'https://checkout.example/session' }),
      },
    },
  }
}
