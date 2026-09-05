import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const appPageSource = fs.readFileSync(
  path.join(process.cwd(), 'app/app/page.tsx'),
  'utf8',
)

const firstSurveyHeroSource = fs.readFileSync(
  path.join(process.cwd(), 'components/admin/onboarding/FirstSurveyHero.tsx'),
  'utf8',
)

const newEventPageSource = fs.readFileSync(
  path.join(process.cwd(), 'app/app/events/new/page.tsx'),
  'utf8',
)

const eventDetailPageSource = fs.readFileSync(
  path.join(process.cwd(), 'app/app/events/[eventId]/page.tsx'),
  'utf8',
)

const eventNewSurveyPageSource = fs.readFileSync(
  path.join(process.cwd(), 'app/app/events/[eventId]/surveys/new/page.tsx'),
  'utf8',
)

const eventDashboardPageSource = fs.readFileSync(
  path.join(process.cwd(), 'app/app/events/[eventId]/dashboard/page.tsx'),
  'utf8',
)

const dashboard2Source = fs.readFileSync(
  path.join(process.cwd(), 'components/admin/Dashboard2.tsx'),
  'utf8',
)

const productTourSource = fs.readFileSync(
  path.join(process.cwd(), 'components/onboarding/ProductTour.tsx'),
  'utf8',
)

describe('Events app navigation', () => {
  it('does not route Events CTAs into /app/events/new as a dynamic event id', () => {
    expect(appPageSource).not.toContain('`/app/events/new?account=${accountSlug}`\n          )')
    expect(appPageSource).toContain('const primaryEventPath = firstEvent')
    expect(appPageSource).toContain('const hasEvent = Boolean(firstEvent)')
    expect(appPageSource).toContain(': createEventPath')
    expect(appPageSource).toContain('Create a new Event container')
    expect(appPageSource).toContain("{isRetail ? 'View Analytics' : 'Open Event'}")
    expect(appPageSource).toContain('Open the event detail workspace')
    expect(appPageSource).toContain(': createEventPath')
    expect(appPageSource).not.toContain("Open ${surveyLabel}")
    expect(firstSurveyHeroSource).toContain("? eventPath || `/app${accountSlug")
    expect(firstSurveyHeroSource).toContain(": eventCreatePath || `/app/events/new${accountSlug")
    expect(firstSurveyHeroSource).toContain("const primaryActionLabel = isRetail ? 'Create Survey' : hasEvent ? 'Open Event' : 'Create Event'")
  })

  it('keeps retail create-survey navigation unchanged', () => {
    expect(appPageSource).toContain('`/app/surveys/create?account=${accountSlug}`')
    expect(firstSurveyHeroSource).toContain('`/app/surveys/create${accountSlug')
    expect(appPageSource).toContain("isRetail ? `+ Create ${surveyLabel}` : createOrOpenSurveyLabel")
  })

  it('uses EVENTS-only copy for app home while preserving retail copy branches', () => {
    expect(appPageSource).toContain("import { isRetailAccount } from '@/lib/account-product-mode'")
    expect(appPageSource).toContain('const isRetail = isRetailAccount(account.accountType)')
    expect(appPageSource).toContain("const workspacePluralLabel = isRetail ? 'Locations/Teams' : 'Event Workspaces'")
    expect(appPageSource).toContain("const workspaceSingularLabel = isRetail ? 'Location/Team' : 'Event Workspace'")
    expect(appPageSource).toContain("const workspaceTooltip = isRetail ? LOCATION_TEAM_TOOLTIP : EVENT_WORKSPACE_TOOLTIP")
    expect(appPageSource).toContain("const collectionSectionLabel = isRetail ? 'Surveys' : 'Event Containers'")
    expect(appPageSource).toContain("const copyActionLabel = isRetail ? 'Copy Survey' : 'Copy Event'")
    expect(appPageSource).toContain("const deleteActionLabel = isRetail ? 'Delete Survey' : 'Delete Event'")
    expect(appPageSource).toContain('Activate Event Feedback')
    expect(appPageSource).toContain('Target Event Workspace')
    expect(appPageSource).toContain('event intelligence will not be copied')
    expect(appPageSource).toContain('Manage live, upcoming, and completed event feedback in one place.')
    expect(appPageSource).toContain('Configure your Event profile, workspaces, and preferences')
    expect(appPageSource).toContain('Manage where feedback is collected and the surveys running there.')
    expect(appPageSource).toContain('Create a Location or Team to start collecting feedback.')
  })

  it('lets EVENTS starter accounts with no event create one event from /app/events/new', () => {
    expect(appPageSource).toContain('const createEventPath = `/app/events/new?account=${accountSlug}`')
    expect(appPageSource).toContain('eventCreatePath={isRetail ? undefined : createEventPath}')
    expect(appPageSource).toContain('hasEvent={hasEvent}')
    expect(appPageSource).toContain(": `Create ${surveyLabel}`")
    expect(newEventPageSource).toContain('Create a new event')
    expect(newEventPageSource).toContain('createEventWithInitialSetup({')
    expect(newEventPageSource).toContain('router.replace(`/app/events/${result.eventId}?${query.toString()}`)')
    expect(newEventPageSource).not.toContain("data?.account.accountType === 'EVENTS' && normalizeTier(data.account.tier) === 'starter'")
    expect(newEventPageSource).toContain("import { isEventsAccount } from '@/lib/account-product-mode'")
    expect(newEventPageSource).toContain('if (!isEventsAccount(data.account.accountType))')
  })

  it('keeps existing event detail pages wired to real event ids', () => {
    expect(eventDetailPageSource).toContain("const eventId = typeof params.eventId === 'string' ? params.eventId : ''")
    expect(eventDetailPageSource).toContain("fetchWorkspaceJson<{ success: true; event: EventDetail }>('Event details', `/api/app/events/${eventId}?account=${accountSlug}`")
    expect(eventDetailPageSource).toContain('<EventWorkspaceShell')
    expect(eventDetailPageSource).not.toContain('Open Command Center')
    expect(eventDetailPageSource).toContain("fetchWorkspaceJson<EventVoiceSurveysResponse & { success: true }>('Event surveys', `/api/app/events/${eventId}/voice-surveys?account=${accountSlug}`")
    expect(eventDetailPageSource).toContain('// Dedicated Events-only creation route. Survey creation no longer renders inline.')
    expect(eventDetailPageSource).toContain('const newSurveyPath = (structureItemId?: string) => {')
    expect(eventDetailPageSource).toContain('<EventTemplateSurveyWorkspace')
    expect(eventDashboardPageSource).toContain("const selectedSurveyId = searchParams.get('surveyId')?.trim() || null")
    expect(eventDashboardPageSource).toContain("const selectedEventStructureItemId = searchParams.get('eventStructureItemId')?.trim() || null")
    expect(eventDashboardPageSource).toContain('fetch(`/api/app/events/${eventId}/voice-surveys?account=${accountSlug}`')
    expect(eventDashboardPageSource).toContain('fetch(`/api/app/events/${eventId}/structure?account=${accountSlug}`')
    expect(eventDashboardPageSource).toContain('`/api/app/events/${eventId}/analysis?${analysisParams.toString()}`')
    expect(eventDashboardPageSource).toContain('`/api/app/events/${eventId}/timeline?${baseParams.toString()}`')
    expect(eventDashboardPageSource).toContain('`/api/app/events/${eventId}/signals?${params.toString()}`')
    expect(eventDashboardPageSource).toContain('`/api/app/events/${eventId}/intelligence?${params.toString()}`')
    expect(eventDashboardPageSource).toContain("params.set('eventStructureItemId', selectedEventStructureItemId)")
    expect(eventDashboardPageSource).toContain("params.set('structureKind', selectedStructureKind)")
    expect(eventDashboardPageSource).toContain("params.set('surveyTargetId', selectedCoverageTargetId)")
    expect(eventDashboardPageSource).toContain("params.set('questionId', selectedCoverageQuestionId)")
  })

  it('cancels the Events Home request when navigation leaves the page', () => {
    expect(appPageSource).toContain('const controller = new AbortController()')
    expect(appPageSource).toContain('void loadAccountData(controller.signal)')
    expect(appPageSource).toContain('return () => controller.abort()')
    expect(appPageSource).toContain("fetch(`/api/app/account?account=${accountSlug}`, { signal })")
  })

  it('keeps event detail and dashboard copy in event-intelligence language', () => {
    expect(eventDetailPageSource).toContain('Collection readiness')
    // Survey creation copy lives on the dedicated Events-only New Survey route.
    expect(eventNewSurveyPageSource).toContain('targetLabel')
    expect(eventNewSurveyPageSource).toContain('Response method')
    expect(eventNewSurveyPageSource).toContain('Overall Event')
    expect(eventNewSurveyPageSource).toContain("targetCategory: preselectedSpeakerId ? 'SPEAKER' : 'EVENT'")
    expect(eventDetailPageSource).not.toMatch(/survey target/i)
    expect(eventDetailPageSource).not.toMatch(/collection target/i)
    expect(eventDetailPageSource).toContain('activeSection="setup"')
    expect(eventDashboardPageSource).toContain('activeSection="signals"')
    expect(eventDashboardPageSource).toContain('<Dashboard2')
    expect(eventDashboardPageSource).toContain('RetailSurveyDashboard')
    expect(eventDashboardPageSource).toContain('Share This Survey')
    expect(eventDashboardPageSource).toContain('Launch the survey kiosk in fullscreen mode or download a QR code for physical placement')
  })

  it('uses event-specific product tour copy for EVENTS accounts without removing non-EVENTS guidance', () => {
    expect(productTourSource).toContain('export function getTourSteps(isEventsAccount: boolean)')
    expect(productTourSource).toContain("import { isEventsAccount } from '@/lib/account-product-mode'")
    expect(productTourSource).toContain('loadAccountContext(accountSlug)')
    expect(productTourSource).toContain('setAccountContext({ slug: accountSlug, accountType: account.accountType, settled: true })')
    expect(productTourSource).toContain('const tourSteps = getTourSteps(isEventsAccount(accountType))')
    expect(productTourSource).toContain('Event Workspaces')
    expect(productTourSource).toContain('attendee feedback')
    expect(productTourSource).toContain('Open the Event detail surface to manage surveys and view the command center.')
    expect(productTourSource).toContain('live event feedback')
    expect(productTourSource).toContain('Google Review link')
    expect(productTourSource).toContain('Customers can be directed to leave a review')
    expect(productTourSource).toContain('setVisible(shouldAutoStartTour())')
    expect(productTourSource).toContain('autoStartEvaluatedRef.current = true')
    expect(productTourSource).toContain('dismissTour()')
    expect(productTourSource).not.toContain('RUN_EVERY_TIME')
    expect(productTourSource).toContain('This permanently deletes the Event and its attendee responses.')
    expect(productTourSource).toContain('This permanently deletes the survey and its responses.')
  })

  it('loads event intelligence without making it a page-blocking fetch', () => {
    const intelligenceFetchBlock = eventDashboardPageSource.match(/const fetchIntelligence = async[\s\S]*?^  \}/m)?.[0] || ''

    expect(eventDashboardPageSource).toContain('const [intelligenceData, setIntelligenceData]')
    expect(eventDashboardPageSource).toContain('const [intelligenceLoading, setIntelligenceLoading]')
    expect(eventDashboardPageSource).toContain('const [intelligenceError, setIntelligenceError]')
    expect(eventDashboardPageSource).toContain('fetchIntelligence()')
    expect(intelligenceFetchBlock).toContain('setIntelligenceError(err instanceof Error ? err.message : \'Unknown error\')')
    expect(intelligenceFetchBlock).toContain('setIntelligenceData(null)')
    expect(intelligenceFetchBlock).not.toContain('setError(')
  })

  it('passes intelligence state into Dashboard2 while preserving existing dashboard inputs', () => {
    const dashboardBlock = eventDashboardPageSource.match(/<Dashboard2[\s\S]*?\/>/)?.[0] || ''

    expect(dashboardBlock).toContain('analysisData={analysisData}')
    expect(dashboardBlock).toContain('signalsData={signalsData}')
    expect(dashboardBlock).toContain('keyInsightsData={keyInsightsData}')
    expect(dashboardBlock).toContain('intelligenceData={intelligenceData}')
    expect(dashboardBlock).toContain('intelligenceLoading={intelligencePending}')
    expect(dashboardBlock).toContain('intelligenceError={intelligenceError}')
    expect(dashboardBlock).toContain('activeIntelligenceFilter={intelligenceFilter}')
    expect(dashboardBlock).toContain('onFilterByTarget={(target) => updateCoverageFilter({')
    expect(dashboardBlock).toContain('onFilterByQuestion={(question) => updateCoverageFilter({')
    expect(dashboardBlock).toContain('onClearIntelligenceFilter={() => updateCoverageFilter(null)}')
  })

  it('keeps event command-center dashboard rendering behind the EVENTS product mode', () => {
    expect(eventDashboardPageSource).toContain("import { isEventsAccount, isRetailAccount } from '@/lib/account-product-mode'")
    expect(eventDashboardPageSource).toContain('const isEventsDashboard = isEventsAccount(analysisData.accountType)')
    expect(eventDashboardPageSource).toContain('const isRetailDashboard = isRetailAccount(analysisData.accountType)')
    expect(eventDashboardPageSource).toContain('{USE_DASHBOARD2 && isEventsDashboard ? (')
    expect(eventDashboardPageSource).toContain('if (isEventsDashboard) {')
    expect(eventDashboardPageSource).toContain("setIntelligenceData(null)")
    expect(eventDashboardPageSource).toContain('if (analysisData && isEventsAccount(analysisData.accountType)) return')
    expect(eventDashboardPageSource).toContain('fetchData(undefined, false)')
    expect(eventDashboardPageSource).toContain("fetchData(undefined, signalsTab === 'intelligence', true)")
    expect(eventDashboardPageSource).toContain('fetchData(undefined, true, true)')
    expect(eventDashboardPageSource).toContain('<RetailSurveyDashboard')
    expect(eventDashboardPageSource).toContain('fetchSignals(undefined, false)')
    expect(eventDashboardPageSource).toContain('fetchSignals(undefined, true)')
  })

  it('redesigns the EVENTS Home into one compact event browser', () => {
    expect(appPageSource).toContain('Your events')
    expect(appPageSource).toContain('function EventsHomeSummaryStrip')
    expect(appPageSource).toContain('Live now')
    expect(appPageSource).toContain('Responses today')
    expect(appPageSource).toContain('Need action')
    expect(appPageSource).toContain('Events')
    expect(appPageSource).toContain('Browse and open every event in this account.')
    expect(appPageSource).toContain('Signals')
    expect(appPageSource).toContain('New event')
    expect(appPageSource).not.toContain('Past events')
    expect(appPageSource).not.toContain('Open workspace')
    // The new operating home only appears for EVENTS accounts.
    expect(appPageSource).toContain('{!isRetail && (')
    expect(appPageSource).toContain('fullWidthContent={!isRetail}')
    expect(appPageSource).toContain('mx-auto w-full max-w-[1280px] px-4 sm:px-6 lg:px-8')
    // Generic prototype cards + stats are gated to retail render, so Events
    // accounts do not render the old workspace/container admin list.
    expect(appPageSource).toContain('{isRetail && (\n      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5 mb-10">')
    expect(appPageSource).toContain('{isRetail && (\n      <section className="mb-10">')
  })

  it('maps EVENTS Home browser rows and actions to event routes without kiosk/QR actions', () => {
    const browserBlock = appPageSource.match(/function EventsHomeBrowser[\s\S]*?function CustomerAdminHomeContent/)?.[0] || ''

    // Each browser row uses the same Event Workspace route as its explicit Open link.
    expect(browserBlock).toContain('...liveEvents.map((event)')
    expect(browserBlock).toContain('const href = `/app/events/${event.id}?account=${accountSlug}`')
    expect(browserBlock).toContain('href={href}')
    expect(browserBlock).toContain('role="link"')
    expect(browserBlock).toContain('tabIndex={0}')
    expect(browserBlock).toContain('aria-label={`Open ${event.name}`}')
    expect(browserBlock).toContain('onClick={() => router.push(href)}')
    expect(browserBlock).toContain("interaction.key === 'Enter' || interaction.key === ' '")
    expect(browserBlock).toContain('interaction.target !== interaction.currentTarget')
    expect(browserBlock).toContain('cursor-pointer')
    // Signals and create-event flows preserve account and event context.
    expect(browserBlock).toContain('const dashboardHref = `/app/events/${event.id}/dashboard?account=${accountSlug}`')
    expect(browserBlock).toContain('href={dashboardHref}')
    expect(browserBlock).toContain('<BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />')
    expect(browserBlock).toContain('onClick={(interaction) => interaction.stopPropagation()}')
    expect(browserBlock.indexOf('href={dashboardHref}')).toBeLessThan(browserBlock.indexOf('href={href}'))
    expect(browserBlock).not.toContain('href={`${href}&tab=surveys`}')
    expect(browserBlock).not.toContain('Surveys &amp; Areas')
    // Survey-level launch/QR belongs on Event detail survey cards, not the event browser row.
    expect(browserBlock).not.toContain('Launch kiosk')
    expect(browserBlock).not.toContain('QR code')
    expect(browserBlock).not.toContain('window.open(kioskPath')
    expect(browserBlock).not.toContain('path={kioskPath}')
    expect(browserBlock).not.toContain('metric?.launch?.kioskPath')
    expect(appPageSource).toContain('const createEventPath = `/app/events/new?account=${accountSlug}`')
    expect(appPageSource).toContain('onClick={() => router.push(createEventPath)}')
    // Existing admin flows remain in source for retail / non-primary areas, but
    // dangerous Delete is not part of the Events operating-home hero.
    expect(appPageSource).toContain('onClick={() => openCopySurveyModal(event, location.id)}')
    expect(appPageSource).toContain('onClick={() => handleSurveyStatusChange(event)}')
    expect(appPageSource).toContain('<SurveyQrCard')
    expect(appPageSource).toContain('metrics.totalResponses')
    expect(appPageSource).not.toContain('Product Launch Activation')
    expect(appPageSource).not.toContain('Spring Experience Summit 2026')
  })

  it('renders an outlined delete control between Signals and Open event on every Events row', () => {
    const browserBlock = appPageSource.match(/function EventsHomeBrowser[\s\S]*?function CustomerAdminHomeContent/)?.[0] || ''

    expect(browserBlock).toContain('data-testid="events-home-delete-event"')
    expect(browserBlock).toContain('aria-label={`Delete ${event.name}`}')
    expect(browserBlock).toContain('<Trash2 className="h-3.5 w-3.5" aria-hidden="true" />')
    expect(browserBlock).toContain('border border-red-400 text-red-600')
    expect(browserBlock.indexOf('href={dashboardHref}')).toBeLessThan(browserBlock.indexOf('data-testid="events-home-delete-event"'))
    expect(browserBlock.indexOf('data-testid="events-home-delete-event"')).toBeLessThan(browserBlock.indexOf('href={href}'))
  })

  it('keeps the Events delete confirmation mounted outside the Retail-only content branch', () => {
    const retailOnlyStart = appPageSource.indexOf('{isRetail && (\n      <>')
    const retailOnlyEnd = appPageSource.lastIndexOf('\n      </>\n      )}')
    const retailOnlyContent = appPageSource.slice(retailOnlyStart, retailOnlyEnd)

    expect(retailOnlyContent).not.toContain('isOpen={!!deleteConfirmEvent}')
  })

  it('cancels Event-list deletion without issuing a delete request', () => {
    const deleteModalBlock = appPageSource.slice(appPageSource.indexOf('isOpen={!!deleteConfirmEvent}'))

    expect(deleteModalBlock).toContain('setDeleteConfirmEvent(null)')
    expect(deleteModalBlock).toContain('Cancel')
    expect(deleteModalBlock).toContain('if (!isRetail) setEventDeleteError(null)')
  })

  it('removes the Event row only after the canonical deletion API succeeds', () => {
    const deleteHandlerBlock = appPageSource.match(/const handleDeleteSurvey = async \(event: Event\) => \{[\s\S]*?\n  \}/)?.[0] || ''

    expect(deleteHandlerBlock).toContain('method: \'DELETE\'')
    expect(deleteHandlerBlock).toContain('body: JSON.stringify({ confirmationName: event.name })')
    expect(deleteHandlerBlock).toContain('if (!res.ok || (!isRetail && !json?.success)) throw new Error')
    expect(deleteHandlerBlock).toContain('events: loc.events.filter((e) => e.id !== event.id)')
    expect(deleteHandlerBlock.indexOf('if (!res.ok || (!isRetail && !json?.success))')).toBeLessThan(deleteHandlerBlock.indexOf('events: loc.events.filter'))
  })

  it('keeps an Event visible and renders an error when Event-list deletion fails', () => {
    const deleteHandlerBlock = appPageSource.match(/const handleDeleteSurvey = async \(event: Event\) => \{[\s\S]*?\n  \}/)?.[0] || ''

    expect(deleteHandlerBlock).toContain("else setEventDeleteError(err instanceof Error ? err.message : 'Failed to delete event')")
    expect(appPageSource).toContain('{!isRetail && eventDeleteError && <p role="alert"')
    expect(deleteHandlerBlock).toContain('events: loc.events.filter((e) => e.id !== event.id)')
  })

  it('keeps all three Events actions together across responsive row layouts', () => {
    const browserBlock = appPageSource.match(/function EventsHomeBrowser[\s\S]*?function CustomerAdminHomeContent/)?.[0] || ''

    expect(browserBlock).toContain('md:grid-cols-[minmax(0,1fr)_auto] md:items-center')
    expect(browserBlock).toContain('flex w-full flex-wrap items-center gap-1.5 sm:w-auto sm:flex-nowrap md:justify-end')
    expect(browserBlock).toContain('shrink-0 items-center justify-center rounded-lg border border-red-400')
  })

  it('renders truthful event-scoped Home metrics from server eventMetrics', () => {
    // Home reads per-event derived metrics from the account API, not account-wide
    // or legacy UI-only counters.
    expect(appPageSource).toContain('const eventMetrics = data.eventMetrics ?? {}')
    expect(appPageSource).toContain('const metric = eventMetrics[event.id] ?? null')
    // Responses today is today's count, not all-time totalResponses.
    expect(appPageSource).toContain('const responsesTodayCount = metrics.responsesToday ?? 0')
    expect(appPageSource).toContain('responsesTodayCount={responsesTodayCount}')
    // Need action comes from real open attention items across live events.
    expect(appPageSource).toContain('const needActionCount = metrics.needActionCount ?? 0')
    expect(appPageSource).toContain('needActionCount={needActionCount}')
    // Browser-row responses/attention are event-scoped.
    expect(appPageSource).toContain('{metric?.responses ?? 0}')
    expect(appPageSource).toContain('{metric?.surveyCount ?? 0}')
    expect(appPageSource).toContain('{metric?.liveSurveyCount ?? 0}')
    expect(appPageSource).toContain('{metric?.draftSurveyCount ?? 0}')
    expect(appPageSource).toContain('{metric?.openAttentionCount ?? 0}')
    // Survey count no longer comes from the legacy questionsJson array length.
    expect(appPageSource).not.toContain('questionsJson.length')
  })

  it('renders all events once through the same grouped collection used for counts', () => {
    expect(appPageSource).toContain("import { groupEventsForHome } from '@/lib/events-home-groups'")
    expect(appPageSource).toContain('const eventBuckets = groupEventsForHome(realEvents)')
    expect(appPageSource).toContain('const liveEvents = eventBuckets.live')
    expect(appPageSource).toContain('const upcomingEvents = eventBuckets.upcoming')
    expect(appPageSource).toContain('const pastEvents = eventBuckets.past')
    expect(appPageSource).toContain('liveCount={liveEvents.length}')
    expect(appPageSource).toContain('...liveEvents.map((event) => ({ event, bucket:')
    expect(appPageSource).toContain('data-testid="events-home-event-entry"')
    expect(appPageSource).not.toContain('data-testid="events-home-live-card"')
    expect(appPageSource).not.toContain('function EventsHomeLiveCard')
    expect(appPageSource).not.toContain('const featuredLiveEvent = liveEvents[0]')
  })

  it('keeps New Event in the header or no-events empty state, not as a fake event card', () => {
    expect(appPageSource).toContain('onClick={() => router.push(createEventPath)}')
    expect(appPageSource).toContain('title="No events yet"')
    expect(appPageSource).toContain("actions={[{ label: 'New event', href: createEventPath, variant: 'primary' }]}")
    expect(appPageSource).not.toContain('data-testid="events-home-create-cta"')
    expect(appPageSource).not.toContain('No upcoming events scheduled.')
    expect(appPageSource).not.toContain('Start setup')
  })

  it('uses one compact Events browser for switching, filtering, and event actions', () => {
    expect(appPageSource).toContain('type EventsHomeFilter =')
    expect(appPageSource).toContain('function EventsHomeBrowser')
    expect(appPageSource).toContain('data-testid="events-home-browser"')
    expect(appPageSource).toContain('data-testid="events-home-all-events-list"')
    expect(appPageSource).toContain('data-testid="events-home-event-entry"')
    expect(appPageSource).toContain('Browse and open every event in this account.')
    expect(appPageSource).toContain('placeholder="Search events"')
    expect(appPageSource).toContain("const tabs: Array<{ value: EventsHomeFilter; label: string; count: number }>")
    expect(appPageSource).toContain('Signals')
    expect(appPageSource).not.toContain('Surveys &amp; Areas')
  })

  it('keeps the Events Home on the platform typography system', () => {
    expect(appPageSource).not.toContain('next/font')
    expect(appPageSource).not.toContain('fontFamily')
    expect(appPageSource).not.toContain('font-family')
    expect(appPageSource).not.toContain('font-black')
    expect(appPageSource).not.toContain('tracking-[0.24em]')
    expect(appPageSource).toContain('font-bold tracking-tight text-slate-950')
    expect(appPageSource).toContain('text-xs font-semibold text-slate-500')
  })

  it('keeps the Events Home browser compact and operator-dense', () => {
    expect(appPageSource).toContain('md:grid-cols-[minmax(0,1fr)_auto] md:items-center')
    expect(appPageSource).toContain('grid cursor-pointer gap-3 px-4 py-4')
    expect(appPageSource).toContain('flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs font-semibold')
    expect(appPageSource).not.toContain('sm:grid-cols-5 xl:justify-end')
    expect(appPageSource).toContain('inline-flex h-8 items-center justify-center gap-1.5')
    expect(appPageSource).toContain('text-2xl font-bold tracking-tight text-slate-950')
  })

  it('keeps event-only drilldown API usage inside the EVENTS Dashboard2 surface', () => {
    // The old per-evidence drilldown endpoint was removed with the evidence
    // drawer; evidence now lives in the selected issue pane and the inline theme
    // panel. Only theme + cluster-status drilldowns remain.
    expect(dashboard2Source).not.toContain('/api/app/events/${eventId}/evidence/${selectedEvidenceId}')
    expect(dashboard2Source).toContain('/api/app/events/${eventId}/themes/${encodeURIComponent(selectedThemeKey)}/evidence?${params.toString()}')
    expect(dashboard2Source).toContain('/api/app/events/${eventId}/clusters/${clusterId}/status?account=${encodeURIComponent(accountSlug)}')
    expect(eventDashboardPageSource).toContain('{USE_DASHBOARD2 && isEventsDashboard ? (')
    expect(eventDashboardPageSource).toContain('<Dashboard2')
    expect(eventDashboardPageSource).toContain('<RetailSurveyDashboard')
  })
})
