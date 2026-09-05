import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const dashboardPageSource = fs.readFileSync(
  path.join(process.cwd(), 'app/app/events/[eventId]/dashboard/page.tsx'),
  'utf8',
)

describe('EVENTS command center live refresh', () => {
  it('adds a manual refresh and EVENTS-only polling owned by the page', () => {
    expect(dashboardPageSource).toContain('const refreshDashboard = async () =>')
    expect(dashboardPageSource).toContain('DASHBOARD_REFRESH_INTERVAL_MS')
    // Polling re-uses the existing cacheBust-aware fetch functions.
    expect(dashboardPageSource).toContain('fetchData({ cacheBust, selection: dashboardSelection, preserveContent: true })')
    expect(dashboardPageSource).toContain('fetchSignals(dashboardSelection, cacheBust)')
    expect(dashboardPageSource).toContain('fetchIntelligence(dashboardSelection, cacheBust)')
  })

  it('guards refresh and polling behind the EVENTS product boundary', () => {
    expect(dashboardPageSource).toContain('if (!analysisData || !isEventsAccount(analysisData.accountType)) return')
    // Manual refresh + auto-refresh controls only render on the EVENTS dashboard.
    expect(dashboardPageSource).toContain('if (isEventsDashboard) {')
    expect(dashboardPageSource).toContain('setAutoRefresh')
  })

  it('cleans up the polling interval to avoid duplicate requests', () => {
    expect(dashboardPageSource).toContain('const intervalId = setInterval(')
    expect(dashboardPageSource).toContain('return () => clearInterval(intervalId)')
    // Guards against overlapping refreshes.
    expect(dashboardPageSource).toContain('if (refreshInFlightRef.current) return')
    expect(dashboardPageSource).toContain('refreshInFlightRef.current = true')
    expect(dashboardPageSource).toContain('refreshInFlightRef.current = false')
  })

  it('shows a last-updated / refreshing state without a full reload', () => {
    expect(dashboardPageSource).toContain('lastRefreshedAt')
    expect(dashboardPageSource).toContain("'Refreshing...'")
    // cacheBust refreshes must not toggle the full-page loading state.
    expect(dashboardPageSource).toContain('if (!cacheBust && !preserveContent) setLoading(true)')
    expect(dashboardPageSource).toContain('if (requestId === fetchDataRequestIdRef.current && !bootstrap && !cacheBust && !preserveContent) setLoading(false)')
  })

  it('loads the canonical Intelligence tab with the former Overview data model', () => {
    expect(dashboardPageSource).toContain("const needsFullDashboardMetrics = !bootstrap && signalsTab === 'intelligence'")
    expect(dashboardPageSource).toContain("signalsTab !== 'intelligence'")
    expect(dashboardPageSource).toContain('loadDashboardJson')
    expect(dashboardPageSource).toContain("kind: 'intelligence'")
  })

  it('keeps the initial Intelligence render in a loading state until data or an error arrives', () => {
    expect(dashboardPageSource).toContain("signalsTab === 'intelligence' && !intelligenceData && !intelligenceError")
    expect(dashboardPageSource).toContain('intelligenceLoading={intelligencePending}')
  })

  it('renders Events Signals in the shared shell while retaining AdminLayout for SMB', () => {
    expect(dashboardPageSource).toContain('if (isEventsDashboard)')
    expect(dashboardPageSource).toContain('<EventWorkspaceShell')
    expect(dashboardPageSource).toContain('activeSection="signals"')
    expect(dashboardPageSource).toContain('eventName={analysisData.eventName}')
    expect(dashboardPageSource).toContain("import { getEventDisplayStatusForPhase, type EventLifecyclePhase } from '@/lib/events-home-groups'")
    expect(dashboardPageSource).toContain("eventStatus={getEventDisplayStatusForPhase(analysisData.defaultLifecyclePhase ?? 'PRE_EVENT')}")
    expect(dashboardPageSource).not.toContain('eventStatus={analysisData.eventStatus}')
    expect(dashboardPageSource).toContain('return <AdminLayout homePath={accountPath}>{dashboardBody}</AdminLayout>')
    expect(dashboardPageSource).not.toContain('Back to Workspace')
  })

  it('uses account context to keep Events loading and error states inside the shared shell', () => {
    expect(dashboardPageSource).toContain('loadAccountContext(accountSlug)')
    expect(dashboardPageSource).toContain('accountContext && isEventsAccount(accountContext.accountType)')
    expect(dashboardPageSource).toContain('error={error || \'Unable to load event data\'}')
    expect(dashboardPageSource).toContain('Loading event workspace…')
  })

  it('renders refresh and auto-refresh as clean pills with a live status dot', () => {
    expect(dashboardPageSource).toContain('rounded-full border border-slate-200 bg-white')
    expect(dashboardPageSource).toContain("autoRefresh ? 'bg-emerald-500' : 'bg-slate-300'")
    expect(dashboardPageSource).toContain("{autoRefresh ? 'Auto-refresh on' : 'Auto-refresh off'}")
  })

  it('puts canonical Intelligence and one filter model beneath the shared event title', () => {
    expect(dashboardPageSource).toContain('data-testid="signals-overview-filter-bar"')
    expect(dashboardPageSource.match(/\{analysisData\.eventName\}/g)).toHaveLength(1)
    expect(dashboardPageSource).not.toContain('Operator-ready patterns, attention items, and evidence from live attendee answers.')
    expect(dashboardPageSource).toContain('text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Survey')
    expect(dashboardPageSource).toContain('Event Area / listening point')
    expect(dashboardPageSource).toContain('All Event Areas and listening points')
    expect(dashboardPageSource).toContain("{ value: 'AREA', label: 'Location', groupLabel: 'Locations' }")
  })

  it('uses one compact searchable dropdown system for Survey and Area filters', () => {
    expect(dashboardPageSource).toContain('const FILTER_DROPDOWN_MENU_CLASS')
    expect(dashboardPageSource).toContain('const FILTER_DROPDOWN_SEARCH_CLASS')
    expect(dashboardPageSource).toContain('function FilterDropdownTrigger')
    expect(dashboardPageSource).toContain('function StructureDropdownMenu')
    expect(dashboardPageSource).toContain('label="Survey"')
    expect(dashboardPageSource).toContain('label="Area"')
    expect(dashboardPageSource).toContain('placeholder="Search surveys"')
    expect(dashboardPageSource).toContain('placeholder="Search areas and targets"')
    expect(dashboardPageSource).toContain('section: group.groupLabel')
    expect(dashboardPageSource).not.toContain('<select')
  })

  it('puts the PRE survey control in the Signals toolbar while retaining shared scope controls for During and Post', () => {
    expect(dashboardPageSource).toContain('const intelligenceScopeControls = (')
    expect(dashboardPageSource).toContain("data-testid={isPreEventIntelligence ? 'pre-event-intelligence-toolbar' : undefined}")
    expect(dashboardPageSource).toContain('data-testid="pre-event-intelligence-survey-control"')
    expect(dashboardPageSource).toContain('{!isPreEventIntelligence && intelligenceScopeControls}')
    expect(dashboardPageSource.indexOf('pre-event-intelligence-survey-control')).toBeLessThan(dashboardPageSource.indexOf('isPreEventIntelligence ? <EventPreEventSignals'))
    expect(dashboardPageSource).not.toContain('pre-event-intelligence-filters')
    expect(dashboardPageSource).not.toContain('scopeControls={intelligenceScopeControls}')
  })

  it('renders pre-event intelligence from the canonical read model and keeps the shared Signals tabs', () => {
    expect(dashboardPageSource).toContain("effectiveLifecyclePhase === 'PRE_EVENT'")
    expect(dashboardPageSource).toContain('isPreEventIntelligence ? <EventPreEventSignals')
    expect(dashboardPageSource).toContain("survey.collectionPhase === 'PRE'")
    expect(dashboardPageSource).toContain('surveys={surveysForCurrentLifecycle}')
    expect(dashboardPageSource).toContain("dashboardSelection.lifecycle !== 'in-event'")
    expect(dashboardPageSource).toContain('fetchIntelligence(dashboardSelection)')
    expect(dashboardPageSource).toContain('serializeEventDashboardRequest({')
    expect(dashboardPageSource).toContain('!isPreEventIntelligence && <div')
    expect(dashboardPageSource).toContain("effectiveLifecyclePhase !== 'IN_EVENT'")
    expect(dashboardPageSource).toContain('pre-event-intelligence-survey-control')
    expect(dashboardPageSource).not.toContain('Confirm the agenda, listening plan, surveys, deployment, and speaker collection before evidence arrives.')
    expect(dashboardPageSource).not.toContain('Evidence-backed priorities, strengths, coverage, and follow-up for the event team.')
    expect(dashboardPageSource).toContain("['intelligence', 'Intelligence']")
    expect(dashboardPageSource).not.toContain("['overview', 'Overview']")
    expect(dashboardPageSource).toContain("['event-areas', 'Event Areas']")
    expect(dashboardPageSource).toContain('aria-label="Intelligence scope"')
    expect(dashboardPageSource).toContain("['raw-responses', 'Raw Responses']")
    expect(dashboardPageSource).toContain("['actions', 'Actions']")
    expect(dashboardPageSource).toContain("activeSignalsTabRef.current?.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'center' })")
    expect(dashboardPageSource).toContain('}, [loading, signalsTab])')
  })

  it('keeps post-event in its dedicated closing-brief surface while retaining session and speaker scopes', () => {
    expect(dashboardPageSource).toContain("effectiveLifecyclePhase === 'POST_EVENT'")
    expect(dashboardPageSource).toContain('isPostEventLifecycle && analysisData.postEventClosingBrief ? <EventPostEventClosingBrief')
    expect(dashboardPageSource).toContain('data-testid="intelligence-scope-controls"')
    expect(dashboardPageSource).toContain("effectiveLifecyclePhase !== 'IN_EVENT'")
    expect(dashboardPageSource).not.toContain('EventBriefAction')
    expect(dashboardPageSource).not.toContain('Post-event closing brief')
    expect(dashboardPageSource).toContain('<EventSessionsIntelligence eventId={eventId} accountSlug={accountSlug ?? \'\'} />')
    expect(dashboardPageSource).toContain('<EventSpeakersIntelligence eventId={eventId} accountSlug={accountSlug ?? \'\'} />')
    expect(dashboardPageSource).toContain("eventStatus={getEventDisplayStatusForPhase(analysisData.defaultLifecyclePhase ?? 'PRE_EVENT')}")
    expect(dashboardPageSource).not.toContain('Close the event with evidenced outcomes, unresolved follow-through, and learning for the next event.')
  })

  it('places the lifecycle-appropriate controls before the distinct PRE, DURING, and POST content branches', () => {
    const dashboardStart = dashboardPageSource.indexOf('<Dashboard2')
    expect(dashboardStart).toBeGreaterThan(-1)
    expect(dashboardPageSource.indexOf('{!isPreEventIntelligence && intelligenceScopeControls}')).toBeLessThan(dashboardStart)
    expect(dashboardPageSource.indexOf('{!isPreEventIntelligence && intelligenceScopeControls}')).toBeLessThan(dashboardPageSource.indexOf('<EventPreEventSignals'))
    expect(dashboardPageSource.indexOf('{!isPreEventIntelligence && intelligenceScopeControls}')).toBeLessThan(dashboardPageSource.indexOf('<EventPostEventClosingBrief'))
    expect(dashboardPageSource).toContain('isPreEventIntelligence ? <EventPreEventSignals')
    expect(dashboardPageSource).toContain('isPostEventLifecycle && analysisData.postEventClosingBrief ? <EventPostEventClosingBrief')
  })

  it('passes lifecycle state to render the dedicated Post-event Actions workspace', () => {
    expect(dashboardPageSource).toContain('isPostEvent={isPostEventLifecycle}')
  })

  it('keeps the lifecycle switcher local to the Advanced Events demo and sends only its dev override to the lifecycle APIs', () => {
    expect(dashboardPageSource).toContain('advanced-demo-lifecycle-switcher')
    expect(dashboardPageSource).toContain('isLocalAdvancedDemoLifecycleEnvironment')
    expect(dashboardPageSource).toContain('DEV_LIFECYCLE_QUERY_PARAM')
    expect(dashboardPageSource).toContain('resolveLocalAdvancedDemoLifecycleOverride')
    expect(dashboardPageSource).toContain('[DEV_LIFECYCLE_QUERY_PARAM]: value')
    expect(dashboardPageSource).toContain('analysisParams.set(DEV_LIFECYCLE_QUERY_PARAM, devLifecycleOverride)')
    expect(dashboardPageSource).toContain('params.set(DEV_LIFECYCLE_QUERY_PARAM, devLifecycleOverride)')
  })

  it('removes view-specific drilldown state when switching Signals tabs', () => {
    expect(dashboardPageSource).toContain("if (tab !== 'intelligence')")
    expect(dashboardPageSource).toContain("query.delete('evidenceStrength')")
    expect(dashboardPageSource).toContain("query.delete('surveyTargetId')")
    expect(dashboardPageSource).toContain("if (tab !== 'actions')")
    expect(dashboardPageSource).toContain("query.delete('actionId')")
  })

  it('uses navigable URL state for Signals tabs and Intelligence filters', () => {
    expect(dashboardPageSource).toContain("import Link from 'next/link'")
    expect(dashboardPageSource).toContain('aria-label="Signals views"')
    expect(dashboardPageSource).toContain("requestedSignalsTab === 'sessions' ? 'sessions'")
    expect(dashboardPageSource).toContain("query.set('tab', tab)")
    expect(dashboardPageSource).toContain("requestedSignalsTab === 'intelligence' || requestedSignalsTab === 'raw-responses' || requestedSignalsTab === 'actions'")
    expect(dashboardPageSource).toContain("searchParams.get('evidenceStrength')")
    expect(dashboardPageSource).toContain("searchParams.get('surveyTargetId')")
    expect(dashboardPageSource).toContain("searchParams.get('questionId')")
    expect(dashboardPageSource).toContain('buildDashboardQueryPath({ evidenceStrength: strength })')
    expect(dashboardPageSource).toContain('updateCoverageFilter(null)')
  })

  it('preserves the Event shell and resolved context during tab and lifecycle navigation', () => {
    expect(dashboardPageSource).toContain('prefetch={false}')
    expect(dashboardPageSource).toContain('if (!cacheBust && !preserveContent) setLoading(true)')
    expect(dashboardPageSource).toContain('preserveContent: analysisScope === \'full\'')
    expect(dashboardPageSource).toContain("}, [eventId, accountSlug])")
    expect(dashboardPageSource).toContain('}, [accountSlug])')
    expect(dashboardPageSource).not.toContain('}, [accountSlug, signalsTab])')
    expect(dashboardPageSource).not.toContain('}, [eventId, accountSlug, requestedLifecycleView])')
  })

  it('has no lifecycle selector and removes old lifecycle queries during normal navigation', () => {
    expect(dashboardPageSource).not.toContain('Lifecycle preview')
    expect(dashboardPageSource).not.toContain('parseEventWorkspaceLifecycleView')
    expect(dashboardPageSource).toContain("query.delete('lifecycle')")
  })

  it('hydrates canonical scope only after selector metadata is available', () => {
    expect(dashboardPageSource).toContain("signalsTab === 'intelligence' && (!surveyOptionsLoaded || !structureOptionsLoaded)")
    expect(dashboardPageSource).toContain('hydrateEventDashboardSelection({')
    expect(dashboardPageSource).toContain('applyEventDashboardSelectionToUrl(')
    expect(dashboardPageSource).not.toContain('includeEventStructureScope')
  })

  it('routes session intelligence through the Intelligence scope control', () => {
    expect(dashboardPageSource).toContain("type SignalsWorkspaceTab = 'intelligence' | 'raw-responses' | 'actions'")
    expect(dashboardPageSource).toContain("intelligenceScope === 'sessions' ?")
    expect(dashboardPageSource).toContain('<EventSessionsIntelligence eventId={eventId} accountSlug={accountSlug ?? \'\'} />')
    expect(dashboardPageSource).toContain("{ type: 'set-intelligence-scope', intelligenceScope: scope }")
  })

  it('routes a URL-backed Events-only Actions tab to the canonical action workspace', () => {
    expect(dashboardPageSource).toContain("type SignalsWorkspaceTab = 'intelligence' | 'raw-responses' | 'actions'")
    expect(dashboardPageSource).toContain("requestedSignalsTab === 'actions'")
    expect(dashboardPageSource).toContain("['actions', 'Actions']")
    expect(dashboardPageSource).toContain("signalsTab === 'actions' ? (")
    expect(dashboardPageSource).toContain("<EventActionsWorkspace eventId={eventId} accountSlug={accountSlug ?? ''} isPostEvent={isPostEventLifecycle} />")
  })

  it('routes Raw Responses to the event-scoped evidence browser', () => {
    expect(dashboardPageSource).toContain("requestedSignalsTab === 'raw-responses'")
    expect(dashboardPageSource).toContain("['raw-responses', 'Raw Responses']")
    expect(dashboardPageSource).toContain("signalsTab === 'raw-responses' ? (")
    expect(dashboardPageSource).toContain("<EventRawResponsesWorkspace eventId={eventId} accountSlug={accountSlug ?? ''} surveyId={rawSelectedSurveyId}")
    expect(dashboardPageSource).toContain('onScopeChange={handleRawEvidenceScopeChange}')
    expect(dashboardPageSource).toContain('onStructureScopeChange={handleRawStructureScopeChange}')
  })

  it('uses tab navigation as the page identity without duplicate body headings', () => {
    expect(dashboardPageSource).toContain("['intelligence', 'Intelligence']")
    expect(dashboardPageSource).toContain("['raw-responses', 'Raw Responses']")
    expect(dashboardPageSource).toContain("['actions', 'Actions']")
    expect(dashboardPageSource).not.toContain("{{ intelligence: 'Intelligence', 'raw-responses': 'Raw Responses', actions: 'Actions' }[signalsTab]")
    expect(dashboardPageSource).not.toContain('>Signals</p>')
  })

  it('does not duplicate the selected Pre-event lifecycle as a header pill', () => {
    expect(dashboardPageSource).toContain('isPreEventLifecycle || isPostEventLifecycle ? null')
    expect(dashboardPageSource).not.toContain("'Pre-event readiness\n             </span>")
  })
})
