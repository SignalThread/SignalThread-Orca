import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { buildEventVoiceSurveyCreatePayload } from '@/lib/event-survey-builder-payload'

const detailPageSource = fs.readFileSync(
  path.join(process.cwd(), 'app/app/events/[eventId]/page.tsx'),
  'utf8',
)
const eventAreasSource = fs.readFileSync(
  path.join(process.cwd(), 'components/events/EventAreasWorkspace.tsx'),
  'utf8',
)
const deploymentWorkspaceSource = fs.readFileSync(
  path.join(process.cwd(), 'components/events/EventDeploymentWorkspace.tsx'),
  'utf8',
)

const dashboardPageSource = fs.readFileSync(
  path.join(process.cwd(), 'app/app/events/[eventId]/dashboard/page.tsx'),
  'utf8',
)

const globalStyles = fs.readFileSync(path.join(process.cwd(), 'app/globals.css'), 'utf8')

describe('event detail page', () => {
  it('uses the compact shared Events typography roles across overview and deployment', () => {
    expect(globalStyles).toContain("font-family: var(--font-montserrat)")
    for (const role of ['event-type-page-title', 'event-type-summary', 'event-type-section-title', 'event-type-row-title', 'event-type-meta', 'event-type-control', 'event-type-pill']) {
      expect(globalStyles).toContain(`.${role}`)
    }
    expect(detailPageSource).toContain('event-type-page-title')
    expect(deploymentWorkspaceSource).toContain('event-type-row-title')
    expect(deploymentWorkspaceSource).toContain('event-type-meta')
  })

  it('keeps Event Area assignment in Operations with the shared survey picker', () => {
    expect(detailPageSource).toContain('<EventAreasWorkspace')
    expect(eventAreasSource).toContain('<EventSurveyLibraryPicker')
    expect(eventAreasSource).toContain("targetType: 'AREA'")
  })

  it('passes the complete event-scoped survey inventory into Event Areas', () => {
    expect(detailPageSource).toContain('The picker inventory is definition/event scoped')
    expect(detailPageSource).toContain('const availableAreaSurveys: SurveyLibraryItem[] = surveys')
    expect(detailPageSource).not.toContain(".filter((survey) => survey.target?.category !== 'SPEAKER' && survey.target?.category !== 'SESSION')")
    expect(detailPageSource).toContain('structureItemIds: surveys.find((candidate) => candidate.id === survey.id)?.assignmentTargets')
  })

  it('renders the shared Event workspace identity instead of a duplicate page header', () => {
    expect(detailPageSource).toContain('function EventDetailContent()')
    expect(detailPageSource).toContain('`/api/app/events/${eventId}?account=${accountSlug}`')
    expect(detailPageSource).toContain('<EventWorkspaceShell')
    expect(detailPageSource).toContain('activeSection="setup"')
    expect(detailPageSource).toContain('eventName={event.name}')
    expect(detailPageSource).toContain('eventStatus={getEventDisplayStatus({ ...event, timezone: event.location?.timezone })}')
    expect(detailPageSource).not.toContain('aria-label="Breadcrumb"')
    expect(detailPageSource).not.toContain('>{event.name}</h1>')
    expect(detailPageSource).not.toContain('{event.description}')
    expect(detailPageSource).toContain('<EventTemplateSurveyWorkspace')
    expect(detailPageSource).not.toContain('<Dashboard2')
  })

  it('uses the permanent Signals navigation instead of a disconnected command-center CTA', () => {
    expect(detailPageSource).toContain('const dashboardPath = (() => {')
    expect(detailPageSource).toContain('return `/app/events/${eventId}/dashboard${suffix ? `?${suffix}` : \'\'}`')
    expect(detailPageSource).not.toContain('Open Command Center')
    expect(detailPageSource).toContain('EventWorkspaceShell')
    expect(detailPageSource).not.toContain('View Dashboard')
  })

  it('routes non-EVENTS accounts back to the nested dashboard path', () => {
    expect(detailPageSource).toContain("import { isEventsAccount } from '@/lib/account-product-mode'")
    expect(detailPageSource).toContain('if (!isEventsAccount(account.accountType))')
    expect(detailPageSource).toContain('router.replace(dashboardPath)')
  })

  it('keeps historical event types on the existing workspace path', () => {
    expect(detailPageSource).toContain('eventType: string')
    expect(detailPageSource).toContain('templateKey?: string | null')
    expect(detailPageSource).toContain('`/api/app/events/${eventId}?account=${accountSlug}`')
    expect(detailPageSource).not.toContain("event.eventType === 'CONFERENCE'")
    expect(detailPageSource).not.toContain("event.eventType === 'LEGACY'")
    expect(detailPageSource).toContain("import { getEventWorkspaceExperience, isEventCreationType } from '@/lib/event-creation-type'")
    expect(detailPageSource).toContain('const workspaceExperience = getEventWorkspaceExperience(event)')
  })

  it('uses the Simple workspace as the event home while reusing the existing deployment workspace', () => {
    expect(detailPageSource).toContain("const isSimpleEvent = workspaceExperience === 'SIMPLE'")
    expect(detailPageSource).toContain('<SimpleEventWorkspace')
    expect(detailPageSource).toContain("activeTab === 'deploy'")
    expect(detailPageSource).toContain('<EventDeploymentWorkspace')
    expect(detailPageSource).toContain('onDone={() => router.push(accountSlug ? `/app/events/${eventId}?account=${encodeURIComponent(accountSlug)}` : `/app/events/${eventId}`)}')
  })

  it('guides only empty TEMPLATE events into agenda-and-areas setup without promising Area import', () => {
    expect(detailPageSource).toContain("const isTemplateEvent = workspaceExperience === 'TEMPLATE'")
    expect(detailPageSource).toContain('const isTemplateAgendaSetup = isTemplateEvent && agendaSessionCount === 0')
    expect(detailPageSource).toContain('Set up your event')
    expect(detailPageSource).toContain('Upload your agenda, then add Event Areas as needed.')
    expect(detailPageSource).toContain('onClick={openTemplateAgendaImport}>Upload agenda</Button>')
    expect(detailPageSource).toContain('const openTemplateManualSetup = () =>')
    expect(detailPageSource).toContain('setShowAreaCreate(true)')
    expect(detailPageSource).toContain("['Upload agenda & areas', 'Review sessions, speakers & areas', 'Confirm event setup']")
    expect(detailPageSource).toContain('templateAgendaSetup={isTemplateAgendaSetup}')
  })

  it('uses exactly the four consolidated top-level workspace destinations', () => {
    const tabsBlock = detailPageSource.match(/const eventTabs = \[([\s\S]*?)\n  \]/)?.[1] || ''

    expect(tabsBlock).toContain("{ key: 'overview', label: 'Overview' }")
    expect(tabsBlock).toContain("{ key: 'operations', label: 'Operations' }")
    expect(tabsBlock).toContain("{ key: 'surveys', label: 'Surveys', count: surveyCount }")
    expect(tabsBlock).toContain("{ key: 'deploy', label: 'Deploy' }")
    expect(tabsBlock).not.toContain("key: 'agenda'")
    expect(tabsBlock).not.toContain("key: 'areas'")
    expect(tabsBlock).not.toContain("key: 'speakers'")
  })

  it('passes a Surveys-row deployment selection into the existing QR deployment workspace', () => {
    expect(detailPageSource).toContain('initialSurveyId={searchParams.get(\'deploySurvey\')}')
  })

  it('uses the three Operations summary cards as the only content navigation', () => {
    const operationsBlock = detailPageSource.match(/\{activeTab === 'operations' && \([\s\S]*?\n        \)\}/)?.[0] || ''

    expect(operationsBlock).toContain('Manage your event setup and agenda.')
    expect(operationsBlock).toContain('startOperationsAgendaImport')
    expect(operationsBlock).toContain('startOperationsSessionCreate')
    expect(operationsBlock).toContain('>Import agenda</Button>')
    expect(operationsBlock).toContain('>Add session</Button>')
    expect(operationsBlock).toContain("startOperationsSpeakerAction('library')")
    expect(operationsBlock).toContain("startOperationsSpeakerAction('import')")
    expect(operationsBlock).toContain("startOperationsSpeakerAction('new')")
    expect(operationsBlock).toContain("activeOperationsSection === 'event-areas' && <div className=\"flex shrink-0 flex-wrap gap-2\">")
    expect(operationsBlock).toContain('onClick={() => setShowAreaCreate(true)}>Add Event Area</Button>')
    expect(operationsBlock).toContain('<EventAreasWorkspace')
    expect(operationsBlock).toContain("section: 'sessions' as const, label: 'Sessions', count: agendaSessionCount")
    expect(operationsBlock).toContain("section: 'speakers' as const, label: 'Speakers', count: event._count?.assignedSpeakerCount ?? 0")
    expect(operationsBlock).toContain("section: 'event-areas' as const, label: 'Event Areas', count: eventAreaCount")
    expect(operationsBlock).toContain('data-testid={`operations-section-${summary.section}`}')
    expect(operationsBlock).toContain('aria-pressed={activeOperationsSection === summary.section}')
    expect(operationsBlock).toContain('onClick={() => selectOperationsSection(summary.section)}')
    expect(operationsBlock).toContain("activeOperationsSection !== 'event-areas'")
    expect(operationsBlock).toContain("activeOperationsSection === 'event-areas'")
    expect(operationsBlock).toContain('<EventAgendaWorkspace')
    expect(operationsBlock).toContain('<EventAreasWorkspace')
    expect(operationsBlock).not.toContain('id="event-areas-title"')
    expect(operationsBlock).not.toContain('Define where you want to collect feedback across the event.')
    expect(operationsBlock).not.toContain('Agenda views')
    expect(operationsBlock).not.toContain("label: 'Missing details'")
    expect(operationsBlock).not.toContain("label: 'Collecting'")
  })

  it('normalizes legacy Agenda and Event Areas links into Operations without breaking deep links', () => {
    expect(detailPageSource).toContain("['agenda', 'areas', 'speakers'].includes(requestedTabValue)")
    expect(detailPageSource).toContain("query.set('tab', 'operations')")
    expect(detailPageSource).toContain("query.set('operationsView', 'speakers')")
    expect(detailPageSource).toContain("query.delete('agendaView')")
    expect(detailPageSource).toContain("type OperationsSection = 'sessions' | 'speakers' | 'event-areas'")
    expect(detailPageSource).toContain("const activeOperationsSection: OperationsSection = requestedOperationsSection === 'event-areas'")
    expect(detailPageSource).toContain("query.set('operationsSection', 'event-areas')")
    expect(detailPageSource).toContain("query.delete('operationFocus')")
    expect(detailPageSource).toContain('const selectOperationsSection = (section: OperationsSection) =>')
    expect(detailPageSource).toContain("path.searchParams.set('speakerAction', action)")
  })

  it('separates the current-event workflow guide from its actionable overview cards', () => {
    expect(detailPageSource).toContain("import { getEventWorkspaceExperience, isEventCreationType } from '@/lib/event-creation-type'")
    expect(detailPageSource).toContain('const isCurrentEventFramework = isEventCreationType(event.eventType)')
    expect(detailPageSource).toContain(') : isCurrentEventFramework ? (')
    expect(detailPageSource).toContain('Event overview')
    expect(detailPageSource).toContain('const isTemplateEvent = workspaceExperience === \'TEMPLATE\'')
    expect(detailPageSource).toContain('const isTemplateAgendaSetup = isTemplateEvent && agendaSessionCount === 0')
    expect(detailPageSource).toContain('data-testid="event-overview-workflow"')
    expect(detailPageSource).toContain('data-testid="event-overview-action-cards"')
    expect(detailPageSource).toContain('id="event-workflow-title"')
    expect(detailPageSource).toContain('>How it works</h3>')
    expect(detailPageSource).toContain('data-testid="event-overview-continue-setup"')
    expect(detailPageSource).toContain('id="event-continue-setup-title"')
    expect(detailPageSource).toContain('>Continue setup</h3>')
    expect(detailPageSource).toContain("{ id: 'setup', number: 1")
    expect(detailPageSource).toContain("{ id: 'surveys', number: 2")
    expect(detailPageSource).toContain("{ id: 'terms', number: 3")
    expect(detailPageSource).toContain("{ id: 'launch', number: 4")
    expect(detailPageSource).toContain("label: 'Setup'")
    expect(detailPageSource).toContain("action: 'Continue in Setup'")
    expect(detailPageSource).toContain("action: 'Manage surveys'")
    expect(detailPageSource).toContain("action: attendeeExperienceReady ? 'Review T&C' : 'Set up T&C'")
    expect(detailPageSource).toContain("action: 'QR, links & launch'")
    expect(detailPageSource).toContain("onAction: () => selectSetupTab('operations')")
    expect(detailPageSource).toContain('onAction: () => router.push(attendeeExperiencePath)')
    expect(detailPageSource).toContain("query.set('tab', 'consent')")
    expect(detailPageSource).toContain("{ label: 'Agenda', icon: 'agenda' as const }")
    expect(detailPageSource).toContain("{ label: 'Sessions', icon: 'sessions' as const }")
    expect(detailPageSource).toContain("{ label: 'Speakers', icon: 'speakers' as const }")
    expect(detailPageSource).toContain("{ label: 'Event Areas', icon: 'areas' as const }")
    expect(detailPageSource).toContain('Complete the steps in order to launch your event. You can save progress and return later.')
    expect(detailPageSource).not.toContain('Agenda → Surveys → T&amp;C → Launch')
    expect(detailPageSource).toContain('const eventTabs = [')
    expect(detailPageSource).toContain('EventReadinessList items={readinessItems}')

    const workflowBlock = detailPageSource.match(/id="event-workflow-title"[\s\S]*?<\/EventCard>/)?.[0] || ''
    expect(workflowBlock).not.toContain('onAction')
    expect(workflowBlock).not.toContain('step.status')
  })

  it('bases the overview workflow and action-card composition on available workspace width', () => {
    expect(detailPageSource).toContain('className="event-overview-responsive border-slate-200/80 shadow-none dark:border-zinc-800"')
    expect(detailPageSource).toContain('className="event-overview-responsive" data-testid="event-overview-continue-setup"')
    expect(detailPageSource).toContain('className="event-overview-action-grid mt-4 grid gap-3"')
    expect(detailPageSource).not.toContain('md:grid-cols-2 xl:grid-cols-4')
    expect(detailPageSource).not.toContain('md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)]')
    expect(globalStyles).toContain('.event-overview-responsive {\n  container-type: inline-size;\n}')
    expect(globalStyles).toContain('@container (min-width: 67.5rem)')
    expect(globalStyles).toContain('grid-template-columns: repeat(4, minmax(0, 1fr));')
    expect(globalStyles).toContain('@container (min-width: 56rem)')
  })

  it('loads event-only detail data only after account type is confirmed EVENTS', () => {
    // The initial load resolves the account, gates on product type, and only
    // then requests the event-only workspace slices.
    const loadEventBlock = detailPageSource.match(/const loadEvent = useCallback[\s\S]*?\}, \[accountSlug, dashboardPath, eventId, fetchWorkspaceSlices, router\]\)/)?.[0] || ''
    const accountFetchIndex = loadEventBlock.indexOf('loadAccountContext(accountSlug,')
    const productGateIndex = loadEventBlock.indexOf('if (!isEventsAccount(account.accountType))')
    const sliceFetchIndex = loadEventBlock.indexOf('fetchWorkspaceSlices(ALL_WORKSPACE_SLICES)')

    expect(accountFetchIndex).toBeGreaterThan(-1)
    expect(productGateIndex).toBeGreaterThan(accountFetchIndex)
    expect(sliceFetchIndex).toBeGreaterThan(productGateIndex)
    // The slice fetcher owns the event-only endpoints.
    expect(detailPageSource).toContain('`/api/app/events/${eventId}?account=${accountSlug}`')
    expect(detailPageSource).toContain('`/api/app/events/${eventId}/voice-surveys?account=${accountSlug}`')
    expect(detailPageSource).toContain('`/api/app/events/${eventId}/structure?account=${accountSlug}`')
  })

  it('times out stalled workspace requests and exposes a retry action', () => {
    expect(detailPageSource).toContain('WORKSPACE_REQUEST_TIMEOUT_MS = 15_000')
    expect(detailPageSource).toContain("throw new Error(`${label} request timed out. Please retry.`)")
    // Retry issues a real new account-context request instead of joining a stale hung one.
    expect(detailPageSource).toContain('onRetry={() => { void loadEvent({ forceAccountRefresh: true }) }}')
    expect(detailPageSource).toContain('loadAccountContext(accountSlug, { forceRefresh: options.forceAccountRefresh })')
  })

  it('revalidates only the affected workspace slices after setup mutations, never a full reload', () => {
    // Mutation handlers must not re-enter the full loading workflow.
    expect(detailPageSource).not.toContain('await loadEvent()')
    expect(detailPageSource).not.toContain('loadEvent(true)')
    expect(detailPageSource).toContain('const refreshWorkspaceData = useCallback(async (slices: WorkspaceSlice[])')
    // Event Areas owns focused mutations and asks the canonical slice loader
    // to revalidate in place.
    expect(detailPageSource).toContain("onChanged={() => refreshWorkspaceData(['surveys', 'structure', 'listeningPlan'])}")
  })

  it('keeps a successful mutation successful when the follow-up refresh fails', () => {
    // Refresh failures set the stale-view notice; they never re-throw into the
    // mutation catch blocks, wipe loaded data, or flip the workspace to error.
    const refreshBlock = detailPageSource.match(/const refreshWorkspaceData = useCallback[\s\S]*?\}, \[fetchWorkspaceSlices\]\)/)?.[0] || ''
    expect(refreshBlock).toContain('setRefreshFailed(true)')
    expect(refreshBlock).not.toContain('setError(')
    expect(refreshBlock).not.toContain('setEvent(null)')
    expect(refreshBlock).not.toContain('setLoading')
    expect(detailPageSource).toContain('Your change was saved.')
    expect(detailPageSource).toContain('Refresh view')
    // The initial-load failure path no longer wipes already-loaded data either.
    expect(detailPageSource).not.toContain('setSurveys([])\n        setStructureItems([])')
  })

  it('uses the bounded agenda summary for the initial Setup bootstrap', () => {
    expect(detailPageSource).toContain('`/api/app/events/${eventId}/agenda?account=${accountSlug}&summary=1`')
  })

  it('uses the shared event summary for canonical event-scoped Operations counts', () => {
    expect(detailPageSource).toContain("section: 'sessions' as const, label: 'Sessions', count: agendaSessionCount")
    expect(detailPageSource).toContain("section: 'speakers' as const, label: 'Speakers', count: event._count?.assignedSpeakerCount ?? 0")
    expect(detailPageSource).toContain("section: 'event-areas' as const, label: 'Event Areas', count: eventAreaCount")
    expect(detailPageSource).toContain("{ key: 'surveys', label: 'Surveys', count: surveyCount }")
    expect(detailPageSource).toContain("onAgendaChanged={() => { void refreshWorkspaceData(ALL_WORKSPACE_SLICES) }}")
  })

  it('uses survey-first management for every event workspace', () => {
    expect(detailPageSource).toContain('<EventTemplateSurveyWorkspace')
    expect(detailPageSource).not.toContain('<EventSurveyTable surveys={filteredSurveys}')
  })

  it('keeps current Advanced events out of TEMPLATE-only agenda and survey gates', () => {
    expect(detailPageSource).toContain('const eventTabs = [')
    expect(detailPageSource).toContain('const isCurrentEventFramework = isEventCreationType(event.eventType)')
    expect(detailPageSource).toContain('<EventAgendaWorkspace')
    expect(detailPageSource).toContain('<EventTemplateSurveyWorkspace')
  })

  it('coalesces the initial Setup load across React Strict Mode effect replay', () => {
    expect(detailPageSource).toContain('const initialLoadKeyRef = useRef<string | null>(null)')
    expect(detailPageSource).toContain("const loadKey = `${accountSlug ?? ''}:${eventId}`")
    expect(detailPageSource).toContain('if (initialLoadKeyRef.current === loadKey) return')
    expect(detailPageSource).toContain('initialLoadKeyRef.current = loadKey')
  })

  it('loads and renders multiple surveys inside the selected Event', () => {
    expect(detailPageSource).toContain('EventVoiceSurvey')
    expect(detailPageSource).toContain('`/api/app/events/${eventId}/voice-surveys?account=${accountSlug}`')
    expect(detailPageSource).toContain('setSurveys(body.data?.surveys ?? [])')
    expect(detailPageSource).toContain("import { EventTemplateSurveyWorkspace } from '@/components/events/EventTemplateSurveyWorkspace'")
  })

  it('loads existing Survey Focus management inside the final Event Areas tab', () => {
    expect(detailPageSource).toContain('EventStructureItem')
    expect(detailPageSource).toContain('`/api/app/events/${eventId}/structure?account=${accountSlug}`')
    expect(detailPageSource).toContain('setStructureItems(body.data?.items ?? [])')
    expect(detailPageSource).toContain('<EventAreasWorkspace')
    expect(detailPageSource).not.toContain('Define where you want to collect feedback across the event.')
    expect(eventAreasSource).toContain("label: 'Event-wide'")
    expect(eventAreasSource).toContain("label: 'Sponsor activation'")
    expect(eventAreasSource).toContain("label: 'Custom'")
  })

  it('uses the shared survey picker in compact Event Area rows', () => {
    expect(eventAreasSource).toContain('<EventSurveyLibraryPicker')
    expect(eventAreasSource).toContain("attachedSurvey ? 'Change survey' : 'Attach survey'")
    expect(eventAreasSource).toContain("attachedSurvey?.name ?? 'No survey'")
    expect(eventAreasSource).not.toContain('✓ Attached')
  })

  it('creates Event Areas through the nested structure endpoint', () => {
    expect(eventAreasSource).toContain('/structure?account=')
    expect(eventAreasSource).toContain("method: isEditing ? 'PATCH' : 'POST'")
    expect(eventAreasSource).toContain('Create Event Area')
  })

  it('edits and archives Event Areas without implying destructive deletion', () => {
    expect(eventAreasSource).toContain("method: 'DELETE'")
    expect(eventAreasSource).toContain('Archive')
    expect(eventAreasSource).toContain('Archiving...')
  })

  it('keeps the Event Area creator focused on the approved fields', () => {
    expect(eventAreasSource).toContain('Name <span')
    expect(eventAreasSource).toContain('Description <span')
    expect(eventAreasSource).toContain('Survey <span')
    expect(eventAreasSource).not.toContain('datetime-local')
    expect(eventAreasSource).not.toContain('Timezone')
  })

  it('keeps the empty survey state for Event containers without surveys', () => {
    expect(detailPageSource).toContain('<EventTemplateSurveyWorkspace')
  })

  it('uses event-operator language and keeps internal model wording out of the workspace', () => {
    expect(detailPageSource).toContain('attendee feedback')
    expect(detailPageSource).not.toContain('Event pulse')
    expect(detailPageSource).not.toContain('Collection activity')
    expect(detailPageSource).not.toContain('Full insights')
    // No internal model language or retail/SMB wording in the Events UI.
    expect(detailPageSource).not.toMatch(/survey target/i)
    expect(detailPageSource).not.toMatch(/collection target/i)
    expect(detailPageSource).not.toContain('customer feedback')
    expect(detailPageSource).not.toContain('Google Review')
    expect(detailPageSource).not.toContain('storefront')
    expect(detailPageSource).not.toContain('reputation')
  })

  it('routes survey creation to the dedicated Events-only New Survey route', () => {
    expect(detailPageSource).toContain('const newSurveyPath = (structureItemId?: string)')
    expect(detailPageSource).toContain('/surveys/new')
    expect(detailPageSource).toContain("query.set('area', structureItemId)")
    // The index no longer hosts an inline creator or a parallel creation path.
    expect(detailPageSource).not.toContain('handleCreateSurvey')
    expect(detailPageSource).not.toContain('buildEventVoiceSurveyCreatePayload')
    expect(detailPageSource).not.toContain('showCreateSurvey')
    expect(detailPageSource).not.toContain('<QuestionBuilder')
    expect(detailPageSource).not.toContain('Survey Question Voice')
    expect(detailPageSource).not.toContain('Preview Voice')
  })

  it('supports tab deep links so Back to Surveys lands on the Surveys index', () => {
    expect(detailPageSource).toContain("const requestedTab = parseEventSetupTab(requestedTabValue)")
    expect(detailPageSource).toContain("const requestedAgendaView = searchParams.get('agendaView')")
    expect(detailPageSource).toContain('new URL(buildEventSetupTabPath(eventId, accountSlug, tab), window.location.origin)')
    expect(detailPageSource).toContain('router.push(`${path.pathname}${path.search}`)')
    expect(detailPageSource).not.toContain('setActiveTab')
  })

  it('routes incomplete event-detail setup to the canonical Event Settings tab', () => {
    expect(detailPageSource).toContain('tab=event-settings&event=${encodeURIComponent(eventId)}')
    expect(detailPageSource).not.toContain('headerActions={(')
  })

  it('keeps QR, public URLs, and kiosk launch out of the survey index rows', () => {
    expect(detailPageSource).not.toContain('SurveyQrCard')
    expect(detailPageSource).not.toContain('Public launch URL')
    expect(detailPageSource).not.toContain('Launch Kiosk')
    expect(detailPageSource).not.toContain('survey.publicLink.kioskPath')
    // Question text previews and voice configuration stay off the index too.
    expect(detailPageSource).not.toContain('survey.questions.map((question) => question.label)')
    expect(detailPageSource).not.toContain('ttsVoice')
  })

  it('derives the connected readiness hub from current Event data', () => {
    expect(detailPageSource).toContain('const setupReadiness = deriveEventSetupReadiness({')
    expect(detailPageSource).toContain('hasEventDetails: Boolean(event.name.trim() && event.startDate && event.endDate)')
    expect(detailPageSource).toContain('eventAreaCount: structureCount')
    expect(detailPageSource).toContain('agendaSessionCount')
    expect(detailPageSource).toContain('surveyCount')
    expect(detailPageSource).toContain('attendeeExperienceReady')
    expect(detailPageSource).toContain('attendeeConsentConfigured && isAttendeeExperienceConfigured(attendeeConsent)')
    expect(detailPageSource).toContain('setAttendeeConsentConfigured(body.settings?.consentConfigured === true)')
    expect(detailPageSource).toContain('launchableSurveyCount')
    expect(detailPageSource).toContain('uncoveredEventAreaCount: uncoveredStructureCount')
    expect(detailPageSource).toContain('<EventReadinessList items={readinessItems}')
    expect(detailPageSource).toContain('{setupReadiness.readyCount} of {setupReadiness.totalCount} stages ready')
    expect(detailPageSource).not.toContain('5 / 5 ready')
    expect(detailPageSource).toContain('Collection readiness')
    expect(detailPageSource).toContain('Attendee terms & experience')
    expect(detailPageSource).toContain('Configure attendee experience')
    expect(detailPageSource).toContain('`/api/app/account/settings?account=${accountSlug}`')
    expect(detailPageSource).toContain("survey.responseMode === 'VOICE_AND_TEXT'")
    expect(eventAreasSource).toContain("{ kind: 'AREA', label: 'Location'")
    expect(detailPageSource).toContain('launchableSurveyCount')
    expect(detailPageSource).toContain('uncoveredStructureCount')
    expect(eventAreasSource).toContain("attachedSurvey?.name ?? 'No survey'")
    expect(detailPageSource).toContain('activeSection="setup"')
    expect(detailPageSource).not.toContain('Attach a survey to each point where you need attendee feedback.')
    expect(detailPageSource).not.toContain('Event Area${structureCount === 1 ? \'\' : \'s\'} across this event.')
    expect(detailPageSource).not.toContain('Event Setup &amp; Operations')
    // Event-intelligence oriented language, not retail/storefront/Google review copy.
    expect(detailPageSource).toContain('attendee')
    expect(detailPageSource).not.toContain('Google review')
    expect(detailPageSource).not.toContain('storefront')
  })

  it('hosts canonical Survey deployment tools in Deploy without survey-management or readiness coaching', () => {
    expect(detailPageSource).toContain("import { EventDeploymentWorkspace, type EventDeploymentSurvey } from '@/components/events/EventDeploymentWorkspace'")
    expect(detailPageSource).toContain('<EventDeploymentWorkspace')
    expect(detailPageSource).toContain('surveys={surveyDeployments}')
    expect(detailPageSource).toContain('setSurveyDeployments(body.data?.deployments ?? body.data?.surveys ?? [])')
    expect(detailPageSource).not.toContain('(survey): survey is EventVoiceSurvey & { target: NonNullable')
    expect(detailPageSource).toContain('accountBranding={accountBranding}')
    expect(detailPageSource).toContain('survey.readiness.responseEligible')
    expect(deploymentWorkspaceSource).toContain('Manage kiosk access, QR assets, sign design, and print output for each survey.')
    expect(detailPageSource).not.toContain('Prepare attendee links, QR packages, and printable signage from the current Survey lifecycle')
    expect(detailPageSource).not.toContain('<h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">Collection readiness</h2>')
    expect(detailPageSource).not.toContain('<h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">Survey management</h2>')
  })

  it('uses four final workspace tabs without a duplicate Insights tab', () => {
    expect(detailPageSource).toContain("{ key: 'overview', label: 'Overview' }")
    expect(detailPageSource).toContain("{ key: 'surveys', label: 'Surveys', count: surveyCount }")
    expect(detailPageSource).toContain("{ key: 'operations', label: 'Operations' }")
    expect(detailPageSource).toContain("{ key: 'deploy', label: 'Deploy' }")
    // The Command Center has one destination: the header CTA, not a duplicate local tab.
    expect(detailPageSource).not.toContain("label: 'Insights'")
    expect(detailPageSource).not.toContain("label: 'Surveys & Areas'")
  })


  it('derives the workspace status badge from the canonical lifecycle rule', () => {
    expect(detailPageSource).toContain("import { getEventDisplayStatus } from '@/lib/events-home-groups'")
    expect(detailPageSource).toContain('eventStatus={getEventDisplayStatus({ ...event, timezone: event.location?.timezone })}')
    expect(detailPageSource).not.toContain('eventStatus={event.status}')
  })


  it('keeps Pre-event navigation lifecycle-specific while preserving the actual event status', () => {
    expect(dashboardPageSource).toContain('isPreEventIntelligence && analysisData.preEventReadiness')
    expect(dashboardPageSource).toContain("eventStatus={getEventDisplayStatusForPhase(analysisData.defaultLifecyclePhase ?? 'PRE_EVENT')}")
    expect(dashboardPageSource).toContain('isPreview: requestedLifecycleView !== null && requestedLifecycleView !== defaultLifecycleView')
  })

  it('shows exactly one lifecycle status per survey row', () => {
    expect(detailPageSource).toContain('function surveyLifecycleStatus(survey: EventVoiceSurvey)')
    expect(detailPageSource).toContain("if (survey.isArchived) return { key: 'archived', label: 'Archived', tone: 'muted' }")
    expect(detailPageSource).toContain("if (survey.status === 'ACTIVE') return { key: 'live', label: 'Live', tone: 'live' }")
    expect(detailPageSource).toContain("if (survey.status === 'COMPLETED') return { key: 'completed', label: 'Completed', tone: 'muted' }")
    expect(detailPageSource).toContain("return { key: 'draft', label: 'Draft', tone: 'attention' }")
    expect(detailPageSource).toContain('<EventRowStatus statuses={rowActions.statuses}')
    // No second launchable badge and no repeated event status on every row.
    expect(detailPageSource).not.toContain('Active · Launchable')
    expect(detailPageSource).not.toContain('Event: {')
    expect(detailPageSource).not.toContain('Scope: {')
  })

  it('keeps lifecycle and destructive controls off the survey index', () => {
    expect(detailPageSource).not.toContain('handleSetSurveyStatus')
    expect(detailPageSource).not.toContain('handleToggleArchiveSurvey')
    expect(detailPageSource).not.toContain('handleDeleteSurvey')
    expect(detailPageSource).not.toContain('Publish survey')
    expect(detailPageSource).not.toContain('Make draft')
    expect(detailPageSource).not.toContain('Delete survey?')
    expect(detailPageSource).not.toContain('Delete survey?')
  })

  it('delegates survey rendering to the survey-first management workspace', () => {
    expect(detailPageSource).toContain('<EventTemplateSurveyWorkspace')
    expect(detailPageSource).not.toContain('<EventSurveyTable surveys={filteredSurveys}')
  })

  it('leaves target filtering to the deployment drawer rather than the survey index', () => {
    expect(detailPageSource).toContain('<EventTemplateSurveyWorkspace')
    expect(detailPageSource).not.toContain('No surveys match your filters')
  })

  it('keeps the Events detail surface on compact Events primitives', () => {
    expect(detailPageSource).toContain('<EventCard padding="md">')
    expect(detailPageSource).not.toContain('<EventCard padding="lg">')
    expect(detailPageSource).toContain('<EventTemplateSurveyWorkspace')
  })

  it('organizes Setup around URL-backed tabs and full-width readiness', () => {
    expect(detailPageSource).toContain("from '@/components/app/events'")
    expect(detailPageSource).toContain('EventTabs')
    // The Setup overview is a readiness-only surface.
    expect(detailPageSource).toContain('EventCard')
    expect(detailPageSource).toContain('eventStatus={getEventDisplayStatus({ ...event, timezone: event.location?.timezone })}')
    expect(detailPageSource).not.toContain("import { Card } from '@/components/ui/Card'")
    expect(detailPageSource).toContain("const requestedTab = parseEventSetupTab(requestedTabValue)")
    expect(detailPageSource).toContain('const selectSetupTab = (tab: EventSetupTab) =>')
    expect(detailPageSource).not.toContain('EventMetricStrip')
    expect(detailPageSource).toContain('<EventTemplateSurveyWorkspace')
    expect(detailPageSource).toContain('<div className="w-full">')
    expect(detailPageSource).not.toContain('xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]')
    expect(detailPageSource).not.toContain('Event pulse')
    expect(detailPageSource).not.toContain('Collection activity')
    expect(detailPageSource).not.toContain('Full insights')
    // The Event Areas workspace maps the existing AREA kind to the product's Location label.
    expect(eventAreasSource).toContain("{ kind: 'AREA', label: 'Location'")
    expect(detailPageSource).toContain('<EventTabs')
    expect(detailPageSource).toContain("{ key: 'surveys', label: 'Surveys', count: surveyCount }")
    expect(detailPageSource).toContain('<EventTemplateSurveyWorkspace')
    // Each tab gates a real panel.
    expect(detailPageSource).toContain("{activeTab === 'overview' && (")
    expect(detailPageSource).toContain("{activeTab === 'surveys' && (")
    expect(detailPageSource).toContain("{activeTab === 'operations' && (")
    expect(detailPageSource).toContain("{activeTab === 'deploy' && (")
  })

  it('routes each readiness row to a real Setup destination and mounts the canonical Agenda workspace', () => {
    expect(detailPageSource).toContain("onAction: () => selectSetupTab('operations')")
    expect(detailPageSource).toContain("onAction: () => selectSetupTab('operations')")
    expect(detailPageSource).toContain('setupReadiness.agenda.actionLabel')
    expect(detailPageSource).toContain('<EventAgendaWorkspace')
    expect(detailPageSource).toContain('workspace={activeOperationsView}')
    expect(detailPageSource).toContain('onAgendaChanged={() => { void refreshWorkspaceData(ALL_WORKSPACE_SLICES) }}')
    expect(detailPageSource).not.toContain('Agenda import and manual session management are not enabled yet.')
    expect(detailPageSource).not.toContain('Full insights')
    expect(detailPageSource).not.toContain('View Dashboard')
    // Deploy remains the real deployment surface while Agenda is composed into Operations.
    expect(detailPageSource).toContain('<EventDeploymentWorkspace')
    expect(detailPageSource).not.toContain('Settings placeholder')
  })

  it('mounts the one canonical compact Event Areas workspace', () => {
    expect(detailPageSource).toContain('<EventAreasWorkspace')
    expect(detailPageSource).toContain("const eventAreaStructureItems = structureItems.filter((item) => item.kind !== 'SESSION')")
    expect(eventAreasSource).toContain('No Event Areas yet')
    expect(eventAreasSource).toContain("attachedSurvey ? 'Change survey' : 'Attach survey'")
    expect(eventAreasSource).toContain('More actions for ${item.name}')
  })

  it('opens each survey independently from its row', () => {
    // Open resolves to the selected survey, not only the first survey.
    expect(detailPageSource).toContain('<EventTemplateSurveyWorkspace')
    expect(detailPageSource).not.toContain('index === 0')
    expect(detailPageSource).toContain('`/app/events/${eventId}/edit?account=${accountSlug}&survey=${surveyId}`')
  })
})

describe('event survey create payload', () => {
  it('sends selected Survey-level voice fields in the create request payload', () => {
    expect(
      buildEventVoiceSurveyCreatePayload({
        selectedSurveyStructureItemId: '',
        targetCategory: 'SESSION',
        targetName: 'Opening Keynote',
        targetDescription: 'Main stage',
        surveyName: 'Session Pulse',
        surveyDescription: 'Quick feedback',
        ttsProvider: 'google',
        ttsVoice: 'en-GB-Studio-C',
        defaultTtsLocale: 'en-US',
        questions: [{ text: 'What stood out?' }],
      }),
    ).toMatchObject({
      targetCategory: 'SESSION',
      targetName: 'Opening Keynote',
      targetDescription: 'Main stage',
      surveyName: 'Session Pulse',
      surveyDescription: 'Quick feedback',
      ttsProvider: 'google',
      ttsVoice: 'en-GB-Studio-C',
      ttsLocale: 'en-GB',
      questions: [{ prompt: 'What stood out?', displayOrder: 0, required: true }],
    })
  })

  it('can create sibling Event surveys with different selected voices', () => {
    const basePayload = {
      selectedSurveyStructureItemId: 'structure_session',
      targetCategory: 'SESSION' as const,
      targetName: '',
      targetDescription: '',
      surveyName: 'Session Pulse',
      surveyDescription: '',
      ttsProvider: 'google',
      defaultTtsLocale: 'en-US',
      questions: [{ text: 'How was this session?' }],
    }

    const surveyA = buildEventVoiceSurveyCreatePayload({
      ...basePayload,
      ttsVoice: 'en-GB-Studio-C',
    })
    const surveyB = buildEventVoiceSurveyCreatePayload({
      ...basePayload,
      ttsVoice: 'en-AU-Neural2-A',
    })

    expect(surveyA).toMatchObject({
      eventStructureItemId: 'structure_session',
      targetCategory: undefined,
      targetName: undefined,
      ttsProvider: 'google',
      ttsVoice: 'en-GB-Studio-C',
      ttsLocale: 'en-GB',
    })
    expect(surveyB).toMatchObject({
      eventStructureItemId: 'structure_session',
      targetCategory: undefined,
      targetName: undefined,
      ttsProvider: 'google',
      ttsVoice: 'en-AU-Neural2-A',
      ttsLocale: 'en-AU',
    })
  })
})

describe('event dashboard page intelligence filters', () => {
  it('presents the in-event Overview with one survey and listening-point filter bar', () => {
    expect(dashboardPageSource).toContain('data-testid="signals-overview-filter-bar"')
    expect(dashboardPageSource).toContain("['intelligence', 'Intelligence']")
    expect(dashboardPageSource).toContain("['raw-responses', 'Raw Responses']")
    expect(dashboardPageSource).toContain("['actions', 'Actions']")
    expect(dashboardPageSource).toContain("['sessions', 'Sessions']")
    expect(dashboardPageSource).toContain('Event Area / listening point')
    expect(dashboardPageSource).toContain('All Event Areas and listening points')
    expect(dashboardPageSource).not.toContain('Live Event Intelligence</h2>')
  })

  it('keeps event intelligence filter state in the URL at the page level', () => {
    expect(dashboardPageSource).toContain('interface IntelligenceFilterState')
    expect(dashboardPageSource).toContain("type: 'target' | 'question'")
    expect(dashboardPageSource).toContain('surveyTargetId?: string')
    expect(dashboardPageSource).toContain('questionId?: string')
    expect(dashboardPageSource).toContain("const selectedCoverageTargetId = searchParams.get('surveyTargetId')?.trim() || null")
    expect(dashboardPageSource).toContain("const selectedCoverageQuestionId = selectedCoverageTargetId ? null : searchParams.get('questionId')?.trim() || null")
    expect(dashboardPageSource).toContain('const updateCoverageFilter = (filter: IntelligenceFilterState | null) => {')
  })

  it('includes selected target and question IDs in the intelligence fetch URL', () => {
    expect(dashboardPageSource).toContain('const params = new URLSearchParams({')
    expect(dashboardPageSource).toContain('account: accountSlug')
    expect(dashboardPageSource).toContain('days: String(timePeriod)')
    expect(dashboardPageSource).toContain("if (selectedSurveyId) params.set('surveyId', selectedSurveyId)")
    expect(dashboardPageSource).toContain("params.set('cacheBust', String(cacheBust))")
    expect(dashboardPageSource).toContain("if (selectedEventStructureItemId) params.set('eventStructureItemId', selectedEventStructureItemId)")
    expect(dashboardPageSource).toContain("else if (selectedStructureKind) params.set('structureKind', selectedStructureKind)")
    expect(dashboardPageSource).toContain("params.set('surveyTargetId', selectedCoverageTargetId)")
    expect(dashboardPageSource).toContain("params.set('questionId', selectedCoverageQuestionId)")
    expect(dashboardPageSource).toContain('/api/app/events/${eventId}/intelligence?${params.toString()}')
    expect(dashboardPageSource).toContain('[eventId, accountSlug, selectedSurveyId, selectedEventStructureItemId, selectedStructureKind, surveyOptionsLoaded, structureOptionsLoaded, timePeriod, analysisScope, analysisStructureKey, structureScopeValue, analysisData?.accountType, analysisData?.lifecyclePhase]')
    expect(dashboardPageSource).toContain('[eventId, accountSlug, selectedSurveyId, selectedEventStructureItemId, selectedStructureKind, selectedCoverageTargetId, selectedCoverageQuestionId, surveyOptionsLoaded, structureOptionsLoaded, timePeriod, analysisData?.accountType, analysisData?.lifecyclePhase, signalsTab]')
    expect(dashboardPageSource).toContain('if (!isEventsAccount(analysisData.accountType))')
    expect(dashboardPageSource).toContain('setIntelligenceData(null)')
  })

  it('passes real filter callbacks into Dashboard2', () => {
    expect(dashboardPageSource).toContain('activeIntelligenceFilter={intelligenceFilter}')
    expect(dashboardPageSource).toContain('selectedSurveyId={selectedSurveyId}')
    expect(dashboardPageSource).toContain('surveyScopeLabel={dashboardScopeLabel}')
    expect(dashboardPageSource).toContain("surveyScopeMode={selectedSurveyId ? 'survey' : 'all'}")
    expect(dashboardPageSource).toContain('onFilterByTarget={(target) => updateCoverageFilter({')
    expect(dashboardPageSource).toContain("type: 'target'")
    expect(dashboardPageSource).toContain('surveyTargetId: target.surveyTargetId')
    expect(dashboardPageSource).toContain('onFilterByQuestion={(question) => updateCoverageFilter({')
    expect(dashboardPageSource).toContain("type: 'question'")
    expect(dashboardPageSource).toContain('questionId: question.questionId')
    expect(dashboardPageSource).toContain('onClearIntelligenceFilter={() => updateCoverageFilter(null)}')
  })

  it('preserves Dashboard2 event-only surface instead of legacy dashboard behavior', () => {
    expect(dashboardPageSource).toContain('USE_DASHBOARD2')
    expect(dashboardPageSource).toContain('<Dashboard2')
    expect(dashboardPageSource).toContain('USE_DASHBOARD2 && isEventsDashboard')
    expect(dashboardPageSource).toContain('accountSlug={accountSlug}')
  })

  it('restores the clean retail survey analytics dashboard for non-EVENTS dashboards', () => {
    expect(dashboardPageSource).toContain('{USE_DASHBOARD2 && isEventsDashboard ? (')
    expect(dashboardPageSource).toContain('<RetailSurveyDashboard')
    expect(dashboardPageSource).toContain('Overall Pulse')
    expect(dashboardPageSource).toContain('Key Insights')
    expect(dashboardPageSource).toContain('Share This Survey')
    expect(dashboardPageSource).toContain('Launch the survey kiosk in fullscreen mode or download a QR code for physical placement')
    expect(dashboardPageSource).toContain('Responses received — insights are processing')
    expect(dashboardPageSource).toContain('Start collecting responses to see customer feedback insights.')
  })

  it('keeps EVENTS-only command-center copy out of the retail dashboard component', () => {
    const retailDashboardSource = dashboardPageSource.match(/function RetailSurveyDashboard\([\s\S]*?\n}\n\nfunction EventDashboardContent/)?.[0] || ''
    const forbiddenRetailCopy = [
      'command center',
      'event intelligence',
      'attendee sentiment',
      'live event operations',
      'event operations',
      'onsite friction',
      'session-level',
      'sponsor activations',
      'event structure',
    ]

    expect(retailDashboardSource).toContain('Overall Pulse')
    expect(retailDashboardSource).toContain('Key Insights')
    expect(retailDashboardSource).toContain('Share This Survey')
    expect(retailDashboardSource).toContain('Responses received — insights are processing')
    for (const term of forbiddenRetailCopy) {
      expect(retailDashboardSource.toLowerCase()).not.toContain(term)
    }
  })

  it('renders an All Surveys selector and preserves selected survey in dashboard fetches', () => {
    expect(dashboardPageSource).toContain("const selectedSurveyId = searchParams.get('surveyId')?.trim() || null")
    expect(dashboardPageSource).toContain('fetch(`/api/app/events/${eventId}/voice-surveys?account=${accountSlug}`')
    expect(dashboardPageSource).toContain('All Surveys')
    expect(dashboardPageSource).toContain('Roll up every survey in this Event')
    expect(dashboardPageSource).toContain('router.replace(buildDashboardPath(nextSurveyId))')
    expect(dashboardPageSource).toContain('`/api/app/events/${eventId}/analysis?${analysisParams.toString()}`')
    expect(dashboardPageSource).toContain('`/api/app/events/${eventId}/timeline?${baseParams.toString()}`')
    expect(dashboardPageSource).toContain('`/api/app/events/${eventId}/signals?${params.toString()}`')
  })

  it('loads event-only dashboard options only after account type is confirmed EVENTS', () => {
    const surveyOptionsFetchIndex = dashboardPageSource.indexOf('fetch(`/api/app/events/${eventId}/voice-surveys?account=${accountSlug}`')
    const structureOptionsFetchIndex = dashboardPageSource.indexOf('fetch(`/api/app/events/${eventId}/structure?account=${accountSlug}`')

    expect(dashboardPageSource).toContain('fetchData(undefined, false)')
    expect(dashboardPageSource).toContain('fetchData(undefined, true, true)')
    expect(dashboardPageSource).toContain('const appendDashboardScope = (params: URLSearchParams, includeEventStructureScope = false)')
    expect(dashboardPageSource).toContain('if (includeEventStructureScope) {')
    expect(dashboardPageSource).toContain('if (analysisData && isEventsAccount(analysisData.accountType)) return')
    expect(dashboardPageSource).toContain('if (!analysisData) {')
    expect(dashboardPageSource.lastIndexOf('if (!isEventsAccount(analysisData.accountType))', surveyOptionsFetchIndex)).toBeGreaterThan(-1)
    expect(dashboardPageSource.lastIndexOf('if (!isEventsAccount(analysisData.accountType))', structureOptionsFetchIndex)).toBeGreaterThan(-1)
    expect(dashboardPageSource).toContain('router.replace(buildDashboardPath(selectedSurveyId, {}))')
    expect(dashboardPageSource).toContain('fetchSignals(undefined, false)')
    expect(dashboardPageSource).toContain('fetchSignals(undefined, true)')
  })

  it('clears event-only dashboard state and skips event-only fetches for non-EVENTS account types', () => {
    const nonEventsEffectBlock = dashboardPageSource.match(/if \(!isEventsAccount\(analysisData\.accountType\)\) \{[\s\S]*?setSurveys\(\[\]\)[\s\S]*?setStructureOptionsLoaded\(true\)[\s\S]*?return\s+}\s+if \(signalsTab !== 'intelligence'\)/)?.[0] || ''
    const nonEventsSignalsBlock = dashboardPageSource.match(/if \(!isEventsAccount\(analysisData\.accountType\)\) \{\s+setIntelligenceData\(null\)[\s\S]*?return\s+\}/)?.[0] || ''

    expect(nonEventsEffectBlock).toContain('setSurveys([])')
    expect(nonEventsEffectBlock).toContain('setStructureItems([])')
    expect(nonEventsEffectBlock).toContain('setIntelligenceData(null)')
    expect(nonEventsEffectBlock).toContain('setStructureOptionsLoaded(true)')
    expect(nonEventsSignalsBlock).toContain('fetchSignals(undefined, false)')
    expect(nonEventsSignalsBlock).not.toContain('fetchIntelligence()')
    expect(nonEventsSignalsBlock).not.toContain('fetchSignals(undefined, true)')
  })

  it('renders Survey Focus dashboard filters and sends structure query params', () => {
    expect(dashboardPageSource).toContain("const selectedEventStructureItemId = searchParams.get('eventStructureItemId')?.trim() || null")
    expect(dashboardPageSource).toContain("const selectedStructureKindRaw = searchParams.get('structureKind')?.trim() || null")
    expect(dashboardPageSource).toContain('fetch(`/api/app/events/${eventId}/structure?account=${accountSlug}`')
    expect(dashboardPageSource).toContain('All Survey Focus')
    expect(dashboardPageSource).toContain('Area types')
    expect(dashboardPageSource).toContain('Sponsor Activations')
    expect(dashboardPageSource).toContain('handleStructureScopeChange')
    expect(dashboardPageSource).toContain("query.set('eventStructureItemId', structureScope.eventStructureItemId)")
    expect(dashboardPageSource).toContain("query.set('structureKind', structureScope.structureKind)")
    expect(dashboardPageSource).toContain('dashboardScopeLabel')
  })
})
