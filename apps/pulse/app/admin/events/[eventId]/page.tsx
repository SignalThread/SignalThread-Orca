'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import {
  processThemes,
  processActionItems,
  groupActionItemsByBucket,
  type InsightsConfig,
} from '@/lib/admin-insights'
import {
  resolveTemplate,
  parseDemoOverride,
  isDemoModeAllowed,
  type ProductTemplate,
  type TemplateConfig,
} from '@/lib/templates'
import { TemplateSwitcher } from '@/components/admin/TemplateSwitcher'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { KPICard } from '@/components/admin/dashboard/KPICard'
import { InsightCard } from '@/components/admin/dashboard/InsightCard'
import { ThemeTag } from '@/components/admin/dashboard/ThemeTag'
import { ActionItem } from '@/components/admin/dashboard/ActionItem'
import { Button } from '@/components/ui/Button'

interface Response {
  id: string
  status: string
  attendeeId: string
  anonymousId: string
  startedAt: string
  completedAt: string | null
  createdAt: string
  answersCompleted: number
  answersTotal: number
}

interface ResponsesData {
  eventId: string
  eventName: string
  responses: Response[]
  totalResponses: number
}

interface EventAnalysis {
  eventId: string
  eventName: string
  eventStatus: string
  totalResponses: number
  completedResponses: number
  totalAnswers: number
  completedAnswers: number
  overallSummary: string | null
  overallSentiment: string | null
  avgSentimentScore: number | null
  topThemes: { theme: string; count: number }[] | null
  topActionItems: string[] | null
  lastComputedAt: string
}

interface Question {
  id: string
  key: string
  text: string
  order: number
  isRequired: boolean
  isEnabled: boolean
}

interface Answer {
  answerId: string
  questionId: string | null
  questionKey: string | null
  questionText: string | null
  sentiment: string | null
  sentimentScore: number | null
  themes: string[]
}

export default function EventOverviewPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const eventId = params.eventId as string

  // Legacy admin/demo template resolution only. Account-scoped product mode for
  // /app is determined by Account.accountType, not by this route or eventId.
  const [activeTemplate, setActiveTemplate] = useState<ProductTemplate | null>(null)
  const [insightsConfig, setInsightsConfig] = useState<InsightsConfig | null>(null)

  // Data state
  const [responsesData, setResponsesData] = useState<ResponsesData | null>(null)
  const [analysisData, setAnalysisData] = useState<EventAnalysis | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [recomputing, setRecomputing] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const [actionsExpanded, setActionsExpanded] = useState(false)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // Resolve template
  useEffect(() => {
    const urlSearchParams = new URLSearchParams(searchParams.toString())
    const demoOverride = parseDemoOverride(urlSearchParams)
    
    let templateConfig: TemplateConfig
    if (demoOverride.enabled) {
      templateConfig = {
        useCase: demoOverride.useCase!,
        vertical: demoOverride.vertical,
      }
    } else {
      if (eventId === 'retail-demo') {
        templateConfig = { useCase: 'retail' }
      } else {
        templateConfig = { useCase: 'events' }
      }
    }
    
    const template = resolveTemplate(templateConfig)
    setActiveTemplate(template)
    
    setInsightsConfig({
      themeBuckets: template.themeBuckets,
      highImpactKeywords: template.highImpactKeywords,
      lowImpactKeywords: template.lowImpactKeywords,
    })
  }, [searchParams, eventId])

  const fetchData = async () => {
    setLoading(true)
    setError(null)

    try {
      const responsesRes = await fetch(`/api/events/${eventId}/responses`)
      const responsesJson = await responsesRes.json()
      if (!responsesJson.success) throw new Error(responsesJson.message)
      setResponsesData(responsesJson.data)

      const analysisRes = await fetch(`/api/events/${eventId}/analysis`)
      const analysisJson = await analysisRes.json()
      if (analysisJson.success) setAnalysisData(analysisJson.data)
      else setAnalysisData(null)

      const questionsRes = await fetch(`/api/events/${eventId}/questions`)
      const questionsJson = await questionsRes.json()
      if (questionsJson.success) setQuestions(questionsJson.data.questions || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [eventId])

  const handleRecompute = async () => {
    setRecomputing(true)
    setToast(null)

    try {
      const res = await fetch(`/api/events/${eventId}/analysis/recompute`, { method: 'POST' })
      const json = await res.json()
      if (!json.success) throw new Error(json.message)

      setToast({ message: 'Insights updated successfully', type: 'success' })
      await fetchData()
      setTimeout(() => setToast(null), 4000)
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'Update failed',
        type: 'error',
      })
      setTimeout(() => setToast(null), 6000)
    } finally {
      setRecomputing(false)
    }
  }

  if (!activeTemplate || !insightsConfig) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      </AdminLayout>
    )
  }

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      </AdminLayout>
    )
  }

  if (error || !responsesData) {
    return (
      <AdminLayout>
        <div className="max-w-2xl mx-auto py-20 text-center">
          <p className="text-red-600 dark:text-red-400 mb-4">{error || 'Unable to load event data'}</p>
          <Button onClick={() => router.push('/admin')}>Return to Admin Home</Button>
        </div>
      </AdminLayout>
    )
  }

  // Compute metrics
  const totalResponses = responsesData.responses.length
  const completedResponses = responsesData.responses.filter(r => r.status === 'COMPLETED').length
  const inProgressResponses = responsesData.responses.filter(r => r.status === 'IN_PROGRESS').length
  const completionRate = totalResponses > 0 ? Math.round((completedResponses / totalResponses) * 100) : 0

  // Process insights
  const processedThemes = analysisData?.topThemes && insightsConfig
    ? processThemes(analysisData.topThemes, insightsConfig)
    : []
  const processedActionItems = analysisData?.topActionItems && insightsConfig
    ? processActionItems(analysisData.topActionItems, processedThemes, insightsConfig)
    : []
  const groupedActionItems = groupActionItemsByBucket(processedActionItems)

  // Determine sentiment category
  const sentimentCategory = analysisData?.overallSentiment?.toLowerCase() === 'positive' ? 'positive' :
                           analysisData?.overallSentiment?.toLowerCase() === 'negative' ? 'negative' : 'neutral'
  const visibleActions = actionsExpanded ? processedActionItems : processedActionItems.slice(0, 5)
  const remainingActionsCount = processedActionItems.length - 5
  return (
    <AdminLayout>
      {/* Toast */}
      {toast && (
        <div className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-lg shadow-xl font-medium text-sm ${
          toast.type === 'success' 
            ? 'bg-green-600 text-white' 
            : 'bg-red-600 text-white'
        }`}>
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="mb-8 pb-6 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-1">
              {responsesData.eventName}
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Event Dashboard
            </p>
          </div>
          {isDemoModeAllowed() && (
            <TemplateSwitcher
              eventId={eventId}
              activeTemplate={activeTemplate}
              currentParams={new URLSearchParams(searchParams.toString())}
            />
          )}
        </div>
        
        {analysisData && (
          <div className="flex items-center gap-4 text-xs text-zinc-500 dark:text-zinc-400">
            <span suppressHydrationWarning>
              Last updated: {mounted ? new Date(analysisData.lastComputedAt).toLocaleString() : analysisData.lastComputedAt}
            </span>
            <button
              onClick={handleRecompute}
              disabled={recomputing}
              className="text-blue-600 dark:text-blue-500 hover:text-blue-700 dark:hover:text-blue-400 font-medium disabled:opacity-50"
            >
              {recomputing ? 'Updating...' : 'Refresh insights'}
            </button>
          </div>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        <KPICard
          label="Total Responses"
          value={totalResponses}
          variant="default"
        />
        <KPICard
          label="Completed"
          value={completedResponses}
          variant="success"
        />
        <KPICard
          label="In Progress"
          value={inProgressResponses}
          variant="warning"
        />
        <KPICard
          label="Completion Rate"
          value={`${completionRate}%`}
          variant="info"
        />
      </div>

      {!analysisData ? (
        <div className="bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-lg p-12 text-center">
          <p className="text-zinc-600 dark:text-zinc-400 mb-4">
            No insights available yet. Generate analysis from completed responses.
          </p>
          <Button onClick={handleRecompute} disabled={recomputing}>
            {recomputing ? 'Generating...' : 'Generate Insights'}
          </Button>
        </div>
      ) : (
        <>
          {/* Executive Summary — always show card; fallback when empty */}
          <InsightCard title="Executive Summary" variant="highlight" className="mb-6">
            {analysisData.overallSummary?.trim() ? (
              <p className="leading-relaxed">{analysisData.overallSummary}</p>
            ) : (
              <p className="text-zinc-500 dark:text-zinc-400 leading-relaxed">
                No summary yet. Generate insights.
              </p>
            )}
          </InsightCard>

          {/* Key Findings Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Sentiment */}
            {analysisData.overallSentiment && (
              <InsightCard title="Overall Sentiment">
                <div className="flex items-center gap-3 mb-2">
                  <span className={`inline-flex px-3 py-1 rounded-full text-sm font-semibold ${
                    sentimentCategory === 'positive' 
                      ? 'bg-green-100 dark:bg-green-950/30 text-green-800 dark:text-green-300'
                      : sentimentCategory === 'negative'
                      ? 'bg-red-100 dark:bg-red-950/30 text-red-800 dark:text-red-300'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                  }`}>
                    {analysisData.overallSentiment}
                  </span>
                  {analysisData.avgSentimentScore !== null && (
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      Score: {analysisData.avgSentimentScore.toFixed(2)}
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-2">
                  Based on {completedResponses} completed responses
                </p>
              </InsightCard>
            )}

            {/* Data Quality */}
            <InsightCard title="Data Quality">
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-zinc-600 dark:text-zinc-400">Response rate</span>
                  <span className="font-semibold">{completionRate}%</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-zinc-600 dark:text-zinc-400">Total answers</span>
                  <span className="font-semibold">{analysisData.completedAnswers}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-zinc-600 dark:text-zinc-400">Questions</span>
                  <span className="font-semibold">{questions.length}</span>
                </div>
              </div>
            </InsightCard>
          </div>

          {/* Top Themes */}
          {processedThemes.length > 0 && (
            <InsightCard 
              title="Top Themes" 
              action={{ label: 'View all responses', onClick: () => router.push(`/admin/events/${eventId}/responses`) }}
              className="mb-6"
            >
              <div className="flex flex-wrap gap-2">
                {processedThemes.slice(0, 10).map((item, i) => (
                  <ThemeTag
                    key={i}
                    theme={item.theme}
                    count={item.count}
                    onClick={() => router.push(`/admin/events/${eventId}/responses`)}
                  />
                ))}
              </div>
              {processedThemes.length > 10 && (
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-3">
                  +{processedThemes.length - 10} more themes
                </p>
              )}
            </InsightCard>
          )}

          {/* Action Items */}
          {processedActionItems.length > 0 && (
            <InsightCard 
              title="Recommended Actions" 
              action={{ label: 'View details', onClick: () => router.push(`/admin/events/${eventId}/responses`) }}
              className="mb-6"
            >
              <div className="space-y-3">
              {visibleActions.map((item, i) => (
                  <ActionItem
                    key={i}
                    text={item.text}
                    impact={item.impact}
                    category={item.bucket}
                  />
                ))}
              </div>
              {processedActionItems.length > 5 && (
                <button
                  type="button"
                  onClick={() => setActionsExpanded(!actionsExpanded)}
                  className="text-xs text-blue-600 dark:text-blue-500 hover:text-blue-700 dark:hover:text-blue-400 font-medium mt-3 cursor-pointer"
                  aria-expanded={actionsExpanded}
                >
                  {actionsExpanded ? 'Show fewer' : `+${remainingActionsCount} more actions`}
                </button>
              )}
            </InsightCard>
          )}

          {/* Questions Performance */}
          {questions.length > 0 && (
            <InsightCard 
              title="Questions" 
              action={{ label: 'View responses', onClick: () => router.push(`/admin/events/${eventId}/responses`) }}
            >
              <div className="space-y-3">
                {questions.map((question, i) => (
                  <div 
                    key={question.id}
                    className="flex items-start justify-between p-3 bg-zinc-50 dark:bg-zinc-900/50 rounded border border-zinc-200 dark:border-zinc-800"
                  >
                    <div className="flex-1">
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-1">
                        {i + 1}. {question.text}
                      </p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        {question.key}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </InsightCard>
          )}
        </>
      )}

      {/* Footer Actions */}
      <div className="mt-10 pt-6 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
        <Button 
          variant="secondary" 
          onClick={() => router.push('/admin')}
        >
          ← Admin Home
        </Button>
        <Button 
          onClick={() => router.push(`/admin/events/${eventId}/responses`)}
        >
          View All Responses
        </Button>
      </div>
    </AdminLayout>
  )
}
