import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const createSurveySource = fs.readFileSync(
  path.join(process.cwd(), 'app/app/surveys/create/CreateSurveyClient.tsx'),
  'utf8',
)

const editSurveySource = fs.readFileSync(
  path.join(process.cwd(), 'app/app/surveys/[surveyId]/edit/page.tsx'),
  'utf8',
)

describe('question audio survey UI copy', () => {
  it('removes the manual generate question audio button from create and edit flows', () => {
    expect(createSurveySource).not.toContain('Generate Question Audio')
    expect(editSurveySource).not.toContain('Generate Question Audio')
  })

  it('moves voice controls into the questions workflow with updated copy', () => {
    expect(createSurveySource).toContain('Preview Voice')
    expect(editSurveySource).toContain('Preview Voice')
    expect(createSurveySource).toContain('Question Voice')
    expect(editSurveySource).toContain('Question Voice')
    expect(createSurveySource).toContain('Choose the voice used to read these questions aloud.')
    expect(editSurveySource).toContain('Choose the voice used to read these questions aloud.')
    expect(createSurveySource).toContain('Audio updates automatically when you save.')
    expect(editSurveySource).toContain('Audio updates automatically when you save.')
    expect(createSurveySource).not.toContain('Question Audio')
    expect(editSurveySource).not.toContain('Question Audio')
    expect(createSurveySource).not.toContain('htmlFor="tts-provider"')
    expect(editSurveySource).not.toContain('htmlFor="tts-provider"')
  })
})
