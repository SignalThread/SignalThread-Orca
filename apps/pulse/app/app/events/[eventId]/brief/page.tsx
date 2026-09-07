'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { EventClosingBriefDocument } from '@/components/events/EventClosingBriefDocument'
import type { EventClosingBrief } from '@/lib/event-closing-brief'
import type { EventLifecyclePhase } from '@/lib/events-home-groups'

type EventAnalysisBriefResponse = {
  success: boolean
  error?: string
  data?: {
    brief?: EventClosingBrief
    briefHash?: string
    eventStartDate?: string | null
    eventEndDate?: string | null
  }
}

export default function EventClosingBriefDocumentPage() {
  const params = useParams<{ eventId: string }>()
  const searchParams = useSearchParams()
  const account = searchParams.get('account')
  const lifecycle = searchParams.get('lifecycle') as EventLifecyclePhase | null
  const briefHash = searchParams.get('briefHash')
  const [brief, setBrief] = useState<EventClosingBrief | null>(null)
  const [dates, setDates] = useState<{ startDate: string | null; endDate: string | null } | undefined>()
  const [error, setError] = useState<string | null>(null)
  const [regenerating, setRegenerating] = useState(false)

  useEffect(() => {
    if (!params.eventId || !account || !briefHash || !lifecycle) {
      setError('An event, lifecycle, and generated brief version are required to view this brief.')
      return
    }
    const query = new URLSearchParams({ account, lifecycle, briefHash })
    fetch(`/api/app/events/${encodeURIComponent(params.eventId)}/brief?${query.toString()}`, { credentials: 'include', cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json().catch(() => ({})) as EventAnalysisBriefResponse
        if (!response.ok || !body.success || !body.data?.brief) throw new Error(body.error || 'Unable to load the event intelligence brief.')
        setBrief(body.data.brief)
        setDates({ startDate: body.data.eventStartDate ?? null, endDate: body.data.eventEndDate ?? null })
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Unable to load the event intelligence brief.'))
  }, [account, briefHash, lifecycle, params.eventId])

  if (error) return <main className="font-brand grid min-h-screen place-items-center bg-slate-100 p-6"><p role="alert" className="max-w-md rounded-xl border border-rose-200 bg-white p-5 text-sm text-rose-700">{error}</p></main>
  if (!brief) return <main className="font-brand grid min-h-screen place-items-center bg-slate-100 p-6"><p className="text-sm text-slate-500">Loading Event Intelligence Brief…</p></main>
  const pdfHref = `/api/app/events/${encodeURIComponent(params.eventId)}/brief?${new URLSearchParams({ account: account ?? '', lifecycle: brief.lifecyclePhase, format: 'pdf', briefHash: brief.versionId }).toString()}`
  const regenerateBrief = async () => {
    if (!account || !params.eventId || regenerating) return
    setRegenerating(true)
    setError(null)
    try {
      const query = new URLSearchParams({ account, lifecycle: brief.lifecyclePhase, mode: 'generate', regenerate: '1' })
      const response = await fetch(`/api/app/events/${encodeURIComponent(params.eventId)}/brief?${query.toString()}`, { credentials: 'include', cache: 'no-store' })
      const body = await response.json().catch(() => ({})) as EventAnalysisBriefResponse
      const nextBriefHash = body.data?.briefHash ?? body.data?.brief?.versionId
      if (!response.ok || !body.success || !nextBriefHash) throw new Error(body.error || 'Unable to regenerate the Event Intelligence Brief.')
      window.location.replace(`/app/events/${encodeURIComponent(params.eventId)}/brief?${new URLSearchParams({ account, lifecycle: brief.lifecyclePhase, briefHash: nextBriefHash }).toString()}`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to regenerate the Event Intelligence Brief.')
      setRegenerating(false)
    }
  }
  return <EventClosingBriefDocument brief={brief} eventDates={dates} pdfHref={pdfHref} onRegenerate={() => void regenerateBrief()} regenerating={regenerating} />
}
