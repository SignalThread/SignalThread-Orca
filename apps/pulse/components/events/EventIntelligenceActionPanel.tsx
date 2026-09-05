'use client'

import { useEffect, useState } from 'react'
import {
  EVENT_ACTION_CLASSIFICATIONS,
  EVENT_ACTION_CLASSIFICATION_LABELS,
  EVENT_ACTION_STATUS_LABELS,
  type EventActionClassification,
  type EventActionStatus,
} from '@/lib/event-actions/contract'

type Owner = { id: string; email: string; firstName: string | null; lastName: string | null }
type Action = {
  id: string
  title: string
  priorityLevel: string
  ownerUserId: string | null
  owner: Owner | null
  actionClassification: EventActionClassification
  actionStatus: EventActionStatus
  actionDueAt: string | null
  summary: string | null
}
type ActionDetail = Action & { actionUpdates: Array<{ id: string; body: string | null; voiceTranscript: string | null; createdAt: string }> }

function ownerName(owner: Owner | null) {
  return owner ? [owner.firstName, owner.lastName].filter(Boolean).join(' ') || owner.email : 'Unassigned'
}

function dateLabel(value: string | null) {
  if (!value) return 'No due date'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'No due date' : date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}

function idempotencyKey() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `action-${Date.now()}-${Math.random()}`
}

/** The intelligence drawer's one-action conversion panel. Action state always comes from the canonical actions API. */
export function EventIntelligenceActionPanel({
  eventId,
  accountSlug,
  finding,
  onOpenAction,
}: {
  eventId: string
  accountSlug: string
  finding: { id: string | null; title: string; summary: string | null; priorityLevel: string }
  onOpenAction: (actionId: string) => void
}) {
  const [owners, setOwners] = useState<Owner[]>([])
  const [action, setAction] = useState<ActionDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState(finding.title)
  const [ownerUserId, setOwnerUserId] = useState('')
  const [classification, setClassification] = useState<EventActionClassification>('DURING_EVENT')
  const [priority, setPriority] = useState(finding.priorityLevel || 'Soon')
  const [dueAt, setDueAt] = useState('')
  const [initialUpdate, setInitialUpdate] = useState('')
  const baseUrl = `/api/app/events/${encodeURIComponent(eventId)}/actions?account=${encodeURIComponent(accountSlug)}`

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setAction(null)
    setShowForm(false)
    setError(null)
    setTitle(finding.title)
    void fetch(baseUrl, { credentials: 'include', cache: 'no-store' })
      .then(async (response) => {
        const json = await response.json()
        if (!response.ok || !json.success) throw new Error(json.error || 'Could not load action state')
        return json.data as { actions: Action[]; availableOwners: Owner[] }
      })
      .then(async (data) => {
        if (cancelled) return
        setOwners(data.availableOwners)
        const linked = finding.id ? data.actions.find((candidate) => candidate.id === finding.id) ?? null : null
        if (!linked) return
        const response = await fetch(`${baseUrl.split('?')[0]}/${encodeURIComponent(linked.id)}?account=${encodeURIComponent(accountSlug)}`, { credentials: 'include', cache: 'no-store' })
        const json = await response.json()
        if (!response.ok || !json.success) throw new Error(json.error || 'Could not load action detail')
        if (!cancelled) setAction(json.data as ActionDetail)
      })
      .catch((cause: unknown) => { if (!cancelled) setError(cause instanceof Error ? cause.message : 'Could not load action state') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [accountSlug, baseUrl, finding.id, finding.title])

  const createAction = async () => {
    if (!finding.id) return
    setSaving(true)
    setError(null)
    try {
      const response = await fetch(baseUrl, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clusterId: finding.id,
          title,
          // Conversion establishes the action. Assignment remains the canonical
          // assignment mutation so delivery/history rules stay identical.
          ownerUserId: null,
          classification,
          priority,
          dueAt: dueAt ? new Date(dueAt).toISOString() : null,
          initialUpdate,
          idempotencyKey: idempotencyKey(),
        }),
      })
      const json = await response.json()
      if (!response.ok || !json.success) throw new Error(json.error || 'Could not create action')
      if (ownerUserId) {
        const assignmentResponse = await fetch(`${baseUrl.split('?')[0]}/${encodeURIComponent(finding.id)}?account=${encodeURIComponent(accountSlug)}`, {
          method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ operation: 'ASSIGN', ownerUserId, idempotencyKey: idempotencyKey() }),
        })
        const assignmentJson = await assignmentResponse.json()
        if (!assignmentResponse.ok || !assignmentJson.success) throw new Error(assignmentJson.error || 'Action was created, but assignment could not be saved')
      }
      const detailResponse = await fetch(`${baseUrl.split('?')[0]}/${encodeURIComponent(finding.id)}?account=${encodeURIComponent(accountSlug)}`, { credentials: 'include', cache: 'no-store' })
      const detailJson = await detailResponse.json()
      if (!detailResponse.ok || !detailJson.success) throw new Error(detailJson.error || 'Action was created but could not be refreshed')
      setAction(detailJson.data as ActionDetail)
      setShowForm(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create action')
    } finally {
      setSaving(false)
    }
  }

  if (!finding.id) return null
  return <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4" aria-label="Action">
    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Action</p>
    {loading ? <div className="mt-3 h-20 animate-pulse rounded-xl bg-slate-200/70" /> : action ? <div className="mt-3">
      <div className="flex flex-wrap items-center gap-2"><span className="rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-indigo-700">{EVENT_ACTION_STATUS_LABELS[action.actionStatus]}</span><span className="text-xs font-semibold text-slate-500">{EVENT_ACTION_CLASSIFICATION_LABELS[action.actionClassification]}</span></div>
      <h3 className="mt-3 text-[15px] font-bold leading-6 text-slate-950">{action.title}</h3>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-xs"><div><dt className="text-slate-400">Owner</dt><dd className="mt-1 font-semibold text-slate-700">{ownerName(action.owner)}</dd></div><div><dt className="text-slate-400">Priority</dt><dd className="mt-1 font-semibold text-slate-700">{action.priorityLevel}</dd></div><div><dt className="text-slate-400">Due date</dt><dd className="mt-1 font-semibold text-slate-700">{dateLabel(action.actionDueAt)}</dd></div><div><dt className="text-slate-400">Latest update</dt><dd className="mt-1 line-clamp-2 font-semibold text-slate-700">{action.actionUpdates.at(-1)?.body || action.actionUpdates.at(-1)?.voiceTranscript || 'No updates yet'}</dd></div></dl>
      <button type="button" onClick={() => onOpenAction(action.id)} className="mt-4 rounded-lg bg-[#111a3a] px-3 py-2 text-xs font-bold text-white">Open action</button>
    </div> : showForm ? <div className="mt-3 space-y-3">
      <p className="text-xs leading-5 text-slate-600">Create one action from this intelligence. The evidence remains separate and linked.</p>
      <label className="block text-xs font-bold text-slate-600">Title<input value={title} onChange={(event) => setTitle(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium" /></label>
      <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold text-slate-600">Owner<select value={ownerUserId} onChange={(event) => setOwnerUserId(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="">Unassigned</option>{owners.map((owner) => <option key={owner.id} value={owner.id}>{ownerName(owner)}</option>)}</select></label><label className="text-xs font-bold text-slate-600">Priority<select value={priority} onChange={(event) => setPriority(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm">{['Immediate', 'Soon', 'Watch', 'Informational'].map((value) => <option key={value}>{value}</option>)}</select></label><label className="text-xs font-bold text-slate-600">Classification<select value={classification} onChange={(event) => setClassification(event.target.value as EventActionClassification)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm">{EVENT_ACTION_CLASSIFICATIONS.map((value) => <option key={value} value={value}>{EVENT_ACTION_CLASSIFICATION_LABELS[value]}</option>)}</select></label><label className="text-xs font-bold text-slate-600">Due date<input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm" /></label></div>
      <label className="block text-xs font-bold text-slate-600">Initial update <span className="font-normal text-slate-400">(optional)</span><textarea value={initialUpdate} onChange={(event) => setInitialUpdate(event.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-3 text-sm font-normal" /></label>
      <div className="flex gap-2"><button type="button" disabled={saving || !title.trim()} onClick={() => void createAction()} className="rounded-lg bg-[#111a3a] px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{saving ? 'Creating…' : 'Create action'}</button><button type="button" disabled={saving} onClick={() => setShowForm(false)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600">Cancel</button></div>
    </div> : <div className="mt-3"><p className="text-sm leading-6 text-slate-600">No action has been created. Create one only when this intelligence needs follow-through.</p><button type="button" onClick={() => setShowForm(true)} className="mt-3 rounded-lg bg-[#111a3a] px-3 py-2 text-xs font-bold text-white">Create action</button></div>}
    {error && <p role="alert" className="mt-3 text-xs font-medium text-rose-700">{error}</p>}
  </section>
}
