'use client'

import { useState } from 'react'

export function EventBriefPdfDownloadButton({ pdfHref, className }: { pdfHref: string; className?: string }) {
  const [error, setError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)

  const download = async () => {
    if (downloading) return
    setDownloading(true)
    setError(null)
    try {
      const response = await fetch(pdfHref, { credentials: 'include', cache: 'no-store' })
      if (!response.ok || !response.headers.get('content-type')?.includes('application/pdf')) {
        const body = await response.json().catch(() => null) as { error?: string } | null
        throw new Error(body?.error || 'Unable to download the Event Intelligence Brief PDF.')
      }
      const blob = await response.blob()
      const disposition = response.headers.get('content-disposition') ?? ''
      const filename = /filename="?([^";]+)"?/i.exec(disposition)?.[1] ?? 'event-intelligence-brief.pdf'
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to download the Event Intelligence Brief PDF.')
    } finally {
      setDownloading(false)
    }
  }

  return <div className="inline-flex flex-col items-end gap-2"><button type="button" onClick={() => void download()} disabled={downloading} className={className ?? 'inline-flex min-h-9 items-center rounded-lg border border-slate-300 bg-white px-3.5 text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60'}>{downloading ? 'Preparing PDF…' : 'Download PDF'}</button>{error && <p role="alert" className="max-w-xs text-right text-xs font-medium text-rose-700">{error}</p>}</div>
}
