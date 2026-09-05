import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('components/events/EventAgendaImportWorkspace.tsx', 'utf8')
const templateSource = readFileSync('lib/event-agenda-import-template.ts', 'utf8')

describe('EventAgendaImportWorkspace', () => {
  it('supports upload, drag and drop, durable URL-backed resume, and manual entry', () => {
    expect(source).toContain("agendaOnly ? 'Drop your agenda here'")
    expect(source).toContain('CSV or XLSX')
    expect(source).toContain('accept=".csv,.xlsx')
    expect(source).toContain('event.dataTransfer.files[0]')
    expect(source).toContain("importJobId !== 'new'")
    expect(source).toContain('Resuming agenda import…')
    expect(source).toContain("agendaOnly ? 'Open session editor'")
    expect(source).toContain('Download template')
    expect(source).toContain('EVENT_AGENDA_IMPORT_TEMPLATE_FILENAME')
    expect(source).toContain("speakerRosterOnly ? 'Drop your speaker roster here'")
  })

  it('keeps mapping as a source-first advanced correction path after automatic review', () => {
    expect(source).toContain('Worksheet')
    for (const label of ['Session title', 'Start date', 'Start time', 'End date', 'End time', 'Room', 'Track', 'Format', 'External / source ID', 'Speaker names', 'Speaker emails']) {
      expect(templateSource).toContain(label)
    }
    expect(source).toContain("action: 'SELECT_WORKSHEET'")
    expect(source).toContain("action: 'SAVE_MAPPING'")
    expect(source).toContain("const showMapping = job.status === 'MAPPING'")
    expect(source).toContain('Upload a CSV or Excel agenda. Pulse will organize it for review.')
    expect(source).toContain('Pulse interpreted {sourceColumns.length} source column')
    expect(source).toContain('Time range detected')
    expect(source).toContain('Multiple names detected')
    expect(source).toContain('Advanced options')
    expect(source).toContain('Source preview')
    expect(source).toContain('Back to review')
    expect(source).toContain('Review agenda')
    expect(source).toContain('sourceColumns.map')
    expect(source).not.toContain('AI suggested mappings for columns deterministic recognition could not resolve.')
    expect(source).not.toContain('One session per row.')
    expect(source).not.toContain('Up to 5 MB and 5,000 rows per worksheet.')
    expect(source).toContain('Replace existing')
  })

  it('renders real normalized rows, status filters, validation, conflicts, and detail review', () => {
    for (const state of ['Ready', 'Needs review', 'Duplicate', 'Missing required information', 'Invalid date/time', 'End time before start', 'Possible overlap']) {
      expect(source).toContain(state)
    }
    expect(source).toContain('row.normalizedRowSnapshot?.title')
    expect(source).toContain('row.validationIssues')
    expect(source).toContain('row.conflictType')
    expect(source).not.toContain('exampleRows')
    expect(source).toContain("Review {activeImportType === 'AGENDA' ? 'agenda' : 'speaker roster'}")
    expect(source).toContain('Agenda interpreted')
    expect(source).toContain('Session details')
    expect(source).toContain('formatSessionMeta')
    expect(source).not.toContain('Source row {row.sourceRowNumber}')
    expect(source).not.toContain('Start time (ISO with timezone offset)')
    expect(source).toContain("action: 'SAVE_CORRECTION'")
  })

  it('opens the selected record in the shared responsive drawer instead of an inline editor', () => {
    expect(source).toContain("import { EventWorkspaceDrawer } from '@/components/events/EventEvidenceDrawer'")
    expect(source).toContain('testId="agenda-session-review-drawer"')
    expect(source).toContain('width="compact"')
    expect(source).toContain('onClick={() => setSelectedRowId(row.id)}')
    expect(source).toContain('onClose={() => setSelectedRowId(null)}')
    expect(source).toContain("summary={selectedRow.normalizedRowSnapshot?.title || selectedRow.normalizedRowSnapshot?.displayName || 'Untitled record'}")
    expect(source).not.toContain("xl:grid-cols-[minmax(0,1fr)_minmax(360px,.72fr)]")
    expect(source).not.toContain('className="self-start xl:sticky xl:top-4"')
  })

  it('keeps reconciliation in the selected-session drawer and final confirmation at agenda level', () => {
    const drawerStart = source.indexOf('{selectedRow && <EventWorkspaceDrawer')
    const drawerEnd = source.indexOf('</EventWorkspaceDrawer>}', drawerStart)
    const confirmationStart = source.indexOf('data-testid="agenda-import-confirmation"')
    expect(drawerStart).toBeGreaterThan(-1)
    expect(drawerEnd).toBeGreaterThan(drawerStart)
    expect(source.slice(drawerStart, drawerEnd)).toContain('Speaker reconciliation')
    expect(source.slice(drawerStart, drawerEnd)).toContain("action: 'SAVE_CORRECTION'")
    expect(source.slice(drawerStart, drawerEnd)).toContain("saveRowDecision(selectedRow, 'KEEP_BOTH')")
    expect(confirmationStart).toBeGreaterThan(drawerEnd)
    expect(source.slice(confirmationStart)).toContain('Confirm ${activeImportType === \'AGENDA\' ? `${counts.ready} sessions`')
  })

  it('keeps reconciliation compact and only renders it for revised uploads', () => {
    expect(source).toContain('hasReuploadChanges')
    expect(source).toContain('>Details</summary>')
    expect(source).not.toContain('Re-upload changes')
    expect(source).not.toContain('Missing sessions remain unchanged and are never silently removed.')
  })

  it('keeps TEMPLATE setup agenda-only while preserving the advanced roster importer', () => {
    expect(source).toContain('agendaOnly')
    expect(source).toContain("agendaOnly ? 'Import agenda'")
    expect(source).toContain('!speakerRosterOnly && !agendaOnly')
    expect(source).toContain('speakerRosterOnly')
  })

  it('supports canonical row and speaker decisions with a clear confirmation action', () => {
    for (const decision of ['Skip', 'Replace existing', 'Keep both', 'Link existing', 'Create new', 'Keep separate', 'Merge into existing', 'Ignore']) {
      expect(source).toContain(decision)
    }
    expect(source).toContain("action: 'SAVE_DECISIONS'")
    expect(source).toContain("action: 'CONFIRM'")
    expect(source).toContain('Confirm ${activeImportType === \'AGENDA\' ? `${counts.ready} sessions`')
    expect(source).toContain('Open imported Sessions')
    expect(source).toContain('Review unresolved Sessions')
    expect(source).toContain('Import in progress')
  })

  it('confirms live-event imports with the canonical modal instead of a native dialog', () => {
    expect(source).toContain('EventConfirmDialog')
    expect(source).toContain("'Confirm schedule change?'")
    expect(source).toContain("'Confirm speaker roster import?'")
    expect(source).toContain('This event is live. Importing updates the published agenda for attendees immediately.')
    expect(source).toContain("'Import agenda'")
    expect(source).toContain("'Import speaker roster'")
    expect(source).not.toContain('window.confirm')
  })

  it('refreshes the canonical import job after confirmation', () => {
    expect(source).toContain("body.action === 'CONFIRM'")
    expect(source).toContain('Agenda import completed but could not be refreshed')
  })

  it('uses responsive natural flow without creating a separate mobile import system', () => {
    expect(source).toContain('sm:grid-cols-2')
    expect(source).toContain('lg:grid-cols-3')
    expect(source).toContain('width="compact"')
    expect(source).toContain('data-testid="agenda-import-confirmation"')
    expect(source).not.toContain('min-w-screen')
  })

  it('keeps roster behavior and recovery actions specific to the selected import type', () => {
    expect(source).toContain("speakerRosterOnly ? 'Add a speaker manually'")
    expect(source).toContain('buildSpeakerRosterImportTemplateCsv')
    expect(source).toContain("action: 'DISCARD'")
    expect(source).toContain('Discard import draft?')
    expect(source).toContain('speakerRosterOnly')
    expect(source).toContain('Add imported speakers to this event')
    expect(source).toContain('Ignore column')
    expect(source).toContain('No session assignments were created.')
  })
})
