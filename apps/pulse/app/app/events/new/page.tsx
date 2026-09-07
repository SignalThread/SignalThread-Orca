'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { Button } from '@/components/ui/Button'
import { EventCard, EventDatePicker } from '@/components/app/events'
import { isEventsAccount } from '@/lib/account-product-mode'
import type { EventCreationType } from '@/lib/event-creation-type'
import { appendInitialEventArea, createEventWithInitialSetup } from '@/lib/create-event-initial-setup'
import { PreCreationAgendaWorkspace } from '@/components/events/PreCreationAgendaWorkspace'
import type { PreCreationAgendaDraft, ReviewedInitialAgenda } from '@/lib/pre-creation-agenda-types'

interface AccountLocation {
  id: string
  name: string
  city?: string | null
  state?: string | null
}

interface AccountData {
  account: {
    accountType: string
    tier: string
  }
  locations: AccountLocation[]
}

// These are intentionally the only choices for newly-created events. TEMPLATE
// remains a supported persisted event type for existing events, but is not a
// creation path while the guided-template experience is being refined.
const NEW_EVENT_SETUP_TYPES = [
  {
    value: 'BLANK',
    label: 'Simple Event',
    description: 'Create event-wide surveys without agenda or assignments.',
  },
  {
    value: 'ADVANCED',
    label: 'Advanced Event',
    description: 'Set up your agenda and event structure now.',
  },
] as const satisfies ReadonlyArray<{ value: EventCreationType; label: string; description: string }>

function NewEventContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const accountSlug = searchParams.get('account')

  const [data, setData] = useState<AccountData | null>(null)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [eventName, setEventName] = useState('')
  const [description, setDescription] = useState('')
  const [locationId, setLocationId] = useState('')
  const [venue, setVenue] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [selectedSetupType, setSelectedSetupType] = useState<EventCreationType>('BLANK')
  const [agendaFile, setAgendaFile] = useState<File | null>(null)
  const [eventAreaInput, setEventAreaInput] = useState('')
  const [eventAreas, setEventAreas] = useState<string[]>([])
  const [eventAreaError, setEventAreaError] = useState<string | null>(null)
  const [createdEventId, setCreatedEventId] = useState<string | null>(null)
  const [postCreateIssue, setPostCreateIssue] = useState<'EVENT_AREAS' | 'AGENDA' | null>(null)
  const [workflowStep, setWorkflowStep] = useState<'setup' | 'mapping' | 'review'>('setup')
  const [agendaDraft, setAgendaDraft] = useState<PreCreationAgendaDraft | null>(null)
  const [timezone, setTimezone] = useState('UTC')
  const agendaInputRef = useRef<HTMLInputElement>(null)
  const submitInFlightRef = useRef(false)
  const createdEventIdRef = useRef<string | null>(null)
  const pendingAreaNamesRef = useRef<string[]>([])
  const creationRequestIdRef = useRef('')

  // These workflow steps share one client page and use the History API rather
  // than a route change. Own scroll restoration so a review never inherits the
  // scroll position from the mapping step.
  const resetWorkflowScroll = () => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }

  useEffect(() => {
    setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC')
    const previousScrollRestoration = window.history.scrollRestoration
    window.history.scrollRestoration = 'manual'
    const onPopState = () => {
      const step = new URL(window.location.href).searchParams.get('createStep')
      setWorkflowStep(agendaDraft && (step === 'mapping' || step === 'review') ? step : 'setup')
      resetWorkflowScroll()
    }
    window.addEventListener('popstate', onPopState)
    return () => {
      window.history.scrollRestoration = previousScrollRestoration
      window.removeEventListener('popstate', onPopState)
    }
  }, [agendaDraft])

  useEffect(() => {
    async function loadAccount() {
      if (!accountSlug) {
        setError('Account parameter required')
        setLoading(false)
        return
      }

      try {
        const response = await fetch(`/api/app/account?account=${accountSlug}`)
        const body = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(body?.error || 'Failed to load account')
        }
        setData(body)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load account')
      } finally {
        setLoading(false)
      }
    }

    loadAccount()
  }, [accountSlug])

  const primaryLocation = data?.locations[0]

  useEffect(() => {
    if (!accountSlug || loading || !data) return

    if (!isEventsAccount(data.account.accountType)) {
      router.replace(`/app?account=${accountSlug}`)
    }
  }, [accountSlug, data, loading, router])

  useEffect(() => {
    if (!locationId && primaryLocation?.id) {
      setLocationId(primaryLocation.id)
    }
  }, [locationId, primaryLocation?.id])

  const canSubmit = Boolean(eventName.trim()) && Boolean(locationId) && !creating
  const isAdvancedSetup = selectedSetupType === 'ADVANCED'

  const addEventArea = () => {
    const result = appendInitialEventArea(eventAreas, eventAreaInput)
    if (!result.added) {
      setEventAreaError(result.reason === 'DUPLICATE' ? 'That Event Area has already been added.' : null)
      return
    }
    setEventAreas(result.areas)
    setEventAreaInput('')
    setEventAreaError(null)
  }

  const removeEventArea = (name: string) => {
    setEventAreas((current) => current.filter((area) => area !== name))
    setEventAreaError(null)
  }

  const navigateWorkflow = (step: 'setup' | 'mapping' | 'review', replace = false) => {
    setWorkflowStep(step)
    const url = new URL(window.location.href)
    if (step === 'setup') url.searchParams.delete('createStep')
    else url.searchParams.set('createStep', step)
    window.history[replace ? 'replaceState' : 'pushState']({ ...window.history.state, createEventStep: step }, '', url)
    resetWorkflowScroll()
  }

  const selectSetupType = (setupType: typeof NEW_EVENT_SETUP_TYPES[number]['value']) => {
    setSelectedSetupType(setupType)
    if (setupType === 'BLANK') {
      // Basic events must not retain hidden Advanced setup state after a user
      // changes their mind before submitting.
      setAgendaFile(null)
      setAgendaDraft(null)
      setEventAreas([])
      setEventAreaInput('')
      setEventAreaError(null)
      if (agendaInputRef.current) agendaInputRef.current.value = ''
      navigateWorkflow('setup', true)
    }
  }

  const interpretAgenda = async (useCurrentMapping: boolean) => {
    if (!accountSlug || !agendaFile) return
    setCreating(true)
    setError(null)
    try {
      const requestBody = useCurrentMapping && agendaDraft
        ? JSON.stringify({
            sourceFileName: agendaDraft.sourceFileName,
            inspection: agendaDraft.inspection,
            worksheetName: agendaDraft.worksheetName,
            mapping: agendaDraft.mapping,
            timezone,
            eventStartDate: startDate || null,
            eventEndDate: endDate || null,
          })
        : (() => {
            const form = new FormData()
            form.set('file', agendaFile)
            form.set('timezone', timezone)
            if (startDate) form.set('eventStartDate', startDate)
            if (endDate) form.set('eventEndDate', endDate)
            return form
          })()
      const response = await fetch(`/api/app/events/agenda-preview?account=${encodeURIComponent(accountSlug)}`, {
        method: 'POST', credentials: 'include',
        ...(typeof requestBody === 'string' ? { headers: { 'Content-Type': 'application/json' } } : {}),
        body: requestBody,
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok || !body.data) throw new Error(body.error || 'Agenda interpretation failed')
      setAgendaDraft(body.data)
      navigateWorkflow(useCurrentMapping ? 'review' : 'mapping')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Agenda interpretation failed')
    } finally {
      setCreating(false)
    }
  }

  const createReviewedEvent = async (agenda: ReviewedInitialAgenda) => {
    if (!isAdvancedSetup || !accountSlug || creating || submitInFlightRef.current) return
    submitInFlightRef.current = true
    setCreating(true)
    setError(null)
    if (!creationRequestIdRef.current) creationRequestIdRef.current = crypto.randomUUID()
    try {
      const response = await fetch(`/api/app/events?account=${encodeURIComponent(accountSlug)}`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: eventName, description, locationId, setupType: selectedSetupType,
          venue: venue.trim() || undefined, startDate: startDate || undefined, endDate: endDate || undefined,
          initialSetup: { requestId: creationRequestIdRef.current, eventAreaNames: eventAreas, agenda },
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok || !body.event?.id) throw new Error(body.error || 'Failed to create event')
      router.replace(`/app/events/${body.event.id}?account=${encodeURIComponent(accountSlug)}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create event')
    } finally {
      submitInFlightRef.current = false
      setCreating(false)
    }
  }

  const createEvent = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!accountSlug || creating || submitInFlightRef.current) return

    if (!locationId) {
      setError('This account is not ready to create an event. Contact your administrator.')
      return
    }

    if (!eventName.trim()) {
      setError('Event name is required')
      return
    }

    if (isAdvancedSetup && agendaFile) {
      await interpretAgenda(false)
      return
    }

    submitInFlightRef.current = true
    setCreating(true)
    setError(null)

    try {
      const areasToPersist = isAdvancedSetup
        ? (createdEventIdRef.current ? pendingAreaNamesRef.current : eventAreas)
        : []
      const result = await createEventWithInitialSetup({
        accountSlug,
        existingEventId: createdEventIdRef.current,
        eventAreaNames: areasToPersist,
        eventPayload: {
          name: eventName,
          description,
          locationId,
          setupType: selectedSetupType,
          venue: venue.trim() || undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        },
      })
      createdEventIdRef.current = result.eventId
      setCreatedEventId(result.eventId)
      pendingAreaNamesRef.current = result.failedAreaNames

      if (result.failedStage) {
        setPostCreateIssue(result.failedStage)
        setError(`Your event was created, but ${result.failedStage === 'AGENDA' ? 'the agenda could not be uploaded' : 'some Event Areas could not be added'}. ${result.error || 'Try again or open the event to continue.'}`)
        return
      }

      const query = new URLSearchParams({ account: accountSlug })
      if (selectedSetupType === 'BLANK') {
        query.set('simpleStart', '1')
        query.set('simpleCreation', '1')
        router.replace(`/app/events/${result.eventId}/surveys/new?${query.toString()}`)
      } else {
        router.replace(`/app/events/${result.eventId}?${query.toString()}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create event')
    } finally { submitInFlightRef.current = false; setCreating(false) }
  }

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex min-h-[50vh] items-center justify-center">
          <div className="text-center">
            <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
            <p className="text-zinc-500 dark:text-zinc-400">Loading event setup...</p>
          </div>
        </div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout>
      <div className="mx-auto mb-5 max-w-5xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-500">Voice for Events</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-zinc-50 sm:text-3xl">Create a new event</h1>
      </div>

      {workflowStep !== 'setup' && agendaDraft ? <PreCreationAgendaWorkspace
        draft={agendaDraft}
        stage={workflowStep}
        busy={creating}
        error={error}
        onDraftChange={setAgendaDraft}
        onBackToSetup={() => navigateWorkflow('setup')}
        onReviewAgenda={() => void interpretAgenda(true)}
        onChangeMapping={() => navigateWorkflow('mapping')}
        onDiscard={() => {
          setAgendaFile(null)
          setAgendaDraft(null)
          setError(null)
          if (agendaInputRef.current) agendaInputRef.current.value = ''
          navigateWorkflow('setup', true)
        }}
        onCreate={(agenda) => void createReviewedEvent(agenda)}
      /> : <div className="mx-auto max-w-5xl pb-8">
        <EventCard padding="md" className="sm:p-6 lg:p-7">
          {!isEventsAccount(data?.account.accountType) ? (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
                Event creation is unavailable
              </h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Event container creation is only available for Events accounts.
              </p>
              <Button
                variant="secondary"
                onClick={() => router.push(accountSlug ? `/app?account=${accountSlug}` : '/app')}
              >
                Back to Dashboard
              </Button>
            </div>
          ) : (
            <form onSubmit={createEvent} className="space-y-6">
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
                  <div className="flex flex-wrap items-center justify-between gap-3"><p>{error}</p>{createdEventId && <Button type="button" size="sm" variant="secondary" onClick={() => router.push(`/app/events/${createdEventId}?account=${encodeURIComponent(accountSlug ?? '')}&tab=operations${postCreateIssue === 'EVENT_AREAS' ? '&operationsSection=event-areas' : ''}`)}>Open created event</Button>}</div>
                </div>
              )}

              <section className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-[11px] font-bold text-white dark:bg-indigo-600">
                    1
                  </span>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-zinc-100">Name your event</h2>
                </div>

                <div className="grid grid-cols-1 gap-x-4 gap-y-4 lg:grid-cols-12">
                  <div className="lg:col-span-12">
                    <label className="mb-1.5 block text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                      Event name <span className="text-red-500">*</span>
                    </label>
                    <input
                      value={eventName}
                      onChange={(event) => setEventName(event.target.value)}
                      placeholder="e.g. WEC San Antonio 2026"
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                    />
                  </div>

                  <div className="lg:col-span-7">
                    <label className="mb-1.5 block text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                      Venue <span className="font-normal text-zinc-400">(optional)</span>
                    </label>
                    <input
                      value={venue}
                      onChange={(event) => setVenue(event.target.value)}
                      placeholder="e.g. Henry B. González Convention Center"
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:col-span-5">
                    <div>
                      <label htmlFor="create-event-start-date" className="mb-1.5 block text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                        Start date <span className="font-normal text-zinc-400">(optional)</span>
                      </label>
                      <EventDatePicker
                        id="create-event-start-date"
                        aria-label="Start date"
                        value={startDate}
                        onChange={setStartDate}
                      />
                    </div>
                    <div>
                      <label htmlFor="create-event-end-date" className="mb-1.5 block text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                        End date <span className="font-normal text-zinc-400">(optional)</span>
                      </label>
                      <EventDatePicker
                        id="create-event-end-date"
                        aria-label="End date"
                        value={endDate}
                        min={startDate || undefined}
                        onChange={setEndDate}
                      />
                    </div>
                  </div>

                  <div className="lg:col-span-12">
                    <label className="mb-1.5 block text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                      Description <span className="font-normal text-zinc-400">(optional)</span>
                    </label>
                    <textarea
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      rows={3}
                      placeholder="Optional context for this event"
                      className="w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                    />
                  </div>

                </div>
              </section>

              {/* Customer-facing event setup type */}
              <section className="space-y-3">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-[11px] font-bold text-white dark:bg-indigo-600">
                    2
                  </span>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-zinc-100">Choose how you want to start your event</h2>
                    <p className="mt-0.5 max-w-3xl text-sm leading-5 text-zinc-500 dark:text-zinc-400">
                      Select a setup type now. You can continue configuring the event after it&apos;s created.
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {NEW_EVENT_SETUP_TYPES.map((setupType) => {
                    const isSelected = setupType.value === selectedSetupType
                    const isAdvanced = setupType.value === 'ADVANCED'
                    return (
                      <button
                        type="button"
                        key={setupType.value}
                        onClick={() => selectSetupType(setupType.value)}
                        aria-pressed={isSelected}
                        className={`flex min-h-[136px] flex-col rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40 ${
                          isSelected
                            ? 'border-indigo-400 bg-indigo-50/50 ring-1 ring-indigo-300 dark:border-indigo-400 dark:bg-indigo-950/30 dark:ring-indigo-500/70'
                            : isAdvanced
                              ? 'border-slate-200 bg-slate-50/70 hover:border-slate-300 hover:bg-slate-50 dark:border-zinc-800 dark:bg-zinc-900/70 dark:hover:border-zinc-700 dark:hover:bg-zinc-800/60'
                              : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700 dark:hover:bg-zinc-800/60'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <span
                            className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold ${setupType.value === 'ADVANCED' ? 'bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-300' : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300'}`}
                            aria-hidden
                          >
                            {setupType.value === 'ADVANCED' ? 'A' : 'B'}
                          </span>
                          {isSelected && (
                            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-white">
                              <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden>
                                <path fillRule="evenodd" d="M16.704 5.29a1 1 0 010 1.42l-7.5 7.5a1 1 0 01-1.42 0l-3.5-3.5a1 1 0 111.42-1.42l2.79 2.79 6.79-6.79a1 1 0 011.42 0z" clipRule="evenodd" />
                              </svg>
                            </span>
                          )}
                        </div>
                        <span className="mt-3 block text-base font-semibold leading-tight text-slate-900 dark:text-zinc-100">
                          {setupType.label}
                        </span>
                        <p className="mt-1 text-sm leading-5 text-slate-500 dark:text-zinc-400">{setupType.description}</p>
                      </button>
                    )
                  })}
                </div>

              </section>

              {isAdvancedSetup && <section className="space-y-3">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-[11px] font-bold text-white dark:bg-indigo-600">3</span>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-zinc-100">Initial event setup</h2>
                    <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">Add event structure now or continue after creation.</p>
                  </div>
                </div>

                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                    <h3 className="font-semibold text-slate-900 dark:text-zinc-100">Agenda</h3>
                    <p className="mt-1 text-sm text-slate-500 dark:text-zinc-400">Upload your agenda now or add it later.</p>
                    <input
                      ref={agendaInputRef}
                      type="file"
                      accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      className="sr-only"
                      onChange={(event) => { setAgendaFile(event.target.files?.[0] ?? null); setAgendaDraft(null); setError(null) }}
                    />
                    {agendaFile ? (
                      <div className="mt-3 rounded-lg border border-indigo-100 bg-indigo-50/50 p-3 dark:border-indigo-900/60 dark:bg-indigo-950/20">
                        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900 dark:text-zinc-100">{agendaFile.name}</p><p className="mt-1 text-xs text-slate-500 dark:text-zinc-400">Agenda will be mapped and reviewed before event creation.</p></div><span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-indigo-600 shadow-sm dark:bg-zinc-900 dark:text-indigo-300">Attached</span></div>
                        <div className="mt-2 flex gap-2"><Button type="button" size="sm" variant="secondary" disabled={creating} onClick={() => agendaInputRef.current?.click()}>Change file</Button><Button type="button" size="sm" variant="ghost" disabled={creating} onClick={() => { setAgendaFile(null); setAgendaDraft(null); if (agendaInputRef.current) agendaInputRef.current.value = '' }}>Remove</Button></div>
                      </div>
                    ) : <Button className="mt-3" type="button" size="sm" variant="secondary" disabled={creating} onClick={() => agendaInputRef.current?.click()}>Upload agenda</Button>}
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                    <h3 className="font-semibold text-slate-900 dark:text-zinc-100">Event Areas</h3>
                    <p className="mt-1 text-sm text-slate-500 dark:text-zinc-400">Add the places where you want to collect feedback.</p>
                    <div className="mt-3 flex gap-2">
                      <input
                        value={eventAreaInput}
                        onChange={(event) => { setEventAreaInput(event.target.value); setEventAreaError(null) }}
                        onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addEventArea() } }}
                        placeholder="e.g. Registration"
                        aria-label="Event Area name"
                        maxLength={160}
                        className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                      />
                      <Button type="button" size="sm" variant="secondary" disabled={creating || !eventAreaInput.trim()} onClick={addEventArea}>Add</Button>
                    </div>
                    {eventAreaError && <p role="alert" className="mt-2 text-xs text-amber-700 dark:text-amber-300">{eventAreaError}</p>}
                    {eventAreas.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{eventAreas.map((area) => <span key={area.toLocaleLowerCase('en-US')} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">{area}<button type="button" aria-label={`Remove ${area}`} disabled={creating} className="text-slate-400 hover:text-red-600 disabled:cursor-not-allowed" onClick={() => removeEventArea(area)}>×</button></span>)}</div>}
                  </div>
                </div>
              </section>}

              <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-slate-50/80 p-3 dark:border-zinc-800 dark:bg-zinc-950/40 sm:flex-row sm:items-center sm:justify-between sm:p-4">
                <p className="max-w-2xl text-sm leading-5 text-zinc-500 dark:text-zinc-400">
                  You can rename, reschedule, add a venue, and restructure this event at any time after it&apos;s created.
                </p>
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => router.push(accountSlug ? `/app?account=${accountSlug}` : '/app')}
                  >
                    Cancel
                  </Button>
                  <button
                    type="submit"
                    disabled={!canSubmit}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 dark:bg-indigo-600 dark:hover:bg-indigo-500 dark:disabled:bg-zinc-700"
                  >
                    {isAdvancedSetup && agendaFile ? (creating ? 'Preparing review…' : 'Review mapping') : creating ? (createdEventId ? 'Finishing setup...' : 'Creating Event...') : createdEventId ? 'Retry initial setup' : 'Create Event'}
                    <span aria-hidden>→</span>
                  </button>
                </div>
              </div>
            </form>
          )}
        </EventCard>
      </div>}
    </AdminLayout>
  )
}

export default function NewEventPage() {
  return (
    <Suspense fallback={
      <AdminLayout>
        <div className="flex min-h-[50vh] items-center justify-center">
          <div className="text-center">
            <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
            <p className="text-zinc-500 dark:text-zinc-400">Loading event setup...</p>
          </div>
        </div>
      </AdminLayout>
    }>
      <NewEventContent />
    </Suspense>
  )
}
