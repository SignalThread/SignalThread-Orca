'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { EventSessionDateTimePicker } from '@/components/events/EventSessionDateTimePicker'

export type EventActionOwner = { id: string; email: string; firstName: string | null; lastName: string | null }

export type CanonicalEventAction = {
  id: string
  title: string
  summary: string | null
  taxonomyKey?: string | null
  actionStatus: string
}

export type CanonicalEventActionFinding = {
  id: string
  title: string
  summary: string | null
  taxonomyKey: string | null
}

export type EventActionSource = { clusterId?: string; title: string; evidenceLabel?: string }

type EventActionData = {
  actions: CanonicalEventAction[]
  availableFindings: CanonicalEventActionFinding[]
  owners: EventActionOwner[]
  loading: boolean
}

function parseOwner(value: unknown): EventActionOwner[] {
  if (!value || typeof value !== 'object') return []
  const owner = value as Record<string, unknown>
  return typeof owner.id === 'string' && typeof owner.email === 'string'
    ? [{ id: owner.id, email: owner.email, firstName: typeof owner.firstName === 'string' ? owner.firstName : null, lastName: typeof owner.lastName === 'string' ? owner.lastName : null }]
    : []
}

function parseAction(value: unknown): CanonicalEventAction[] {
  if (!value || typeof value !== 'object') return []
  const action = value as Record<string, unknown>
  if (typeof action.id !== 'string' || typeof action.title !== 'string' || typeof action.actionStatus !== 'string') return []
  return [{
    id: action.id,
    title: action.title,
    summary: typeof action.summary === 'string' ? action.summary : null,
    taxonomyKey: typeof action.taxonomyKey === 'string' ? action.taxonomyKey : null,
    actionStatus: action.actionStatus,
  }]
}

function parseFinding(value: unknown): CanonicalEventActionFinding[] {
  if (!value || typeof value !== 'object') return []
  const finding = value as Record<string, unknown>
  if (typeof finding.id !== 'string' || typeof finding.title !== 'string') return []
  return [{
    id: finding.id,
    title: finding.title,
    summary: typeof finding.summary === 'string' ? finding.summary : null,
    taxonomyKey: typeof finding.taxonomyKey === 'string' ? finding.taxonomyKey : null,
  }]
}

/** One canonical action read path shared by PRE, DURING, and POST intelligence. */
export function useEventActionData(eventId: string, accountSlug: string): EventActionData {
  const [data, setData] = useState<Omit<EventActionData, 'loading'>>({ actions: [], availableFindings: [], owners: [] })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!eventId || !accountSlug) {
      setData({ actions: [], availableFindings: [], owners: [] })
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    fetch(`/api/app/events/${encodeURIComponent(eventId)}/actions?${new URLSearchParams({ account: accountSlug }).toString()}`, { credentials: 'include', cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}))
        if (!response.ok || !body.success || !Array.isArray(body.data?.actions)) throw new Error(body.error || 'Unable to load actions')
        if (!cancelled) setData({
          actions: body.data.actions.flatMap(parseAction),
          availableFindings: Array.isArray(body.data?.availableFindings) ? body.data.availableFindings.flatMap(parseFinding) : [],
          owners: Array.isArray(body.data?.availableOwners) ? body.data.availableOwners.flatMap(parseOwner) : [],
        })
      })
      .catch(() => { if (!cancelled) setData({ actions: [], availableFindings: [], owners: [] }) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [accountSlug, eventId])

  return useMemo(() => ({ ...data, loading }), [data, loading])
}

function normalizedSourceKey(value: string | null | undefined) {
  return (value ?? '').trim().toLocaleLowerCase('en-US').replace(/[^a-z0-9]+/g, ' ').trim()
}

/** Resolve a visible finding to the persisted cluster used by canonical Actions. */
export function resolveEventActionSource(
  data: Pick<EventActionData, 'actions' | 'availableFindings'>,
  input: { clusterId?: string | null; title: string; themeKeys?: string[]; evidenceLabel?: string },
): { source: EventActionSource; actioned: boolean } {
  const records = [...data.actions, ...data.availableFindings]
  const themeKeys = new Set((input.themeKeys ?? []).map(normalizedSourceKey).filter(Boolean))
  const titleKey = normalizedSourceKey(input.title)
  const cluster = input.clusterId
    ? records.find((record) => record.id === input.clusterId) ?? { id: input.clusterId }
    : records.find((record) => record.taxonomyKey && themeKeys.has(normalizedSourceKey(record.taxonomyKey)))
      ?? records.find((record) => normalizedSourceKey(record.title) === titleKey || normalizedSourceKey(record.summary) === titleKey)
  const clusterId = cluster?.id
  return {
    source: { ...(clusterId ? { clusterId } : {}), title: input.title, evidenceLabel: input.evidenceLabel },
    actioned: Boolean(clusterId && data.actions.some((action) => action.id === clusterId)),
  }
}

function ownerName(owner: EventActionOwner) {
  return [owner.firstName, owner.lastName].filter(Boolean).join(' ') || owner.email
}

function localDateTime(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function idempotencyKey() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `event-action-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/** One small composer for source-linked and manual human actions. */
export function EventActionComposer({
  eventId, accountSlug, owners, source, compact = false, onCreated, onCancel,
}: {
  eventId: string
  accountSlug: string
  owners: EventActionOwner[]
  source?: EventActionSource
  compact?: boolean
  onCreated: (actionId: string) => void
  onCancel?: () => void
}) {
  const [title, setTitle] = useState(source?.title ?? '')
  const [ownerUserId, setOwnerUserId] = useState('')
  const [when, setWhen] = useState<'now' | 'date'>(source ? 'date' : 'now')
  const [dueAt, setDueAt] = useState(localDateTime(new Date()))
  const [datePickerOpen, setDatePickerOpen] = useState(false)
  const [urgent, setUrgent] = useState(false)
  const [reminderEnabled, setReminderEnabled] = useState(true)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const base = `/api/app/events/${encodeURIComponent(eventId)}/actions?account=${encodeURIComponent(accountSlug)}`
  const selectedOwner = owners.find((owner) => owner.id === ownerUserId)

  const create = async () => {
    if (!title.trim()) return
    setSaving(true); setError(null)
    try {
      const response = await fetch(base, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(source?.clusterId ? { clusterId: source.clusterId } : {}),
          title: title.trim(), note: source ? undefined : note.trim() || undefined,
          dueAt: when === 'now' ? new Date().toISOString() : dueAt ? new Date(dueAt).toISOString() : null,
          urgent, reminderEnabled, idempotencyKey: idempotencyKey(),
        }),
      })
      const json = await response.json()
      if (!response.ok || !json.success) throw new Error(json.error || 'Could not create action')
      const actionId = json.data.id as string
      if (ownerUserId) {
        const detail = `/api/app/events/${encodeURIComponent(eventId)}/actions/${encodeURIComponent(actionId)}?account=${encodeURIComponent(accountSlug)}`
        const assignment = await fetch(detail, {
          method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ operation: 'ASSIGN', ownerUserId, idempotencyKey: idempotencyKey() }),
        })
        const assignmentJson = await assignment.json()
        if (!assignment.ok || !assignmentJson.success) throw new Error(assignmentJson.error || 'Action was created, but assignment could not be saved')
      }
      onCreated(actionId)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create action')
    } finally { setSaving(false) }
  }

  return <section className={`rounded-2xl border border-slate-200 bg-white shadow-[0_14px_34px_rgba(15,27,51,.06)] ${compact ? 'w-full max-w-[390px] p-3.5' : 'p-5'}`} aria-label={source ? 'Create action from intelligence' : 'New action'}>
    {source && <div className="mb-3.5 flex min-w-0 items-center gap-2 rounded-lg border border-violet-100 bg-violet-50 px-2.5 py-1.5 text-[11px] text-slate-600"><span className="shrink-0 font-bold text-indigo-700">Created from</span><span className="min-w-0 flex-1 truncate text-left font-medium">{source.title}</span><span className="shrink-0 text-right font-semibold text-indigo-700">{source.evidenceLabel ?? 'Evidence →'}</span></div>}
    <label className="block text-left"><span className="text-[10px] font-bold uppercase tracking-[.12em] text-slate-400">What needs to happen</span><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Restock water in Hall B" className="mt-1.5 h-10 w-full rounded-xl border border-indigo-200 px-3 text-[14px] font-semibold text-left outline-none ring-indigo-100 focus:ring-4" /></label>
    <div className="mt-3.5"><p className="text-[10px] font-bold uppercase tracking-[.12em] text-slate-400">Who</p><div className="mt-1.5 flex flex-wrap gap-1.5"><button type="button" onClick={() => setOwnerUserId('')} className={`rounded-full border px-2.5 py-1.5 text-[11px] font-semibold ${!ownerUserId ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-500'}`}>Unassigned</button>{owners.map((owner) => <button type="button" key={owner.id} onClick={() => setOwnerUserId(owner.id)} className={`rounded-full border px-2.5 py-1.5 text-[11px] font-semibold ${ownerUserId === owner.id ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-700'}`}>{ownerName(owner)}</button>)}</div></div>
    <div className="mt-3.5"><p className="text-[10px] font-bold uppercase tracking-[.12em] text-slate-400">When</p><div className="mt-1.5 flex flex-wrap gap-1.5"><button type="button" onClick={() => { setWhen('now'); setDatePickerOpen(false) }} className={`rounded-lg px-3 py-2 text-xs font-semibold ${when === 'now' ? 'bg-slate-900 text-white' : 'border border-slate-200 text-slate-700'}`}>Now</button><button type="button" onClick={() => { setWhen('date'); setDatePickerOpen(true) }} className={`rounded-lg px-2.5 py-2 text-xs font-semibold ${when === 'date' ? 'bg-slate-900 text-white' : 'border border-slate-200 text-slate-700'}`}>Date + time</button></div>{when === 'date' && <div className="mt-1.5 max-w-sm"><EventSessionDateTimePicker label="Due date and time" hideLabel compact value={dueAt} onChange={setDueAt} open={datePickerOpen} onOpenChange={setDatePickerOpen} clearable /></div>}</div>
    {!source && <label className="mt-3.5 block"><span className="text-[10px] font-bold uppercase tracking-[.12em] text-slate-400">Note <span className="normal-case tracking-normal">(optional)</span></span><textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} className="mt-1.5 w-full rounded-xl border border-slate-200 p-2.5 text-xs" /></label>}
    <div className="mt-3.5 flex flex-wrap items-center gap-2.5"><label className="flex cursor-pointer items-center gap-1.5 text-[11px] font-semibold text-slate-600"><input className="size-3.5" type="checkbox" checked={urgent} onChange={(event) => setUrgent(event.target.checked)} /> Urgent</label><label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-slate-500"><input className="size-3.5" type="checkbox" checked={reminderEnabled} onChange={(event) => setReminderEnabled(event.target.checked)} /> 15 min reminder</label></div>
    <p className="mt-2 text-[11px] text-slate-500">{selectedOwner ? `${ownerName(selectedOwner)} is notified now${reminderEnabled ? ' and 15 minutes before due.' : '.'}` : 'Assign an owner whenever someone should be notified.'}</p>
    <div className="mt-3.5 flex items-center gap-2.5"><button type="button" disabled={saving || !title.trim()} onClick={() => void create()} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{saving ? 'Creating…' : 'Create action'}</button>{onCancel && <button type="button" disabled={saving} onClick={onCancel} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600">Cancel</button>}</div>
    {error && <p role="alert" className="mt-3 text-xs font-semibold text-rose-700">{error}</p>}
  </section>
}

/** A fixed-size, keyboard-reachable affordance that never shifts its row. */
export function EventActionAffordance({ actioned, open, onCreate }: { actioned: boolean; open?: boolean; onCreate: () => void }) {
  return <button type="button" data-open={open || undefined} onClick={onCreate} aria-label={actioned ? 'Action created' : 'Create action'} title={actioned ? 'Action created' : 'Create action'} className={`grid size-7 shrink-0 place-items-center rounded-md text-sm font-bold outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-indigo-400 ${actioned ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-900 text-white opacity-0 pointer-events-none group-hover/actionable:pointer-events-auto group-hover/actionable:opacity-100 group-focus-within/actionable:pointer-events-auto group-focus-within/actionable:opacity-100 data-[open=true]:pointer-events-auto data-[open=true]:opacity-100'}`}>{actioned ? '✓' : '+'}</button>
}

/**
 * The one hover/focus interaction primitive for intelligence. Its fixed action
 * column is always 28px wide; only the control's opacity changes, so content
 * never reflows. The composer stays inside the same hover group while open.
 */
export function EventActionableItem({
  eventId, accountSlug, owners, source, actioned = false, children, className = '', actionSlotAlign = 'top', onCreated,
}: {
  eventId: string
  accountSlug: string
  owners: EventActionOwner[]
  source: EventActionSource
  actioned?: boolean
  children: ReactNode
  className?: string
  /** Align to the row's primary content or an existing vertically-centered control. */
  actionSlotAlign?: 'top' | 'center'
  onCreated?: (actionId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [created, setCreated] = useState(false)
  const isActioned = actioned || created
  const centeredControls = actionSlotAlign === 'center'
  return <div data-testid="event-actionable-item" data-action-composer-open={open || undefined} className={`group/actionable relative flex min-w-0 ${centeredControls ? 'items-center' : 'items-start'} gap-3 ${className}`}>
    <div className="min-w-0 flex-1">{children}</div>
    <div className={`${centeredControls ? '' : 'mt-0.5 self-start '}flex size-7 shrink-0 items-center justify-center`}>
      <EventActionAffordance actioned={isActioned} open={open} onCreate={() => { if (!isActioned) setOpen(true) }} />
    </div>
    {open && <div className="absolute right-0 top-full z-30 mt-2 w-[min(430px,calc(100vw-2rem))]" data-testid="event-action-compact-composer"><EventActionComposer compact eventId={eventId} accountSlug={accountSlug} owners={owners} source={source} onCancel={() => setOpen(false)} onCreated={(actionId) => { setCreated(true); setOpen(false); onCreated?.(actionId) }} /></div>}
  </div>
}
