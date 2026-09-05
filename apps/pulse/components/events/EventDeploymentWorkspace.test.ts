import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'
import {
  DEFAULT_EVENT_SIGNAGE_CONFIGURATION,
  EVENT_SIGNAGE_PRINT_PAYLOAD_KEY,
  resolveCanonicalQrSignConfiguration,
  resolveEventSignageBranding,
  resolveEventSignageQrUrl,
  resolveEventSignageViewModel,
} from '@/lib/event-signage'
import { deploymentQrFileName, deploymentQrPackageFileName, deploymentQrUnavailableReason, deploymentSearchMatches, filterDeploymentSurveys, isUsableDeployment, resolveDeploymentScopeSurveys, type EventDeploymentSurvey } from './EventDeploymentWorkspace'
import { formatSurveyCount } from '@/lib/event-survey-count'

const workspaceSource = fs.readFileSync(path.join(process.cwd(), 'components/events/EventDeploymentWorkspace.tsx'), 'utf8')
const canonicalSignSource = fs.readFileSync(path.join(process.cwd(), 'components/events/CanonicalQrSign.tsx'), 'utf8')
const compositorSource = fs.readFileSync(path.join(process.cwd(), 'components/events/EventSignageSheets.tsx'), 'utf8')
const printPageSource = fs.readFileSync(path.join(process.cwd(), 'app/print/event-signage/page.tsx'), 'utf8')
const signageSource = fs.readFileSync(path.join(process.cwd(), 'lib/event-signage.ts'), 'utf8')
const assetsPanelSource = workspaceSource.slice(
  workspaceSource.indexOf('function DeploymentAssetsPanel'),
  workspaceSource.indexOf('function SignageDesignControls'),
)

function occurrences(source: string, token: string) {
  return source.split(token).length - 1
}

function deployment(id: string, options: { active?: boolean; state?: 'OPEN' | 'NOT_YET_OPEN'; target?: string | null } = {}): EventDeploymentSurvey {
  return {
    id: `deployment-${id}`,
    surveyId: `survey-${id}`,
    name: `Survey ${id}`,
    status: 'ACTIVE',
    isArchived: false,
    target: options.target === null ? null : { name: options.target ?? `Target ${id}`, category: 'SESSION' },
    publicLink: { kioskPath: `/kiosk?token=${id}`, isActive: options.active ?? true },
    availability: { state: options.state ?? 'OPEN', message: 'Available', effectiveOpensAt: null, effectiveClosesAt: null },
    readiness: { responseEligible: options.state !== 'NOT_YET_OPEN', issues: [] },
  }
}

describe('EventDeploymentWorkspace signage ownership', () => {
  it('uses the shared survey-count formatter in Signage Designer for zero, singular, and plural selections', () => {
    expect(formatSurveyCount(0, 'survey')).toBe('0 surveys')
    expect(formatSurveyCount(1, 'survey')).toBe('1 survey')
    expect(formatSurveyCount(2, 'survey')).toBe('2 surveys')
    expect(workspaceSource).toContain("formatSurveyCount(selectedCount, 'survey')")
  })

  it('uses the compact shared Events type roles across roster, menus, and designer controls', () => {
    for (const role of ['event-workspace-type', 'event-type-page-title', 'event-type-section-title', 'event-type-row-title', 'event-type-meta', 'event-type-control', 'event-type-input', 'event-type-pill']) {
      expect(workspaceSource).toContain(role)
    }
  })

  it('renders CanonicalQrSign inside the shared live-preview compositor from one resolved configuration', () => {
    expect(workspaceSource).toContain('resolveCanonicalQrSignConfiguration({ viewModel, qrUrl })')
    expect(workspaceSource).toContain('<EventSignageSheets signs={signs} configuration={previewConfiguration} mode="preview" />')
    expect(compositorSource).toContain('<CanonicalQrSign configuration={{ ...sign.configuration, orientation: layout.orientation }} />')
    expect(workspaceSource).toContain('<SignagePreview')
    expect(workspaceSource).toContain('pageConfiguration={signageConfiguration}')
    expect(workspaceSource).toContain('const [signageConfiguration, setSignageConfiguration]')
    expect(workspaceSource).not.toContain('const previewConfig =')
    expect(workspaceSource).not.toContain('printConfig')
    expect(workspaceSource).not.toContain('downloadConfig')
  })

  it('passes copy, color, logo state, logo source, and the survey QR through the canonical contract', () => {
    const viewModel = resolveEventSignageViewModel({
      configuration: {
        ...DEFAULT_EVENT_SIGNAGE_CONFIGURATION,
        headline: 'We value your feedback',
        supportingLine: 'Share your thoughts.',
        buttonLabel: 'Scan now',
        accent: 'teal',
        useEventBranding: true,
      },
      eventName: 'Summit',
      survey: { id: 'survey-2', name: 'Session Pulse', eventArea: 'Studio A', qrPath: '/kiosk?token=survey-2', availabilityMessage: 'Open' },
      branding: resolveEventSignageBranding({ useEventBranding: true, eventBranding: { logoUrl: '/event-logo.svg' } }),
    })
    const configuration = resolveCanonicalQrSignConfiguration({
      viewModel,
      qrUrl: resolveEventSignageQrUrl(viewModel.qrPath, 'https://voice.signalthread.ai'),
    })

    expect(configuration).toEqual({
      templateId: 'tabletop',
      orientation: 'portrait',
      qrUrl: 'https://voice.signalthread.ai/kiosk?token=survey-2',
      headline: 'We value your feedback',
      supportingText: 'Share your thoughts.',
      buttonLabel: 'Scan now',
      primaryColor: '#0F766E',
      showLogo: true,
      logoSrc: '/event-logo.svg',
      footerText: null,
    })
  })

  it('uses CanonicalQrSign in the output foundation instead of rebuilding sign markup', () => {
    expect(printPageSource).toContain("import { EventSignageSheets }")
    expect(printPageSource).toContain('<EventSignageSheets signs={signs} configuration={payload.pageConfiguration} mode="print" />')
    expect(compositorSource).toContain('<CanonicalQrSign configuration={{ ...sign.configuration, orientation: layout.orientation }} />')
    expect(printPageSource).toContain('resolveCanonicalQrSignConfiguration({')
    expect(printPageSource).toContain('resolveEventSignageQrUrl(survey.qrPath, payload.origin)')
    expect(workspaceSource).not.toContain('buildPrintableSignageHtml')
    expect(workspaceSource).not.toContain('printableSignMarkup')
    expect(printPageSource).not.toContain('document.write(buildPrintableSignageHtml')
  })

  it('retires the old named-slot and generic-grid sign composition', () => {
    for (const source of [workspaceSource, compositorSource, printPageSource, signageSource]) {
      expect(source).not.toContain('grid-template-areas')
      expect(source).not.toContain('slot-headline')
      expect(source).not.toContain('slot-qr')
      expect(source).not.toContain('STACKED_LAYOUTS')
      expect(source).not.toContain('SESSION_LAYOUTS')
    }
    expect(signageSource).toContain("name: 'Tabletop Sign'")
  })

  it('preserves survey-specific QR payloads and scanner safety in the canonical renderer', () => {
    expect(workspaceSource).toContain('qrPath: previewSurvey.publicLink.kioskPath')
    expect(workspaceSource).toContain('qrPath: survey.publicLink?.kioskPath')
    expect(canonicalSignSource).toContain('value={qrUrl}')
    expect(canonicalSignSource).toContain('level="H"')
    expect(canonicalSignSource).toContain('marginSize={4}')
    expect(canonicalSignSource).toContain('bgColor="#FFFFFF"')
    expect(canonicalSignSource).toContain('fgColor="#08111f"')
  })

  it('keeps the existing designer controls wired to the same configuration state', () => {
    for (const field of ['headline', 'supportingLine', 'buttonLabel', 'accent', 'useEventBranding']) {
      expect(workspaceSource).toContain(`update('${field}'`)
    }
    expect(workspaceSource).toContain('configuration={signageConfiguration}')
    expect(workspaceSource).toContain('configuration: visualConfiguration')
    expect(workspaceSource).toContain('aria-label="Signage orientation"')
    expect(workspaceSource).toContain('aria-label="Signs per page"')
    expect(workspaceSource).toContain('isEventSignageLayoutSupported')
  })

  it('offers all templates, preserves copy on switch, and resets only from the selected template defaults', () => {
    expect(workspaceSource).toContain('EVENT_SIGNAGE_TEMPLATES.map')
    expect(workspaceSource).toContain("update('preset', event.target.value")
    expect(workspaceSource).toContain('getEventSignageTemplateVisualDefaults(configuration.preset, configuration.orientation)')
    expect(workspaceSource).not.toContain("onChange(getEventSignageTemplateVisualDefaults(event.target.value")
  })

  it('keeps the dedicated output payload and survey-specific print route', () => {
    expect(EVENT_SIGNAGE_PRINT_PAYLOAD_KEY).toBe('signalthread:event-signage-print')
    expect(workspaceSource).toContain("popup.location.replace(`${window.location.origin}/print/event-signage`)")
    expect(printPageSource).toContain('payload?.surveys.map((survey) =>')
  })

  it('builds deterministic operator-friendly QR filenames', () => {
    expect(deploymentQrFileName('SignalThread Summit 2026', 'AI Lounge', 'Overall Pulse')).toBe('signalthread-summit-2026__ai-lounge__overall-pulse.png')
    expect(deploymentQrFileName('Event / East', 'Main & Expo', '???')).toBe('event-east__main-expo__survey.png')
  })

  it('keeps live survey QR actions inside Deployment', () => {
    expect(assetsPanelSource).toContain('path={survey.publicLink.kioskPath}')
    expect(assetsPanelSource).toContain('onClick={open}')
    expect(assetsPanelSource).toContain('onClick={onDesign}')
    expect(assetsPanelSource).toContain('onClick={onPrint}')
  })

  it('resolves One, Multiple, and All to deterministic existing deployment rows', () => {
    const surveys = [deployment('one'), deployment('two'), deployment('three')]
    expect(resolveDeploymentScopeSurveys({ scope: 'one', surveys, previewSurveyId: 'deployment-two', selectedIds: [] }).map((survey) => survey.id)).toEqual(['deployment-two'])
    expect(resolveDeploymentScopeSurveys({ scope: 'multiple', surveys, previewSurveyId: '', selectedIds: ['deployment-three', 'deployment-one'] }).map((survey) => survey.id)).toEqual(['deployment-one', 'deployment-three'])
    expect(resolveDeploymentScopeSurveys({ scope: 'all', surveys, previewSurveyId: '', selectedIds: [] }).map((survey) => survey.id)).toEqual(['deployment-one', 'deployment-two', 'deployment-three'])
  })

  it('keeps Apply to All event-wide instead of redefining it from temporary filters', () => {
    const surveys = [deployment('open'), deployment('scheduled', { state: 'NOT_YET_OPEN' }), deployment('other-target')]
    const temporarilyVisible = filterDeploymentSurveys(surveys, { filter: 'scheduled', eventArea: 'all', category: 'all' })
    expect(temporarilyVisible).toHaveLength(1)
    expect(resolveDeploymentScopeSurveys({ scope: 'all', surveys, previewSurveyId: '', selectedIds: [] })).toHaveLength(3)
    expect(workspaceSource).toContain('filterDeploymentSurveys(surveys, { filter, eventArea, category })')
    expect(workspaceSource).toContain("return surveys")
  })

  it('filters visible rows by real readiness/target/category without mutating signage configuration', () => {
    const surveys = [
      deployment('ready', { target: 'Main Stage' }),
      deployment('scheduled', { state: 'NOT_YET_OPEN', target: 'Expo' }),
    ]
    const before = JSON.stringify(DEFAULT_EVENT_SIGNAGE_CONFIGURATION)
    expect(filterDeploymentSurveys(surveys, { filter: 'ready', eventArea: 'Main Stage', category: 'SESSION' }).map((survey) => survey.id)).toEqual(['deployment-ready'])
    expect(filterDeploymentSurveys(surveys, { filter: 'scheduled', eventArea: 'all', category: 'all' }).map((survey) => survey.id)).toEqual(['deployment-scheduled'])
    expect(JSON.stringify(DEFAULT_EVENT_SIGNAGE_CONFIGURATION)).toBe(before)
  })

  it('treats every target-scoped assignment as a searchable deployment row', () => {
    const closingSessionAtAfternoonBreak = {
      ...deployment('closing-session-afternoon', { target: 'Afternoon Networking Break' }),
      surveyId: 'survey-closing-session',
      name: 'Closing Session',
      targetId: 'target-afternoon-networking-break',
      publicLinkId: 'link-afternoon-networking-break',
    }
    const closingSessionAtWelcome = {
      ...deployment('closing-session-welcome', { target: 'Welcome Reception' }),
      surveyId: 'survey-closing-session',
      name: 'Closing Session',
      targetId: 'target-welcome-reception',
      publicLinkId: 'link-welcome-reception',
    }

    expect(new Set([closingSessionAtAfternoonBreak.id, closingSessionAtWelcome.id]).size).toBe(2)
    expect(new Set([closingSessionAtAfternoonBreak.targetId, closingSessionAtWelcome.targetId]).size).toBe(2)
    expect(new Set([closingSessionAtAfternoonBreak.publicLinkId, closingSessionAtWelcome.publicLinkId]).size).toBe(2)
    expect([closingSessionAtAfternoonBreak, closingSessionAtWelcome].filter((row) => deploymentSearchMatches(row, 'afternoon'))).toEqual([closingSessionAtAfternoonBreak])
    expect(workspaceSource).toContain('return deploymentSearchMatches(survey, search)')
    expect(workspaceSource).toContain('Deployment target')
    expect(workspaceSource).toContain('Assigned survey')
  })

  it('keeps unassigned non-ready surveys in All while Ready contains only deployable surveys', () => {
    const unassignedDraft = {
      ...deployment('unassigned-draft', { active: false, target: null }),
      status: 'DRAFT',
      publicLink: null,
      readiness: { responseEligible: false, issues: ['Survey is not assigned', 'Survey is unpublished', 'Public survey link is missing'] },
    }
    const unassignedActive = {
      ...deployment('unassigned-active', { active: false, target: null }),
      publicLink: null,
      readiness: { responseEligible: false, issues: ['Survey is not assigned', 'Public survey link is missing'] },
    }
    const assignedReady = deployment('assigned-ready', { target: 'Main Stage' })
    const surveys = [unassignedDraft, unassignedActive, assignedReady]

    expect(filterDeploymentSurveys(surveys, { filter: 'all', eventArea: 'all', category: 'all' })).toHaveLength(3)
    expect(filterDeploymentSurveys(surveys, { filter: 'ready', eventArea: 'all', category: 'all' }).map((survey) => survey.id)).toEqual(['deployment-assigned-ready'])
    expect(isUsableDeployment(unassignedDraft)).toBe(false)
    expect(isUsableDeployment(unassignedActive)).toBe(false)
    expect(isUsableDeployment(assignedReady)).toBe(true)
    expect(deploymentQrUnavailableReason(unassignedDraft)).toBe('Survey not assigned')
    expect(deploymentQrUnavailableReason(unassignedActive)).toBe('Survey not assigned')
    expect(workspaceSource).toContain("survey.target?.name !== filters.eventArea")
    expect(workspaceSource).toContain("survey.target?.category !== filters.category")
    expect(workspaceSource).toContain("survey.target?.name ?? 'Not assigned'")
    expect(workspaceSource).toContain("if (!survey.target) return 'Survey not assigned'")
    expect(workspaceSource).toContain('No QR actions available')
  })

  it('keeps setup-blocked public links unavailable while allowing scheduled QR destinations', () => {
    const missingQuestions = {
      ...deployment('missing-questions'),
      readiness: { responseEligible: false, issues: ['Survey has no questions'] },
    }
    const scheduled = {
      ...deployment('scheduled-ready', { state: 'NOT_YET_OPEN' }),
      readiness: { responseEligible: false, issues: ['Survey is not yet open'] },
    }

    expect(isUsableDeployment(missingQuestions)).toBe(false)
    expect(deploymentQrUnavailableReason(missingQuestions)).toBe('Survey has no questions')
    expect(isUsableDeployment(scheduled)).toBe(true)
  })

  it('uses one pending-safe apply request and refreshes only after server success', () => {
    expect(workspaceSource).toContain('if (!scopeSurveyIds.length || applying) return')
    expect(workspaceSource).toContain("fetch(`/api/app/events/${eventId}/signage?account=${encodeURIComponent(accountSlug)}`")
    expect(workspaceSource).toContain('body: JSON.stringify({ surveyIds: scopeSurveyIds, configuration: visualConfiguration })')
    expect(workspaceSource).toContain('if (!response.ok || !body.success) throw new Error')
    expect(workspaceSource).toContain('const refreshed = await onSignageApplied?.()')
    expect(workspaceSource).not.toContain('router.push')
  })

  it('shows an immediate live success notice next to the designer after persistence', () => {
    expect(workspaceSource).toContain('data-testid="signage-apply-notice"')
    expect(workspaceSource).toContain('role="status" aria-live="polite"')
    expect(workspaceSource).toContain("tone: 'success'")
    expect(workspaceSource).toContain('Design applied to ${scopeSurveys.length} survey')
    expect(workspaceSource).toContain('setApplyNotice(null)')
    expect(workspaceSource.indexOf("setApplyNotice({ message: `Design applied")).toBeLessThan(
      workspaceSource.indexOf('const refreshed = await onSignageApplied?.()'),
    )
  })

  it('loads saved survey configuration in the embedded designer and protects dirty switches', () => {
    expect(workspaceSource).toContain('visualConfigurationForSurvey(survey, savedVisualConfigurations)')
    expect(workspaceSource).toContain("window.confirm('Discard unsaved signage changes and load this survey’s saved design?')")
    expect(workspaceSource).not.toContain("scope === 'one' && previewSurvey && !loadSurveyIntoDesigner")
    expect(workspaceSource).toContain("setDesignScope('one')")
    expect(workspaceSource).toContain("setView('designer')")
    expect(workspaceSource).not.toContain('window.location.assign')
  })

  it('uses the current Apply scope for packages and top-level print while keeping row print singular', () => {
    expect(workspaceSource).toContain('for (const survey of surveysToExport)')
    expect(workspaceSource).toContain('const printSignage = async (surveysToPrint = scopeSurveys)')
    expect(occurrences(assetsPanelSource, 'onClick={onPrint}')).toBe(1)
    expect(workspaceSource).toContain('...visualConfigurationForSurvey(survey, savedVisualConfigurations)')
    expect(workspaceSource).toContain('orientation: printOrientation')
    expect(workspaceSource).toContain('No surveys in this scope have an active public QR destination.')
  })

  it('keeps row Download PNG survey-specific and package names token-free', () => {
    expect(workspaceSource).toContain('path={survey.publicLink.kioskPath}')
    expect(assetsPanelSource).toContain('onClick={() => void downloadPng()}')
    expect(workspaceSource).toContain('deploymentQrPackageFileName(eventName)')
    expect(deploymentQrPackageFileName('SignalThread Summit 2026')).toBe('signalthread-summit-2026-qr-package.zip')
    expect(deploymentQrFileName('Summit', 'Keynote', 'Feedback')).toBe('summit__keynote__feedback.png')
    expect(deploymentQrFileName('Summit', 'Keynote', 'Feedback')).not.toContain('token')
  })

  it('uses the prototype deployment roster with grouped deployability sections', () => {
    expect(workspaceSource).toContain('Survey deployment roster')
    expect(workspaceSource).toContain('Manage kiosk access, QR assets, sign design, and print output for each survey.')
    expect(workspaceSource).toContain('Ready to hand out')
    expect(workspaceSource).toContain('Scheduled deployments')
    expect(workspaceSource).toContain('collection opens at their scheduled time.')
    expect(workspaceSource).toContain("survey.availability.state === 'OPEN'")
    expect(workspaceSource).toContain("survey.availability.state === 'NOT_YET_OPEN'")
    expect(workspaceSource).toContain('Not deployable yet')
    expect(workspaceSource).toContain('Select surveys')
  })

  it('gives short and long survey names a meaningful responsive track without truncating the primary name', () => {
    expect(workspaceSource).toContain("selectionMode ? 'lg:grid-cols-[28px_48px_minmax(220px,1.6fr)")
    expect(workspaceSource).toContain(": 'lg:grid-cols-[48px_minmax(220px,1.6fr)")
    expect(workspaceSource).toContain('className="event-type-row-title break-words')
    expect(workspaceSource).toContain('className="event-type-row-title truncate')
    expect(workspaceSource).toContain('className="event-type-meta mt-0.5 truncate')
    expect(workspaceSource).toContain('deployment-unavailable-actions')
    expect(workspaceSource).toContain('No QR actions available')
  })

  it('shows one labeled instance of every required Assets action', () => {
    for (const label of ['Copy link', 'Open kiosk', 'Download QR PNG', 'View QR', 'Design signage', 'Print signage']) {
      expect(occurrences(assetsPanelSource, label), label).toBe(1)
    }
    expect(assetsPanelSource).not.toContain('<EventSurveyRowActions')
  })

  it('keeps the prototype roster structure as a presentation layer over real deployment state', () => {
    expect(workspaceSource).toContain('filterDeploymentSurveys(surveys, { filter, eventArea, category }).filter')
    expect(workspaceSource).toContain("['needs-setup', 'Needs setup']")
    expect(workspaceSource).toContain("['draft', 'Draft']")
    expect(workspaceSource).toContain('No surveys match')
    expect(workspaceSource).toContain('Design signage')
    expect(workspaceSource).toContain('Download pack')
    expect(workspaceSource).toContain('Get QR pack')
  })

  it('keeps the Assets panel connected to the existing QR, kiosk, and signage actions', () => {
    expect(assetsPanelSource).toContain('Kiosk public link')
    expect(assetsPanelSource).toContain('onClick={() => void copyLink()}')
    expect(assetsPanelSource).toContain('href={survey.publicLink!.kioskPath}')
    expect(assetsPanelSource).toContain('onClick={() => void downloadPng()}')
    expect(assetsPanelSource).toContain('onClick={open}')
    expect(assetsPanelSource).toContain('onClick={onDesign}')
    expect(assetsPanelSource).toContain('onClick={onPrint}')
    expect(assetsPanelSource).toContain('<SurveyQrCard')
  })

  it('announces immediate visible feedback after Copy link succeeds', () => {
    expect(assetsPanelSource).toContain('role="status" aria-live="polite"')
    expect(assetsPanelSource).toContain("{copied ? 'Link copied to clipboard.' : ''}")
    expect(assetsPanelSource).toContain("{copied ? 'Copied' : 'Copy link'}")
  })

  it('uses a row-anchored Assets popover and the existing QR-pack / print flows', () => {
    expect(workspaceSource).toContain('anchor: HTMLButtonElement')
    expect(workspaceSource).toContain('anchor.getBoundingClientRect()')
    expect(workspaceSource).toContain('role="dialog" aria-label={`${survey.name} assets`}')
    expect(workspaceSource).not.toContain('flex h-full w-full max-w-md flex-col')
    expect(workspaceSource).toContain('aria-label="Get QR pack options"')
    expect(workspaceSource).toContain('All ready surveys')
    expect(workspaceSource).toContain('Current selection')
    expect(workspaceSource).toContain('Print-ready PDF')
    expect(workspaceSource).toContain('void downloadBulkQr(applicableSurveys)')
    expect(workspaceSource).toContain('void printSignage(applicableSurveys)')
  })

  it('dismisses the QR pack menu on outside pointer interaction and Escape with focus restoration', () => {
    expect(workspaceSource).toContain('ref={qrPackMenuRef}')
    expect(workspaceSource).toContain('ref={qrPackToggleRef}')
    expect(workspaceSource).toContain("document.addEventListener('pointerdown', handlePointerDown)")
    expect(workspaceSource).toContain("if (event.key !== 'Escape') return")
    expect(workspaceSource).toContain('qrPackToggleRef.current?.focus()')
    expect(workspaceSource).toContain("document.removeEventListener('pointerdown', handlePointerDown)")
    expect(workspaceSource).toContain("document.removeEventListener('keydown', handleKeyDown)")
  })

  it('preserves the split-button action, menu options, and selection-aware disabled state', () => {
    expect(workspaceSource).toContain('onClick={() => void downloadBulkQr(applicableSurveys)}')
    expect(workspaceSource).toContain('onClick={() => setQrPackMenuOpen((open) => !open)}')
    expect(workspaceSource).toContain('aria-haspopup="menu"')
    expect(workspaceSource).toContain('<span>All ready surveys</span>')
    expect(workspaceSource).toContain('<span>Current selection</span>')
    expect(workspaceSource).toContain('<span>Print-ready PDF</span>')
    expect(workspaceSource).toContain('disabled={!selectedApplicable.length}')
  })
})
