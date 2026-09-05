'use client'

import { useState } from 'react'
import { EventBriefPdfDownloadButton } from './EventBriefPdfDownloadButton'

export function EventBriefAction({ eventId, accountSlug, briefHash: initialBriefHash = null }: { eventId: string; accountSlug: string; briefHash?: string | null }) {
  const [briefHash, setBriefHash] = useState<string | null>(initialBriefHash)
  const [generatingBrief, setGeneratingBrief] = useState(false)
  const [briefGenerationError, setBriefGenerationError] = useState<string | null>(null)
  const briefDocumentHref = `/app/events/${encodeURIComponent(eventId)}/brief?account=${encodeURIComponent(accountSlug)}`
  const briefPdfHref = `/api/app/events/${encodeURIComponent(eventId)}/brief?account=${encodeURIComponent(accountSlug)}&format=pdf${briefHash ? `&briefHash=${encodeURIComponent(briefHash)}` : ''}`
  const briefDataHref = `/api/app/events/${encodeURIComponent(eventId)}/brief?account=${encodeURIComponent(accountSlug)}`

  const openBriefDocument = () => window.open(briefDocumentHref, '_blank', 'noopener,noreferrer')
  const generateBrief = async () => {
    if (generatingBrief) return
    const previewWindow = window.open('about:blank', '_blank')
    if (previewWindow) previewWindow.opener = null
    setGeneratingBrief(true)
    setBriefGenerationError(null)
    try {
      const response = await fetch(briefDataHref, { credentials: 'include', cache: 'no-store' })
      const payload = await response.json().catch(() => ({})) as { success?: boolean; error?: string; data?: { briefHash?: string; postEventClosingBrief?: { editorial?: { inputHash?: string } } } }
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Unable to generate the Event Intelligence Brief.')
      setBriefHash(payload.data?.briefHash ?? payload.data?.postEventClosingBrief?.editorial?.inputHash ?? null)
      if (previewWindow) previewWindow.location.replace(briefDocumentHref)
      else openBriefDocument()
    } catch (error) {
      previewWindow?.close()
      setBriefGenerationError(error instanceof Error ? error.message : 'Unable to generate the Event Intelligence Brief.')
    } finally {
      setGeneratingBrief(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" disabled={generatingBrief} onClick={briefHash ? openBriefDocument : generateBrief} className="inline-flex min-h-9 items-center rounded-lg bg-indigo-700 px-3.5 text-[11px] font-semibold text-white shadow-sm transition hover:bg-indigo-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:cursor-not-allowed disabled:opacity-50">
        {briefHash ? 'View brief' : generatingBrief ? 'Generating brief…' : 'Generate brief'}
      </button>
      {briefHash && <EventBriefPdfDownloadButton pdfHref={briefPdfHref} className="inline-flex min-h-9 items-center rounded-lg border border-slate-200 bg-white px-3.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400" />}
      {briefGenerationError && <p role="alert" className="basis-full text-xs font-medium text-rose-700">{briefGenerationError}</p>}
    </div>
  )
}
