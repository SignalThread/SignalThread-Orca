'use client'

import { useEffect } from 'react'
import type { EventClosingBrief } from '@/lib/event-closing-brief'
import { EventBriefPdfDownloadButton } from './EventBriefPdfDownloadButton'
import { evidenceTierLabel } from '@/lib/event-intelligence/evidence-model'

function dateLabel(value: string) {
  return new Date(value).toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' })
}

function compactDateRange(startDate: string | null, endDate: string | null) {
  if (!startDate) return null
  if (!endDate || startDate.slice(0, 10) === endDate.slice(0, 10)) return dateLabel(startDate)
  return `${dateLabel(startDate)} – ${dateLabel(endDate)}`
}

function briefLanguage(phase: EventClosingBrief['lifecyclePhase']) {
  if (phase === 'PRE_EVENT') return {
    badge: 'Pre-event brief', story: 'What the team should prepare for', worked: 'What attendees expect', friction: 'What needs attention', next: 'Prepare now', priorities: 'Priorities before doors open', pattern: 'Program and event-area signals', empty: 'No recurring pre-event pattern is established yet.',
  }
  if (phase === 'IN_EVENT') return {
    badge: 'During-event brief', story: 'The live read', worked: 'Protect', friction: 'Fix now', next: 'Watch', priorities: 'Act while there is still time', pattern: 'Where the experience is landing', empty: 'No recurring live pattern is established yet.',
  }
  return {
    badge: 'Post-event brief', story: 'What defined the event', worked: 'What worked best', friction: 'What held it back', next: 'Carry forward', priorities: 'Repeat, change, and follow through', pattern: 'Program and experience patterns', empty: 'No recurring post-event pattern is established yet.',
  }
}

function FindingList({ title, narrative, items, tone, empty }: {
  title: string
  narrative: string
  items: Array<{ id: string; title: string; statement: string | null; meta: string }>
  tone: 'emerald' | 'rose' | 'violet'
  empty: string
}) {
  const border = { emerald: 'border-emerald-400', rose: 'border-rose-400', violet: 'border-violet-400' }[tone]
  return <section className={`rounded-xl border border-slate-200 border-t-[3px] bg-white p-5 ${border}`}>
    <h3 className="text-[15px] font-semibold text-slate-950">{title}</h3>
    {narrative && <p className="mt-2 text-[12px] leading-5 text-slate-600">{narrative}</p>}
    <div className="mt-3 space-y-3">
      {items.length > 0 ? items.slice(0, 3).map((item) => <article key={item.id}>
        <h4 className="text-[13px] font-semibold leading-5 text-slate-900">{item.title}</h4>
        {item.statement && <p className="mt-1 text-[12px] leading-5 text-slate-600">{item.statement}</p>}
        <p className="mt-1 text-[10px] font-medium text-slate-500">{item.meta}</p>
      </article>) : <p className="text-[12px] leading-5 text-slate-500">{empty}</p>}
    </div>
  </section>
}

export function EventClosingBriefDocument({ brief, eventDates, pdfHref, onRegenerate, regenerating = false }: {
  brief: EventClosingBrief
  eventDates?: { startDate: string | null; endDate: string | null }
  pdfHref: string
  onRegenerate?: () => void
  regenerating?: boolean
}) {
  const language = briefLanguage(brief.lifecyclePhase)
  useEffect(() => {
    const previousTitle = document.title
    document.title = `${brief.event.name} — ${language.badge}`
    return () => { document.title = previousTitle }
  }, [brief.event.name, language.badge])

  const narratives = new Map(brief.editorial.copy.findingNarratives.map((item) => [item.findingId, item.narrative]))
  const priorities = brief.decisions.afterEventFollowUp.map((item) => ({
    id: item.id, title: item.title, statement: null, meta: `${item.status.toLowerCase().replaceAll('_', ' ')} · ${item.owner} · ${item.priority}`,
  }))
  const intelligencePriorities = [
    ...brief.decisions.nextEventLearning.sessionLearning.map((item) => ({ id: item.id, title: item.title, statement: null, meta: `${item.source} · ${evidenceTierLabel(item.evidenceTier)}` })),
    ...brief.decisions.nextEventLearning.findings.map((item) => ({ id: item.id, title: item.title, statement: item.statement, meta: evidenceTierLabel(item.evidenceTier) })),
  ]
  const patternItems = [
    ...brief.intelligencePacket.sessionPatterns.map((item) => ({ key: `session:${item.title}`, label: item.title, detail: item.finding })),
    ...brief.intelligencePacket.speakerPatterns.map((item) => ({ key: `speaker:${item.name}`, label: item.name, detail: item.finding })),
    ...brief.intelligencePacket.eventAreaPatterns.filter((item) => item.answerCount > 0).map((item) => ({ key: `area:${item.name}`, label: item.name, detail: item.kind })),
  ].filter((item) => item.detail).slice(0, 6)
  const eventDateRange = compactDateRange(eventDates?.startDate ?? null, eventDates?.endDate ?? null)

  return <main data-testid="closing-brief-document" data-brief-lifecycle={brief.lifecyclePhase} className="font-brand min-h-screen bg-slate-100 px-4 py-7 text-slate-950 sm:px-8 print:bg-white print:px-0 print:py-0">
    <style jsx global>{`@media print { @page { size: letter; margin: 0.55in 0.62in; } body { background: white !important; } [data-brief-document-controls] { display: none !important; } [data-brief-document-section], [data-brief-document-card] { break-inside: avoid; page-break-inside: avoid; } }`}</style>
    <div className="mx-auto max-w-[900px]">
      <div data-brief-document-controls className="mb-5 flex flex-wrap justify-end gap-2"><button type="button" onClick={onRegenerate} disabled={!onRegenerate || regenerating} className="inline-flex min-h-9 items-center rounded-lg border border-slate-300 bg-white px-3.5 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">{regenerating ? 'Regenerating…' : 'Regenerate brief'}</button><EventBriefPdfDownloadButton pdfHref={pdfHref} /></div>
      <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_12px_32px_rgba(15,23,42,0.07)] print:rounded-none print:border-0 print:shadow-none">
        <header className="border-b border-slate-200 bg-slate-50 px-7 py-7 sm:px-10 print:px-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-indigo-700">SignalThread · Event Intelligence Brief</p>
          <div className="mt-5 flex flex-wrap items-end justify-between gap-4"><div><h1 className="max-w-2xl text-[30px] font-bold leading-[1.12] tracking-[-0.025em] sm:text-[34px]">{brief.event.name}</h1><p className="mt-2 text-[13px] text-slate-600">{eventDateRange || 'Event intelligence update'}{eventDateRange ? ' · ' : ''}Generated {dateLabel(brief.generatedAt)}</p></div><p className="rounded-full bg-indigo-50 px-3 py-1.5 text-[11px] font-semibold text-indigo-700">{language.badge}</p></div>
        </header>

        <div className="space-y-8 px-7 py-8 sm:px-10 print:px-0">
          <section data-brief-document-section><p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-indigo-700">Executive update</p><h2 className="mt-2 max-w-3xl text-[24px] font-bold leading-[1.18] tracking-[-0.02em]">{brief.editorial.copy.headline}</h2><p className="mt-3 max-w-3xl text-[15px] leading-7 text-slate-700">{brief.editorial.copy.executiveSummary}</p><p className="mt-4 border-l-2 border-indigo-500 pl-4 text-[14px] font-medium leading-6 text-indigo-900">{brief.editorial.copy.keyTakeaway}</p></section>

          <section data-brief-document-section><h2 className="text-[22px] font-bold tracking-[-0.02em]">{language.story}</h2><div className="mt-4 grid gap-3 md:grid-cols-3">
            <FindingList title={language.worked} narrative={brief.editorial.copy.whatWorkedNarrative} tone="emerald" empty={language.empty} items={brief.whatWorked.map((item) => ({ id: item.id, title: item.title, statement: narratives.get(item.id) || item.statement, meta: evidenceTierLabel(item.evidenceTier) }))} />
            <FindingList title={language.friction} narrative={brief.editorial.copy.frictionNarrative} tone="rose" empty={language.empty} items={brief.friction.map((item) => ({ id: item.id, title: item.title, statement: narratives.get(item.id) || item.statement, meta: evidenceTierLabel(item.evidenceTier) }))} />
            <FindingList title={language.next} narrative={brief.editorial.copy.nextEventNarrative} tone="violet" empty={language.empty} items={intelligencePriorities} />
          </div></section>

          {(brief.intelligencePacket.attendeeQuestions.length > 0 || patternItems.length > 0) && <section data-brief-document-section className="grid gap-6 md:grid-cols-2">
            {brief.intelligencePacket.attendeeQuestions.length > 0 && <div><h2 className="text-[18px] font-bold">Questions the program should be ready to answer</h2><ul className="mt-3 space-y-2">{brief.intelligencePacket.attendeeQuestions.slice(0, 5).map((question) => <li key={question} className="border-l-2 border-indigo-200 pl-3 text-[13px] leading-5 text-slate-700">{question}</li>)}</ul></div>}
            {patternItems.length > 0 && <div><h2 className="text-[18px] font-bold">{language.pattern}</h2><ul className="mt-3 space-y-2">{patternItems.map((item) => <li key={item.key} className="text-[13px] leading-5 text-slate-700"><span className="font-semibold text-slate-950">{item.label}</span>{item.detail ? ` — ${item.detail}` : ''}</li>)}</ul></div>}
          </section>}

          <section data-brief-document-section><h2 className="text-[22px] font-bold tracking-[-0.02em]">{language.priorities}</h2><div className="mt-4 grid gap-3 md:grid-cols-2"><FindingList title="Team-owned follow-through" narrative="" tone="violet" empty="No open user-created action is attached to this lifecycle brief." items={priorities} /><FindingList title="Leadership takeaways" narrative="" tone="emerald" empty={language.empty} items={brief.keyFindings.slice(0, 4).map((item) => ({ id: item.id, title: item.title, statement: narratives.get(item.id) || item.statement, meta: evidenceTierLabel(item.evidenceTier) }))} /></div></section>

          <footer data-brief-document-section className="border-t border-slate-200 pt-4 text-[10px] leading-5 text-slate-500">{brief.editorial.copy.coverageNarrative} This {language.badge.toLowerCase()} uses only the canonical intelligence and user-created follow-through for this lifecycle.</footer>
        </div>
      </article>
    </div>
  </main>
}
