import { Prisma } from '@prisma/client'
import { describe, expect, it } from 'vitest'

describe('QuestionAudioAsset schema contract', () => {
  it('keys cache uniqueness by question and TTS variant fields', () => {
    const model = Prisma.dmmf.datamodel.models.find((candidate) => candidate.name === 'QuestionAudioAsset')
    expect(model).toBeDefined()
    expect(model?.uniqueFields).toContainEqual([
      'questionId',
      'provider',
      'voice',
      'language',
      'locale',
      'textHash',
    ])
  })

  it('uses empty-string defaults for optional locale dimensions so the unique cache key remains enforceable', () => {
    const model = Prisma.dmmf.datamodel.models.find((candidate) => candidate.name === 'QuestionAudioAsset')
    const language = model?.fields.find((field) => field.name === 'language')
    const locale = model?.fields.find((field) => field.name === 'locale')

    expect(language?.isRequired).toBe(true)
    expect(language?.hasDefaultValue).toBe(true)
    expect(language?.default).toBe('')

    expect(locale?.isRequired).toBe(true)
    expect(locale?.hasDefaultValue).toBe(true)
    expect(locale?.default).toBe('')
  })
})
