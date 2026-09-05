'use client'

import { useState } from 'react'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import { Button } from '@/components/ui/Button'
import { normalizeGeneratedQuestions } from '@/lib/ai/question-generation'

const SparkleIcon = () => (
  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
  </svg>
)

export interface Question {
    id: string
    text: string
    order: number
    type?: SurveyQuestionType
    required?: boolean
    responseTarget?: 'GENERAL' | 'SESSION' | 'SPEAKERS'
}

export type SurveyQuestionType = 'VOICE' | 'RATING_1_TO_5' | 'RECOMMENDATION_0_TO_10'

export const QUESTION_TYPE_OPTIONS: Array<{
    value: SurveyQuestionType
    label: string
    hint: string
}> = [
    { value: 'VOICE', label: 'Voice response', hint: 'Attendee answers in their own words.' },
    { value: 'RATING_1_TO_5', label: '1–5 rating', hint: 'Fixed scale from 1 through 5.' },
    { value: 'RECOMMENDATION_0_TO_10', label: '0–10 recommendation', hint: 'Fixed scale from 0 through 10.' },
]

interface QuestionBuilderProps {
    questions: Question[]
    onChange: (questions: Question[]) => void
    disabled?: boolean
    disabledMessage?: string
    /** When provided, shows "Generate with AI" button; used for Create Survey flow */
    surveyName?: string
    description?: string
    aiGenerateDescription?: string
    aiContextLabel?: string
    aiContextPlaceholder?: string
    aiDefaultContext?: string
    aiGoalOptions?: Array<{ value: string; label: string }>
    /** Generation mode: 'events' uses event-native AI framing; defaults to retail. */
    aiMode?: 'events' | 'retail'
    /** Events-only opt-in. Retail/SMB callers retain the voice-only builder. */
    enableMixedTypes?: boolean
    allowTypeChange?: boolean
    enablePresenterRatingTarget?: boolean
}

const DEFAULT_AI_GOAL_OPTIONS = [
    { value: 'reviews', label: 'Reviews' },
    { value: 'NPS', label: 'NPS' },
    { value: 'feedback', label: 'Feedback' },
    { value: 'complaints', label: 'Complaints' },
]

export function QuestionBuilder({
    questions,
    onChange,
    disabled = false,
    disabledMessage,
    surveyName,
    description,
    aiGenerateDescription = 'Generate high-conversion voice survey questions in seconds.',
    aiContextLabel = 'Business type',
    aiContextPlaceholder = 'e.g., coffee shop, restaurant',
    aiDefaultContext = 'retail',
    aiGoalOptions = DEFAULT_AI_GOAL_OPTIONS,
    aiMode = 'retail',
    enableMixedTypes = false,
    allowTypeChange = true,
    enablePresenterRatingTarget = false,
}: QuestionBuilderProps) {
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editText, setEditText] = useState('')
    const [generateModalOpen, setGenerateModalOpen] = useState(false)
    const [generateLoading, setGenerateLoading] = useState(false)
    const [generateError, setGenerateError] = useState<string | null>(null)
    const [genBusinessType, setGenBusinessType] = useState('')
    const [genGoal, setGenGoal] = useState('feedback')
    const [genTone, setGenTone] = useState('friendly')
    const [genCount, setGenCount] = useState(5)
    const [addTypeMenuOpen, setAddTypeMenuOpen] = useState(false)

    const handleAdd = (type: SurveyQuestionType = 'VOICE') => {
        const newQuestion: Question = {
            id: `q-${Date.now()}`,
            text: '',
            order: questions.length,
            type,
            required: true,
        }
        setAddTypeMenuOpen(false)
        setEditingId(newQuestion.id)
        setEditText('')
        onChange([...questions, newQuestion])
    }

    const handleEdit = (id: string, currentText: string) => {
        setEditingId(id)
        setEditText(currentText)
    }

    const handleSave = (id: string) => {
        if (editText.trim()) {
            onChange(
                questions.map(q =>
                    q.id === id ? { ...q, text: editText.trim() } : q
                )
            )
        }
        setEditingId(null)
        setEditText('')
    }

    const handleCancel = (id: string) => {
        // If it's a new question (empty text), remove it
        const question = questions.find(q => q.id === id)
        if (question && !question.text) {
            handleDelete(id)
        }
        setEditingId(null)
        setEditText('')
    }

    const handleDelete = (id: string) => {
        const updatedQuestions = questions
            .filter(q => q.id !== id)
            .map((q, index) => ({ ...q, order: index }))
        onChange(updatedQuestions)
        if (editingId === id) {
            setEditingId(null)
            setEditText('')
        }
    }

    const handleGenerate = async () => {
        setGenerateLoading(true)
        setGenerateError(null)
        try {
            const res = await fetch('/api/ai/generate-questions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mode: aiMode,
                    surveyName,
                    description,
                    businessType: genBusinessType.trim() || aiDefaultContext,
                    eventContext: aiMode === 'events' ? (genBusinessType.trim() || aiDefaultContext) : undefined,
                    goal: genGoal,
                    tone: genTone,
                    count: genCount,
                }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Failed to generate')
            const generatedQuestions = normalizeGeneratedQuestions(data)
            const newQuestions: Question[] = generatedQuestions.map((question, i) => ({
                id: `q-${Date.now()}-${i}`,
                text: question.text,
                order: i,
                type: aiMode === 'events' ? question.type : 'VOICE',
                required: true,
            }))
            onChange(newQuestions)
            setGenerateModalOpen(false)
        } catch (err) {
            setGenerateError(err instanceof Error ? err.message : 'Something went wrong')
        } finally {
            setGenerateLoading(false)
        }
    }

    const handleDragEnd = (result: DropResult) => {
        if (!result.destination || disabled) return

        const items = Array.from(questions)
        const [reorderedItem] = items.splice(result.source.index, 1)
        items.splice(result.destination.index, 0, reorderedItem)

        // Update order property
        const reordered = items.map((q, index) => ({ ...q, order: index }))
        onChange(reordered)
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Questions <span className="text-red-500">*</span>
                </label>
                <div className="flex flex-wrap items-center gap-2 justify-end">
                    <div className="relative">
                        <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => enableMixedTypes ? setAddTypeMenuOpen((open) => !open) : handleAdd()}
                            disabled={disabled}
                            className="min-h-0 h-8 px-3 text-sm"
                            aria-haspopup={enableMixedTypes ? 'menu' : undefined}
                            aria-expanded={enableMixedTypes ? addTypeMenuOpen : undefined}
                        >
                            Add question
                        </Button>
                        {enableMixedTypes && addTypeMenuOpen && (
                            <div
                                role="menu"
                                className="absolute right-0 top-10 z-20 w-64 overflow-hidden rounded-lg border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
                            >
                                {QUESTION_TYPE_OPTIONS.map((option) => (
                                    <button
                                        key={option.value}
                                        type="button"
                                        role="menuitem"
                                        onClick={() => handleAdd(option.value)}
                                        className="w-full rounded-md px-3 py-2 text-left hover:bg-zinc-100 focus:bg-zinc-100 focus:outline-none dark:hover:bg-zinc-800 dark:focus:bg-zinc-800"
                                    >
                                        <span className="block text-sm font-semibold text-zinc-900 dark:text-zinc-100">{option.label}</span>
                                        <span className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400">{option.hint}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    {surveyName !== undefined && (
                        <Button
                            type="button"
                            variant="primary"
                            size="sm"
                            onClick={() => setGenerateModalOpen(true)}
                            disabled={disabled}
                            className="min-h-0 h-8 px-3 text-sm inline-flex gap-1.5"
                        >
                            <SparkleIcon />
                            Generate with AI
                        </Button>
                    )}
                </div>
            </div>

            {/* AI Generate Modal */}
            {generateModalOpen && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                    onClick={() => !generateLoading && setGenerateModalOpen(false)}
                >
                    <div
                        className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-700 shadow-2xl w-full max-w-md overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="px-6 pt-6 pb-4">
                            <h3 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                                <SparkleIcon />
                                Generate with AI
                            </h3>
                            <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">
                                {aiGenerateDescription}
                            </p>
                        </div>

                        {/* Body */}
                        <div className="px-6 pb-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                                    {aiContextLabel}
                                </label>
                                <input
                                    type="text"
                                    value={genBusinessType}
                                    onChange={(e) => setGenBusinessType(e.target.value)}
                                    placeholder={aiContextPlaceholder}
                                    className="w-full px-4 py-2.5 text-sm border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                                    Goal
                                </label>
                                <select
                                    value={genGoal}
                                    onChange={(e) => setGenGoal(e.target.value)}
                                    className="w-full px-4 py-2.5 text-sm border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                >
                                    {aiGoalOptions.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                                    Tone
                                </label>
                                <select
                                    value={genTone}
                                    onChange={(e) => setGenTone(e.target.value)}
                                    className="w-full px-4 py-2.5 text-sm border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                >
                                    <option value="friendly">Friendly</option>
                                    <option value="direct">Direct</option>
                                    <option value="premium">Premium</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                                    # of questions
                                </label>
                                <select
                                    value={genCount}
                                    onChange={(e) => setGenCount(Number(e.target.value))}
                                    className="w-full px-4 py-2.5 text-sm border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                >
                                    {[3, 4, 5, 6, 7, 8].map((n) => (
                                        <option key={n} value={n}>{n}</option>
                                    ))}
                                </select>
                            </div>
                            {generateError && (
                                <p className="text-sm text-red-600 dark:text-red-400">{generateError}</p>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="px-6 py-4 bg-zinc-50 dark:bg-zinc-800/50 border-t border-zinc-200 dark:border-zinc-700 flex gap-3 justify-end">
                            <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() => !generateLoading && setGenerateModalOpen(false)}
                                disabled={generateLoading}
                                className="min-h-0 h-9 px-4"
                            >
                                Cancel
                            </Button>
                            <Button
                                type="button"
                                variant="primary"
                                size="sm"
                                onClick={handleGenerate}
                                disabled={generateLoading}
                                className="min-h-0 h-9 px-4 inline-flex gap-1.5"
                            >
                                {generateLoading ? (
                                    <>
                                        <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        Generating…
                                    </>
                                ) : (
                                    <>
                                        <SparkleIcon />
                                        Generate
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {disabled && disabledMessage && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                    <p className="text-sm text-amber-800 dark:text-amber-200">{disabledMessage}</p>
                </div>
            )}

            <DragDropContext onDragEnd={handleDragEnd}>
                <Droppable droppableId="questions">
                    {(provided) => (
                        <div
                            {...provided.droppableProps}
                            ref={provided.innerRef}
                            className="space-y-2"
                        >
                            {questions.map((question, index) => (
                                <Draggable
                                    key={question.id}
                                    draggableId={question.id}
                                    index={index}
                                    isDragDisabled={disabled}
                                >
                                    {(provided, snapshot) => (
                                        <div
                                            ref={provided.innerRef}
                                            {...provided.draggableProps}
                                            data-testid="survey-question-row"
                                            className={`
                        bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4
                        ${snapshot.isDragging ? 'shadow-lg opacity-90' : ''}
                        ${disabled ? 'opacity-60' : ''}
                      `}
                                        >
                                            <div className="flex items-start gap-3">
                                                {/* Drag Handle */}
                                                <div
                                                    {...provided.dragHandleProps}
                                                    className={`mt-1 ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-grab active:cursor-grabbing'}`}
                                                >
                                                    <svg className="w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                                                        <path d="M7 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 2zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 14zm6-8a2 2 0 1 0-.001-4.001A2 2 0 0 0 13 6zm0 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 14z" />
                                                    </svg>
                                                </div>

                                                {/* Question Number */}
                                                <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full text-xs font-semibold mt-1">
                                                    {index + 1}
                                                </div>

                                                {/* Question Content */}
                                                <div className="flex-1 min-w-0">
                                                    {enableMixedTypes && (
                                                        <div className="mb-2 flex flex-wrap items-center gap-2">
                                                            {allowTypeChange && !disabled ? (
                                                                <select
                                                                    aria-label={`Question ${index + 1} type`}
                                                                    value={question.type ?? 'VOICE'}
                                                                    onChange={(event) => onChange(questions.map((item) =>
                                                                        item.id === question.id
                                                                            ? { ...item, type: event.target.value as SurveyQuestionType }
                                                                            : item
                                                                    ))}
                                                                    className="h-7 rounded-md border border-zinc-300 bg-white px-2 text-xs font-semibold text-zinc-700 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
                                                                >
                                                                    {QUESTION_TYPE_OPTIONS.map((option) => (
                                                                        <option key={option.value} value={option.value}>{option.label}</option>
                                                                    ))}
                                                                </select>
                                                            ) : (
                                                                <span className="rounded-md bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200">
                                                                    {QUESTION_TYPE_OPTIONS.find((option) => option.value === (question.type ?? 'VOICE'))?.label}
                                                                </span>
                                                            )}
                                                            <label className="inline-flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-300">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={question.required ?? true}
                                                                    disabled={disabled}
                                                                    onChange={(event) => onChange(questions.map((item) =>
                                                                        item.id === question.id ? { ...item, required: event.target.checked } : item
                                                                    ))}
                                                                    className="h-3.5 w-3.5 rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
                                                                />
                                                                Required
                                                            </label>
                                                            {(question.type ?? 'VOICE') !== 'VOICE' && (
                                                                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                                                                    {(question.type ?? 'VOICE') === 'RATING_1_TO_5' ? 'Range 1–5' : 'Range 0–10'}
                                                                </span>
                                                            )}
                                                            {enablePresenterRatingTarget && (question.type ?? 'VOICE') === 'RATING_1_TO_5' && (
                                                                <select
                                                                    aria-label={`Question ${index + 1} rating subject`}
                                                                    value={question.responseTarget ?? 'GENERAL'}
                                                                    disabled={disabled}
                                                                    onChange={(event) => onChange(questions.map((item) => item.id === question.id ? { ...item, responseTarget: event.target.value as Question['responseTarget'] } : item))}
                                                                    className="h-7 rounded-md border border-zinc-300 bg-white px-2 text-xs font-semibold text-zinc-700 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
                                                                >
                                                                    <option value="GENERAL">Rate the session</option>
                                                                    <option value="SPEAKERS">Rate each presenter</option>
                                                                </select>
                                                            )}
                                                        </div>
                                                    )}
                                                    {editingId === question.id ? (
                                                        <div className="space-y-2">
                                                            <textarea
                                                                value={editText}
                                                                onChange={(e) => setEditText(e.target.value)}
                                                                placeholder="Enter question text..."
                                                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white resize-none"
                                                                rows={2}
                                                                autoFocus
                                                                onKeyDown={(e) => {
                                                                    if (e.key === 'Enter' && !e.shiftKey) {
                                                                        e.preventDefault()
                                                                        handleSave(question.id)
                                                                    }
                                                                    if (e.key === 'Escape') {
                                                                        handleCancel(question.id)
                                                                    }
                                                                }}
                                                            />
                                                            <div className="flex gap-2">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleSave(question.id)}
                                                                    className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                                                                >
                                                                    Save
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleCancel(question.id)}
                                                                    className="px-3 py-1 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
                                                                >
                                                                    Cancel
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-start justify-between gap-2">
                                                            <p className="text-sm text-gray-900 dark:text-gray-100 flex-1">
                                                                {question.text || <span className="text-gray-400 italic">Empty question</span>}
                                                            </p>
                                                            {!disabled && (
                                                                <div className="flex gap-1 flex-shrink-0">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleEdit(question.id, question.text)}
                                                                        className="p-1 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400"
                                                                        title="Edit question"
                                                                    >
                                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                                        </svg>
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleDelete(question.id)}
                                                                        className="p-1 text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400"
                                                                        title="Delete question"
                                                                    >
                                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                                        </svg>
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </Draggable>
                            ))}
                            {provided.placeholder}
                        </div>
                    )}
                </Droppable>
            </DragDropContext>

            {questions.length === 0 && (
                <div className="text-center py-8 border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded-lg">
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                        {surveyName !== undefined
                            ? 'No questions yet. Use Add Question or Generate with AI to get started.'
                            : 'No questions yet. Use Add Question to get started.'}
                    </p>
                </div>
            )}
        </div>
    )
}
