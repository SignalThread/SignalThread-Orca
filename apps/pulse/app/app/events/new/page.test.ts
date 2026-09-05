import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const newEventPageSource = fs.readFileSync(
  path.join(process.cwd(), 'app/app/events/new/page.tsx'),
  'utf8',
)

const retailCreateSurveySource = fs.readFileSync(
  path.join(process.cwd(), 'app/app/surveys/create/CreateSurveyClient.tsx'),
  'utf8',
)

describe('EVENTS create event setup page', () => {
  it('creates an Event container instead of a starter voice survey', () => {
    expect(newEventPageSource).toContain('Create a new event')
    expect(newEventPageSource).toContain('Voice for Events')
    expect(newEventPageSource).not.toContain('Create an event container for attendee feedback, surveys, and intelligence.')
    expect(newEventPageSource).toContain('createEventWithInitialSetup({')
    expect(newEventPageSource).toContain("if (selectedSetupType === 'BLANK')")
    expect(newEventPageSource).toContain("query.set('simpleStart', '1')")
    expect(newEventPageSource).toContain("query.set('simpleCreation', '1')")
    expect(newEventPageSource).toContain('router.replace(`/app/events/${result.eventId}/surveys/new?${query.toString()}`)')
    expect(newEventPageSource).toContain('router.replace(`/app/events/${result.eventId}?${query.toString()}`)')
    expect(newEventPageSource).not.toContain("import { QuestionBuilder")
    expect(newEventPageSource).not.toContain('<QuestionBuilder')
    expect(newEventPageSource).not.toContain('targetName')
    expect(newEventPageSource).not.toContain('ttsProvider: DEFAULT_TTS_PROVIDER')
  })

  it('lets EVENTS users open the create route even when other Events exist', () => {
    expect(newEventPageSource).not.toContain('router.replace(`/app/events/${firstEvent.id}?account=${accountSlug}`)')
    expect(newEventPageSource).not.toContain('const firstEvent =')
    expect(newEventPageSource).toContain("import { isEventsAccount } from '@/lib/account-product-mode'")
    expect(newEventPageSource).toContain('if (!isEventsAccount(data.account.accountType))')
  })

  it('keeps Event metadata separate from the selected setup type', () => {
    expect(newEventPageSource).toContain('const [eventName, setEventName]')
    expect(newEventPageSource).toContain('const [description, setDescription]')
    expect(newEventPageSource).toContain('const [locationId, setLocationId]')
    expect(newEventPageSource).toContain('name: eventName')
    expect(newEventPageSource).toContain('description,')
    expect(newEventPageSource).toContain('locationId,')
    expect(newEventPageSource).toContain('setupType: selectedSetupType')
    expect(newEventPageSource).not.toContain('templateSurveyRecommendations:')
    expect(newEventPageSource).not.toContain('questions:')
    expect(newEventPageSource).not.toContain('responseMode:')
  })

  it('removes the Event workspace card while retaining automatic account scoping', () => {
    expect(newEventPageSource).not.toContain('Event workspace')
    expect(newEventPageSource).not.toContain('event-location')
    expect(newEventPageSource).toContain('const primaryLocation = data?.locations[0]')
    expect(newEventPageSource).toContain('setLocationId(primaryLocation.id)')
    expect(newEventPageSource).toContain('locationId,')
  })

  it('keeps agenda upload and review available for Advanced creation', () => {
    expect(newEventPageSource).toContain('const [agendaFile, setAgendaFile]')
    expect(newEventPageSource).toContain('accept=".csv,.xlsx')
    expect(newEventPageSource).toContain('Agenda will be mapped and reviewed before event creation.')
    expect(newEventPageSource).toContain('>Change file</Button>')
    expect(newEventPageSource).toContain('setAgendaFile(null)')
    expect(newEventPageSource).toContain('>Remove</Button>')
    expect(newEventPageSource).toContain("agendaFile ? (creating ? 'Preparing review…' : 'Review mapping')")
  })

  it('adds and removes Event Areas locally with Enter-key support', () => {
    expect(newEventPageSource).toContain('appendInitialEventArea(eventAreas, eventAreaInput)')
    expect(newEventPageSource).toContain("event.key === 'Enter'")
    expect(newEventPageSource).toContain('event.preventDefault(); addEventArea()')
    expect(newEventPageSource).toContain('onClick={addEventArea}>Add</Button>')
    expect(newEventPageSource).toContain('removeEventArea(area)')
    expect(newEventPageSource).toContain('aria-label={`Remove ${area}`}')
  })

  it('guards direct and reviewed final submission against duplicate events', () => {
    expect(newEventPageSource).toContain('submitInFlightRef.current')
    expect(newEventPageSource).toContain('existingEventId: createdEventIdRef.current')
    expect(newEventPageSource).toContain('creationRequestIdRef.current')
    expect(newEventPageSource).toContain('initialSetup: { requestId: creationRequestIdRef.current')
    expect(newEventPageSource).toContain('createdEventIdRef.current = result.eventId')
    expect(newEventPageSource).toContain('pendingAreaNamesRef.current = result.failedAreaNames')
    expect(newEventPageSource).toContain('Your event was created, but')
    expect(newEventPageSource).toContain('Open created event')
  })

  it('only sends Advanced events through agenda preview and reviewed creation', () => {
    expect(newEventPageSource).toContain("if (isAdvancedSetup && agendaFile) {")
    expect(newEventPageSource).toContain('await interpretAgenda(false)')
    expect(newEventPageSource).toContain('/api/app/events/agenda-preview')
    expect(newEventPageSource).toContain("navigateWorkflow(useCurrentMapping ? 'review' : 'mapping')")
    expect(newEventPageSource).toContain('<PreCreationAgendaWorkspace')
    expect(newEventPageSource).toContain('onCreate={(agenda) => void createReviewedEvent(agenda)}')
    expect(newEventPageSource).toContain('if (!isAdvancedSetup || !accountSlug || creating || submitInFlightRef.current) return')
    expect(newEventPageSource).not.toContain("query.set('agendaImport'")
  })

  it('preserves setup and interpreted state across explicit and browser back navigation', () => {
    expect(newEventPageSource).toContain("const [agendaDraft, setAgendaDraft]")
    expect(newEventPageSource).toContain("window.addEventListener('popstate', onPopState)")
    expect(newEventPageSource).toContain("window.history[replace ? 'replaceState' : 'pushState']")
    expect(newEventPageSource).toContain("onChangeMapping={() => navigateWorkflow('mapping')}")
    expect(newEventPageSource).toContain("onBackToSetup={() => navigateWorkflow('setup')}")
  })

  it('owns scroll restoration for the client-side mapping and review workflow', () => {
    expect(newEventPageSource).toContain("window.history.scrollRestoration = 'manual'")
    expect(newEventPageSource).toContain("window.scrollTo({ top: 0, left: 0, behavior: 'auto' })")
    expect(newEventPageSource).toContain('resetWorkflowScroll()')
  })

  it('routes Simple creation into its survey starting point while preserving Advanced creation', () => {
    expect(newEventPageSource).toContain("import type { EventCreationType } from '@/lib/event-creation-type'")
    expect(newEventPageSource).toContain("const [selectedSetupType, setSelectedSetupType] = useState<EventCreationType>('BLANK')")
    expect(newEventPageSource).toContain("value: 'BLANK'")
    expect(newEventPageSource).toContain("label: 'Simple Event'")
    expect(newEventPageSource).toContain("description: 'Create event-wide surveys without agenda or assignments.'")
    expect(newEventPageSource).toContain("value: 'ADVANCED'")
    expect(newEventPageSource).toContain("label: 'Advanced Event'")
    expect(newEventPageSource).toContain("description: 'Set up your agenda and event structure now.'")
    expect(newEventPageSource).toContain('NEW_EVENT_SETUP_TYPES.map((setupType)')
    expect(newEventPageSource).not.toContain('EVENT_CREATION_TYPES.map((setupType)')
    expect(newEventPageSource).not.toContain("label: 'Event Template'")
    expect(newEventPageSource).not.toContain("label: 'Blank Event'")
    expect(newEventPageSource).toContain("const isAdvanced = setupType.value === 'ADVANCED'")
    expect(newEventPageSource).toContain("setupType.value === 'ADVANCED' ? 'A' : 'B'")
    expect(newEventPageSource).not.toContain('EVENT_TEMPLATES')
    expect(newEventPageSource).not.toContain('Conference')
    expect(newEventPageSource).not.toContain('Expo/Trade Show')
    expect(newEventPageSource).not.toContain('Workshop')
    expect(newEventPageSource).not.toContain('Brand Activation')
    expect(newEventPageSource).toContain("if (selectedSetupType === 'BLANK')")
    expect(newEventPageSource).toContain("query.set('simpleStart', '1')")
    expect(newEventPageSource).toContain("query.set('simpleCreation', '1')")
    expect(newEventPageSource).toContain('/surveys/new?${query.toString()}')
    expect(newEventPageSource).not.toContain('Classic Event')
    // The existing event metadata continues through the existing create API.
    expect(newEventPageSource).toContain('venue: venue.trim() || undefined,')
    expect(newEventPageSource).toContain('startDate: startDate || undefined,')
    expect(newEventPageSource).toContain('endDate: endDate || undefined,')
    // Create is gated on required fields only.
    expect(newEventPageSource).toContain('const canSubmit = Boolean(eventName.trim()) && Boolean(locationId) && !creating')
    expect(newEventPageSource).toContain('disabled={!canSubmit}')
    // Still no retail survey concepts leaking in.
    expect(newEventPageSource).not.toContain('questions:')
    expect(newEventPageSource).not.toContain('responseMode:')
  })

  it('lays out the create flow as a compact responsive setup page', () => {
    expect(newEventPageSource).toContain('max-w-5xl pb-8')
    expect(newEventPageSource).toContain('sm:p-6 lg:p-7')
    expect(newEventPageSource).toContain('className="space-y-6"')
    expect(newEventPageSource).toContain('lg:grid-cols-12')
    expect(newEventPageSource).toContain('lg:col-span-12')
    expect(newEventPageSource).toContain('lg:col-span-7')
    expect(newEventPageSource).toContain('lg:col-span-5')
    expect(newEventPageSource).toContain('rows={3}')
    expect(newEventPageSource).toContain('resize-y')
    expect(newEventPageSource).toContain('min-h-[136px]')
    expect(newEventPageSource).toContain('grid grid-cols-1 gap-3 sm:grid-cols-2')
    expect(newEventPageSource).toContain('grid gap-3 lg:grid-cols-2')
    expect(newEventPageSource).toContain('rounded-xl border border-zinc-200 bg-slate-50/80 p-3')
  })

  it('keeps Basic creation as metadata-only and hides all initial setup controls', () => {
    expect(newEventPageSource).toContain("const isAdvancedSetup = selectedSetupType === 'ADVANCED'")
    expect(newEventPageSource).toContain('{isAdvancedSetup && <section className="space-y-3">')
    expect(newEventPageSource).toContain("? (createdEventIdRef.current ? pendingAreaNamesRef.current : eventAreas)")
    expect(newEventPageSource).toContain(': []')
    expect(newEventPageSource).toContain("if (setupType === 'BLANK') {")
    expect(newEventPageSource).toContain('setAgendaFile(null)')
    expect(newEventPageSource).toContain('setEventAreas([])')
  })

  it('keeps the retail survey creation flow intact', () => {
    expect(retailCreateSurveySource).toContain('<QuestionBuilder')
    expect(retailCreateSurveySource).toContain('ttsProvider,')
    expect(retailCreateSurveySource).toContain('ttsVoice,')
    expect(retailCreateSurveySource).toContain('router.push(`/app?account=${accountSlug}`)')
  })
})
