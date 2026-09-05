import OpenAI from 'openai'
import { ANALYSIS_MODEL } from '@/lib/analysis-model'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export interface ActionItem {
  text: string
  priority: 'High' | 'Medium' | 'Low'
}

export interface AnalysisResult {
  /** Present on the canonical context-aware answer analysis path. */
  evidenceState?: 'SUBSTANTIVE' | 'INSUFFICIENT_EVIDENCE'
  summary: string
  sentiment: string
  sentimentScore: number
  themes: string[]
  actionItems: ActionItem[]
  keyQuote: string
}

/**
 * Analyze transcript using OpenAI GPT
 * Extracts summary, sentiment, themes, action items, and key quote
 */
export async function analyzeTranscript(transcript: string): Promise<AnalysisResult> {
  try {
    console.log(`[Analysis] Starting analysis for ${transcript.length} characters`)
    
    const prompt = `Analyze the following audio feedback transcript and provide structured insights with actionable recommendations.

Transcript:
"""
${transcript}
"""

Provide your analysis in the following JSON format:
{
  "summary": "A concise 2-3 sentence summary of the main points",
  "sentiment": "POSITIVE, NEGATIVE, NEUTRAL, or MIXED",
  "sentimentScore": number between -1.0 (very negative) and 1.0 (very positive),
  "themes": ["theme1", "theme2", "theme3"],
  "actionItems": [
    { "text": "Fix WiFi outages", "priority": "High" },
    { "text": "Enforce service standards", "priority": "Medium" }
  ],
  "keyQuote": "The most impactful or representative quote from the transcript"
}

Rules:
- Keep summary concise and actionable
- Sentiment should be one of: POSITIVE, NEGATIVE, NEUTRAL, MIXED
- sentimentScore should be a decimal between -1.0 and 1.0
- Extract 2-5 main themes from the feedback
- Generate 3-10 operational action items. Each must be:
  * Written for a store manager: specific, concrete, direct
  * Start with a strong verb (Fix, Enforce, Speed up, Clean, Add, Train, Reduce, etc.)
  * 4-12 words max. No periods. No filler clauses ("to ensure…", "in order to…")
  * Avoid weak verbs: "look into", "identify", "improve", "reinforce", "optimize", "ensure"
  * Avoid: "focused action items", "the root cause of", vague "processes"
  * Examples: "Fix WiFi outages", "Enforce service standards", "Speed up food prep", "Clean dining area hourly"
  * "priority": "High" | "Medium" | "Low"
- Prioritize actions based on:
  * High: Critical issues, strong negative feedback, safety/quality concerns
  * Medium: Improvement opportunities, moderate feedback
  * Low: Minor enhancements, positive suggestions
- Select the most impactful quote that captures the essence of the feedback

Return ONLY the JSON object, no additional text.`

    console.log(`[Analysis] Sending to OpenAI GPT...`)
    const response = await openai.chat.completions.create({
      model: ANALYSIS_MODEL,
      messages: [
        {
          role: 'system',
          content: 'You are an expert at analyzing customer feedback and extracting actionable insights. Always respond with valid JSON only.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.3, // Lower temperature for more consistent analysis
      response_format: { type: 'json_object' },
    })

    const content = response.choices[0].message.content
    if (!content) {
      throw new Error('No content in GPT response')
    }

    console.log(`[Analysis] Received response, parsing...`)
    const analysis = JSON.parse(content) as AnalysisResult

    // Validate sentiment value
    const validSentiments = ['POSITIVE', 'NEGATIVE', 'NEUTRAL', 'MIXED']
    if (!validSentiments.includes(analysis.sentiment)) {
      analysis.sentiment = 'NEUTRAL'
    }

    // Ensure sentimentScore is within bounds
    if (typeof analysis.sentimentScore !== 'number' || analysis.sentimentScore < -1 || analysis.sentimentScore > 1) {
      analysis.sentimentScore = 0
    }

    // Ensure arrays
    if (!Array.isArray(analysis.themes)) {
      analysis.themes = []
    }
    if (!Array.isArray(analysis.actionItems)) {
      analysis.actionItems = []
    }

    // Validate and cap action items at 10
    analysis.actionItems = analysis.actionItems
      .slice(0, 10)
      .map(item => {
        // Ensure each action has required fields
        if (typeof item === 'string') {
          return { text: item, priority: 'Medium' as const }
        }
        // Validate priority
        const validPriorities: Array<'High' | 'Medium' | 'Low'> = ['High', 'Medium', 'Low']
        if (!validPriorities.includes(item.priority)) {
          item.priority = 'Medium'
        }
        return item
      })

    console.log(`[Analysis] Success! Sentiment: ${analysis.sentiment}, Themes: ${analysis.themes.length}, Actions: ${analysis.actionItems.length}`)

    return analysis
  } catch (error) {
    console.error('[Analysis] Error:', error)
    throw new Error(
      `Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}
