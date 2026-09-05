import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const source = fs.readFileSync(path.join(process.cwd(), 'components/surveys/QuestionBuilder.tsx'), 'utf8')
const retailCreateSource = fs.readFileSync(path.join(process.cwd(), 'app/app/surveys/create/CreateSurveyClient.tsx'), 'utf8')
const retailEditSource = fs.readFileSync(path.join(process.cwd(), 'app/app/surveys/[surveyId]/edit/page.tsx'), 'utf8')

describe('QuestionBuilder mixed-question mode', () => {
  it('offers the three approved customer-facing types only when opted in', () => {
    expect(source).toContain("enableMixedTypes = false")
    expect(source).toContain("{ value: 'VOICE', label: 'Voice response'")
    expect(source).toContain("{ value: 'RATING_1_TO_5', label: '1–5 rating'")
    expect(source).toContain("{ value: 'RECOMMENDATION_0_TO_10', label: '0–10 recommendation'")
    expect(source).toContain('{enableMixedTypes && addTypeMenuOpen && (')
  })

  it('preserves generated Events types through normalization, insertion, and reorder', () => {
    expect(source).toContain("const handleAdd = (type: SurveyQuestionType = 'VOICE')")
    expect(source).toContain('type,')
    expect(source).toContain('required: true')
    expect(source).toContain("import { normalizeGeneratedQuestions } from '@/lib/ai/question-generation'")
    expect(source).toContain('const generatedQuestions = normalizeGeneratedQuestions(data)')
    expect(source).toContain("type: aiMode === 'events' ? question.type : 'VOICE'")
    expect(source).toContain("type: SurveyQuestionType = 'VOICE'")
    expect(source).toContain('const reordered = items.map((q, index) => ({ ...q, order: index }))')
  })

  it('keeps fixed ranges compact and supports required or optional questions', () => {
    expect(source).toContain("? 'Range 1–5' : 'Range 0–10'")
    expect(source).toContain('checked={question.required ?? true}')
    expect(source).toContain("? { ...item, required: event.target.checked } : item")
  })

  it('can lock type changes without hiding reorder and delete controls', () => {
    expect(source).toContain('{allowTypeChange && !disabled ? (')
    expect(source).toContain('title="Delete question"')
    expect(source).toContain('<DragDropContext onDragEnd={handleDragEnd}>')
  })

  it('does not expose mixed mode from either SMB builder caller', () => {
    expect(retailCreateSource).toContain('<QuestionBuilder')
    expect(retailEditSource).toContain('<QuestionBuilder')
    expect(retailCreateSource).not.toContain('enableMixedTypes')
    expect(retailEditSource).not.toContain('enableMixedTypes')
  })
})
