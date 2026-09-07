'use client'

import { useState } from 'react'
import { ArrowRight, ClipboardCheck, Handshake, MessageSquareText, Sparkles, Users } from 'lucide-react'
import { EventCard } from '@/components/app/events'
import { SIMPLE_EVENT_SURVEY_TEMPLATES, type SimpleEventSurveyTemplate } from '@/lib/simple-event-survey-templates'

const SIMPLE_TEMPLATE_ICON = {
  'event-feedback': { Icon: MessageSquareText, tone: 'bg-emerald-50 text-emerald-700' },
  'attendee-experience': { Icon: Users, tone: 'bg-violet-50 text-violet-700' },
  'sponsor-exhibitor-feedback': { Icon: Handshake, tone: 'bg-amber-50 text-amber-700' },
  'post-event-wrap-up': { Icon: ClipboardCheck, tone: 'bg-sky-50 text-sky-700' },
} as const

export function SimpleEventSurveyStartingPoint({
  eventId,
  accountSlug,
  onStartFromScratch,
  onTemplateCreated,
}: {
  eventId: string
  accountSlug: string
  onStartFromScratch: () => void
  onTemplateCreated: (surveyId: string) => void
}) {
  const [creatingTemplateId, setCreatingTemplateId] = useState<string | null>(null)
  const [collectionPhase, setCollectionPhase] = useState<'PRE' | 'DURING' | 'POST' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const chooseTemplate = async (template: SimpleEventSurveyTemplate) => {
    if (creatingTemplateId) return
    if (!collectionPhase) {
      setError('Choose when this survey will be collected.')
      return
    }
    setCreatingTemplateId(template.id)
    setError(null)
    try {
      const response = await fetch(`/api/app/events/${encodeURIComponent(eventId)}/advanced-survey-builder?account=${encodeURIComponent(accountSlug)}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creationRequestId: crypto.randomUUID(),
          name: template.label,
          description: null,
          collectionPhase,
          questions: template.questions,
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok || !body?.success || !body.data?.survey?.id) throw new Error(body?.error || 'The survey template could not be created')
      onTemplateCreated(body.data.survey.id)
    } catch (currentError) {
      setError(currentError instanceof Error ? currentError.message : 'The survey template could not be created')
    } finally {
      setCreatingTemplateId(null)
    }
  }

  return (
    <main className="event-workspace-type mx-auto w-full max-w-[812px] px-4 pb-16 sm:px-6 sm:pb-20" data-testid="simple-event-survey-starting-point">
      <div className="mb-8">
        <h1 className="text-[32px] font-bold leading-[1.2] tracking-[-0.025em] text-slate-950 sm:text-[38px] dark:text-white">Choose a survey starting point</h1>
        <p className="mt-2 text-[17px] font-medium leading-6 text-slate-600 sm:text-[19px] sm:leading-7 dark:text-zinc-400">Every Simple Event survey covers the whole event automatically — nothing to assign.</p>
      </div>
      {error && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      <fieldset className="mb-5 rounded-2xl border border-slate-200 bg-white p-4">
        <legend className="px-1 text-sm font-bold text-slate-900">When will responses be collected?</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {([['PRE', 'Before event'], ['DURING', 'During event'], ['POST', 'After event']] as const).map(([value, label]) => <label key={value} className={`cursor-pointer rounded-xl border px-3 py-2 text-sm font-semibold ${collectionPhase === value ? 'border-blue-600 bg-blue-50 text-blue-800' : 'border-slate-200 text-slate-700'}`}><input className="sr-only" type="radio" name="template-collection-phase" checked={collectionPhase === value} onChange={() => { setCollectionPhase(value); setError(null) }} />{label}</label>)}
        </div>
      </fieldset>
      <div className="space-y-3">
        <EventCard padding="none" className="rounded-[16px] px-4 py-3 sm:px-5 sm:py-4">
          <div className="flex items-center gap-3 sm:gap-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700"><Sparkles data-testid="simple-survey-scratch-sparkle" aria-hidden="true" className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1"><h2 className="text-[16px] font-semibold leading-5 tracking-[-0.01em] text-slate-950 sm:text-[18px] sm:leading-6 dark:text-white">Start from scratch</h2><p className="mt-1 text-[13px] font-medium leading-5 text-slate-600 sm:text-[14px] lg:text-[15px] dark:text-zinc-400">Build an event-wide survey with your own questions or AI assistance.</p></div>
            <button type="button" aria-label="Start building" onClick={onStartFromScratch} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600 sm:h-9 sm:w-9 dark:hover:bg-zinc-800"><span className="sr-only">Start building</span><ArrowRight className="h-5 w-5" aria-hidden="true" /></button>
          </div>
        </EventCard>
        {SIMPLE_EVENT_SURVEY_TEMPLATES.map((template) => {
          const { Icon, tone } = SIMPLE_TEMPLATE_ICON[template.id]
          return <EventCard key={template.id} padding="none" className="rounded-[16px] px-4 py-3 sm:px-5 sm:py-4">
            <div className="flex items-center gap-3 sm:gap-4">
              <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${tone}`}><Icon className="h-5 w-5" aria-hidden="true" /></span>
              <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="text-[16px] font-semibold leading-5 tracking-[-0.01em] text-slate-950 sm:text-[18px] sm:leading-6 dark:text-white">{template.label}</h2>{template.recommended && <span className="event-type-pill rounded-full bg-blue-100 px-2 py-0.5 text-blue-800">Recommended</span>}<span className="basis-full text-[12px] font-medium leading-4 text-slate-500 sm:basis-auto sm:text-[14px] sm:leading-5">· {template.questions.length} ready-to-edit questions</span></div><p className="mt-1 text-[13px] font-medium leading-5 text-slate-600 sm:text-[14px] lg:text-[15px] dark:text-zinc-400">{template.description}</p></div>
              <button type="button" aria-label={creatingTemplateId === template.id ? 'Creating…' : 'Use this starting point'} disabled={Boolean(creatingTemplateId)} onClick={() => { void chooseTemplate(template) }} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-50 sm:h-9 sm:w-9 dark:hover:bg-zinc-800"><span className="sr-only">{creatingTemplateId === template.id ? 'Creating…' : 'Use this starting point'}</span><ArrowRight className="h-5 w-5" aria-hidden="true" /></button>
            </div>
          </EventCard>
        })}
      </div>
    </main>
  )
}
