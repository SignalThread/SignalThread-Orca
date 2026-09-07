'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { ArrowLeft, ChevronDown, Download, FileText, LayoutTemplate, Palette, QrCode, Search } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { SurveyQrCard } from '@/components/ui/SurveyQrCard'
import type { StatusPillTone } from '@/components/ui/StatusPill'
import { formatSurveyCount } from '@/lib/event-survey-count'
import { EventSignageSheets } from '@/components/events/EventSignageSheets'
import {
  DEFAULT_EVENT_SIGNAGE_CONFIGURATION,
  DEFAULT_EVENT_SIGNAGE_VISUAL_CONFIGURATION,
  EVENT_SIGNAGE_PRINT_PAYLOAD_KEY,
  EVENT_SIGNAGE_ACCENTS,
  EVENT_SIGNAGE_TEMPLATES,
  getEventSignageTemplateVisualDefaults,
  isEventSignageLayoutSupported,
  resolveCanonicalQrSignConfiguration,
  resolveEventSignageBranding,
  resolveEventSignageQrUrl,
  resolveEventSignageViewModel,
  toEventSignageVisualConfiguration,
  withEventSignageCardsPerPage,
  withEventSignageVisualConfiguration,
  type EventSignageBranding,
  type EventSignageConfiguration,
  type EventSignagePrintPayload,
  type EventSignageVisualConfiguration,
  type EventSignageViewModel,
} from '@/lib/event-signage'

export interface EventDeploymentSurvey {
  id: string
  surveyId?: string
  targetId?: string | null
  publicLinkId?: string | null
  name: string
  status: string
  isArchived: boolean
  target: { id?: string; name: string; category: string; eventStructureItemId?: string | null } | null
  publicLink: { id?: string; kioskPath: string; isActive: boolean } | null
  availability: {
    state: 'OPEN' | 'NOT_YET_OPEN' | 'CLOSED' | 'INVALID'
    message: string
    effectiveOpensAt: string | null
    effectiveClosesAt: string | null
  }
  readiness: { responseEligible: boolean; issues: string[] }
  signageConfiguration?: EventSignageVisualConfiguration | null
}

type DeploymentFilter = 'all' | 'ready' | 'scheduled' | 'needs-setup' | 'draft'
type DesignScope = 'one' | 'multiple' | 'all'
type DeploymentView = 'roster' | 'designer'

export function EventDeploymentWorkspace({
  eventId,
  accountSlug,
  eventName,
  surveys,
  accountBranding,
  eventBranding,
  initialSurveyId,
  onSignageApplied,
  onDone,
}: {
  eventId: string
  accountSlug: string
  eventName: string
  surveys: EventDeploymentSurvey[]
  accountBranding?: EventSignageBranding | null
  eventBranding?: EventSignageBranding | null
  initialSurveyId?: string | null
  onSignageApplied?: () => Promise<boolean | void> | boolean | void
  onDone?: () => void
}) {
  const [filter, setFilter] = useState<DeploymentFilter>('all')
  const [eventArea, setEventArea] = useState('all')
  const [category, setCategory] = useState('all')
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [selectionMode, setSelectionMode] = useState(false)
  const [assetPopover, setAssetPopover] = useState<{ surveyId: string; anchor: HTMLButtonElement } | null>(null)
  const [qrPackMenuOpen, setQrPackMenuOpen] = useState(false)
  const [view, setView] = useState<DeploymentView>('roster')
  const [origin, setOrigin] = useState('')
  const [exporting, setExporting] = useState(false)
  const [applying, setApplying] = useState(false)
  const [exportNotice, setExportNotice] = useState<string | null>(null)
  const [applyNotice, setApplyNotice] = useState<{ message: string; tone: 'success' | 'warning' } | null>(null)
  const [signageConfiguration, setSignageConfiguration] = useState<EventSignageConfiguration>(DEFAULT_EVENT_SIGNAGE_CONFIGURATION)
  const [previewSurveyId, setPreviewSurveyId] = useState('')
  const [designScope, setDesignScope] = useState<DesignScope>('one')
  const [designSearch, setDesignSearch] = useState('')
  const [designerDirty, setDesignerDirty] = useState(false)
  const [savedVisualConfigurations, setSavedVisualConfigurations] = useState<Record<string, EventSignageVisualConfiguration>>({})
  const canvasBySurveyId = useRef(new Map<string, HTMLCanvasElement>())
  const initialSurveyHandledRef = useRef(false)
  const qrPackMenuRef = useRef<HTMLDivElement>(null)
  const qrPackToggleRef = useRef<HTMLButtonElement>(null)

  // A design can be prepared before its response window opens. A current,
  // active public link is the boundary for QR download/preview/print actions.
  const applicableSurveys = useMemo(() => surveys.filter(isUsableDeployment), [surveys])

  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])

  useEffect(() => {
    if (!qrPackMenuOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!qrPackMenuRef.current?.contains(event.target as Node)) setQrPackMenuOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setQrPackMenuOpen(false)
      qrPackToggleRef.current?.focus()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [qrPackMenuOpen])

  useEffect(() => {
    setSavedVisualConfigurations((current) => {
      const next = { ...current }
      for (const survey of surveys) {
        if (survey.signageConfiguration) next[underlyingSurveyId(survey)] = survey.signageConfiguration
      }
      return next
    })
  }, [surveys])

  useEffect(() => {
    setPreviewSurveyId((current) => {
      if (applicableSurveys.some((survey) => survey.id === current)) return current
      const next = applicableSurveys[0]
      if (next) {
        setSignageConfiguration((configuration) => withEventSignageVisualConfiguration(
          configuration,
          visualConfigurationForSurvey(next, savedVisualConfigurations),
        ))
        setDesignerDirty(false)
      }
      return next?.id ?? ''
    })
  }, [applicableSurveys])

  const areas = useMemo(() => Array.from(new Set(surveys.flatMap((survey) => survey.target ? [survey.target.name] : []))).sort(), [surveys])
  const categories = useMemo(() => Array.from(new Set(surveys.flatMap((survey) => survey.target ? [survey.target.category] : []))).sort(), [surveys])
  const filtered = filterDeploymentSurveys(surveys, { filter, eventArea, category }).filter((survey) => {
    return deploymentSearchMatches(survey, search)
  })
  const selectedApplicable = applicableSurveys.filter((survey) => selectedIds.includes(survey.id))
  const deployableSurveys = filtered.filter(isUsableDeployment)
  const readyDeployments = deployableSurveys.filter((survey) => survey.availability.state === 'OPEN')
  const scheduledDeployments = deployableSurveys.filter((survey) => survey.availability.state === 'NOT_YET_OPEN')
  const unavailableSurveys = filtered.filter((survey) => !isUsableDeployment(survey))
  const readyToShareCount = applicableSurveys.filter((survey) => survey.availability.state === 'OPEN').length
  const scheduledDeploymentCount = applicableSurveys.filter((survey) => survey.availability.state === 'NOT_YET_OPEN').length
  const previewSurvey = applicableSurveys.find((survey) => survey.id === previewSurveyId) ?? applicableSurveys[0] ?? null
  const visibleDesignSurveys = applicableSurveys.filter((survey) => `${survey.name} ${deploymentTargetName(survey)}`.toLowerCase().includes(designSearch.trim().toLowerCase()))
  const eligibleVisibleIds = visibleDesignSurveys.map((survey) => survey.id)
  const scopeSurveys = resolveDeploymentScopeSurveys({
    scope: designScope,
    surveys: applicableSurveys,
    previewSurveyId: previewSurvey?.id ?? '',
    selectedIds,
  })
  const scopeSurveyIds = uniqueSurveyIds(scopeSurveys)
  const scopeLabel = designScope === 'one'
    ? 'Apply to survey'
    : designScope === 'multiple'
      ? `Apply to ${scopeSurveys.length} surveys`
      : `Apply to all ${applicableSurveys.length} surveys`
  const resolvedBranding = useMemo(() => resolveEventSignageBranding({
    useEventBranding: signageConfiguration.useEventBranding,
    eventBranding,
    accountBranding,
  }), [accountBranding, eventBranding, signageConfiguration.useEventBranding])
  const printBranding = useMemo(() => resolveEventSignageBranding({
    useEventBranding: true,
    eventBranding,
    accountBranding,
  }), [accountBranding, eventBranding])
  const previewViewModel = previewSurvey?.publicLink
    ? resolveEventSignageViewModel({
        configuration: signageConfiguration,
        eventName,
        survey: {
          id: previewSurvey.id,
          name: previewSurvey.name,
          eventArea: deploymentTargetName(previewSurvey),
          qrPath: previewSurvey.publicLink.kioskPath,
          availabilityMessage: previewSurvey.availability.message,
        },
        branding: resolvedBranding,
      })
    : null

  const toggleSelected = (surveyId: string) => {
    setSelectedIds((current) => current.includes(surveyId)
      ? current.filter((id) => id !== surveyId)
      : [...current, surveyId])
  }

  const loadSurveyIntoDesigner = (surveyId: string, options: { focus?: boolean; warnIfDirty?: boolean; warnAlways?: boolean } = {}) => {
    const survey = applicableSurveys.find((candidate) => candidate.id === surveyId)
    if (!survey) return false
    if (options.warnIfDirty !== false && designerDirty && (options.warnAlways || survey.id !== previewSurveyId)) {
      const discard = window.confirm('Discard unsaved signage changes and load this survey’s saved design?')
      if (!discard) return false
    }
    setPreviewSurveyId(survey.id)
    setSignageConfiguration((configuration) => withEventSignageVisualConfiguration(
      configuration,
      visualConfigurationForSurvey(survey, savedVisualConfigurations),
    ))
    setDesignerDirty(false)
    setApplyNotice(null)
    if (options.focus) setView('designer')
    return true
  }

  const designSurvey = (surveyId: string) => {
    if (!loadSurveyIntoDesigner(surveyId, { focus: true, warnAlways: true })) return
    setDesignScope('one')
  }

  const openDesigner = (scope: DesignScope = 'all', surveyId?: string) => {
    if (surveyId) loadSurveyIntoDesigner(surveyId, { warnAlways: true })
    setApplyNotice(null)
    setDesignScope(scope)
    setView('designer')
  }

  const resetDesign = () => {
    setSignageConfiguration((configuration) => withEventSignageVisualConfiguration(
      configuration,
      getEventSignageTemplateVisualDefaults(configuration.preset, configuration.orientation),
    ))
    setDesignerDirty(true)
    setApplyNotice(null)
  }

  const handleScopeChange = (scope: DesignScope) => {
    if (scope === designScope) return
    setApplyNotice(null)
    setDesignScope(scope)
  }

  const handleConfigurationChange = (configuration: EventSignageConfiguration) => {
    const visualChanged = JSON.stringify(toEventSignageVisualConfiguration(configuration))
      !== JSON.stringify(toEventSignageVisualConfiguration(signageConfiguration))
    setSignageConfiguration(configuration)
    if (visualChanged) {
      setDesignerDirty(true)
      setApplyNotice(null)
    }
  }

  const applyDesign = async () => {
    if (!scopeSurveyIds.length || applying) return
    setApplying(true)
    setExportNotice(null)
    setApplyNotice(null)
    const visualConfiguration = toEventSignageVisualConfiguration(signageConfiguration)
    try {
      const response = await fetch(`/api/app/events/${eventId}/signage?account=${encodeURIComponent(accountSlug)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ surveyIds: scopeSurveyIds, configuration: visualConfiguration }),
      })
      const body = await response.json().catch(() => ({})) as {
        success?: boolean
        error?: string
        data?: { configuration?: EventSignageVisualConfiguration }
      }
      if (!response.ok || !body.success) throw new Error(body.error || 'Failed to apply signage design')
      const appliedConfiguration = body.data?.configuration ?? visualConfiguration

      setSavedVisualConfigurations((current) => ({
        ...current,
        ...Object.fromEntries(scopeSurveyIds.map((id) => [id, appliedConfiguration])),
      }))
      setDesignerDirty(false)
      setApplyNotice({ message: `Design applied to ${scopeSurveys.length} survey${scopeSurveys.length === 1 ? '' : 's'}. Each QR keeps its own destination.`, tone: 'success' })
      const refreshed = await onSignageApplied?.()
      if (refreshed === false) setApplyNotice({ message: `Design saved for ${scopeSurveys.length} survey${scopeSurveys.length === 1 ? '' : 's'}, but the list could not be refreshed.`, tone: 'warning' })
    } catch (error) {
      setExportNotice(error instanceof Error ? error.message : 'Failed to apply signage design')
    } finally {
      setApplying(false)
    }
  }

  useEffect(() => {
    if (initialSurveyHandledRef.current || !initialSurveyId) return
    const selected = applicableSurveys.find((survey) => survey.id === initialSurveyId || survey.surveyId === initialSurveyId)
    if (!selected) return
    initialSurveyHandledRef.current = true
    loadSurveyIntoDesigner(selected.id, { focus: true, warnIfDirty: false })
    setDesignScope('one')
  }, [applicableSurveys, initialSurveyId])

  const downloadBulkQr = async (surveysToExport = scopeSurveys) => {
    if (surveysToExport.length === 0 || exporting) return
    setExporting(true)
    setExportNotice(null)
    try {
      const { default: JSZip } = await import('jszip')
      const zip = new JSZip()
      const usedNames = new Map<string, number>()
      const included: string[] = []
      const omitted: string[] = []
      for (const survey of surveysToExport) {
        const canvas = canvasBySurveyId.current.get(survey.id)
        const blob = canvas ? await canvasToBlob(canvas) : null
        if (!blob) {
          omitted.push(`${survey.name} — ${deploymentTargetName(survey)}`)
          continue
        }
        const fileName = uniquePackageAssetName(
          deploymentQrFileName(eventName, deploymentTargetName(survey), survey.name),
          usedNames,
        )
        zip.file(fileName, blob)
        included.push(`${survey.name} — ${deploymentTargetName(survey)}: ${fileName}`)
      }
      if (included.length === 0) throw new Error('No usable survey QR assets were available for this package.')
      zip.file('README.txt', [
        `SignalThread QR package for ${eventName}`,
        `${included.length} QR asset${included.length === 1 ? '' : 's'} included.`,
        '',
        ...included,
        ...(omitted.length ? ['', `${omitted.length} omitted because QR rendering was unavailable:`, ...omitted] : []),
        '',
      ].join('\n'))
      const blob = await zip.generateAsync({ type: 'blob' })
      downloadBlob(blob, deploymentQrPackageFileName(eventName))
      setExportNotice(omitted.length
        ? `QR package ready with ${included.length} asset${included.length === 1 ? '' : 's'}; ${omitted.length} unavailable asset${omitted.length === 1 ? '' : 's'} omitted and listed in the manifest.`
        : `QR package ready for ${included.length} survey${included.length === 1 ? '' : 's'}.`)
    } catch (error) {
      setExportNotice(error instanceof Error ? error.message : 'QR package could not be prepared.')
    } finally {
      setExporting(false)
    }
  }

  const printSignage = async (surveysToPrint = scopeSurveys) => {
    const printableSurveys = surveysToPrint.filter(isUsableDeployment)
    if (printableSurveys.length === 0) {
      setExportNotice('No surveys in this scope have an active public QR destination.')
      return
    }
    if (printableSurveys.length !== surveysToPrint.length) {
      setExportNotice('Some surveys in this scope do not have an active public QR destination and cannot be printed.')
      return
    }
    if (!isEventSignageLayoutSupported(signageConfiguration)) {
      setExportNotice('Choose a print layout that keeps every QR code at least 1 inch wide.')
      return
    }
    // Open synchronously from the click gesture. Once the logo/QR payload is
    // ready, the window is navigated to the dedicated same-origin print route.
    const popup = window.open('', '_blank')
    if (!popup) {
      setExportNotice('Allow pop-ups to open printable signage.')
      return
    }
    popup.opener = null
    popup.document.write('<!doctype html><html><head><title>Preparing survey signage</title></head><body><p style="font:14px Arial,sans-serif;padding:24px">Preparing printable signage…</p></body></html>')
    popup.document.close()
    try {
      if (popup.closed) return
      const singleSurveyVisualConfiguration = printableSurveys.length === 1
        ? visualConfigurationForSurvey(printableSurveys[0], savedVisualConfigurations)
        : null
      const printOrientation = singleSurveyVisualConfiguration?.orientation ?? signageConfiguration.orientation
      const printPayload: EventSignagePrintPayload = {
        eventName,
        origin,
        pageConfiguration: {
          orientation: printOrientation,
          cardsPerPage: signageConfiguration.cardsPerPage,
        },
        branding: printBranding,
        surveys: printableSurveys.map((survey) => {
          return {
            id: survey.id,
            name: survey.name,
            eventArea: deploymentTargetName(survey),
            qrPath: survey.publicLink?.kioskPath ?? '',
            availabilityMessage: survey.availability.message,
            signageConfiguration: {
              ...visualConfigurationForSurvey(survey, savedVisualConfigurations),
              orientation: printOrientation,
            },
          }
        }),
      }
      popup.sessionStorage.setItem(EVENT_SIGNAGE_PRINT_PAYLOAD_KEY, JSON.stringify(printPayload))
      popup.location.replace(`${window.location.origin}/print/event-signage`)
    } catch {
      popup.close()
      setExportNotice('Printable signage could not be prepared. Please try again.')
    }
  }

  const assetSurvey = surveys.find((survey) => survey.id === assetPopover?.surveyId) ?? null
  const draftCount = surveys.filter((survey) => survey.status === 'DRAFT').length
  const needsSetupCount = surveys.filter((survey) => !isUsableDeployment(survey) && survey.status !== 'DRAFT').length

  return (
    <div className="event-workspace-type space-y-5" data-testid="event-deployment-workspace">
      {view === 'designer' ? (
        <section className="overflow-hidden rounded-2xl border border-[#e5e8ef] bg-white shadow-[0_1px_2px_rgba(15,23,42,.03)]" aria-labelledby="signage-design-title" data-testid="signage-design">
          <header className="flex flex-col gap-3 border-b border-[#e5e8ef] px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-3"><button type="button" onClick={() => setView('roster')} className="event-type-control inline-flex items-center gap-1 text-slate-600 hover:text-slate-950"><ArrowLeft className="h-4 w-4" />Back to Deploy</button><span className="hidden h-5 w-px bg-slate-200 sm:block" /><h2 id="signage-design-title" className="event-type-section-title text-[#0B1220]">Signage designer</h2></div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="event-type-meta text-slate-600">Applying to <select value={designScope} onChange={(event) => handleScopeChange(event.target.value as DesignScope)} className="event-type-input ml-1 h-9 rounded-lg border border-slate-300 bg-white px-2 text-slate-900"><option value="one">One survey</option><option value="multiple">Multiple surveys</option><option value="all">All eligible surveys</option></select></label>
              <Button size="sm" variant="secondary" onClick={resetDesign} disabled={applying}>Reset</Button>
              <Button size="sm" onClick={() => { void applyDesign() }} disabled={applying || scopeSurveys.length === 0}>{applying ? 'Applying...' : 'Apply design'}</Button>
            </div>
          </header>
          {applyNotice && <p role="status" aria-live="polite" data-testid="signage-apply-notice" className={`event-type-control border-b px-4 py-3 sm:px-6 ${applyNotice.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>{applyNotice.message}</p>}
          {previewViewModel && origin ? <div className="grid lg:grid-cols-[minmax(300px,.72fr)_minmax(0,1.28fr)]">
            <SignageDesignControls
              configuration={signageConfiguration}
              onChange={handleConfigurationChange}
              designScope={designScope}
              onScopeChange={handleScopeChange}
              applicableSurveys={applicableSurveys}
              previewSurveyId={previewSurvey?.id ?? ''}
              onPreviewSurveyChange={(surveyId) => { loadSurveyIntoDesigner(surveyId) }}
              selectedCount={designScope === 'multiple' ? selectedApplicable.length : scopeSurveys.length}
              designSearch={designSearch}
              onDesignSearchChange={setDesignSearch}
              visibleDesignSurveys={visibleDesignSurveys}
              selectedIds={selectedIds}
              onToggleSelected={toggleSelected}
              onSelectAllVisible={() => setSelectedIds(eligibleVisibleIds)}
              onClearSelection={() => setSelectedIds([])}
              eligibleCount={applicableSurveys.length}
              applyLabel={scopeLabel}
              applying={applying}
              onApply={() => { void applyDesign() }}
              hideScopeAndActions
            />
            <SignagePreview viewModel={previewViewModel} qrUrl={resolveEventSignageQrUrl(previewViewModel.qrPath, origin)} pageConfiguration={signageConfiguration} />
          </div> : <p className="event-type-summary px-3 py-10 text-center text-slate-500">A ready Survey with an active public link is required before signage can be designed.</p>}
        </section>
      ) : <>
        <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div><h2 className="event-type-page-title text-slate-950 dark:text-white">Deployment</h2><p className="event-type-summary mt-1 text-slate-600 dark:text-slate-400">{formatSurveyCount(readyToShareCount, 'survey')} ready to share{scheduledDeploymentCount ? ` · ${formatSurveyCount(scheduledDeploymentCount, 'scheduled survey')}` : ''}{needsSetupCount ? ` · ${needsSetupCount} need setup` : ''}{draftCount ? ` · ${draftCount} draft${draftCount === 1 ? '' : 's'}` : ''}</p></div>
          <div className="flex flex-wrap gap-2">{onDone && <Button size="sm" variant="secondary" onClick={onDone}>Done</Button>}<Button size="sm" variant="secondary" onClick={() => openDesigner('all')}><LayoutTemplate className="h-4 w-4" />Signage designer</Button><div ref={qrPackMenuRef} className="relative inline-flex"><Button size="sm" className="rounded-r-none" onClick={() => void downloadBulkQr(applicableSurveys)} disabled={!applicableSurveys.length || exporting}><Download className="h-4 w-4" />{exporting ? 'Preparing...' : 'Get QR pack'}</Button><button ref={qrPackToggleRef} type="button" aria-label="Get QR pack options" aria-haspopup="menu" aria-expanded={qrPackMenuOpen} onClick={() => setQrPackMenuOpen((open) => !open)} className="event-type-control inline-flex min-h-[36px] items-center rounded-r-lg border-l border-white/30 bg-blue-600 px-2 text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-zinc-300" disabled={!applicableSurveys.length || exporting}><ChevronDown className="h-4 w-4" /></button>{qrPackMenuOpen && <div role="menu" aria-label="Get QR pack options" className="absolute right-0 top-[calc(100%+8px)] z-30 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"><button type="button" role="menuitem" onClick={() => { setQrPackMenuOpen(false); void downloadBulkQr(applicableSurveys) }} className="event-type-control flex w-full items-center justify-between px-4 py-3 text-left text-slate-800 hover:bg-slate-50 dark:text-zinc-100 dark:hover:bg-zinc-800"><span>All ready surveys</span><span className="event-type-meta text-slate-400">{applicableSurveys.length} QR{applicableSurveys.length === 1 ? '' : 's'}</span></button><button type="button" role="menuitem" onClick={() => { setQrPackMenuOpen(false); if (selectedApplicable.length) void downloadBulkQr(selectedApplicable) }} disabled={!selectedApplicable.length} className="event-type-control flex w-full items-center justify-between px-4 py-3 text-left text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400 dark:text-zinc-100 dark:hover:bg-zinc-800"><span>Current selection</span><span className="event-type-meta text-slate-400">{selectedApplicable.length ? `${selectedApplicable.length} selected` : 'None selected'}</span></button><button type="button" role="menuitem" onClick={() => { setQrPackMenuOpen(false); void printSignage(applicableSurveys) }} className="event-type-control flex w-full items-center justify-between px-4 py-3 text-left text-slate-800 hover:bg-slate-50 dark:text-zinc-100 dark:hover:bg-zinc-800"><span>Print-ready PDF</span><span className="event-type-meta text-slate-400">US Letter</span></button></div>}</div></div>
        </header>

        <section aria-labelledby="survey-deployment-assets-title" data-testid="survey-deployment-assets" className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,.03)] dark:border-zinc-800 dark:bg-zinc-900/70">
          <header className="space-y-3 border-b border-zinc-200 px-4 py-4 sm:px-5 dark:border-zinc-800">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 id="survey-deployment-assets-title" className="event-type-section-title text-zinc-950 dark:text-white">Survey deployment roster</h3><p className="event-type-meta mt-0.5 text-zinc-500">Manage kiosk access, QR assets, sign design, and print output for each survey.</p></div><button type="button" onClick={() => { setSelectionMode((active) => !active); if (selectionMode) setSelectedIds([]) }} className="event-type-control text-blue-700 hover:text-blue-800">{selectionMode ? 'Done selecting' : 'Select surveys'}</button></div>
            <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between"><div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1" aria-label="Deployment filters">{([['all', 'All'], ['ready', 'Ready'], ['needs-setup', 'Needs setup'], ['draft', 'Draft']] as Array<[DeploymentFilter, string]>).map(([key, label]) => <button key={key} type="button" onClick={() => setFilter(key)} aria-pressed={filter === key} className={`event-type-control rounded-lg px-3 py-1.5 ${filter === key ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600 hover:text-slate-950'}`}>{label}</button>)}</div><div className="flex flex-wrap gap-2"><label className="relative"><Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search surveys" aria-label="Search deployments" className="event-type-input h-8 w-52 rounded-lg border border-zinc-300 bg-white pl-8 pr-3 dark:border-zinc-700 dark:bg-zinc-950" /></label><select value={eventArea} onChange={(event) => setEventArea(event.target.value)} aria-label="Filter by Target" className="event-type-input h-8 max-w-40 rounded-lg border border-zinc-300 bg-white px-2 dark:border-zinc-700 dark:bg-zinc-950"><option value="all">All targets</option>{areas.map((area) => <option key={area} value={area}>{area}</option>)}</select><select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Filter by Target category" className="event-type-input h-8 max-w-40 rounded-lg border border-zinc-300 bg-white px-2 dark:border-zinc-700 dark:bg-zinc-950"><option value="all">All categories</option>{categories.map((value) => <option key={value} value={value}>{formatCategory(value)}</option>)}</select></div></div>
          </header>
          {filtered.length === 0 ? <div className="px-5 py-16 text-center"><QrCode className="mx-auto h-8 w-8 text-slate-300" /><p className="event-type-row-title mt-3 text-slate-700">No surveys match</p><p className="event-type-meta mt-1 text-slate-500">Try changing your search or filters.</p></div> : <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {readyDeployments.length > 0 && <DeploymentSection title="Ready to hand out" description="Active target deployments and their QR assets are ready for attendees.">{readyDeployments.map((survey) => <DeploymentRosterRow key={survey.id} survey={survey} eventName={eventName} origin={origin} selected={selectedIds.includes(survey.id)} selectionMode={selectionMode} onToggleSelected={toggleSelected} onAssets={(anchor) => setAssetPopover({ surveyId: survey.id, anchor })} savedDesign={Boolean(savedVisualConfigurations[underlyingSurveyId(survey)] || survey.signageConfiguration)} />)}</DeploymentSection>}
            {scheduledDeployments.length > 0 && <DeploymentSection title="Scheduled deployments" description="These active target deployments have QR assets ready, but collection opens at their scheduled time.">{scheduledDeployments.map((survey) => <DeploymentRosterRow key={survey.id} survey={survey} eventName={eventName} origin={origin} selected={selectedIds.includes(survey.id)} selectionMode={selectionMode} onToggleSelected={toggleSelected} onAssets={(anchor) => setAssetPopover({ surveyId: survey.id, anchor })} savedDesign={Boolean(savedVisualConfigurations[underlyingSurveyId(survey)] || survey.signageConfiguration)} />)}</DeploymentSection>}
            {unavailableSurveys.length > 0 && <DeploymentSection title="Not deployable yet" description="These surveys need an assignment, publication, or availability update before QR assets can be shared.">{unavailableSurveys.map((survey) => <DeploymentUnavailableRow key={survey.id} survey={survey} />)}</DeploymentSection>}
          </div>}
        </section>
      </>}

      {exportNotice && <p className="event-type-meta text-zinc-500 dark:text-zinc-400" role="status">{exportNotice}</p>}
      {view === 'roster' && selectionMode && selectedApplicable.length > 0 && <div className="sticky bottom-4 z-20 mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-950 px-4 py-3 text-white shadow-xl"><p className="event-type-control">{selectedApplicable.length} survey{selectedApplicable.length === 1 ? '' : 's'} selected</p><div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={() => openDesigner('multiple')}>Design signage</Button><Button size="sm" variant="secondary" onClick={() => void downloadBulkQr(selectedApplicable)} disabled={exporting}><Download className="h-4 w-4" />Download pack</Button><Button size="sm" onClick={() => void printSignage(selectedApplicable)}><FileText className="h-4 w-4" />Print</Button></div></div>}
      {assetSurvey && assetPopover && <DeploymentAssetsPanel survey={assetSurvey} anchor={assetPopover.anchor} eventName={eventName} onClose={() => setAssetPopover(null)} onDesign={() => { setAssetPopover(null); designSurvey(assetSurvey.id) }} onPrint={() => void printSignage([assetSurvey])} />}

      <div className="pointer-events-none absolute -left-[9999px] top-0 opacity-0" aria-hidden="true">
        {applicableSurveys.map((survey) => survey.publicLink && origin ? (
          <QRCodeCanvas key={survey.id} value={resolveEventSignageQrUrl(survey.publicLink.kioskPath, origin)} size={1024} level="H" marginSize={4} bgColor="#FFFFFF" fgColor="#111827" ref={(canvas) => {
            if (canvas) canvasBySurveyId.current.set(survey.id, canvas)
            else canvasBySurveyId.current.delete(survey.id)
          }} />
        ) : null)}
      </div>
    </div>
  )
}

function DeploymentSection({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <section className="px-4 py-4 sm:px-5">
    <div className="mb-3 flex items-baseline justify-between gap-3"><div><h4 className="event-type-section-title text-slate-950 dark:text-white">{title}</h4><p className="event-type-meta mt-0.5 text-slate-500">{description}</p></div></div>
    <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-zinc-800">{children}</div>
  </section>
}

function DeploymentRosterRow({
  survey,
  eventName,
  origin,
  selected,
  selectionMode,
  onToggleSelected,
  onAssets,
  savedDesign,
}: {
  survey: EventDeploymentSurvey
  eventName: string
  origin: string
  selected: boolean
  selectionMode: boolean
  onToggleSelected: (surveyId: string) => void
  onAssets: (anchor: HTMLButtonElement) => void
  savedDesign: boolean
}) {
  const status = deploymentStatus(survey)
  const statusPresentation = deploymentStatusPresentation(survey, status)
  const qrUrl = survey.publicLink && origin ? resolveEventSignageQrUrl(survey.publicLink.kioskPath, origin) : ''
  return <div data-testid="deployment-survey-row" className={`grid gap-3 border-b border-slate-100 bg-white px-3 py-3 last:border-b-0 lg:items-center lg:px-4 dark:border-zinc-800 dark:bg-zinc-900/40 ${selectionMode ? 'lg:grid-cols-[28px_48px_minmax(220px,1.6fr)_minmax(130px,.75fr)_minmax(140px,.8fr)_auto]' : 'lg:grid-cols-[48px_minmax(220px,1.6fr)_minmax(130px,.75fr)_minmax(140px,.8fr)_auto]'}`}>
    {selectionMode && <label className="grid h-7 w-7 place-items-center"><input type="checkbox" checked={selected} onChange={() => onToggleSelected(survey.id)} aria-label={`Select ${survey.name}`} className="h-4 w-4 rounded border-slate-300 text-blue-700" /></label>}
    <div className="grid h-11 w-11 place-items-center overflow-hidden rounded-lg border border-slate-200 bg-white p-1 dark:border-zinc-700">{qrUrl ? <QRCodeCanvas value={qrUrl} size={40} level="H" marginSize={1} bgColor="#FFFFFF" fgColor="#111827" /> : <QrCode className="h-5 w-5 text-slate-400" />}</div>
    <div className="min-w-0"><p className="event-type-row-title break-words text-slate-950 dark:text-white">{deploymentTargetName(survey)}</p><p className="event-type-meta mt-0.5 truncate text-slate-500">{formatCategory(survey.target?.category ?? 'TARGET')} · Deployment target</p></div>
    <div className="min-w-0"><p className="event-type-row-title truncate text-slate-900 dark:text-white">{survey.name}</p><p className="event-type-meta mt-0.5 text-slate-500">Assigned survey</p></div>
    <div className="min-w-0"><div className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${statusPresentation.indicatorClass}`} /><p className="event-type-row-title truncate text-slate-900 dark:text-white">{statusPresentation.label}</p></div><p className="event-type-meta mt-0.5 truncate text-slate-500">{statusPresentation.detail}</p></div>
    <div className="flex items-center justify-between gap-3 sm:justify-end"><p className="event-type-meta text-slate-500">{savedDesign ? 'Custom design' : 'Default design'}</p><Button size="sm" variant="secondary" onClick={(event) => onAssets(event.currentTarget)}>Assets</Button></div>
    <span className="sr-only">{eventName}</span>
  </div>
}

function DeploymentUnavailableRow({ survey }: { survey: EventDeploymentSurvey }) {
  const status = deploymentStatus(survey)
  return <div data-testid="deployment-survey-row" className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/70 px-4 py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800 dark:bg-zinc-950/30"><div className="min-w-0"><p className="event-type-row-title truncate text-slate-700 dark:text-zinc-200">{deploymentTargetName(survey)}</p><p className="event-type-meta mt-0.5 text-slate-500">Survey: {survey.name} · {survey.target ? formatCategory(survey.target.category) : 'No target assigned'}</p></div><div className="min-w-0 text-left sm:text-right"><p className="event-type-control text-slate-700 dark:text-zinc-200">{status.label}</p><p className="event-type-meta mt-0.5 text-slate-500">{deploymentQrUnavailableReason(survey)}</p><p data-testid="deployment-unavailable-actions" className="sr-only">No QR actions available</p></div></div>
}

function DeploymentAssetsPanel({
  survey,
  anchor,
  eventName,
  onClose,
  onDesign,
  onPrint,
}: {
  survey: EventDeploymentSurvey
  anchor: HTMLButtonElement
  eventName: string
  onClose: () => void
  onDesign: () => void
  onPrint: () => void
}) {
  const [origin, setOrigin] = useState('')
  const [position, setPosition] = useState({ top: 16, left: 16 })
  useEffect(() => setOrigin(window.location.origin), [])
  useEffect(() => {
    const updatePosition = () => {
      const rect = anchor.getBoundingClientRect()
      const panelWidth = Math.min(560, window.innerWidth - 32)
      setPosition({
        top: Math.min(rect.bottom + 8, Math.max(16, window.innerHeight - 560)),
        left: Math.max(16, Math.min(rect.right - panelWidth, window.innerWidth - panelWidth - 16)),
      })
    }
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => { window.removeEventListener('resize', updatePosition); window.removeEventListener('scroll', updatePosition, true) }
  }, [anchor])
  if (!survey.publicLink) return null
  const qrUrl = origin ? resolveEventSignageQrUrl(survey.publicLink.kioskPath, origin) : ''
  return <>
    <button type="button" aria-label="Close assets" onClick={onClose} className="fixed inset-0 z-30 cursor-default bg-transparent" />
    <aside role="dialog" aria-label={`${survey.name} assets`} className="fixed z-40 max-h-[calc(100vh-32px)] w-[min(560px,calc(100vw-32px))] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-950" style={position}>
      <header className="flex items-start justify-between border-b border-slate-200 px-5 py-4 dark:border-zinc-800">
        <div><p className="event-type-kicker text-slate-500">Survey assets</p><h3 className="event-type-section-title mt-1 text-slate-950 dark:text-white">{survey.name}</h3><p className="event-type-meta mt-1 text-slate-500">{deploymentTargetName(survey)}</p></div>
        <button type="button" onClick={onClose} className="event-type-control rounded-md px-2 py-1 text-slate-600 hover:bg-slate-100">Close</button>
      </header>
      <div className="space-y-5 p-5">
        <SurveyQrCard
          surveyName={survey.name}
          path={survey.publicLink.kioskPath}
          fileName={deploymentQrFileName(eventName, deploymentTargetName(survey), survey.name)}
          renderTrigger={({ open, copyLink, downloadPng, copied, disabled }) => <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-[140px_minmax(0,1fr)]">
              <div aria-hidden="true" className="mx-auto block rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">{qrUrl ? <QRCodeCanvas value={qrUrl} size={112} level="H" marginSize={2} bgColor="#FFFFFF" fgColor="#111827" /> : <QrCode className="h-28 w-28 text-slate-800" />}</div>
              <div className="space-y-3">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><p className="event-type-kicker text-slate-500">Kiosk public link</p><p className="event-type-meta mt-1 break-all text-slate-700">{survey.publicLink!.kioskPath}</p></div>
                <div className="grid grid-cols-2 gap-2"><Button size="sm" variant="secondary" onClick={() => void copyLink()} disabled={disabled}>{copied ? 'Copied' : 'Copy link'}</Button><a href={survey.publicLink!.kioskPath} target="_blank" rel="noreferrer" className="event-type-control inline-flex h-9 items-center justify-center rounded-lg bg-blue-700 px-3 text-white hover:bg-blue-800">Open kiosk</a></div>
                <p role="status" aria-live="polite" className="event-type-meta min-h-4 text-emerald-700">{copied ? 'Link copied to clipboard.' : ''}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2"><Button size="sm" variant="secondary" onClick={() => void downloadPng()} disabled={disabled}>Download QR PNG</Button><Button size="sm" variant="secondary" onClick={open} disabled={disabled}>View QR</Button></div>
          </div>}
        />
        <div className="border-t border-slate-200 pt-4"><p className="event-type-kicker text-slate-500">Signage</p><div className="mt-2 grid grid-cols-2 gap-2"><Button size="sm" variant="secondary" onClick={onDesign}><Palette className="h-4 w-4" />Design signage</Button><Button size="sm" variant="secondary" onClick={onPrint}><FileText className="h-4 w-4" />Print signage</Button></div></div>
      </div>
    </aside>
  </>
}

function SignageDesignControls({
  configuration,
  onChange,
  designScope,
  onScopeChange,
  applicableSurveys,
  previewSurveyId,
  onPreviewSurveyChange,
  selectedCount,
  designSearch,
  onDesignSearchChange,
  visibleDesignSurveys,
  selectedIds,
  onToggleSelected,
  onSelectAllVisible,
  onClearSelection,
  eligibleCount,
  applyLabel,
  applying,
  onApply,
  hideScopeAndActions = false,
}: {
  configuration: EventSignageConfiguration
  onChange: (configuration: EventSignageConfiguration) => void
  designScope: DesignScope
  onScopeChange: (scope: DesignScope) => void
  applicableSurveys: EventDeploymentSurvey[]
  previewSurveyId: string
  onPreviewSurveyChange: (surveyId: string) => void
  selectedCount: number
  designSearch: string
  onDesignSearchChange: (value: string) => void
  visibleDesignSurveys: EventDeploymentSurvey[]
  selectedIds: string[]
  onToggleSelected: (surveyId: string) => void
  onSelectAllVisible: () => void
  onClearSelection: () => void
  eligibleCount: number
  applyLabel: string
  applying: boolean
  onApply: () => void
  hideScopeAndActions?: boolean
}) {
  const update = <Key extends keyof EventSignageConfiguration>(key: Key, value: EventSignageConfiguration[Key]) => onChange({ ...configuration, [key]: value })
  const inputClass = 'event-type-input mt-1 h-9 w-full rounded-lg border border-[#dbe1ea] bg-white px-3 text-[#0B1220] outline-none focus:border-[#28439A] focus:ring-2 focus:ring-[#dbe7ff]'

  return <div className="border-b border-[#e5e8ef] p-5 lg:border-b-0 lg:border-r">
    <h3 className="event-type-section-title text-[#0B1220]">Signage controls</h3>
    <div className="mt-4 space-y-3">
      {!hideScopeAndActions && <fieldset>
        <legend className="event-type-control text-slate-700">Apply to</legend>
        <div className="mt-1.5 inline-flex rounded-lg bg-slate-100 p-1" aria-label="QR design scope">
          {([['one', 'One survey'], ['multiple', 'Multiple'], ['all', 'All']] as Array<[DesignScope, string]>).map(([scope, label]) => <button key={scope} type="button" onClick={() => onScopeChange(scope)} aria-pressed={designScope === scope} className={`event-type-control rounded-md px-2.5 py-1.5 ${designScope === scope ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600 hover:text-slate-950'}`}>{label}</button>)}
        </div>
      </fieldset>}
      {designScope === 'one' && <label className="event-type-control block text-slate-700">Survey
        <select aria-label="Preview Survey" value={previewSurveyId} onChange={(event) => onPreviewSurveyChange(event.target.value)} disabled={applicableSurveys.length === 0} className={inputClass}>
          {applicableSurveys.map((survey) => <option key={survey.id} value={survey.id}>{survey.name} — {deploymentTargetName(survey)}</option>)}
        </select>
      </label>}
      {designScope === 'multiple' && <div className="rounded-lg border border-[#dbe1ea] bg-slate-50/60 p-3">
        <div className="flex items-center justify-between gap-2"><p className="event-type-control text-slate-800">{formatSurveyCount(selectedCount, 'survey')} selected</p><div className="event-type-pill flex gap-2 text-blue-700"><button type="button" onClick={onSelectAllVisible}>Select all visible</button><button type="button" onClick={onClearSelection}>Clear</button></div></div>
        <input type="search" value={designSearch} onChange={(event) => onDesignSearchChange(event.target.value)} placeholder="Search surveys" aria-label="Search surveys to design" className={inputClass} />
        <div className="event-type-meta mt-2 max-h-28 space-y-1 overflow-y-auto pr-1 text-slate-700">{visibleDesignSurveys.map((survey) => <label key={survey.id} className="flex items-center gap-2"><input type="checkbox" checked={selectedIds.includes(survey.id)} onChange={() => onToggleSelected(survey.id)} />{survey.name} — {deploymentTargetName(survey)}</label>)}</div>
      </div>}
      {designScope === 'all' && <p className="event-type-meta rounded-lg bg-slate-50 px-3 py-2 text-slate-600">All {eligibleCount} eligible surveys</p>}
      <div className="border-t border-[#edf0f4] pt-3"><p className="event-type-kicker text-slate-500">Template</p>
      <label className="event-type-control mt-2 block text-slate-700">Template
        <select aria-label="Signage template" value={configuration.preset} onChange={(event) => update('preset', event.target.value as EventSignageConfiguration['preset'])} className={inputClass}>
          {EVENT_SIGNAGE_TEMPLATES.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
        </select>
      </label></div>
      <div className="border-t border-[#edf0f4] pt-3"><p className="event-type-kicker text-slate-500">Wording</p>
      <label className="event-type-control block text-slate-700">Headline
        <input aria-label="Signage headline" value={configuration.headline} onChange={(event) => update('headline', event.target.value)} className={inputClass} />
      </label>
      <label className="event-type-control block text-slate-700">Supporting text
        <input aria-label="Signage supporting line" value={configuration.supportingLine} onChange={(event) => update('supportingLine', event.target.value)} className={inputClass} />
      </label>
      <label className="event-type-control block text-slate-700">Button label
        <input aria-label="Signage button label" value={configuration.buttonLabel} onChange={(event) => update('buttonLabel', event.target.value)} className={inputClass} />
      </label>
      </div>
      <div className="border-t border-[#edf0f4] pt-3"><p className="event-type-kicker text-slate-500">Brand</p><div className="mt-2"><p className="event-type-control text-slate-700">Primary color</p><div className="mt-1.5 flex gap-1.5" role="group" aria-label="Signage accent">{EVENT_SIGNAGE_ACCENTS.map((accent) => <button key={accent.id} type="button" aria-label={`${accent.name} accent`} aria-pressed={configuration.accent === accent.id} onClick={() => update('accent', accent.id)} className={`grid h-7 w-7 place-items-center rounded-full border-2 ${configuration.accent === accent.id ? 'border-[#28439A]' : 'border-transparent'}`}><span className="h-4 w-4 rounded-full" style={{ backgroundColor: accent.color }} /></button>)}</div></div>
      <div className="mt-3"><SignageToggle label="Logo" checked={configuration.useEventBranding} onChange={(value) => update('useEventBranding', value)} /></div></div>
      <fieldset>
        <legend className="event-type-control text-slate-700">Print layout</legend>
        <div className="mt-1.5 space-y-2 rounded-lg border border-[#e5e8ef] p-2.5">
          <div>
            <p className="event-type-pill text-slate-600">Sign orientation</p>
            <div className="mt-1 flex gap-1.5" role="group" aria-label="Signage orientation">
              {(['portrait', 'landscape'] as const).map((orientation) => {
                const supported = isEventSignageLayoutSupported({ orientation, cardsPerPage: configuration.cardsPerPage })
                return <button
                  key={orientation}
                  type="button"
                  disabled={!supported}
                  aria-pressed={configuration.orientation === orientation}
                  title={supported ? undefined : 'Unavailable because the printed QR would be smaller than 1 inch'}
                  onClick={() => update('orientation', orientation)}
                  className={`event-type-control rounded-md border px-2 py-1 disabled:cursor-not-allowed disabled:opacity-40 ${configuration.orientation === orientation ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600'}`}
                >{orientation === 'portrait' ? 'Portrait' : 'Landscape'}</button>
              })}
            </div>
          </div>
          <div>
            <p className="event-type-pill text-slate-600">Signs per page</p>
            <div className="mt-1 flex flex-wrap gap-1.5" role="group" aria-label="Signs per page">
              {([1, 2, 4] as const).map((count) => {
                const supported = isEventSignageLayoutSupported({ orientation: configuration.orientation, cardsPerPage: count })
                return <button
                  key={count}
                  type="button"
                  disabled={!supported}
                  aria-pressed={configuration.cardsPerPage === count}
                  title={supported ? undefined : 'Unavailable because the printed QR would be smaller than 1 inch'}
                  onClick={() => onChange(withEventSignageCardsPerPage(configuration, count))}
                  className={`event-type-control rounded-md border px-2 py-1 disabled:cursor-not-allowed disabled:opacity-40 ${configuration.cardsPerPage === count ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600'}`}
                >{count} / page</button>
              })}
            </div>
          </div>
        </div>
      </fieldset>
      {!hideScopeAndActions && <div className="flex gap-2 border-t border-[#edf0f4] pt-3"><Button type="button" size="sm" variant="secondary" disabled={applying} onClick={() => onChange(withEventSignageVisualConfiguration(configuration, getEventSignageTemplateVisualDefaults(configuration.preset, configuration.orientation)))}>Reset to template</Button><Button type="button" size="sm" disabled={applying || selectedCount === 0} onClick={onApply}>{applying ? 'Applying...' : applyLabel}</Button></div>}
    </div>
  </div>
}

function SignageToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="event-type-control flex cursor-pointer items-center justify-between gap-3 text-slate-700"><span>{label}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-[#28439A] focus:ring-[#28439A]" /></label>
}

function SignagePreview({
  viewModel,
  qrUrl,
  pageConfiguration,
}: {
  viewModel: EventSignageViewModel
  qrUrl: string
  pageConfiguration: EventSignageConfiguration
}) {
  const [previewMode, setPreviewMode] = useState<'sign' | 'sheet'>('sign')
  const configuration = resolveCanonicalQrSignConfiguration({ viewModel, qrUrl })
  const previewConfiguration = previewMode === 'sign'
    ? withEventSignageCardsPerPage(pageConfiguration, 1)
    : pageConfiguration
  const signs = Array.from({ length: previewConfiguration.cardsPerPage }, (_, index) => ({
    id: `preview-${index}`,
    configuration,
  }))
  return <section className="min-w-0 p-5" aria-label="Signage live preview">
    <div className="mb-3 flex flex-wrap items-start justify-between gap-3"><div><p className="event-type-row-title text-[#0B1220]">Live preview</p><p className="event-type-meta text-slate-500">{previewMode === 'sign' ? 'Sign view' : 'Print sheet view'} · {pageConfiguration.orientation === 'portrait' ? 'Portrait' : 'Landscape'} · {previewConfiguration.cardsPerPage} / page</p></div><div className="inline-flex rounded-lg bg-slate-100 p-1" aria-label="Signage preview mode"><button type="button" onClick={() => setPreviewMode('sign')} aria-pressed={previewMode === 'sign'} className={`event-type-control rounded-md px-2 py-1 ${previewMode === 'sign' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600'}`}>Sign view</button><button type="button" onClick={() => setPreviewMode('sheet')} aria-pressed={previewMode === 'sheet'} className={`event-type-control rounded-md px-2 py-1 ${previewMode === 'sheet' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600'}`}>Print sheet</button></div></div>
    <div data-testid="signage-preview" className="grid min-h-[430px] place-items-center rounded-xl border border-[#e5e8ef] bg-[#f1f3f8] p-3 shadow-inner sm:p-5">
      <div className="w-full max-w-[560px]">
        <EventSignageSheets signs={signs} configuration={previewConfiguration} mode="preview" />
      </div>
    </div>
    <p className="event-type-pill mt-2 text-center text-slate-500">Actual print composition · live survey QR</p>
  </section>
}

export function deploymentQrFileName(eventName: string, eventArea: string, surveyName: string) {
  return `${sanitizeFilePart(eventName)}__${sanitizeFilePart(eventArea)}__${sanitizeFilePart(surveyName)}.png`
}

export function deploymentQrPackageFileName(eventName: string) {
  return `${sanitizeFilePart(eventName)}-qr-package.zip`
}

function deploymentStatus(survey: EventDeploymentSurvey): { label: string; detail: string; tone: StatusPillTone } {
  if (survey.status === 'DRAFT') return { label: 'Draft', detail: 'Not published yet', tone: 'lifecycle' }
  if (survey.availability.state === 'CLOSED') return { label: 'Closed', detail: 'Response window has ended', tone: 'lifecycle' }
  if (survey.availability.state === 'NOT_YET_OPEN') return { label: 'Scheduled', detail: survey.availability.effectiveOpensAt ? `Opens ${formatWindowDate(survey.availability.effectiveOpensAt)}` : 'Opening time scheduled', tone: 'attention' }
  if (survey.readiness.responseEligible) return { label: 'Open now', detail: survey.availability.effectiveClosesAt ? `Closes ${formatWindowDate(survey.availability.effectiveClosesAt)}` : 'Accepting responses', tone: 'healthy' }
  return { label: 'Needs setup', detail: survey.readiness.issues[0] ?? 'Review deployment', tone: 'attention' }
}

function deploymentStatusPresentation(survey: EventDeploymentSurvey, status: ReturnType<typeof deploymentStatus>) {
  if (survey.status === 'DRAFT') return { label: 'DRAFT', detail: 'Not published yet · Publish to deploy', indicatorClass: 'bg-slate-400', pill: true }
  if (!survey.publicLink) return { label: 'Inactive', detail: 'Public survey link is unavailable', indicatorClass: 'bg-slate-400', pill: false }
  if (!survey.publicLink.isActive) return { label: 'Inactive', detail: 'Public survey link is inactive', indicatorClass: 'bg-slate-400', pill: false }
  if (survey.readiness.responseEligible && survey.availability.state === 'OPEN') return { label: 'Accepting responses', detail: scheduleLogic(survey), indicatorClass: 'bg-emerald-500', pill: false }
  return { label: status.label, detail: status.detail, indicatorClass: status.tone === 'healthy' ? 'bg-emerald-500' : status.tone === 'attention' ? 'bg-amber-500' : 'bg-slate-400', pill: false }
}

export function resolveDeploymentScopeSurveys({
  scope,
  surveys,
  previewSurveyId,
  selectedIds,
}: {
  scope: DesignScope
  surveys: EventDeploymentSurvey[]
  previewSurveyId: string
  selectedIds: string[]
}) {
  if (scope === 'one') return surveys.filter((survey) => survey.id === previewSurveyId).slice(0, 1)
  if (scope === 'multiple') {
    const selected = new Set(selectedIds)
    return surveys.filter((survey) => selected.has(survey.id))
  }
  return surveys
}

export function filterDeploymentSurveys(
  surveys: EventDeploymentSurvey[],
  filters: { filter: DeploymentFilter; eventArea: string; category: string },
) {
  return surveys.filter((survey) => {
    if (filters.eventArea !== 'all' && survey.target?.name !== filters.eventArea) return false
    if (filters.category !== 'all' && survey.target?.category !== filters.category) return false
    if (filters.filter === 'ready') return survey.readiness.responseEligible
    if (filters.filter === 'scheduled') return survey.availability.state === 'NOT_YET_OPEN'
    if (filters.filter === 'draft') return survey.status === 'DRAFT'
    if (filters.filter === 'needs-setup') return !isUsableDeployment(survey) && survey.status !== 'DRAFT'
    return true
  })
}

export function isUsableDeployment(survey: EventDeploymentSurvey) {
  const blockingReadinessIssues = survey.readiness.issues.filter((issue) => issue !== 'Survey is not yet open')
  return Boolean(
    survey.status === 'ACTIVE'
      && !survey.isArchived
      && survey.target
      && survey.publicLink?.isActive
      && survey.publicLink.kioskPath.trim()
      && blockingReadinessIssues.length === 0
      && (survey.availability.state === 'OPEN' || survey.availability.state === 'NOT_YET_OPEN'),
  )
}

export function deploymentQrUnavailableReason(survey: EventDeploymentSurvey) {
  if (survey.isArchived) return 'Target archived'
  if (!survey.target) return 'Survey not assigned'
  if (survey.status !== 'ACTIVE') return survey.status === 'DRAFT' ? 'Survey not published' : 'Survey not active'
  if (!survey.publicLink) return 'Public link required'
  if (!survey.publicLink.isActive) return 'Public link inactive'
  if (survey.availability.state === 'CLOSED') return 'Response window closed'
  if (survey.availability.state === 'INVALID') return 'Availability schedule invalid'
  const blockingReadinessIssue = survey.readiness.issues.find((issue) => issue !== 'Survey is not yet open')
  if (blockingReadinessIssue) return blockingReadinessIssue
  return 'QR destination unavailable'
}

function deploymentTargetName(survey: EventDeploymentSurvey) {
  return survey.target?.name ?? 'Not assigned'
}

export function deploymentSearchMatches(survey: EventDeploymentSurvey, search: string) {
  const query = search.trim().toLowerCase()
  return !query || `${deploymentTargetName(survey)} ${survey.name} ${survey.target?.category ?? ''}`.toLowerCase().includes(query)
}

function underlyingSurveyId(survey: EventDeploymentSurvey) {
  return survey.surveyId?.trim() || survey.id
}

function uniqueSurveyIds(surveys: EventDeploymentSurvey[]) {
  return Array.from(new Set(surveys.map(underlyingSurveyId)))
}

function visualConfigurationForSurvey(
  survey: EventDeploymentSurvey,
  saved: Record<string, EventSignageVisualConfiguration>,
) {
  return saved[underlyingSurveyId(survey)]
    ?? survey.signageConfiguration
    ?? DEFAULT_EVENT_SIGNAGE_VISUAL_CONFIGURATION
}

function uniquePackageAssetName(fileName: string, usedNames: Map<string, number>) {
  const count = usedNames.get(fileName) ?? 0
  usedNames.set(fileName, count + 1)
  if (count === 0) return fileName
  return fileName.replace(/\.png$/i, `-${count + 1}.png`)
}

function scheduleLogic(survey: EventDeploymentSurvey) { return survey.availability.effectiveOpensAt || survey.availability.effectiveClosesAt ? 'Scheduled response window' : survey.status === 'DRAFT' ? 'Publish to deploy' : 'Always open' }
function formatWindowDate(value: string) { return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) }

function formatCategory(value: string) {
  return value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function sanitizeFilePart(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'survey'
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
