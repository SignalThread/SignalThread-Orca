'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Section } from '@/components/ui/Section'

interface Answer {
  id: string
  answerType: string
  promptLabel: string
  questionId: string | null
  questionKey: string | null
  questionText: string | null
  questionOrder: number | null
  status: string
  durationMs: number | null
  transcript: string | null
  transcriptProvider: string | null
  transcriptModel: string | null
  analysis: {
    summary: string
    sentiment: string
    sentimentScore: number
    themes: string[]
    actionItems: string[]
    keyQuote: string | null
  } | null
  createdAt: string
  updatedAt: string
}

interface ResponseDetail {
  id: string
  eventId: string
  eventName: string
  attendeeId: string
  anonymousId: string
  status: string
  startedAt: string
  completedAt: string | null
  createdAt: string
  updatedAt: string
  answers: Answer[]
  answersCompleted: number
  answersTotal: number
}

export default function ResponseDetailPage() {
  const params = useParams()
  const router = useRouter()
  const eventId = params.eventId as string
  const responseId = params.responseId as string

  const [data, setData] = useState<ResponseDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchResponse() {
      try {
        const res = await fetch(`/api/events/${eventId}/responses/${responseId}`)
        const json = await res.json()

        if (!json.success) {
          throw new Error(json.message || 'Failed to fetch response')
        }

        setData(json.data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }

    fetchResponse()
  }, [eventId, responseId])

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-zinc-400">Loading response...</p>
          </div>
        </div>
      </AdminLayout>
    )
  }

  if (error || !data) {
    return (
      <AdminLayout>
        <Card>
          <h2 className="text-xl font-bold text-zinc-100 mb-2">Error</h2>
          <p className="text-red-400 mb-4">{error || 'No data'}</p>
          <Button onClick={() => router.back()}>Go Back</Button>
        </Card>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout>
      <PageHeader
        title="Response Detail"
        subtitle={`Response #${data.id.slice(0, 8)}`}
        breadcrumbs={[
          { label: 'Admin', href: '/admin' },
          { label: data.eventName, href: `/admin/events/${eventId}` },
          { label: 'Responses', href: `/admin/events/${eventId}/responses` },
          { label: 'Detail' },
        ]}
        actions={
          <Button variant="secondary" onClick={() => router.push(`/admin/events/${eventId}/responses`)}>
            ← Back to Responses
          </Button>
        }
      />

      {/* Response Metadata */}
      <Card className="mb-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <p className="text-zinc-500 text-sm mb-1">Status</p>
            <Badge variant={data.status === 'COMPLETED' ? 'success' : 'warning'}>
              {data.status}
            </Badge>
          </div>
          <div>
            <p className="text-zinc-500 text-sm mb-1">Progress</p>
            <p className="text-zinc-100 font-semibold">
              {data.answersCompleted} / {data.answersTotal} answers
            </p>
          </div>
          <div>
            <p className="text-zinc-500 text-sm mb-1">Date</p>
            <p className="text-zinc-100">
              {new Date(data.startedAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </div>
        </div>
      </Card>

      {/* Answers */}
      <Section title="Answers" description={`${data.answers.length} recorded responses`}>
        {data.answers.length === 0 ? (
          <Card>
            <p className="text-zinc-400 text-center py-8">No answers yet.</p>
          </Card>
        ) : (
          <div className="space-y-6">
            {data.answers.map((answer, index) => (
              <Card key={answer.id}>
                {/* Question Header */}
                <div className="mb-4 pb-4 border-b border-zinc-200 dark:border-zinc-800">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
                      {index + 1}. {answer.promptLabel}
                    </h3>
                    <Badge variant={answer.status === 'COMPLETED' ? 'success' : 'warning'} size="sm">
                      {answer.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-zinc-600 dark:text-zinc-500">
                    {answer.questionKey && (
                      <span className="font-mono">{answer.questionKey}</span>
                    )}
                    {answer.durationMs && (
                      <span>{(answer.durationMs / 1000).toFixed(1)}s</span>
                    )}
                  </div>
                </div>

                {/* Transcript */}
                {answer.transcript && (
                  <div className="mb-4">
                    <h4 className="text-sm font-semibold text-zinc-600 dark:text-zinc-400 mb-2">Transcript</h4>
                    <div className="bg-zinc-100 dark:bg-zinc-800/50 rounded-lg p-4">
                      <p className="text-zinc-800 dark:text-zinc-200 leading-relaxed whitespace-pre-wrap">
                        {answer.transcript}
                      </p>
                    </div>
                  </div>
                )}

                {/* Analysis */}
                {answer.analysis && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Summary */}
                    <div>
                      <h4 className="text-sm font-semibold text-zinc-600 dark:text-zinc-400 mb-2">Summary</h4>
                      <p className="text-zinc-700 dark:text-zinc-300 text-sm leading-relaxed">{answer.analysis.summary}</p>
                    </div>

                    {/* Sentiment */}
                    <div>
                      <h4 className="text-sm font-semibold text-zinc-600 dark:text-zinc-400 mb-2">Sentiment</h4>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            answer.analysis.sentiment === 'positive'
                              ? 'success'
                              : answer.analysis.sentiment === 'negative'
                              ? 'error'
                              : 'default'
                          }
                        >
                          {answer.analysis.sentiment}
                        </Badge>
                        <span className="text-zinc-600 dark:text-zinc-400 text-sm">
                          {answer.analysis.sentimentScore.toFixed(2)}
                        </span>
                      </div>
                    </div>

                    {/* Themes */}
                    {answer.analysis.themes && answer.analysis.themes.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold text-zinc-600 dark:text-zinc-400 mb-2">Themes</h4>
                        <div className="flex flex-wrap gap-2">
                          {answer.analysis.themes.map((theme, i) => (
                            <Badge key={i} variant="default" size="sm">
                              {theme}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Action Items */}
                    {answer.analysis.actionItems && answer.analysis.actionItems.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold text-zinc-600 dark:text-zinc-400 mb-2">Action Items</h4>
                        <ul className="space-y-1">
                          {answer.analysis.actionItems.map((item, i) => (
                            <li key={i} className="text-zinc-700 dark:text-zinc-300 text-sm flex items-start gap-2">
                              <span className="text-blue-600 dark:text-blue-500 mt-0.5">→</span>
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Key Quote */}
                    {answer.analysis.keyQuote && (
                      <div className="md:col-span-2">
                        <h4 className="text-sm font-semibold text-zinc-600 dark:text-zinc-400 mb-2">Key Quote</h4>
                        <blockquote className="border-l-4 border-blue-600 dark:border-blue-600 pl-4 py-2 bg-zinc-100 dark:bg-zinc-800/30 rounded-r-lg">
                          <p className="text-zinc-700 dark:text-zinc-300 italic">"{answer.analysis.keyQuote}"</p>
                        </blockquote>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </Section>
    </AdminLayout>
  )
}
