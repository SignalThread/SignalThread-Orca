'use client'

import { CalendarDays, ExternalLink, MapPin, QrCode, Users } from 'lucide-react'
import { SurveyQrCard } from '@/components/ui/SurveyQrCard'
import { EventRowActionButton, EventRowActionOverflow } from '@/components/events/EventRowActionControl'

export interface EventSurveyTableSurvey {
  id: string
  name: string
  status: string
  isArchived: boolean
  responseCount: number
  target: { category: 'EVENT' | 'SESSION' | 'LOCATION' | 'CUSTOM' | 'SPEAKER'; name: string }
  publicLink: { kioskPath: string; isActive: boolean } | null
  availability: {
    state: 'OPEN' | 'NOT_YET_OPEN' | 'CLOSED' | 'INVALID'
    message: string
    effectiveOpensAt: string | null
    effectiveClosesAt: string | null
  }
  readiness: { responseEligible: boolean; issues: string[] }
}

const SURVEY_TABLE_GRID = 'lg:grid-cols-[minmax(0,30fr)_minmax(0,24fr)_minmax(0,26fr)_minmax(12rem,20fr)]'
const ACTION_RAIL_CLASS = 'grid shrink-0 grid-cols-[10rem_2rem] items-center justify-end gap-2'

export function EventSurveyTable({ surveys, surveyEditPath, onManageSurvey }: { surveys: EventSurveyTableSurvey[]; surveyEditPath: (surveyId: string) => string; onManageSurvey: (surveyId: string) => void }) {
  return <div data-testid="event-survey-table" className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/60">
    <div className={`hidden items-center gap-4 border-b border-slate-200 px-5 py-3 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:border-zinc-800 lg:grid ${SURVEY_TABLE_GRID}`}>
      <span>Survey</span><span>Target</span><span>Status &amp; window</span><span className="text-right">Actions</span>
    </div>
    <div>
      {surveys.map((survey) => <EventSurveyTableRow key={survey.id} survey={survey} editPath={surveyEditPath(survey.id)} onManage={() => onManageSurvey(survey.id)} />)}
    </div>
  </div>
}

function EventSurveyTableRow({ survey, editPath, onManage }: { survey: EventSurveyTableSurvey; editPath: string; onManage: () => void }) {
  const launchable = survey.readiness.responseEligible && Boolean(survey.publicLink?.isActive)
  const status = getSurveyTableStatus(survey)
  const targetType = targetTypeLabel(survey.target.category)
  return <article data-testid="event-survey-table-row" className={`grid min-h-[78px] gap-3 border-t border-slate-200 px-5 py-3 transition-colors hover:bg-slate-50/70 first:border-t-0 dark:border-zinc-800 dark:hover:bg-zinc-800/40 ${SURVEY_TABLE_GRID} lg:items-center lg:gap-4`}>
    <div className="flex min-w-0 items-center gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-300"><QrCode className="h-5 w-5" aria-hidden /></span>
      <div className="min-w-0"><h3 className="truncate text-sm font-semibold"><a href={editPath} className="text-slate-950 hover:text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:text-zinc-100 dark:hover:text-blue-300">{survey.name}</a></h3><span className="mt-1 inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-zinc-800 dark:text-zinc-300">{targetIcon(survey.target.category)}{targetType}</span></div>
    </div>
    <div className="min-w-0 pl-[52px] lg:pl-0"><p className="truncate text-sm font-medium text-slate-900 dark:text-zinc-100">{survey.target.name}</p><p className="mt-1 text-xs text-slate-500 dark:text-zinc-400">{targetType} target</p></div>
    <div className="pl-[52px] lg:pl-0"><div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${status.dotClass}`} /><span className={`rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${status.pillClass}`}>{status.label}</span></div><p className="mt-1 text-xs text-slate-500 dark:text-zinc-400">{status.detail}</p></div>
    <div className="pt-1 lg:justify-self-end lg:pt-0"><div data-testid="event-survey-action-rail" className={ACTION_RAIL_CLASS}>
      {launchable && survey.publicLink ? <SurveyQrCard surveyName={survey.name} path={survey.publicLink.kioskPath} fileName={`${safeFilePart(survey.name)}.png`} renderTrigger={({ open, copyLink, downloadPng, copied, disabled }) => <><EventRowActionButton href={survey.publicLink!.kioskPath} external variant="primary" className="w-40 min-w-40 gap-1.5"><ExternalLink className="h-3.5 w-3.5" aria-hidden />Open kiosk</EventRowActionButton><EventRowActionOverflow label="More survey actions"><EventRowActionButton href={editPath} className="w-full justify-start">Edit survey</EventRowActionButton><EventRowActionButton onClick={open} disabled={disabled} className="w-full justify-start">View QR</EventRowActionButton><EventRowActionButton onClick={() => void copyLink()} disabled={disabled} className="w-full justify-start">{copied ? 'Copied' : 'Copy link'}</EventRowActionButton><EventRowActionButton onClick={() => void downloadPng()} disabled={disabled} className="w-full justify-start">Download PNG</EventRowActionButton></EventRowActionOverflow></>} /> : <><EventRowActionButton variant="primary" onClick={onManage} className="w-40 min-w-40">Manage</EventRowActionButton><EventRowActionOverflow label="More survey actions"><EventRowActionButton href={editPath} className="w-full justify-start">Edit survey</EventRowActionButton></EventRowActionOverflow></>}
    </div></div>
  </article>
}

function getSurveyTableStatus(survey: EventSurveyTableSurvey) {
  if (survey.isArchived) return statusPresentation('Archived', 'Archived', 'bg-slate-400', 'bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-300')
  if (survey.status === 'COMPLETED') return statusPresentation('Complete', 'Collection complete', 'bg-slate-400', 'bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-300')
  if (survey.availability.state === 'NOT_YET_OPEN') return statusPresentation('Scheduled', formatDate(survey.availability.effectiveOpensAt) ?? survey.availability.message, 'bg-amber-500', 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300')
  if (survey.readiness.responseEligible && survey.publicLink?.isActive) return statusPresentation('Open', survey.availability.effectiveOpensAt || survey.availability.effectiveClosesAt ? survey.availability.message : 'Always open', 'bg-emerald-500', 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300')
  if (survey.status === 'DRAFT') return statusPresentation('Draft', 'Not published', 'bg-slate-400', 'bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-300')
  return statusPresentation('Closed', survey.availability.message, 'bg-slate-400', 'bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-300')
}

function statusPresentation(label: string, detail: string, dotClass: string, pillClass: string) { return { label, detail, dotClass, pillClass } }

function targetTypeLabel(category: EventSurveyTableSurvey['target']['category']) {
  return category === 'EVENT' ? 'Event' : category === 'SESSION' ? 'Session' : category === 'LOCATION' ? 'Location' : category === 'SPEAKER' ? 'Speaker' : 'Custom'
}

function targetIcon(category: EventSurveyTableSurvey['target']['category']) {
  const className = 'h-3 w-3'
  if (category === 'LOCATION') return <MapPin className={className} aria-hidden />
  if (category === 'SESSION' || category === 'SPEAKER') return <Users className={className} aria-hidden />
  return <CalendarDays className={className} aria-hidden />
}

function formatDate(value: string | null) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function safeFilePart(value: string) { return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'survey' }
