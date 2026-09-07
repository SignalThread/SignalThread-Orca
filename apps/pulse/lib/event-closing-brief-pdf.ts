import PDFDocument from 'pdfkit'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { EventClosingBrief } from '@/lib/event-closing-brief'
import { evidenceTierLabel } from '@/lib/event-intelligence/evidence-model'

const PAGE = { width: 612, height: 792, left: 54, right: 54, top: 54, bottom: 54 }
const CONTENT_WIDTH = PAGE.width - PAGE.left - PAGE.right

const colors = {
  ink: '#0b1025',
  copy: '#3e506c',
  muted: '#64748b',
  line: '#dbe3ef',
  indigo: '#4338ca',
  paleIndigo: '#eef2ff',
  paleSlate: '#f8fafc',
  emerald: '#047857',
  rose: '#be123c',
  violet: '#6d28d9',
}

type EventDates = { startDate: string | null; endDate: string | null }
type DocumentItem = { id: string; title: string; statement: string | null; meta: string }

function fontPath(weight: 400 | 600 | 700) {
  const relativePath = path.join('node_modules', '@fontsource', 'montserrat', 'files', `montserrat-latin-${weight}-normal.woff`)
  // npm workspaces hoist the font package to the repository root, so the
  // nearest node_modules above the app is searched as well as its own.
  let directory = process.cwd()
  for (;;) {
    const candidate = path.join(directory, relativePath)
    const parent = path.dirname(directory)
    if (existsSync(candidate) || parent === directory) return candidate
    directory = parent
  }
}

function registerDocumentFonts(document: { registerFont: (name: string, source: string | Buffer) => unknown }) {
  try {
    document.registerFont('Montserrat', readFileSync(fontPath(400)))
    document.registerFont('Montserrat-Semibold', readFileSync(fontPath(600)))
    document.registerFont('Montserrat-Bold', readFileSync(fontPath(700)))
  } catch (error) {
    // Deployed route bundles do not always retain package font assets. A
    // readable PDF is preferable to failing an otherwise valid canonical brief.
    console.warn('Event brief PDF fonts unavailable; using built-in PDF fonts.', error)
    document.registerFont('Montserrat', 'Helvetica')
    document.registerFont('Montserrat-Semibold', 'Helvetica-Bold')
    document.registerFont('Montserrat-Bold', 'Helvetica-Bold')
  }
}

function dateLabel(value: string) {
  return new Date(value).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function eventDateRange(dates?: EventDates) {
  if (!dates?.startDate) return null
  if (!dates.endDate || dates.startDate.slice(0, 10) === dates.endDate.slice(0, 10)) return dateLabel(dates.startDate)
  return `${dateLabel(dates.startDate)} – ${dateLabel(dates.endDate)}`
}

function truncate(value: string, maximum = 360) {
  if (value.length <= maximum) return value
  return `${value.slice(0, maximum - 1).trimEnd()}…`
}

function pdfLanguage(phase: EventClosingBrief['lifecyclePhase']) {
  if (phase === 'PRE_EVENT') return { report: 'Pre-event brief', story: 'What the team should prepare for', worked: 'What attendees expect', friction: 'What needs attention', next: 'Prepare now', priorities: 'Priorities before doors open' }
  if (phase === 'IN_EVENT') return { report: 'During-event brief', story: 'The live read', worked: 'Protect', friction: 'Fix now', next: 'Watch', priorities: 'Act while there is still time' }
  return { report: 'Post-event brief', story: 'What defined the event', worked: 'What worked best', friction: 'What held it back', next: 'Carry forward', priorities: 'Repeat, change, and follow through' }
}

export async function renderEventClosingBriefPdf({
  brief,
  eventDates,
}: {
  brief: EventClosingBrief
  eventDates?: EventDates
}) {
  const language = pdfLanguage(brief.lifecyclePhase ?? 'POST_EVENT')
  const document = new PDFDocument({
    size: 'LETTER',
    margin: 0,
    info: {
      Title: `${brief.event.name} — Event Intelligence Brief`,
      Author: 'SignalThread',
      Subject: language.report,
    },
  })
  registerDocumentFonts(document)

  const chunks: Buffer[] = []
  const result = new Promise<Buffer>((resolve, reject) => {
    document.on('data', (chunk: Buffer) => chunks.push(chunk))
    document.on('end', () => resolve(Buffer.concat(chunks)))
    document.on('error', reject)
  })

  let y = PAGE.top
  const bottom = PAGE.height - PAGE.bottom
  const resetPage = () => {
    document.addPage()
    y = PAGE.top
  }
  const ensure = (height: number) => {
    if (y + height > bottom) resetPage()
  }
  const text = (value: string, options: PDFKit.Mixins.TextOptions = {}) => {
    document.text(value, PAGE.left, y, { width: CONTENT_WIDTH, ...options })
    y = document.y
  }
  const label = (value: string) => {
    document.font('Montserrat-Semibold').fontSize(8.5).fillColor(colors.indigo).text(value.toUpperCase(), PAGE.left, y, { width: CONTENT_WIDTH, characterSpacing: 1.4 })
    y = document.y
  }
  const sectionHeading = (value: string) => {
    ensure(42)
    document.font('Montserrat-Bold').fontSize(19).fillColor(colors.ink).text(value, PAGE.left, y, { width: CONTENT_WIDTH })
    y = document.y + 11
  }
  const rule = () => {
    document.strokeColor(colors.line).lineWidth(1).moveTo(PAGE.left, y).lineTo(PAGE.left + CONTENT_WIDTH, y).stroke()
    y += 16
  }
  const card = (height: number, tone = colors.line) => {
    ensure(height)
    document.roundedRect(PAGE.left, y, CONTENT_WIDTH, height, 8).fillAndStroke('#ffffff', tone)
  }
  const findingNarratives = new Map(brief.editorial.copy.findingNarratives.map((item) => [item.findingId, item.narrative]))
  const nextEventItems: DocumentItem[] = [
    ...(brief.decisions.nextEventLearning.actions ?? []).map((item) => ({ id: item.id, title: item.title, statement: null, meta: `${item.status.toLowerCase().replaceAll('_', ' ')} · ${item.priority}` })),
    ...(brief.decisions.nextEventLearning.sessionLearning ?? []).map((item) => ({ id: item.id, title: item.title, statement: null, meta: `From ${item.source} · ${evidenceTierLabel(item.evidenceTier)}` })),
    ...(brief.decisions.nextEventLearning.findings ?? []).map((item) => ({ id: item.id, title: item.title, statement: item.statement, meta: `${item.mentionCount} mentions · ${evidenceTierLabel(item.evidenceTier)}` })),
  ]

  // Report header
  label('SignalThread · Event Intelligence Brief')
  y += 12
  document.font('Montserrat-Bold').fontSize(25).fillColor(colors.ink).text(brief.event.name, PAGE.left, y, { width: CONTENT_WIDTH })
  y = document.y + 8
  document.font('Montserrat').fontSize(10).fillColor(colors.copy).text(`${eventDateRange(eventDates) || language.report} · Generated ${dateLabel(brief.generatedAt)}`, PAGE.left, y, { width: CONTENT_WIDTH })
  y = document.y + 22
  rule()

  // Executive summary
  label('Executive summary')
  y += 7
  document.font('Montserrat-Bold').fontSize(18).fillColor(colors.ink).text(brief.editorial.copy.headline, PAGE.left, y, { width: CONTENT_WIDTH, lineGap: 2 })
  y = document.y + 10
  document.font('Montserrat').fontSize(11).fillColor(colors.copy).text(brief.editorial.copy.executiveSummary, PAGE.left, y, { width: CONTENT_WIDTH, lineGap: 4 })
  y = document.y + 11
  const takeawayHeight = Math.max(38, document.font('Montserrat-Semibold').fontSize(10.5).heightOfString(brief.editorial.copy.keyTakeaway, { width: CONTENT_WIDTH - 34, lineGap: 3 }) + 20)
  ensure(takeawayHeight)
  document.rect(PAGE.left, y, 3, takeawayHeight).fill(colors.indigo)
  document.font('Montserrat-Semibold').fontSize(10.5).fillColor('#312e81').text(brief.editorial.copy.keyTakeaway, PAGE.left + 16, y + 10, { width: CONTENT_WIDTH - 34, lineGap: 3 })
  y += takeawayHeight + 20

  sectionHeading(language.story)
  const verdicts: Array<{ title: string; narrative: string | null; tone: string; items: DocumentItem[] }> = [
    {
      title: language.worked, tone: colors.emerald, narrative: brief.editorial.copy.whatWorkedNarrative,
      items: brief.whatWorked.slice(0, 3).map((item) => ({ id: item.id, title: item.title, statement: findingNarratives.get(item.id) || item.statement, meta: `${item.mentionCount} mentions · ${evidenceTierLabel(item.evidenceTier)}` })),
    },
    {
      title: language.friction, tone: colors.rose, narrative: brief.editorial.copy.frictionNarrative,
      items: brief.friction.slice(0, 3).map((item) => ({ id: item.id, title: item.title, statement: findingNarratives.get(item.id) || item.statement, meta: `${item.mentionCount} evidence · ${evidenceTierLabel(item.evidenceTier)}` })),
    },
    {
      title: language.next, tone: colors.violet, narrative: brief.editorial.copy.nextEventNarrative,
      items: nextEventItems.slice(0, 3),
    },
  ]
  for (const verdict of verdicts) {
    const cardWidth = CONTENT_WIDTH - 28
    const narrativeHeight = verdict.narrative
      ? document.font('Montserrat').fontSize(9.5).heightOfString(truncate(verdict.narrative, 260), { width: cardWidth, lineGap: 3 }) + 6
      : 0
    const itemHeight = verdict.items.length > 0
      ? verdict.items.reduce((total, item) => total
        + document.font('Montserrat-Semibold').fontSize(9.5).heightOfString(item.title, { width: cardWidth })
        + 2
        + document.font('Montserrat').fontSize(8.5).heightOfString(item.meta, { width: cardWidth })
        + 5, 0)
      : document.font('Montserrat').fontSize(9.5).heightOfString('No material recommendation emerged from the available evidence.', { width: cardWidth })
    const height = Math.max(56, 12 + document.font('Montserrat-Semibold').fontSize(10).heightOfString(verdict.title, { width: cardWidth }) + 6 + narrativeHeight + itemHeight + 12)
    card(height, verdict.tone)
    const top = y
    document.font('Montserrat-Semibold').fontSize(10).fillColor(verdict.tone).text(verdict.title, PAGE.left + 14, top + 12, { width: CONTENT_WIDTH - 28 })
    let cardY = document.y + 6
    if (verdict.narrative) {
      document.font('Montserrat').fontSize(9.5).fillColor(colors.copy).text(truncate(verdict.narrative, 260), PAGE.left + 14, cardY, { width: CONTENT_WIDTH - 28, lineGap: 3 })
      cardY = document.y + 6
    }
    if (verdict.items.length === 0) {
      document.font('Montserrat').fontSize(9.5).fillColor(colors.muted).text('No material recommendation emerged from the available evidence.', PAGE.left + 14, cardY, { width: CONTENT_WIDTH - 28 })
    } else {
      verdict.items.forEach((item) => {
        document.font('Montserrat-Semibold').fontSize(9.5).fillColor(colors.ink).text(item.title, PAGE.left + 14, cardY, { width: CONTENT_WIDTH - 28 })
        cardY = document.y + 2
        document.font('Montserrat').fontSize(8.5).fillColor(colors.muted).text(item.meta, PAGE.left + 14, cardY, { width: CONTENT_WIDTH - 28 })
        cardY = document.y + 5
      })
    }
    y = top + height + 9
  }

  sectionHeading(language.priorities)
  const canonicalFollowThrough: DocumentItem[] = brief.decisions.afterEventFollowUp.map((item) => ({
    id: item.id,
    title: item.title,
    statement: null,
    meta: `${item.status.toLowerCase().replaceAll('_', ' ')} · ${item.owner} · ${item.priority}`,
  }))
  const closingItems = [...canonicalFollowThrough, ...nextEventItems].slice(0, 5)
  if (closingItems.length === 0) {
    text('No material priority has emerged from the current lifecycle intelligence.', { lineGap: 3 })
    y += 8
  } else {
    for (const item of closingItems) {
      ensure(38)
      document.font('Montserrat-Semibold').fontSize(10).fillColor(colors.ink).text(item.title, PAGE.left, y, { width: CONTENT_WIDTH })
      y = document.y + 2
      document.font('Montserrat').fontSize(8.5).fillColor(colors.muted).text(item.meta, PAGE.left, y, { width: CONTENT_WIDTH })
      y = document.y + 7
    }
  }

  ensure(42)
  rule()
  document.font('Montserrat').fontSize(7.5).fillColor(colors.muted).text('This report synthesizes persisted attendee and staff feedback. Coverage and evidence confidence inform the editorial synthesis and reported findings.', PAGE.left, y, { width: CONTENT_WIDTH, lineGap: 2 })
  document.end()
  return result
}
