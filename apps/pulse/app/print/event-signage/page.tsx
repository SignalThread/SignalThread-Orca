'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { EventSignageSheets } from '@/components/events/EventSignageSheets'
import {
  EVENT_SIGNAGE_PRINT_PAYLOAD_KEY,
  isEventSignageLayoutSupported,
  resolveCanonicalQrSignConfiguration,
  resolveEventSignageQrUrl,
  resolveEventSignageViewModel,
  withEventSignageVisualConfiguration,
  type EventSignagePrintPayload,
} from '@/lib/event-signage'

export default function EventSignagePrintPage() {
  const [payload, setPayload] = useState<EventSignagePrintPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const initialized = useRef(false)

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    const rawPayload = window.sessionStorage.getItem(EVENT_SIGNAGE_PRINT_PAYLOAD_KEY)
    if (!rawPayload) {
      setError('This print session is no longer available. Return to Event Operations and try again.')
      return
    }
    try {
      const nextPayload = JSON.parse(rawPayload) as EventSignagePrintPayload
      if (!nextPayload.eventName || !nextPayload.origin || !nextPayload.surveys?.length || !nextPayload.pageConfiguration) throw new Error('Invalid signage print payload')
      if (nextPayload.surveys.some((survey) => !survey.signageConfiguration || !survey.qrPath)) throw new Error('Incomplete signage print payload')
      if (!isEventSignageLayoutSupported(nextPayload.pageConfiguration)) throw new Error('Unsafe signage print layout')
      window.sessionStorage.removeItem(EVENT_SIGNAGE_PRINT_PAYLOAD_KEY)
      setPayload(nextPayload)
      document.title = `${nextPayload.eventName} survey signage`
    } catch {
      setError('Printable signage could not be prepared. Return to Event Operations and try again.')
    }
  }, [])

  const signs = useMemo(() => payload?.surveys.map((survey) => {
    const viewModel = resolveEventSignageViewModel({
      configuration: withEventSignageVisualConfiguration(
        payload.pageConfiguration,
        survey.signageConfiguration,
      ),
      eventName: payload.eventName,
      survey,
      branding: payload.branding,
    })
    return {
      id: survey.id,
      configuration: resolveCanonicalQrSignConfiguration({
        viewModel,
        qrUrl: resolveEventSignageQrUrl(survey.qrPath, payload.origin),
      }),
    }
  }) ?? [], [payload])

  useEffect(() => {
    if (!payload || signs.length === 0) return
    const frame = window.requestAnimationFrame(() => window.requestAnimationFrame(() => window.print()))
    return () => window.cancelAnimationFrame(frame)
  }, [payload, signs.length])

  if (error) return <p role="alert">{error}</p>
  if (!payload) return <p>Preparing printable survey signage…</p>

  return <>
    <style jsx global>{`
      @page { size: letter ${payload.pageConfiguration.orientation}; margin: 0; }
      html, body { margin: 0; padding: 0; background: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    `}</style>
    <EventSignageSheets signs={signs} configuration={payload.pageConfiguration} mode="print" />
  </>
}
