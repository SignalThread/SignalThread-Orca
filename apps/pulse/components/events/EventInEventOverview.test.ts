import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const overviewSource = fs.readFileSync(path.join(process.cwd(), 'components/events/EventInEventOverview.tsx'), 'utf8')
const heroSource = fs.readFileSync(path.join(process.cwd(), 'components/events/EventLifecycleHero.tsx'), 'utf8')
const dashboardSource = fs.readFileSync(path.join(process.cwd(), 'components/admin/Dashboard2.tsx'), 'utf8')
const pageSource = fs.readFileSync(path.join(process.cwd(), 'app/app/events/[eventId]/dashboard/page.tsx'), 'utf8')

describe('approved in-event Event Areas composition', () => {
  it('uses the existing overview component with live intelligence data and the shared lifecycle hero', () => {
    expect(dashboardSource).toContain('<EventInEventOverview')
    expect(dashboardSource).toContain('sentimentBreakdown={{')
    expect(dashboardSource).toContain('themes={canonicalOverviewThemes}')
    expect(dashboardSource).toContain('issues={activeAttentionQueue}')
    expect(dashboardSource).toContain('overview={overview}')
    expect(overviewSource).toContain('<EventLifecycleHero')
    expect(heroSource).not.toContain('AI written')
  })

  it('renders the approved overview card with a four-part metric strip and real detail interactions', () => {
    expect(heroSource).toContain("title = 'Event overview'")
    expect(overviewSource).toContain('EventBriefAction eventId={eventId} accountSlug={accountSlug}')
    expect(heroSource).toContain('event-intelligence-metrics grid')
    for (const label of ['Sentiment', 'Responses', 'Coverage', 'Follow-up']) expect(heroSource).toContain(`>${label}</p>`)
    expect(heroSource).toContain('data-testid="coverage-detail-toggle"')
    expect(heroSource).toContain('data-testid="follow-up-detail-toggle"')
    expect(overviewSource).toContain('data-testid="coverage-detail-panel"')
    expect(overviewSource).toContain('data-testid="follow-up-detail-panel"')
    expect(heroSource).toContain('expandedDetail')
    expect(heroSource).toContain('Coverage distribution')
    expect(heroSource).toContain('neutralPercent')
    expect(heroSource).toContain('negativePercent')
    expect(overviewSource).toContain('followUpHrefs.open')
    expect(overviewSource).toContain('followUpHrefs.unclaimed')
    expect(overviewSource).toContain('followUpHrefs.afterEvent')
  })

  it('keeps review and working evidence as equal dense report columns with their current callbacks', () => {
    expect(overviewSource).toContain('event-intelligence-main-grid grid min-w-0 gap-[14px]')
    expect(overviewSource).toContain('What needs review')
    expect(overviewSource).toContain('What is working')
    expect(overviewSource).toContain('Ranked by evidence weight')
    expect(overviewSource).toContain('Strong evidence across all three')
    expect(overviewSource).toContain('Review evidence')
    expect(overviewSource).toContain('onReviewTheme')
    expect(overviewSource).toContain('onReviewIssue')
    expect(overviewSource).toContain('No credible friction or mixed pattern has emerged in the current evidence.')
    expect(overviewSource).toContain('No positive patterns have enough evidence yet.')
  })

  it('preserves the three decision horizons and evidence links below the middle columns', () => {
    expect(overviewSource).toContain('Keep, improve, and revisit')
    expect(overviewSource).toContain('Action-oriented recommendations grounded in attendee feedback')
    expect(overviewSource).toContain('Improve during this event')
    expect(overviewSource).toContain('Revisit next event')
    expect(overviewSource).toContain("{decisionDetailsOpen ? 'Hide details' : 'Show details'}")
    expect(overviewSource).toContain('data-decision-columns')
    expect(overviewSource).toContain('data-decision-evidence-link')
    expect(overviewSource).toContain('View supporting evidence →')
  })

  it('uses container-sized grids so the desktop composition only stacks when the workspace is narrow', () => {
    const globalsSource = fs.readFileSync(path.join(process.cwd(), 'app/globals.css'), 'utf8')
    expect(globalsSource).toContain('.event-intelligence-overview')
    expect(globalsSource).toContain('@container (min-width: 44rem)')
    expect(globalsSource).toContain('.event-intelligence-metrics')
    expect(globalsSource).toContain('grid-template-columns: repeat(4, minmax(0, 1fr))')
    expect(globalsSource).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))')
    expect(globalsSource).toContain('.event-intelligence-decision-columns')
    expect(overviewSource).not.toContain('xl:grid-cols-')
    expect(overviewSource).not.toContain('fixed inset-0')
    expect(overviewSource).not.toContain('min-w-[1176px]')
  })

  it('uses a container-sized compact scope, survey, and area control treatment', () => {
    const globalsSource = fs.readFileSync(path.join(process.cwd(), 'app/globals.css'), 'utf8')
    expect(pageSource).toContain("intelligenceScope !== 'event-areas' && intelligenceScope !== 'speakers'")
    expect(pageSource).toContain('data-testid="intelligence-scope-controls"')
    expect(pageSource).toContain('aria-haspopup="listbox"')
    expect(pageSource).toContain('role="listbox"')
    expect(pageSource).toContain('>Survey</span>')
    expect(pageSource).toContain('>Area</span>')
    expect(globalsSource).toContain('.event-intelligence-scope-controls-grid')
    expect(globalsSource).toContain('grid-template-columns: minmax(0, auto) minmax(8rem, 0.8fr) minmax(11rem, 1.15fr)')
    expect(globalsSource).toContain('@container (max-width: 39rem)')
  })
})
