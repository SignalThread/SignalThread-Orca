import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { hasCompleteSessionDateTime, sessionDateTimeParts, speakerMissingDetailsLabel, updateSessionDateTimePart } from './EventAgendaWorkspace'

const source = readFileSync('components/events/EventAgendaWorkspace.tsx', 'utf8')

describe('EventAgendaWorkspace', () => {
  it('loads and combines session date and time fields without changing the save value', () => {
    // Existing sessions still hydrate into the same local wall-time string
    // consumed by eventLocalDateTimeToIso at the canonical save boundary.
    expect(sessionDateTimeParts('2026-09-17T09:05')).toEqual({ date: '2026-09-17', time: '09:05' })

    let startsAt = updateSessionDateTimePart('', 'date', '2026-09-17')
    startsAt = updateSessionDateTimePart(startsAt, 'time', '09:05')
    expect(startsAt).toBe('2026-09-17T09:05')
    expect(hasCompleteSessionDateTime(startsAt)).toBe(true)
    expect(hasCompleteSessionDateTime('2026-09-17T9:05')).toBe(false)
  })

  it('uses combined session date-time pickers instead of separate or native inputs', () => {
    expect(source).toContain('EventSessionDateTimePicker')
    expect(source).toContain('label="Starts"')
    expect(source).toContain('label="Ends"')
    expect(source).toContain('minValue={sessionForm.startsAt}')
    expect(source).not.toContain('function AgendaDateTimeField')
    expect(source).not.toContain('placeholder="HH:MM"')
    expect(source).not.toContain('<input type="datetime-local"')
    expect(source).toContain('eventLocalDateTimeToIso(sessionForm.startsAt, sessionForm.timezone)')
    expect(source).toContain('eventLocalDateTimeToIso(sessionForm.endsAt, sessionForm.timezone)')
  })

  it('names the exact incomplete speaker fields and leaves complete speakers unlabeled', () => {
    expect(speakerMissingDetailsLabel(['title'])).toBe('Missing title')
    expect(speakerMissingDetailsLabel(['organization'])).toBe('Missing organization')
    expect(speakerMissingDetailsLabel(['email'])).toBe('Missing email')
    expect(speakerMissingDetailsLabel(['title', 'organization', 'email'])).toBe('Missing title, organization and email')
    expect(speakerMissingDetailsLabel([])).toBeNull()
  })

  it('uses the canonical Agenda API under the Operations card selection', () => {
    expect(source).toContain('/agenda?account=')
    expect(source).toContain('workspace: AgendaView')
    expect(source).toContain('const activeView: AgendaView = workspace')
    expect(source).toContain("query.set('operationsView', 'speakers')")
    expect(source).not.toContain('<EventTabs')
    expect(source).toContain("const requestedSessionId = searchParams.get('sessionId')?.trim() || null")
    expect(source).toContain("query.set('sessionId', session.id)")
    expect(source).toContain('data.sessions.find((session) => session.id === requestedSessionId)')
    expect(source).toContain("query.set('tab', 'operations')")
    expect(source).toContain("searchParams.get('agendaImport')")
    expect(source).toContain("query.set('agendaImport', jobId)")
    expect(source).toContain('<EventAgendaImportWorkspace')
  })

  it('renders real derived summary, filter, loading, error, and empty states', () => {
    expect(source).toContain('data.speakers')
    expect(source).toContain('Search sessions, rooms, tracks...')
    expect(source).toContain('aria-label="Session filters"')
    expect(source).toContain('Room')
    expect(source).toContain('Track')
    expect(source).toContain('Format')
    expect(source).toContain('Loading agenda…')
    expect(source).toContain('Agenda unavailable')
    expect(source).toContain('No agenda sessions yet')
    expect(source).toContain('No speakers yet')
  })

  it('coalesces the initial Agenda load across React Strict Mode effect replay', () => {
    expect(source).toContain('const initialLoadEndpointRef = useRef<string | null>(null)')
    expect(source).toContain('if (initialLoadEndpointRef.current === endpoint) return')
    expect(source).toContain('initialLoadEndpointRef.current = endpoint')
  })

  it('keeps the focused session-detail fields, validation review, and active-event confirmation', () => {
    for (const field of ['Title', 'Starts', 'Ends', 'Timezone', 'Room', 'Track', 'External / source ID']) {
      expect(source).toContain(field)
    }
    const drawerBlock = source.match(/<EventWorkspaceDrawer open title=\{selectedSessionId[\s\S]*?<\/EventWorkspaceDrawer>/)?.[0] || ''
    for (const removedField of ['Description', 'Format', 'Capacity', 'Tags (comma separated)']) {
      expect(drawerBlock).not.toContain(`label="${removedField}"`)
    }
    expect(source).toContain('SESSION_REVIEW_CONFIRMATION_REQUIRED')
    expect(source).toContain("title: 'Confirm schedule change?'")
    expect(source).toContain('Archive session')
  })

  it('confirms schedule changes with the canonical SignalThread modal, not native dialogs', () => {
    expect(source).toContain('EventConfirmDialog')
    expect(source).toContain("data?.eventLifecyclePhase === 'IN_EVENT'")
    expect(source).not.toContain("data?.eventStatus === 'ACTIVE'")
    // Live-event save confirmation: explains immediacy, names the action.
    expect(source).toContain("title: 'Confirm schedule change?'")
    expect(source).toContain('This event is live. Saving updates the published schedule for attendees immediately.')
    expect(source).toContain("confirmLabel: selectedSessionId ? 'Update session' : 'Add session'")
    // Warnings and archive flow through the same canonical dialog.
    expect(source).toContain("title: 'Save session with warnings?'")
    expect(source).toContain("confirmLabel: 'Save anyway'")
    expect(source).toContain("title: 'Archive this session?'")
    expect(source).toContain("confirmLabel: 'Archive session'")
    // Cancel clears the pending action without mutating anything.
    expect(source).toContain('onCancel={() => setPendingConfirm(null)}')
    // No native confirms remain in the session schedule flows.
    expect(source).not.toContain("window.confirm('This event is active. Confirm this schedule correction?')")
    expect(source).not.toContain('Save this session anyway?')
    expect(source).not.toContain('window.confirm(`Archive “${session.name}”?')
  })

  it('connects durable agenda import status to Setup readiness', () => {
    expect(source).toContain('onManualEntry={openManualEntry}')
    expect(source).toContain('onAgendaImportStateChanged')
    expect(source).toContain("status === 'NEEDS_REVIEW' || status === 'FAILED'")
    expect(source).toContain("status === 'COMPLETED' ? null : 'IN_PROGRESS'")
    expect(source).toContain('agendaOnly={templateEvent || templateAgendaSetup}')
  })

  it('keeps independent speaker tools for non-Template events only', () => {
    expect(source).toContain('Import speakers')
    expect(source).toContain('speakerRosterOnly')
    expect(source).toContain('speaker-import-drawer')
    expect(source).toContain('Add from speaker library')
    expect(source).toContain('speaker-library-drawer')
    expect(source).toContain("if (activeView !== 'speakers' || templateEvent || !requestedSpeakerAction) return")
    expect(source).toContain("templateEvent ? 'Add speakers to sessions from the Agenda.'")
    expect(source).toContain("if (activeView === 'speakers') query.set('operationsView', 'speakers')")
    expect(source).toContain("const requestedSpeakerAction = searchParams.get('speakerAction')")
    expect(source).toContain("query.delete('speakerAction')")
  })

  it('keeps Template speakers session-driven under Operations', () => {
    expect(source).toContain('templateEvent?: boolean')
    expect(source).toContain("aria-label={activeView === 'sessions' ? 'Session management' : 'Speaker management'}")
    expect(source).not.toContain('Agenda views')
    expect(source).not.toContain('selectAgendaView')
    expect(source).toContain("action: selectedSpeakerId ? 'UPDATE_SPEAKER' : templateEvent && selectedSessionId ? 'CREATE_AND_ASSIGN_SPEAKER' : 'CREATE_SPEAKER'")
    expect(source).toContain('Create speaker')
    expect(source).toContain('Add to session')
  })

  it('restores shared survey actions for speaker rows without adding editing controls to the toolbar', () => {
    const speakerListBlock = source.match(/filteredSpeakers\.map\(\(speaker\) => \{[\s\S]*?\}\)\}<\/div>/)?.[0] || ''

    expect(speakerListBlock).toContain('missingDetailsLabel')
    expect(speakerListBlock).not.toContain('>Missing details</span>')
    expect(speakerListBlock).toContain('bg-amber-100')
    expect(speakerListBlock).not.toContain('>Edit</EventRowActionButton>')
    expect(speakerListBlock).not.toContain('Complete setup')
    expect(speakerListBlock).not.toContain('resolveEventRowActions({')
    expect(speakerListBlock).toContain('EventSurveyAssignmentControl')
    expect(speakerListBlock).toContain('onDetach={() =>')
    expect(speakerListBlock).toContain('type="checkbox"')
    expect(speakerListBlock).toContain('isSurveyAssignableToEventTarget(survey, eventId)')
    expect(speakerListBlock).not.toContain("survey.targetType === 'SPEAKER'")
    expect(speakerListBlock).toContain("assignedSurvey={speaker.survey ? { ...speaker.survey, targetType: 'SPEAKER', eventId } : null}")
  })

  it('uses the shared white list shell with separate session and speaker cards', () => {
    expect(source).toContain("import { EventEntityCard, EventEntityListShell } from '@/components/events/EventEntityCard'")
    expect(source).toContain('<EventEntityListShell>')
    expect(source).toContain('<EventEntityCard selected={selectedSessionId === session.id}')
    expect(source).toContain('<EventEntityCard key={speaker.id} selected={selectedSpeakerId === speaker.id}')
    expect(source).toContain('className="mt-4 space-y-3"')
  })

  it('supports speaker profiles, roles, assignment, and non-destructive archival', () => {
    for (const field of ['Name', 'Title', 'Organization', 'Email', 'Phone', 'Biography']) {
      expect(source).toContain(field)
    }
    expect(source).toContain("['SPEAKER', 'MODERATOR', 'HOST', 'PANELIST']")
    expect(source).toContain("action: 'ASSIGN_SPEAKERS'")
    expect(source).toContain("action: 'REMOVE_ASSIGNMENT'")
    expect(source).toContain('Session records will not be deleted.')
    expect(source).toContain("title: 'Archive this speaker?'")
    expect(source).toContain("confirmLabel: 'Archive speaker'")
    expect(source).toContain('archiveSpeakerInFlightRef')
    expect(source).not.toContain('window.confirm(`Archive “${speaker.name}”?')
    expect(source).toContain("action: 'ARCHIVE_SPEAKER'")
    expect(source).toContain('setSelectedSpeakerId(null)')
    expect(source).toContain("setError(currentError instanceof Error ? currentError.message : 'Failed to archive speaker')")
  })

  it('keeps pending multi-speaker choices in the session save path', () => {
    expect(source).toContain('const [pendingAssignmentSpeakerIds, setPendingAssignmentSpeakerIds] = useState<string[]>([])')
    expect(source).toContain("action: 'ASSIGN_SPEAKERS'")
    expect(source).toContain("action: selectedSessionId && pendingAssignmentSpeakerIds.length > 0")
    expect(source).toContain("? 'UPDATE_SESSION_WITH_SPEAKER_ASSIGNMENTS'")
    expect(source).toContain('speakerIds: pendingAssignmentSpeakerIds')
    expect(source).toContain('role: assignmentRole')
    expect(source).toContain('setPendingAssignmentSpeakerIds([])')
    expect(source).not.toContain('assignmentSpeakerId')
  })

  it('renders a searchable multi-select that marks assigned speakers and lets organizers remove pending choices', () => {
    expect(source).toContain('aria-label="Choose speakers to assign"')
    expect(source).toContain('aria-label="Search speakers to assign"')
    expect(source).toContain('[speaker.name, speaker.title, speaker.organization]')
    expect(source).toContain("'Already assigned'")
    expect(source).toContain('disabled={assigned}')
    expect(source).toContain('aria-label="Pending speaker selections"')
    expect(source).toContain('Remove pending ${speaker.name}')
    expect(source).toContain('aria-multiselectable="true"')
  })

  it('uses a right-side session drawer and supports bulk selection for sessions and speakers', () => {
    expect(source).toContain('testId="session-detail-drawer"')
    expect(source).toContain('<EventWorkspaceDrawer')
    expect(source).toContain('entityLabel="sessions"')
    expect(source).toContain('selectedBulkSessionIds')
    expect(source).toContain('selectedBulkSpeakerIds')
    expect(source).toContain('entityLabel="speakers"')
    expect(source).not.toContain("sessionFormOpen ? 'xl:grid-cols")
    expect(source).toContain('sm:grid-cols-2')
    expect(source).not.toContain('min-w-screen')
  })

  it('closes the URL-backed session drawer through the shared product-styled dismissal contract', () => {
    expect(source).toContain('const closeSession = useCallback')
    expect(source).toContain("title: 'Discard unsaved session changes?'")
    expect(source).toContain("confirmLabel: 'Discard changes'")
    expect(source).toContain("query.delete('sessionId')")
    expect(source).not.toContain('window.confirm')
    expect(source).toContain('sessionTriggerRefs.current[previousSessionId]?.focus()')
    expect(source).toContain('onClose={closeSession}')
    expect(source).toContain('closeSession(true)')
  })

  it('bounds the agenda load so it cannot hang indefinitely', () => {
    expect(source).toContain('const AGENDA_REQUEST_TIMEOUT_MS = 15_000')
    expect(source).toContain('window.setTimeout(() => controller.abort(), AGENDA_REQUEST_TIMEOUT_MS)')
    expect(source).toContain("'Agenda request timed out. Please retry.'")
  })

  it('keeps a successful agenda mutation successful when the follow-up refresh fails', () => {
    // Post-mutation refreshes keep the loaded agenda visible and report failure
    // as a stale-view notice instead of a red error or a lost save.
    expect(source).toContain('await loadAgenda({ refresh: true })')
    expect(source).toContain('setRefreshFailed(true)')
    expect(source).toContain('Your change was saved.')
    expect(source).toContain('Refresh view')
    const loadBlock = source.match(/const loadAgenda = useCallback[\s\S]*?\}, \[endpoint\]\)/)?.[0] || ''
    expect(loadBlock).toContain('if (options.refresh) {')
    expect(loadBlock).toContain("if (!options.refresh) {\n        setLoading(true)")
  })

  it('renders only the event roster and opens account speakers through a separate library request', () => {
    // A blank event must never read as if every account speaker already belonged to it.
    expect(source).toContain("aria-label={activeView === 'sessions' ? 'Session management' : 'Speaker management'}")
    expect(source).not.toContain('aria-label="Speaker filter"')
    expect(source).not.toContain('<option value="complete">Complete</option>')
    expect(source).not.toContain('<option value="missing">Missing details</option>')
    expect(source).not.toContain('<option value="duplicates">Possible duplicates</option>')
    expect(source).toContain('speaker-library?account=')
    expect(source).toContain('loadSpeakerLibrary')
    expect(source).toContain("action: 'ADD_EXISTING_SPEAKER'")
    expect(source).toContain('Assigned to this event · No sessions yet')
    expect(source).not.toContain("{ key: 'unassigned', label: 'Not in this event'")
    expect(source).not.toContain('account speakers ·')
  })

  it('uses the shared Speakers toolbar and keeps status information on each row', () => {
    const speakerListBlock = source.match(/const filteredSpeakers = useMemo\([\s\S]*?const filteredSpeakerLibrary/)?.[0] || ''

    expect(speakerListBlock).toContain('[speaker.name, speaker.title, speaker.organization, speaker.email]')
    expect(speakerListBlock).not.toContain('matchesFilter')
    expect(speakerListBlock).not.toContain('speaker.possibleDuplicate')
    expect(source).toContain('searchPlaceholder="Search speakers, organizations..."')
    expect(source).toContain('OperationsSearchToolbar')
    expect(source).toContain("title={data.speakers.length === 0 ? 'No speakers yet' : 'No speakers match your search'}")
    expect(source).toContain("label: 'Clear search'")
    expect(source).toContain("speaker.profileState === 'MISSING_DETAILS'")
    expect(source).toContain('Headshot {speaker.headshotState.toLocaleLowerCase()}')
  })

  it('prevents duplicate submits while an agenda mutation is pending', () => {
    expect(source).toContain('if (busy) return')
    expect(source).toContain('if (busy || selectedListeningSessionIds.length === 0) return')
    expect(source).toContain('if (busy || !selectedSessionId || pendingAssignmentSpeakerIds.length === 0) return')
    expect(source).toContain('if (busy || !selectedSessionId) return')
  })

  it('restores the fixed Operations bulk-survey workflow', () => {
    expect(source).not.toContain('Manage in bulk')
    expect(source).toContain('selectedCoverageLabel')
    expect(source).toContain('evidenceCoverageLabel')
    expect(source).toContain("NOT_SELECTED: 'No survey'")
    expect(source).toContain("NEEDS_SURVEY: 'No survey'")
    expect(source).toContain('sessionDetailStatusLabel')
    expect(source).not.toContain('sessions need details.')
    expect(source).toContain("action: 'BULK_ASSIGN_EXISTING_SURVEY'")
    expect(source).toContain('data-testid="bulk-survey-selection-bar"')
    expect(source).toContain('fixed inset-x-0 bottom-5')
    expect(source).toContain('Attach survey')
    expect(source).toContain('Attach to ${selectedBulkCount}')
    expect(source).toContain('bulkOverwriteCount')
    expect(source).toContain('Replace existing assignments')
    expect(source).toContain("'Survey assigned'")
    expect(source).toContain("'Survey changed'")
    expect(source).toContain('{bulkAssignmentMessage && <div role="status"')
    expect(source).not.toContain('Voice listening plan')
    expect(source).not.toContain('Agenda sessions stay separate')
  })

  it('uses the canonical replacement mutation for an individual session survey change', () => {
    const assignmentBlock = source.match(/const applyBulkSurvey = async[\s\S]*?const requestBulkSurveyApply/)?.[0] || ''
    expect(assignmentBlock).toContain("action: 'BULK_ASSIGN_EXISTING_SURVEY'")
    expect(assignmentBlock).toContain("const attachSessionSurvey = (sessionId: string, surveyId: string) => {")
    expect(assignmentBlock).toContain("targetType: 'SESSION', targetIds: [sessionId], surveyId, conflictMode: 'REPLACE_EXISTING'")
    expect(assignmentBlock).toContain("counts.replaced > 0 ? 'Survey changed' : 'Survey assigned'")
    expect(assignmentBlock).not.toContain("input.targetIds.length === 1 ? 'Survey already assigned'")
  })

  it('reconciles the canonical session and speaker assignment payload before the shared control changes from Attach to Swap', () => {
    const assignmentBlock = source.match(/const applyBulkSurvey = async[\s\S]*?const attachSessionSurvey/)?.[0] || ''
    expect(source).toContain("return applyBulkSurvey({ targetType: 'SESSION', targetIds: [sessionId], surveyId, conflictMode: 'REPLACE_EXISTING' })")
    expect(source).toContain("return applyBulkSurvey({ targetType: 'SPEAKER', targetIds: [speakerId], surveyId, conflictMode: 'REPLACE_EXISTING' })")
    expect(source).toContain("await mutate('PATCH', { action: 'CLEAR_EXISTING_SURVEY_ASSIGNMENT', targetType, targetIds: [targetId] })")
    expect(source).toContain('await afterMutation()')
    expect(source).toContain("assignedSurvey={listening?.survey ? { ...listening.survey, targetType: 'SESSION', eventId } : null}")
    expect(source).toContain("assignedSurvey={speaker.survey ? { ...speaker.survey, targetType: 'SPEAKER', eventId } : null}")
    expect(assignmentBlock.indexOf('await afterMutation()')).toBeLessThan(assignmentBlock.indexOf('setBulkAssignmentMessage(assignmentMessage)'))
  })

  it('uses product-styled confirmation for duplicate speaker profiles', () => {
    expect(source).toContain("title: 'Keep this speaker profile separate?'")
    expect(source).toContain("confirmLabel: 'Keep separate'")
    expect(source).toContain('<EventSurveyLibraryPicker')
    expect(source).toContain('availableBulkSurveys')
  })

  it('keeps survey deployment out of Operations rows and detail surfaces', () => {
    expect(source).not.toContain('inlineSurveyTarget')
    expect(source).not.toContain('setInlineSurveyTarget')
    expect(source).toContain('Attach survey')
    expect(source).toContain('EventSurveyAssignmentControl')
    expect(source).toContain("action: 'CLEAR_EXISTING_SURVEY_ASSIGNMENT'")
    expect(source).not.toContain('Session survey')
    expect(source).toContain('Speaker survey')
    expect(source).not.toContain('speakerSurveyId')
  })

  it('treats missing optional session metadata as a warning', () => {
    const drawerBlock = source.match(/<EventWorkspaceDrawer open title=\{selectedSessionId[\s\S]*?<\/EventWorkspaceDrawer>/)?.[0] || ''
    expect(drawerBlock).toContain('Missing info')
    expect(drawerBlock).toContain('border-amber-200 bg-amber-50')
    expect(drawerBlock).not.toContain('Attach survey')
    expect(drawerBlock).not.toContain('summary={selectedSession?.reviewIssues')
    expect(drawerBlock).not.toContain('Missing format')
    expect(source).toContain("if (issue === 'Missing format') return null")
    expect(source).toContain("if (issue === 'Missing room' || issue === 'Missing track') return 'Missing info'")
  })

  it('uses compact missing-info actions while leaving Edit out of the assignment toolbar', () => {
    expect(source).toContain("const missingInfo = session.reviewIssues.map(sessionDetailStatusLabel)")
    expect(source).not.toContain('<EventRowActions')
    expect(source).not.toContain('label="Complete"')
    expect(source).toContain("speaker.profileState === 'MISSING_DETAILS' && missingDetailsLabel && <span className=\"rounded-full bg-amber-100")
    expect(source).toContain("!selectedBulkSessionIds.includes(session.id)")
    expect(source).toContain('entityLabel="speakers"')
    expect(source).not.toContain('leadingAction=')
    expect(source).not.toContain('EventRowActionButton')
  })

  it('keeps each survey toolbar in a reserved, hover-owned card gutter', () => {
    expect(source).toContain('group relative mt-2 flex items-start gap-3 pr-[10.5rem]')
    expect(source).toContain('group relative flex items-start gap-3 pr-[10.5rem]')
    expect(source).toContain('[&:has(.event-survey-assignment-toolbar[data-open=true])]:bg-[#f7f9fe]')
  })

  it('opens the canonical speaker editor idempotently for the requested event speaker', () => {
    expect(source).toContain('const dismissSpeaker = useCallback')
    expect(source).toContain("query.delete('speakerId')")
    expect(source).toContain('dismissedSpeakerIdRef')
    expect(source).toContain("event.key === 'Escape'")
    expect(source).not.toContain('if (selectedSpeakerId === speaker.id)')
    expect(source).toContain('setSelectedSpeakerId(speaker.id)')
    expect(source).toContain('setSpeakerForm(speakerToForm(speaker))')
    expect(source).toContain("query.set('speakerId', speaker.id)")
    expect(source).toContain('`/app/events/${encodeURIComponent(eventId)}?${query.toString()}`')
    expect(source).toContain('variant="ghost" onClick={dismissSpeaker}>Close</Button>')
    expect(source).toContain("speakerFormOpen ? 'xl:grid-cols")
  })

  it('updates the selected speaker through the scoped edit mutation without changing session assignments', () => {
    expect(source).toContain("await mutate(selectedSpeakerId ? 'PATCH' : 'POST'")
    expect(source).toContain("action: selectedSpeakerId ? 'UPDATE_SPEAKER'")
    expect(source).toContain('...(selectedSpeakerId ? { speakerId: selectedSpeakerId } : {})')
    expect(source).toContain('Assigned sessions')
    expect(source).toContain('selectedSpeaker.sessionAssignments.map')
    expect(source).toContain('await afterMutation()')
  })
})
