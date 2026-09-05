'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { EventClosingBriefDocument } from '@/components/events/EventClosingBriefDocument'
import type { EventClosingBrief } from '@/lib/event-closing-brief'

type EventAnalysisBriefResponse = {
  success: boolean
  error?: string
  data?: {
    postEventClosingBrief?: EventClosingBrief
    briefHash?: string
    eventStartDate?: string | null
    eventEndDate?: string | null
  }
}

export default function EventClosingBriefDocumentPage() {
  const params = useParams<{ eventId: string }>()
  const searchParams = useSearchParams()
  const account = searchParams.get('account')
  const regenerate = searchParams.get('regenerate') === '1'
  const [brief, setBrief] = useState<EventClosingBrief | null>(null)
  const [dates, setDates] = useState<{ startDate: string | null; endDate: string | null } | undefined>()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!params.eventId || !account) {
      setError('An event and account are required to generate this brief.')
      return
    }
    const query = new URLSearchParams({ account })
    if (regenerate) query.set('cacheBust', String(Date.now()))
    fetch(`/api/app/events/${encodeURIComponent(params.eventId)}/brief?${query.toString()}`, { credentials: 'include', cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json().catch(() => ({})) as EventAnalysisBriefResponse
        if (!response.ok || !body.success || !body.data?.postEventClosingBrief) throw new Error(body.error || 'Unable to generate the event intelligence brief.')
        setBrief(body.data.postEventClosingBrief)
        setDates({ startDate: body.data.eventStartDate ?? null, endDate: body.data.eventEndDate ?? null })
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Unable to generate the event intelligence brief.'))
  }, [account, params.eventId, regenerate])

  if (error) return <main className="font-brand grid min-h-screen place-items-center bg-slate-100 p-6"><p role="alert" className="max-w-md rounded-xl border border-rose-200 bg-white p-5 text-sm text-rose-700">{error}</p></main>
  if (!brief) return <main className="font-brand grid min-h-screen place-items-center bg-slate-100 p-6"><p className="text-sm text-slate-500">Generating Event Intelligence Brief…</p></main>
  const pdfHref = `/api/app/events/${encodeURIComponent(params.eventId)}/brief?${new URLSearchParams({ account: account ?? '', format: 'pdf', briefHash: brief.editorial.inputHash }).toString()}`
  return <EventClosingBriefDocument brief={brief} eventDates={dates} pdfHref={pdfHref} />
}
