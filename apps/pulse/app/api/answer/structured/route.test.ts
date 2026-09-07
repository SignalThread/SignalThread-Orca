import { beforeEach, describe, expect, it, vi } from 'vitest'

const submitStructuredAnswerMock = vi.fn()

vi.mock('@/lib/mixed-survey-contract', async () => {
  const actual = await vi.importActual<typeof import('@/lib/mixed-survey-contract')>('@/lib/mixed-survey-contract')
  return { ...actual, submitStructuredAnswer: submitStructuredAnswerMock }
})

describe('POST /api/answer/structured', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('submits a canonical numeric answer and returns its retry disposition', async () => {
    submitStructuredAnswerMock.mockResolvedValue({
      answer: {
        id: 'ckanswer123456789012345678',
        responseId: 'ckresponse1234567890123456',
        questionId: 'ckquestion1234567890123456',
        numericValue: 5,
        status: 'COMPLETED',
      },
      disposition: 'created',
    })
    const { POST } = await import('./route')
    const response = await POST({
      json: async () => ({
        responseId: 'ckresponse1234567890123456',
        questionId: 'ckquestion1234567890123456',
        numericValue: 5,
      }),
    } as never)

    expect(response.status).toBe(200)
    expect(submitStructuredAnswerMock).toHaveBeenCalledWith({
      responseId: 'ckresponse1234567890123456',
      questionId: 'ckquestion1234567890123456',
      numericValue: 5,
    })
    expect((await response.json()).data).toMatchObject({ numericValue: 5, disposition: 'created' })
  })

  it('rejects decimals and audio-shaped fields at the route boundary', async () => {
    const { POST } = await import('./route')
    for (const body of [
      { responseId: 'ckresponse1234567890123456', questionId: 'ckquestion1234567890123456', numericValue: 4.5 },
      { responseId: 'ckresponse1234567890123456', questionId: 'ckquestion1234567890123456', numericValue: 4, objectKey: 'audio.webm' },
    ]) {
      const response = await POST({ json: async () => body } as never)
      expect(response.status).toBe(400)
    }
    expect(submitStructuredAnswerMock).not.toHaveBeenCalled()
  })

  it('returns explicit service errors', async () => {
    const { MixedSurveyValidationError } = await import('@/lib/mixed-survey-contract')
    submitStructuredAnswerMock.mockRejectedValue(new MixedSurveyValidationError('Response is already finalized', 409))
    const { POST } = await import('./route')
    const response = await POST({
      json: async () => ({
        responseId: 'ckresponse1234567890123456',
        questionId: 'ckquestion1234567890123456',
        numericValue: 4,
      }),
    } as never)

    expect(response.status).toBe(409)
    expect((await response.json()).message).toBe('Response is already finalized')
  })

  it('accepts a stable speaker ID for a presenter rating', async () => {
    submitStructuredAnswerMock.mockResolvedValue({ answer: { id: 'ckanswer123456789012345678', numericValue: 4, speakerId: 'ckspeaker12345678901234567', status: 'COMPLETED' }, disposition: 'created' })
    const { POST } = await import('./route')
    const response = await POST({ json: async () => ({ responseId: 'ckresponse1234567890123456', questionId: 'ckquestion1234567890123456', speakerId: 'ckspeaker12345678901234567', numericValue: 4 }) } as never)
    expect(response.status).toBe(200)
    expect(submitStructuredAnswerMock).toHaveBeenCalledWith(expect.objectContaining({ speakerId: 'ckspeaker12345678901234567' }))
  })
})
