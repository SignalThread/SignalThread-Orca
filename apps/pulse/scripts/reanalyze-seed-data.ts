/**
 * Re-analyze seed data with real AI
 * 
 * Deletes fake analysis from seed script and runs real OpenAI analysis
 * on all transcripts for responses marked as demoData: true
 */

import { PrismaClient } from '@prisma/client'
import OpenAI from 'openai'

const prisma = new PrismaClient()

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

interface ActionItem {
  text: string
  priority: 'High' | 'Medium' | 'Low'
}

interface AnalysisResult {
  summary: string
  sentiment: string
  sentimentScore: number
  themes: string[]
  actionItems: ActionItem[]
  keyQuote: string
}

async function analyzeTranscript(transcript: string): Promise<AnalysisResult> {
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

  const response = await openai.chat.completions.create({
    model: process.env.ANALYSIS_MODEL || 'gpt-4-turbo-preview',
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
    temperature: 0.3,
    response_format: { type: 'json_object' },
  })

  const content = response.choices[0].message.content
  if (!content) {
    throw new Error('No content in GPT response')
  }

  const analysis = JSON.parse(content) as AnalysisResult

  // Validate and normalize
  const validSentiments = ['POSITIVE', 'NEGATIVE', 'NEUTRAL', 'MIXED']
  if (!validSentiments.includes(analysis.sentiment)) {
    analysis.sentiment = 'NEUTRAL'
  }

  if (typeof analysis.sentimentScore !== 'number' || analysis.sentimentScore < -1 || analysis.sentimentScore > 1) {
    analysis.sentimentScore = 0
  }

  if (!Array.isArray(analysis.themes)) {
    analysis.themes = []
  }
  
  if (!Array.isArray(analysis.actionItems)) {
    analysis.actionItems = []
  }

  // Cap at 10 actions
  analysis.actionItems = analysis.actionItems.slice(0, 10).map(item => {
    if (typeof item === 'string') {
      return { text: item, priority: 'Medium' as const }
    }
    const validPriorities: Array<'High' | 'Medium' | 'Low'> = ['High', 'Medium', 'Low']
    if (!validPriorities.includes(item.priority)) {
      item.priority = 'Medium'
    }
    return item
  })

  return analysis
}

async function main() {
  console.log('🔄 Re-analyzing seed data with real AI...\n')

  // Find all seed responses
  const seedResponses = await prisma.response.findMany({
    where: {
      metadata: {
        path: ['demoData'],
        equals: true,
      },
    },
    include: {
      answers: {
        include: {
          answerTranscript: true,
          answerAnalysis: true,
        },
      },
    },
  })

  if (seedResponses.length === 0) {
    console.log('❌ No seed responses found')
    return
  }

  console.log(`Found ${seedResponses.length} seed responses`)
  
  // Get all answers with transcripts but delete their fake analysis
  const answersToAnalyze = seedResponses.flatMap(r => r.answers).filter(a => a.answerTranscript)
  
  console.log(`Processing ${answersToAnalyze.length} answers...\n`)

  let successCount = 0
  let failCount = 0

  for (const answer of answersToAnalyze) {
    try {
      // Delete fake analysis if exists
      if (answer.answerAnalysis) {
        await prisma.answerAnalysis.delete({
          where: { answerId: answer.id },
        })
        console.log(`  🗑️  Deleted fake analysis for answer ${answer.id}`)
      }

      // Run REAL AI analysis
      const transcript = answer.answerTranscript!.text
      console.log(`  🤖 Analyzing: "${transcript.slice(0, 60)}..."`)
      
      const analysisResult = await analyzeTranscript(transcript)
      
      // Store real analysis
      await prisma.answerAnalysis.create({
        data: {
          answerId: answer.id,
          provider: process.env.ANALYSIS_PROVIDER || 'openai',
          model: process.env.ANALYSIS_MODEL || 'gpt-4-turbo-preview',
          promptVersion: process.env.ANALYSIS_PROMPT_VERSION || 'v1.0',
          summary: analysisResult.summary,
          sentimentLabel: analysisResult.sentiment,
          sentimentScore: analysisResult.sentimentScore,
          themesJson: {
            themes: analysisResult.themes,
            keyQuote: analysisResult.keyQuote,
          } as any,
          actionsJson: {
            actionItems: analysisResult.actionItems,
          } as any,
        },
      })

      console.log(`  ✅ Real AI analysis complete! Actions: ${analysisResult.actionItems.length}\n`)
      successCount++

      // Small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 1000))

    } catch (error) {
      console.error(`  ❌ Failed to analyze answer ${answer.id}:`, error instanceof Error ? error.message : error)
      failCount++
    }
  }

  console.log('\n✨ Re-analysis complete!')
  console.log(`  • Success: ${successCount}`)
  console.log(`  • Failed: ${failCount}`)
  console.log(`  • Total: ${answersToAnalyze.length}`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
