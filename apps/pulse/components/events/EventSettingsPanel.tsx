'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Modal } from '@/components/ui/Modal'
import { EventDatePicker } from '@/components/app/events'
import { eventDateToDateInputValue } from '@/lib/event-dates'

type EventSettingsRecord = {
  id: string
  name: string
  description: string | null
  venue: string | null
  startDate: string | null
  endDate: string | null
  listeningWindowOpensAt: string | null
  listeningWindowClosesAt: string | null
}

function eventWindowDate(value: string | null) {
  return eventDateToDateInputValue(value)
}

function eventWindowTime(value: string | null) {
  if (!value) return '12:00'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '12:00' : `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function eventWindowIso(date: string, time: string) {
  if (!date) return null
  const parsed = new Date(`${date}T${/^\d{2}:\d{2}$/.test(time) ? time : '12:00'}`)
  if (Number.isNaN(parsed.getTime())) throw new Error('Listening window date and time must be valid')
  return parsed.toISOString()
}

/** The only Event metadata form: rendered in the account Settings Event Settings tab. */
export function EventSettingsPanel({ accountSlug, eventId }: { accountSlug: string; eventId: string }) {
  const router = useRouter()
  const [event, setEvent] = useState<EventSettingsRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [venue, setVenue] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [listeningOpenDate, setListeningOpenDate] = useState('')
  const [listeningOpenTime, setListeningOpenTime] = useState('12:00')
  const [listeningCloseDate, setListeningCloseDate] = useState('')
  const [listeningCloseTime, setListeningCloseTime] = useState('12:00')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteConfirmation, setDeleteConfirmation] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch(`/api/app/events/${encodeURIComponent(eventId)}?account=${encodeURIComponent(accountSlug)}`, { credentials: 'include' })
        const body = await response.json().catch(() => ({}))
        if (!response.ok || !body?.success || !body.event) throw new Error(body?.error || 'Failed to load event settings')
        if (cancelled) return
        const next = body.event as EventSettingsRecord
        setEvent(next)
        setName(next.name)
        setDescription(next.description ?? '')
        setVenue(next.venue ?? '')
        setStartDate(eventDateToDateInputValue(next.startDate))
        setEndDate(eventDateToDateInputValue(next.endDate))
        setListeningOpenDate(eventWindowDate(next.listeningWindowOpensAt))
        setListeningOpenTime(eventWindowTime(next.listeningWindowOpensAt))
        setListeningCloseDate(eventWindowDate(next.listeningWindowClosesAt))
        setListeningCloseTime(eventWindowTime(next.listeningWindowClosesAt))
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Failed to load event settings')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [accountSlug, eventId])

  const save = async () => {
    if (!name.trim() || saving) {
      if (!name.trim()) setError('Event name is required')
      return
    }
    try {
      setSaving(true)
      setError(null)
      setSaved(false)
      const response = await fetch(`/api/app/events/${encodeURIComponent(eventId)}/settings?account=${encodeURIComponent(accountSlug)}`, {
        method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(), description: description.trim() || null, venue: venue.trim() || null,
          startDate: startDate || null, endDate: endDate || null,
          listeningWindowOpensAt: eventWindowIso(listeningOpenDate, listeningOpenTime),
          listeningWindowClosesAt: eventWindowIso(listeningCloseDate, listeningCloseTime),
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok || !body?.success) throw new Error(body?.error || body?.message || 'Failed to save event settings')
      setEvent((current) => current ? { ...current, name: name.trim() } : current)
      setSaved(true)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Failed to save event settings')
    } finally {
      setSaving(false)
    }
  }

  const deleteEvent = async () => {
    if (!event || deleteConfirmation !== event.name || deleting) return
    try {
      setDeleting(true)
      setDeleteError(null)
      const response = await fetch(`/api/app/events/${encodeURIComponent(eventId)}?account=${encodeURIComponent(accountSlug)}`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmationName: deleteConfirmation }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body?.error || 'Unable to delete this Event.')
      router.replace(`/app?account=${encodeURIComponent(accountSlug)}`)
    } catch (reason) {
      setDeleteError(reason instanceof Error ? reason.message : 'Unable to delete this Event.')
      setDeleting(false)
    }
  }

  if (loading) return <Card padding="md"><p className="text-sm text-zinc-500">Loading event settings…</p></Card>
  if (!event) return <Card padding="md"><p role="alert" className="text-sm text-red-700">{error || 'Event settings are unavailable.'}</p></Card>

  return <>
    <Card padding="md" data-testid="event-settings-panel">
      <div><h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Event Settings</h2><p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Manage details and collection timing for this event.</p></div>
      {error && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {saved && !error && <p role="status" className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">Event settings saved.</p>}
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <label className="md:col-span-2"><span className="mb-2 block text-sm font-semibold text-zinc-700 dark:text-zinc-300">Event name</span><input value={name} onChange={(value) => setName(value.target.value)} className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" /></label>
        <label className="md:col-span-2"><span className="mb-2 block text-sm font-semibold text-zinc-700 dark:text-zinc-300">Description</span><textarea value={description} onChange={(value) => setDescription(value.target.value)} rows={3} className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" /></label>
        <label className="md:col-span-2"><span className="mb-2 block text-sm font-semibold text-zinc-700 dark:text-zinc-300">Venue</span><input value={venue} onChange={(value) => setVenue(value.target.value)} placeholder="e.g. Henry B. González Convention Center" className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" /></label>
        <div><label htmlFor="event-settings-start-date" className="mb-2 block text-sm font-semibold text-zinc-700 dark:text-zinc-300">Start date</label><EventDatePicker id="event-settings-start-date" aria-label="Start date" value={startDate} onChange={setStartDate} /></div>
        <div><label htmlFor="event-settings-end-date" className="mb-2 block text-sm font-semibold text-zinc-700 dark:text-zinc-300">End date</label><EventDatePicker id="event-settings-end-date" aria-label="End date" value={endDate} min={startDate || undefined} onChange={setEndDate} /></div>
        <div className="md:col-span-2 rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 dark:border-indigo-900 dark:bg-indigo-950/20"><p className="text-sm font-semibold text-slate-950 dark:text-white">Event-wide listening window</p><p className="mt-1 text-xs text-slate-600">Event-wide surveys can open automatically during this window. Leave it blank to use five days before the event starts through five days after it ends.</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><div><label className="mb-2 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">Opens</label><EventDatePicker aria-label="Listening window opens date" value={listeningOpenDate} onChange={setListeningOpenDate} /><input aria-label="Listening window opens time" className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 shadow-sm" value={listeningOpenTime} onChange={(value) => setListeningOpenTime(value.target.value)} placeholder="HH:MM" inputMode="numeric" /></div><div><label className="mb-2 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">Closes</label><EventDatePicker aria-label="Listening window closes date" value={listeningCloseDate} onChange={setListeningCloseDate} /><input aria-label="Listening window closes time" className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 shadow-sm" value={listeningCloseTime} onChange={(value) => setListeningCloseTime(value.target.value)} placeholder="HH:MM" inputMode="numeric" /></div></div></div>
      </div>
      <div className="mt-5 flex justify-end"><Button type="button" onClick={() => void save()} disabled={saving}>{saving ? 'Saving...' : 'Save Settings'}</Button></div>
      <section className="mt-8 border-t border-red-200 pt-6 dark:border-red-900/60"><h3 className="text-sm font-bold text-red-700 dark:text-red-300">Danger Zone</h3><div className="mt-3 flex flex-col gap-4 rounded-xl border border-red-200 bg-red-50/50 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-red-900/60 dark:bg-red-950/20"><div><p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Delete event</p><p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Permanently delete this event and its associated surveys, responses, intelligence, actions, and event data.</p></div><Button type="button" variant="danger" onClick={() => { setDeleteError(null); setDeleteConfirmation(''); setDeleteOpen(true) }}>Delete event</Button></div></section>
    </Card>
    <Modal isOpen={deleteOpen} onClose={() => { if (!deleting) setDeleteOpen(false) }} title="Delete event permanently?"><div className="space-y-4"><p className="text-sm text-zinc-700 dark:text-zinc-300">Deleting <strong>{event.name}</strong> is permanent. Its associated surveys, responses, intelligence, actions, agenda data, and legacy records will be removed.</p><label className="block text-sm font-semibold text-zinc-800 dark:text-zinc-200">Type <span className="font-bold">{event.name}</span> to confirm<input aria-label="Confirm event name" value={deleteConfirmation} onChange={(value) => setDeleteConfirmation(value.target.value)} disabled={deleting} className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" /></label>{deleteError && <p role="alert" className="text-sm font-medium text-red-700">{deleteError}</p>}<div className="flex justify-end gap-3"><Button type="button" variant="secondary" onClick={() => setDeleteOpen(false)} disabled={deleting}>Cancel</Button><Button type="button" variant="danger" onClick={() => void deleteEvent()} disabled={deleting || deleteConfirmation !== event.name}>{deleting ? 'Deleting event…' : 'Delete event'}</Button></div></div></Modal>
  </>
}
