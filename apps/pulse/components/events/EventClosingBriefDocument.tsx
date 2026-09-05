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

function FindingList({
  title,
  items,
  tone,
}: {
  title: string
  items: Array<{ id: string; title: string; statement: string | null; meta: string }>
  tone: 'emerald' | 'rose' | 'violet'
}) {
  const border = { emerald: 'border-emerald-400', rose: 'border-rose-400', violet: 'border-violet-400' }[tone]
  return (
    <section className={`rounded-xl border border-slate-200 border-t-[3px] bg-white p-5 ${border}`}>
      <h3 className="text-[15px] font-semibold text-slate-950">{title}</h3>
      <div className="mt-3 space-y-3">
        {items.length > 0 ? items.map((item) => (
          <article key={item.id}>
            <h4 className="text-[13px] font-semibold leading-5 text-slate-900">{item.title}</h4>
            {item.statement && <p className="mt-1 text-[12px] font-normal leading-5 text-slate-600">{item.statement}</p>}
            <p className="mt-1 text-[10px] font-medium text-slate-500">{item.meta}</p>
          </article>
        )) : <p className="text-[12px] font-normal leading-5 text-slate-500">No material recommendation emerged from the available evidence.</p>}
      </div>
    </section>
  )
}

export function EventClosingBriefDocument({
  brief,
  eventDates,
  pdfHref,
}: {
  brief: EventClosingBrief
  eventDates?: { startDate: string | null; endDate: string | null }
  pdfHref: string
}) {
  useEffect(() => {
    const previousTitle = document.title
    document.title = `${brief.event.name} — Event Intelligence Brief`
    return () => { document.title = previousTitle }
  }, [brief.event.name])

  const findingNarratives = new Map(brief.editorial.copy.findingNarratives.map((item) => [item.findingId, item.narrative]))
  const nextEventItems = [
    ...(brief.decisions.nextEventLearning.actions ?? []).map((item) => ({ id: item.id, title: item.title, statement: null, meta: `${item.status.toLowerCase().replaceAll('_', ' ')} · ${item.priority}` })),
    ...(brief.decisions.nextEventLearning.sessionLearning ?? []).map((item) => ({ id: item.id, title: item.title, statement: null, meta: `From ${item.source} · ${evidenceTierLabel(item.evidenceTier)}` })),
    ...(brief.decisions.nextEventLearning.findings ?? []).map((item) => ({ id: item.id, title: item.title, statement: item.statement, meta: `${item.mentionCount} mentions · ${evidenceTierLabel(item.evidenceTier)}` })),
  ]
  const eventDateRange = compactDateRange(eventDates?.startDate ?? null, eventDates?.endDate ?? null)

  return (
    <main data-testid="closing-brief-document" className="font-brand min-h-screen bg-slate-100 px-4 py-7 text-slate-950 sm:px-8 print:bg-white print:px-0 print:py-0">
      <style jsx global>{`
        @media print {
          @page { size: letter; margin: 0.58in 0.62in 0.68in; }
          body { background: white !important; }
          [data-brief-document-controls] { display: none !important; }
          [data-brief-document-section], [data-brief-document-card] { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>
      <div className="mx-auto max-w-[900px]">
        <div data-brief-document-controls className="mb-5 flex justify-end">
          <EventBriefPdfDownloadButton pdfHref={pdfHref} />
        </div>
        <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_12px_32px_rgba(15,23,42,0.07)] print:rounded-none print:border-0 print:shadow-none">
          <header className="border-b border-slate-200 bg-slate-50 px-7 py-7 sm:px-10 print:px-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-indigo-700">SignalThread · Event Intelligence Brief</p>
            <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h1 className="max-w-2xl text-[30px] font-bold leading-[1.12] tracking-[-0.025em] text-slate-950 sm:text-[34px]">{brief.event.name}</h1>
                <p className="mt-2 text-[13px] font-normal text-slate-600">{eventDateRange || 'Event intelligence report'}{eventDateRange ? ' · ' : ''}Generated {dateLabel(brief.generatedAt)}</p>
              </div>
              <p className="rounded-full bg-indigo-50 px-3 py-1.5 text-[11px] font-semibold text-indigo-700">Post-event report</p>
            </div>
          </header>

          <div className="space-y-8 px-7 py-8 sm:px-10 print:px-0">
            <section data-brief-document-section>
              <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-indigo-700">Executive summary</p>
              <h2 className="mt-2 max-w-3xl text-[24px] font-bold leading-[1.18] tracking-[-0.02em] text-slate-950">{brief.editorial.copy.headline}</h2>
              <p className="mt-3 max-w-3xl text-[15px] font-normal leading-7 text-slate-700">{brief.editorial.copy.executiveSummary}</p>
              <p className="mt-4 border-l-2 border-indigo-500 pl-4 text-[14px] font-medium leading-6 text-indigo-900">{brief.editorial.copy.keyTakeaway}</p>
            </section>

            <section data-brief-document-section className="grid gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 sm:grid-cols-4">
              {[
                ['Responses collected', brief.summary.responseCount.toLocaleString()],
                ['Analyzed answers', brief.summary.answerCount.toLocaleString()],
                ['Overall sentiment', brief.summary.sentiment],
                ['Listening coverage', `${brief.summary.representedPercent}%`],
              ].map(([label, value]) => <div key={label} className="bg-white px-4 py-4"><p className="text-[10px] font-semibold uppercase tracking-[0.11em] text-slate-500">{label}</p><p className="mt-2 text-[20px] font-bold tracking-[-0.02em] text-slate-950">{value}</p></div>)}
            </section>

            <section data-brief-document-section>
              <h2 className="text-[22px] font-bold tracking-[-0.02em] text-slate-950">The verdict</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <FindingList title="What worked" tone="emerald" items={brief.whatWorked.slice(0, 3).map((item) => ({ id: item.id, title: item.title, statement: findingNarratives.get(item.id) || item.statement, meta: `${item.mentionCount} mentions · ${evidenceTierLabel(item.evidenceTier)}` }))} />
                <FindingList title="What created friction" tone="rose" items={brief.friction.slice(0, 3).map((item) => ({ id: item.id, title: item.title, statement: findingNarratives.get(item.id) || item.statement, meta: `${item.mentionCount} evidence · ${evidenceTierLabel(item.evidenceTier)}` }))} />
                <FindingList title="What should change next time" tone="violet" items={nextEventItems.slice(0, 3)} />
              </div>
            </section>

            <section data-brief-document-section>
              <h2 className="text-[22px] font-bold tracking-[-0.02em] text-slate-950">Key findings</h2>
              <div className="mt-4 space-y-3">
                {brief.keyFindings.slice(0, 6).map((finding) => <article data-brief-document-card key={finding.id} className="rounded-xl border border-slate-200 p-4"><div className="grid grid-cols-[8px_minmax(0,1fr)] gap-x-3"><span aria-hidden className="mt-1.5 h-1.5 w-1.5 rounded-full bg-slate-400" /><div><div className="flex flex-wrap items-center gap-x-2 gap-y-1"><h3 className="text-[14px] font-semibold text-slate-950">{finding.title}</h3><span className="text-[10px] font-semibold text-slate-500">{evidenceTierLabel(finding.evidenceTier)}</span></div><p className="mt-2 text-[13px] font-normal leading-6 text-slate-700">{findingNarratives.get(finding.id) || finding.statement || 'The available attendee evidence supports this finding.'}</p><p className="mt-2 text-[10px] font-medium text-slate-500">{finding.mentionCount} evidence · {finding.responseCount ?? '—'} analyzed responses</p></div></div></article>)}
              </div>
            </section>

            <section data-brief-document-section>
              <h2 className="text-[22px] font-bold tracking-[-0.02em] text-slate-950">Recommendations</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <FindingList title="Keep" tone="emerald" items={brief.whatWorked.slice(0, 3).map((item) => ({ id: item.id, title: item.title, statement: item.statement, meta: 'Continue what attendees valued' }))} />
                <FindingList title="Follow through" tone="rose" items={brief.friction.slice(0, 3).map((item) => ({ id: item.id, title: item.title, statement: item.statement, meta: 'Address in post-event follow-through' }))} />
                <FindingList title="Revisit next event" tone="violet" items={nextEventItems.slice(0, 3)} />
              </div>
            </section>

            <footer data-brief-document-section className="border-t border-slate-200 pt-4 text-[10px] font-normal leading-5 text-slate-500">This brief synthesizes persisted attendee and staff feedback. Coverage and evidence confidence inform the editorial synthesis and the reported findings.</footer>
          </div>
        </article>
      </div>
    </main>
  )
}
