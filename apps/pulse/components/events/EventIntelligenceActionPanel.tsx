'use client'

import { useEffect, useState } from 'react'
import { EventActionableItem, type EventActionOwner } from '@/components/events/EventActionComposer'

/**
 * The one intelligence-to-action bridge. It never creates anything itself:
 * the human explicitly opens the compact composer and presses Create action.
 */
export function EventIntelligenceActionPanel({ eventId, accountSlug, finding, onOpenAction }: {
  eventId: string
  accountSlug: string
  finding: { id: string | null; title: string; summary: string | null; priorityLevel: string }
  onOpenAction: (actionId: string) => void
}) {
  const [owners, setOwners] = useState<EventActionOwner[]>([])
  const [actionId, setActionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const base = `/api/app/events/${encodeURIComponent(eventId)}/actions?account=${encodeURIComponent(accountSlug)}`
  useEffect(() => { let cancelled = false; void fetch(base, { credentials: 'include', cache: 'no-store' }).then(async (response) => { const json = await response.json(); if (!response.ok || !json.success) throw new Error(json.error || 'Could not load actions'); return json.data as { actions: Array<{ id: string }>; availableOwners: EventActionOwner[] } }).then((data) => { if (!cancelled) { setOwners(data.availableOwners); setActionId(finding.id ? (data.actions.find((action) => action.id === finding.id)?.id ?? null) : null) } }).catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : 'Could not load action state') }); return () => { cancelled = true } }, [base, finding.id])
  if (!finding.id) return null
  if (actionId) return <section className="rounded-xl border border-emerald-100 bg-emerald-50 p-3"><p className="text-xs font-semibold text-emerald-800">✓ A team member created an action from this intelligence.</p><button type="button" onClick={() => onOpenAction(actionId)} className="mt-2 text-xs font-bold text-indigo-700">Open action →</button></section>
  return <section className="rounded-xl border border-slate-200 bg-slate-50 p-3"><EventActionableItem eventId={eventId} accountSlug={accountSlug} owners={owners} source={{ clusterId: finding.id, title: finding.title, evidenceLabel: 'Evidence →' }} className="text-xs text-slate-600" onCreated={setActionId}><span>A human can turn this into an action when it needs follow-through.</span></EventActionableItem>{error && <p role="alert" className="mt-2 text-xs text-rose-700">{error}</p>}</section>
}
