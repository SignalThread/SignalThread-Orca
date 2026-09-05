import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import {
  buildQuestionPrompt,
  normalizeGeneratedQuestions,
  normalizeQuestionRequest,
} from '@/lib/ai/question-generation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/ai/generate-questions
 *
 * Generate survey questions using OpenAI gpt-4o-mini. Supports an event-native
 * generation mode while preserving the original retail/SMB behavior.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const normalized = normalizeQuestionRequest(body)

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 })
    }

    const openai = new OpenAI({ apiKey })
    const prompt = buildQuestionPrompt(normalized)

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: normalized.mode === 'events'
            ? 'You output only valid JSON arrays of question objects. No markdown, no explanation, no extra text.'
            : 'You output only valid JSON arrays of strings. No markdown, no explanation, no extra text.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      max_tokens: 512,
      temperature: 0.7,
    })

    const text = response.choices[0]?.message?.content?.trim() ?? ''
    // Strip markdown code blocks if present
    const cleanText = text.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '').trim()
    const parsed = JSON.parse(cleanText) as unknown

    if (!Array.isArray(parsed)) {
      return NextResponse.json({ error: 'Invalid response format' }, { status: 500 })
    }

    const questions = normalizeGeneratedQuestions(parsed)

    // SMB retains its existing string-only payload and voice-only insertion.
    // Events receives the canonical typed payload consumed by the mixed builder.
    return NextResponse.json(normalized.mode === 'events' ? questions : questions.map((question) => question.text))
  } catch (error) {
    console.error('[POST /api/ai/generate-questions] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate questions' },
      { status: 500 }
    )
  }
}
