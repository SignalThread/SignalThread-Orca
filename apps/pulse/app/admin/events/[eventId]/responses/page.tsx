'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
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

export default function ResponsesListPage() {
  const params = useParams()
  const router = useRouter()
  const eventId = params.eventId as string

  const [data, setData] = useState<ResponsesData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchResponses() {
      try {
        const res = await fetch(`/api/events/${eventId}/responses`)
        const json = await res.json()

        if (!json.success) {
          throw new Error(json.message || 'Failed to fetch responses')
        }

        setData(json.data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }

    fetchResponses()
  }, [eventId])

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-zinc-400">Loading responses...</p>
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
        title={data.eventName}
        subtitle={`${data.totalResponses} total responses`}
        breadcrumbs={[
          { label: 'Admin', href: '/admin' },
          { label: data.eventName, href: `/admin/events/${eventId}` },
          { label: 'Responses' },
        ]}
        actions={
          <Button variant="secondary" onClick={() => router.push(`/admin/events/${eventId}`)}>
            ← Back to Overview
          </Button>
        }
      />

      {data.responses.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <p className="text-zinc-400 text-lg mb-2">No responses yet</p>
            <p className="text-zinc-500 text-sm">
              Responses will appear here once participants complete the survey
            </p>
          </div>
        </Card>
      ) : (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800">
                  <th className="px-3 sm:px-6 py-3 sm:py-4 text-left text-xs sm:text-sm font-semibold text-zinc-700 dark:text-zinc-300">Response</th>
                  <th className="px-3 sm:px-6 py-3 sm:py-4 text-left text-xs sm:text-sm font-semibold text-zinc-700 dark:text-zinc-300 hidden md:table-cell">Date</th>
                  <th className="px-3 sm:px-6 py-3 sm:py-4 text-left text-xs sm:text-sm font-semibold text-zinc-700 dark:text-zinc-300">Status</th>
                  <th className="px-3 sm:px-6 py-3 sm:py-4 text-left text-xs sm:text-sm font-semibold text-zinc-700 dark:text-zinc-300 hidden sm:table-cell">Progress</th>
                  <th className="px-3 sm:px-6 py-3 sm:py-4 text-left text-xs sm:text-sm font-semibold text-zinc-700 dark:text-zinc-300 hidden lg:table-cell">Attendee</th>
                </tr>
              </thead>
              <tbody>
                {data.responses.map((response) => (
                  <tr
                    key={response.id}
                    onClick={() => router.push(`/admin/events/${eventId}/responses/${response.id}`)}
                    className="border-b border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 cursor-pointer transition-colors"
                  >
                    <td className="px-3 sm:px-6 py-3 sm:py-4 text-zinc-900 dark:text-zinc-100 font-mono text-xs sm:text-sm">
                      <span className="block sm:hidden">{response.id.slice(0, 8)}...</span>
                      <span className="hidden sm:block">{response.id}</span>
                    </td>
                    <td className="px-3 sm:px-6 py-3 sm:py-4 text-zinc-700 dark:text-zinc-300 text-xs sm:text-sm hidden md:table-cell">
                      {new Date(response.createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="px-3 sm:px-6 py-3 sm:py-4">
                      <Badge variant={response.status === 'COMPLETED' ? 'success' : 'warning'} size="sm">
                        {response.status}
                      </Badge>
                    </td>
                    <td className="px-3 sm:px-6 py-3 sm:py-4 text-zinc-700 dark:text-zinc-300 text-xs sm:text-sm hidden sm:table-cell">
                      {response.answersCompleted} / {response.answersTotal}
                    </td>
                    <td className="px-3 sm:px-6 py-3 sm:py-4 text-zinc-600 dark:text-zinc-400 font-mono text-xs hidden lg:table-cell">
                      {response.anonymousId}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </AdminLayout>
  )
}
