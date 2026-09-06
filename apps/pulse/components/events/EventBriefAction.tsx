'use client'

import { useEffect, useState } from 'react'
import type { EventLifecyclePhase } from '@/lib/events-home-groups'

type BriefStatusResponse = {
  success?: boolean
  error?: string
  data?: { briefHash?: string | null; brief?: { editorial?: { inputHash?: string } } }
}

export function EventBriefAction({
  eventId,
  accountSlug,
  lifecyclePhase,
  briefHash: initialBriefHash = null,
}: {
  eventId: string
  accountSlug: string
  lifecyclePhase: EventLifecyclePhase
  briefHash?: string | null
}) {
  const [briefHash, setBriefHash] = useState<string | null>(initialBriefHash)
  const [checkingBrief, setCheckingBrief] = useState(!initialBriefHash)
  const [generatingBrief, setGeneratingBrief] = useState(false)
  const [briefGenerationError, setBriefGenerationError] = useState<string | null>(null)
  const baseQuery = new URLSearchParams({ account: accountSlug, lifecycle: lifecyclePhase })
  const briefDataHref = `/api/app/events/${encodeURIComponent(eventId)}/brief?${baseQuery.toString()}`
  const briefDocumentHref = briefHash
    ? `/app/events/${encodeURIComponent(eventId)}/brief?${new URLSearchParams({ account: accountSlug, lifecycle: lifecyclePhase, briefHash }).toString()}`
    : null

  useEffect(() => {
    setBriefHash(initialBriefHash)
    if (initialBriefHash || !eventId || !accountSlug) {
      setCheckingBrief(false)
      return
    }
    let cancelled = false
    setCheckingBrief(true)
    fetch(`${briefDataHref}&mode=status`, { credentials: 'include', cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({})) as BriefStatusResponse
        if (!response.ok || !payload.success) throw new Error(payload.error || 'Unable to check brief status.')
        if (!cancelled) setBriefHash(payload.data?.briefHash ?? null)
      })
      .catch(() => { if (!cancelled) setBriefHash(null) })
      .finally(() => { if (!cancelled) setCheckingBrief(false) })
    return () => { cancelled = true }
  }, [accountSlug, briefDataHref, eventId, initialBriefHash, lifecyclePhase])

  const openBriefDocument = (hash = briefHash) => {
    if (!hash) return
    const href = `/app/events/${encodeURIComponent(eventId)}/brief?${new URLSearchParams({ account: accountSlug, lifecycle: lifecyclePhase, briefHash: hash }).toString()}`
    window.open(href, '_blank', 'noopener,noreferrer')
  }

  const generateBrief = async (forceRefresh = false) => {
    if (generatingBrief) return
    const previewWindow = window.open('about:blank', '_blank')
    if (previewWindow) previewWindow.opener = null
    setGeneratingBrief(true)
    setBriefGenerationError(null)
    try {
      const response = await fetch(`${briefDataHref}&mode=generate${forceRefresh ? '&regenerate=1' : ''}`, { credentials: 'include', cache: 'no-store' })
      const payload = await response.json().catch(() => ({})) as BriefStatusResponse
      const generatedHash = payload.data?.briefHash ?? payload.data?.brief?.editorial?.inputHash ?? null
      if (!response.ok || !payload.success || !generatedHash) throw new Error(payload.error || 'Unable to generate the Event Intelligence Brief.')
      setBriefHash(generatedHash)
      const href = `/app/events/${encodeURIComponent(eventId)}/brief?${new URLSearchParams({ account: accountSlug, lifecycle: lifecyclePhase, briefHash: generatedHash }).toString()}`
      if (previewWindow) previewWindow.location.replace(href)
      else openBriefDocument(generatedHash)
    } catch (error) {
      previewWindow?.close()
      setBriefGenerationError(error instanceof Error ? error.message : 'Unable to generate the Event Intelligence Brief.')
    } finally {
      setGeneratingBrief(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2" data-brief-lifecycle={lifecyclePhase}>
      <button type="button" disabled={checkingBrief || generatingBrief} onClick={briefHash ? () => openBriefDocument() : () => void generateBrief()} className="inline-flex min-h-9 items-center rounded-lg bg-indigo-700 px-3.5 text-[11px] font-semibold text-white shadow-sm transition hover:bg-indigo-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:cursor-not-allowed disabled:opacity-50">
        {checkingBrief ? 'Checking brief…' : briefHash ? 'View brief' : generatingBrief ? 'Generating brief…' : 'Generate brief'}
      </button>
      {briefGenerationError && <p role="alert" className="basis-full text-xs font-medium text-rose-700">{briefGenerationError}</p>}
      {briefDocumentHref && <span className="sr-only" data-brief-document-href={briefDocumentHref} />}
    </div>
  )
}
