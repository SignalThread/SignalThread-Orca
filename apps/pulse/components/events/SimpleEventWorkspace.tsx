'use client'

import { BarChart3, ExternalLink, FileText, Plus, Send } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { EventCard, EventEmptyState, EventStatusPill } from '@/components/app/events'
import { EventEntityCard, EventEntityListShell } from '@/components/events/EventEntityCard'

export type SimpleEventWorkspaceSurvey = {
  id: string
  name: string
  status: string
  responseCount: number
  questions: Array<{ id: string }>
}

export function SimpleEventWorkspace({
  eventId,
  accountSlug,
  surveys,
}: {
  eventId: string
  accountSlug: string
  surveys: SimpleEventWorkspaceSurvey[]
}) {
  const router = useRouter()
  const baseQuery = new URLSearchParams({ account: accountSlug })
  const newSurveyPath = `/app/events/${encodeURIComponent(eventId)}/surveys/new?${baseQuery.toString()}`
  const surveyPath = (surveyId: string) => `/app/events/${encodeURIComponent(eventId)}/surveys/new?${new URLSearchParams({ account: accountSlug, survey: surveyId }).toString()}`
  const deployPath = (surveyId?: string) => `/app/events/${encodeURIComponent(eventId)}?${new URLSearchParams({ account: accountSlug, tab: 'deploy', ...(surveyId ? { deploySurvey: surveyId } : {}) }).toString()}`
  const signalsPath = `/app/events/${encodeURIComponent(eventId)}/dashboard?${baseQuery.toString()}`

  return (
    <main className="event-workspace-type mx-auto max-w-5xl space-y-6 pb-20" data-testid="simple-event-workspace">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="event-type-kicker text-blue-700">Simple Event</p><h1 className="event-type-page-title mt-2 text-slate-950 dark:text-white">Your surveys</h1><p className="event-type-summary mt-2 text-slate-600 dark:text-zinc-400">This survey covers the whole event — nothing to assign.</p></div>
        <Button onClick={() => { router.push(newSurveyPath) }}><Plus className="h-4 w-4" />Add Survey</Button>
      </header>

      {surveys.length === 0 ? <EventCard padding="lg"><EventEmptyState title="Create your first survey" description="Choose a starting point, then tailor the questions for your event." actions={[{ label: 'Add Survey', onClick: () => { router.push(newSurveyPath) } }]} /></EventCard> : <EventEntityListShell className="space-y-3">
        {surveys.map((survey) => <EventEntityCard key={survey.id} className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="event-type-section-title text-slate-950 dark:text-white">{survey.name}</h2><EventStatusPill status={survey.status as any} /></div><p className="event-type-summary mt-2 text-slate-600 dark:text-zinc-400">Whole event · {survey.questions.length} question{survey.questions.length === 1 ? '' : 's'} · {survey.responseCount} response{survey.responseCount === 1 ? '' : 's'}</p><p className="event-type-meta mt-2 text-slate-500">This survey covers the whole event — nothing to assign.</p></div>
          <div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={() => { router.push(surveyPath(survey.id)) }}><FileText className="h-4 w-4" />Edit</Button><Button size="sm" variant="secondary" onClick={() => { router.push(signalsPath) }}><BarChart3 className="h-4 w-4" />Signals</Button><Button size="sm" variant="secondary" onClick={() => { router.push(deployPath(survey.id)) }}><Send className="h-4 w-4" />Deploy</Button></div>
        </EventEntityCard>)}
      </EventEntityListShell>}
      {surveys.length > 0 && <EventCard padding="md" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="event-type-section-title text-slate-950 dark:text-white">Ready to share?</h2><p className="event-type-summary mt-1 text-slate-600 dark:text-zinc-400">Use Deploy to publish, schedule, and share event-wide links and QR codes.</p></div><Button variant="secondary" onClick={() => { router.push(deployPath()) }}>Open Deploy <ExternalLink className="h-4 w-4" /></Button></EventCard>}
    </main>
  )
}
