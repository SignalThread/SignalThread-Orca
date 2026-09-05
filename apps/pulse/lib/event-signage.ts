export const EVENT_SIGNAGE_PRESETS = ['tabletop', 'clean', 'bold_event'] as const

export type EventSignagePreset = (typeof EVENT_SIGNAGE_PRESETS)[number]
export type EventSignageOrientation = 'portrait' | 'landscape'
export type EventSignageCardsPerPage = 1 | 2 | 4
export type EventSignageAccent = 'event' | 'ink' | 'teal' | 'amber'

export const EVENT_SIGNAGE_PAGE_SIZE = 'letter' as const
export const EVENT_SIGNAGE_PAGE_MARGIN_IN = 0.42
export const EVENT_SIGNAGE_PAGE_GUTTER_IN = 0.2
export const PORTRAIT_SIGN_ASPECT_RATIO = 5 / 7
export const LANDSCAPE_SIGN_ASPECT_RATIO = 7 / 5
/** @deprecated Use the orientation-aware sign aspect ratio helpers. */
export const CANONICAL_SIGN_ASPECT_RATIO = PORTRAIT_SIGN_ASPECT_RATIO
// The approved sign's 43cqw QR card leaves about 37.4% for the QR after
// padding. Use a conservative 36% for physical safety checks so its border
// and print rounding cannot make a borderline layout appear valid.
export const CANONICAL_QR_WIDTH_RATIO = 0.36
// Landscape templates reserve 31–32cqw for the QR card. The Tabletop card's
// padding leaves 27cqw for QR modules, so use that smallest real rendered size.
export const LANDSCAPE_QR_WIDTH_RATIO = 0.27
export const MINIMUM_PRINTED_QR_SIZE_IN = 1

export interface EventSignagePageLayout {
  pageSize: typeof EVENT_SIGNAGE_PAGE_SIZE
  orientation: EventSignageOrientation
  paperOrientation: EventSignageOrientation
  signAspectRatio: number
  cardsPerPage: EventSignageCardsPerPage
  pageWidthIn: number
  pageHeightIn: number
  marginIn: number
  gutterIn: number
  columns: number
  rows: number
  cellWidthIn: number
  cellHeightIn: number
  signWidthIn: number
  signHeightIn: number
  qrSizeIn: number
  isScannerSafe: boolean
}

export interface EventSignageTemplate {
  id: EventSignagePreset
  name: string
  description: string
  defaults: {
    headline: string
    supportingLine: string
    buttonLabel: string
    accent: EventSignageAccent
    useEventBranding: boolean
  }
}

export const EVENT_SIGNAGE_TEMPLATES: readonly EventSignageTemplate[] = [
  {
    id: 'tabletop',
    name: 'Tabletop Sign',
    description: 'Branded wave composition with a centered QR card',
    defaults: {
      headline: 'We value your feedback',
      supportingLine: 'Share your thoughts in under 2 minutes.',
      buttonLabel: 'Scan to take the survey',
      accent: 'event',
      useEventBranding: true,
    },
  },
  {
    id: 'clean',
    name: 'Clean QR',
    description: 'Light, minimal composition with the QR as the focal point',
    defaults: {
      headline: 'Your feedback matters',
      supportingLine: 'Scan the code to share your experience.',
      buttonLabel: 'Scan to give feedback',
      accent: 'event',
      useEventBranding: true,
    },
  },
  {
    id: 'bold_event',
    name: 'Bold Event',
    description: 'High-impact event-floor composition with a strong color field',
    defaults: {
      headline: 'Tell us what you think',
      supportingLine: 'Your feedback helps shape what comes next.',
      buttonLabel: 'Scan and share',
      accent: 'event',
      useEventBranding: true,
    },
  },
] as const

export const EVENT_SIGNAGE_ACCENTS: ReadonlyArray<{ id: EventSignageAccent; name: string; color: string }> = [
  { id: 'event', name: 'Event', color: '#28439A' },
  { id: 'ink', name: 'Ink', color: '#0B1220' },
  { id: 'teal', name: 'Teal', color: '#0F766E' },
  { id: 'amber', name: 'Amber', color: '#B45309' },
]

export interface EventSignageConfiguration {
  preset: EventSignagePreset
  useEventBranding: boolean
  headline: string
  supportingLine: string
  buttonLabel: string
  showSurveyName: boolean
  showAvailability: boolean
  accent: EventSignageAccent
  cardsPerPage: EventSignageCardsPerPage
  orientation: EventSignageOrientation
}

/** Persisted visual design only. QR destinations and sheet layout are runtime data. */
export interface EventSignageVisualConfiguration {
  version: 1
  preset: EventSignagePreset
  useEventBranding: boolean
  logoSource: 'event-branding'
  headline: string
  supportingLine: string
  buttonLabel: string
  accent: EventSignageAccent
  orientation: EventSignageOrientation
}

export interface EventSignageBranding {
  logoUrl?: string | null
  primaryColor?: string | null
  primaryButtonColor?: string | null
}

export interface EventSignageSurvey {
  id: string
  name: string
  eventArea: string
  qrPath: string
  availabilityMessage: string
}

export const EVENT_SIGNAGE_PRINT_PAYLOAD_KEY = 'signalthread:event-signage-print'
export const EVENT_SIGNAGE_SETTINGS_KEY = 'qrSignage' as const

export interface EventSignagePrintSurvey extends EventSignageSurvey {
  signageConfiguration: EventSignageVisualConfiguration
}

export interface EventSignagePrintPayload {
  eventName: string
  origin: string
  pageConfiguration: Pick<EventSignageConfiguration, 'orientation' | 'cardsPerPage'>
  branding: ResolvedEventSignageBranding
  surveys: EventSignagePrintSurvey[]
}

export interface ResolvedEventSignageBranding {
  source: 'event' | 'account' | 'neutral'
  logoUrl: string
  accentColor: string
}

export interface EventSignageViewModel {
  eventName: string
  surveyName: string | null
  eventArea: string | null
  qrPath: string
  headline: string
  supportingLine: string | null
  buttonLabel: string | null
  availabilityMessage: string | null
  footer: string | null
  showBranding: boolean
  template: EventSignageTemplate
  accentColor: string
  copyDensity: 'standard' | 'compact'
  branding: ResolvedEventSignageBranding
  orientation: EventSignageOrientation
}

/** The only complete sign-renderer input used by preview and output. */
export interface CanonicalQrSignConfiguration {
  templateId: EventSignagePreset
  orientation: EventSignageOrientation
  qrUrl: string
  headline: string
  supportingText: string | null
  buttonLabel: string | null
  primaryColor: string
  showLogo: boolean
  logoSrc: string
  footerText: string | null
}

export const DEFAULT_EVENT_SIGNAGE_CONFIGURATION: EventSignageConfiguration = {
  preset: 'tabletop',
  useEventBranding: true,
  headline: 'We value your feedback',
  supportingLine: 'Share your thoughts in under 2 minutes.',
  buttonLabel: 'Scan to take the survey',
  showSurveyName: false,
  showAvailability: false,
  accent: 'event',
  cardsPerPage: 1,
  orientation: 'portrait',
}

export const DEFAULT_EVENT_SIGNAGE_VISUAL_CONFIGURATION: EventSignageVisualConfiguration = {
  version: 1,
  preset: DEFAULT_EVENT_SIGNAGE_CONFIGURATION.preset,
  useEventBranding: DEFAULT_EVENT_SIGNAGE_CONFIGURATION.useEventBranding,
  logoSource: 'event-branding',
  headline: DEFAULT_EVENT_SIGNAGE_CONFIGURATION.headline,
  supportingLine: DEFAULT_EVENT_SIGNAGE_CONFIGURATION.supportingLine,
  buttonLabel: DEFAULT_EVENT_SIGNAGE_CONFIGURATION.buttonLabel,
  accent: DEFAULT_EVENT_SIGNAGE_CONFIGURATION.accent,
  orientation: DEFAULT_EVENT_SIGNAGE_CONFIGURATION.orientation,
}

export function getEventSignageTemplateVisualDefaults(
  preset: EventSignagePreset,
  orientation: EventSignageOrientation = DEFAULT_EVENT_SIGNAGE_CONFIGURATION.orientation,
): EventSignageVisualConfiguration {
  const template = getEventSignageTemplate(preset)
  return {
    version: 1,
    preset: template.id,
    useEventBranding: template.defaults.useEventBranding,
    logoSource: 'event-branding',
    headline: template.defaults.headline,
    supportingLine: template.defaults.supportingLine,
    buttonLabel: template.defaults.buttonLabel,
    accent: template.defaults.accent,
    orientation,
  }
}

export function toEventSignageVisualConfiguration(
  configuration: EventSignageConfiguration,
): EventSignageVisualConfiguration {
  return {
    version: 1,
    preset: configuration.preset,
    useEventBranding: configuration.useEventBranding,
    logoSource: 'event-branding',
    headline: configuration.headline,
    supportingLine: configuration.supportingLine,
    buttonLabel: configuration.buttonLabel,
    accent: configuration.accent,
    orientation: configuration.orientation,
  }
}

export function withEventSignageVisualConfiguration(
  pageConfiguration: Pick<EventSignageConfiguration, 'orientation' | 'cardsPerPage'>,
  visualConfiguration: EventSignageVisualConfiguration,
): EventSignageConfiguration {
  return {
    ...DEFAULT_EVENT_SIGNAGE_CONFIGURATION,
    preset: visualConfiguration.preset,
    useEventBranding: visualConfiguration.useEventBranding,
    headline: visualConfiguration.headline,
    supportingLine: visualConfiguration.supportingLine,
    buttonLabel: visualConfiguration.buttonLabel,
    accent: visualConfiguration.accent,
    orientation: visualConfiguration.orientation,
    cardsPerPage: pageConfiguration.cardsPerPage,
  }
}

export function readEventSignageVisualConfiguration(settingsJson: unknown): EventSignageVisualConfiguration | null {
  if (!isRecord(settingsJson)) return null
  const value = settingsJson[EVENT_SIGNAGE_SETTINGS_KEY]
  if (!isRecord(value) || value.version !== 1) return null
  // Preserve designs saved before templates existed by mapping the original
  // single-template key to the approved Tabletop composition.
  const preset = value.preset === 'branded' ? 'tabletop' : value.preset
  if (!EVENT_SIGNAGE_PRESETS.includes(preset as EventSignagePreset)) return null
  if (typeof value.useEventBranding !== 'boolean') return null
  if (value.logoSource !== 'event-branding') return null
  if (typeof value.headline !== 'string' || typeof value.supportingLine !== 'string' || typeof value.buttonLabel !== 'string') return null
  if (!['event', 'ink', 'teal', 'amber'].includes(String(value.accent))) return null
  const orientation = value.orientation === 'landscape' ? 'landscape' : 'portrait'
  return {
    version: 1,
    preset: preset as EventSignagePreset,
    useEventBranding: value.useEventBranding,
    logoSource: value.logoSource,
    headline: value.headline,
    supportingLine: value.supportingLine,
    buttonLabel: value.buttonLabel,
    accent: value.accent as EventSignageAccent,
    orientation,
  }
}

export function mergeEventSignageSettings(
  settingsJson: unknown,
  configuration: EventSignageVisualConfiguration,
) {
  return {
    ...(isRecord(settingsJson) ? settingsJson : {}),
    [EVENT_SIGNAGE_SETTINGS_KEY]: configuration,
  }
}

export function withEventSignageCardsPerPage(
  configuration: EventSignageConfiguration,
  cardsPerPage: EventSignageCardsPerPage,
): EventSignageConfiguration {
  return { ...configuration, cardsPerPage }
}

/**
 * Physical Letter-sheet contract shared by preview and print. Paper orientation
 * is selected automatically to match the sign; the compositor scales the
 * complete sign into each cell without sizing internal regions.
 */
export function resolveEventSignagePageLayout({
  orientation,
  cardsPerPage,
}: Pick<EventSignageConfiguration, 'orientation' | 'cardsPerPage'>): EventSignagePageLayout {
  const landscape = orientation === 'landscape'
  const paperOrientation = orientation
  const pageWidthIn = paperOrientation === 'landscape' ? 11 : 8.5
  const pageHeightIn = paperOrientation === 'landscape' ? 8.5 : 11
  const columns = cardsPerPage === 4 || (landscape && cardsPerPage === 2) ? 2 : 1
  const rows = cardsPerPage === 4 || (!landscape && cardsPerPage === 2) ? 2 : 1
  const usableWidthIn = pageWidthIn - (2 * EVENT_SIGNAGE_PAGE_MARGIN_IN) - ((columns - 1) * EVENT_SIGNAGE_PAGE_GUTTER_IN)
  const usableHeightIn = pageHeightIn - (2 * EVENT_SIGNAGE_PAGE_MARGIN_IN) - ((rows - 1) * EVENT_SIGNAGE_PAGE_GUTTER_IN)
  const cellWidthIn = usableWidthIn / columns
  const cellHeightIn = usableHeightIn / rows
  const signAspectRatio = landscape ? LANDSCAPE_SIGN_ASPECT_RATIO : PORTRAIT_SIGN_ASPECT_RATIO
  const signWidthIn = Math.min(cellWidthIn, cellHeightIn * signAspectRatio)
  const signHeightIn = signWidthIn / signAspectRatio
  const qrSizeIn = signWidthIn * (landscape ? LANDSCAPE_QR_WIDTH_RATIO : CANONICAL_QR_WIDTH_RATIO)

  return {
    pageSize: EVENT_SIGNAGE_PAGE_SIZE,
    orientation,
    paperOrientation,
    signAspectRatio,
    cardsPerPage,
    pageWidthIn,
    pageHeightIn,
    marginIn: EVENT_SIGNAGE_PAGE_MARGIN_IN,
    gutterIn: EVENT_SIGNAGE_PAGE_GUTTER_IN,
    columns,
    rows,
    cellWidthIn,
    cellHeightIn,
    signWidthIn,
    signHeightIn,
    qrSizeIn,
    isScannerSafe: qrSizeIn >= MINIMUM_PRINTED_QR_SIZE_IN,
  }
}

export function isEventSignageLayoutSupported(
  configuration: Pick<EventSignageConfiguration, 'orientation' | 'cardsPerPage'>,
) {
  return resolveEventSignagePageLayout(configuration).isScannerSafe
}

/** Deterministic pagination that never changes scale on a partially full page. */
export function paginateEventSignageItems<Value>(values: readonly Value[], cardsPerPage: EventSignageCardsPerPage) {
  const pages: Value[][] = []
  for (let index = 0; index < values.length; index += cardsPerPage) {
    pages.push(values.slice(index, index + cardsPerPage))
  }
  return pages
}

const NEUTRAL_BRANDING: ResolvedEventSignageBranding = {
  source: 'neutral',
  logoUrl: '/brand/logov2.png',
  accentColor: '#2563eb',
}

export function getEventSignageTemplate(preset: EventSignagePreset): EventSignageTemplate {
  return EVENT_SIGNAGE_TEMPLATES.find((template) => template.id === preset) ?? EVENT_SIGNAGE_TEMPLATES[0]
}

export function resolveEventSignageBranding({
  useEventBranding,
  eventBranding,
  accountBranding,
}: {
  useEventBranding: boolean
  eventBranding?: EventSignageBranding | null
  accountBranding?: EventSignageBranding | null
}): ResolvedEventSignageBranding {
  if (!useEventBranding) return NEUTRAL_BRANDING

  if (hasBranding(eventBranding)) {
    return {
      source: 'event',
      logoUrl: eventBranding.logoUrl?.trim() || accountBranding?.logoUrl?.trim() || NEUTRAL_BRANDING.logoUrl,
      accentColor: safeAccentColor(eventBranding.primaryColor || eventBranding.primaryButtonColor)
        ?? safeAccentColor(accountBranding?.primaryColor || accountBranding?.primaryButtonColor)
        ?? NEUTRAL_BRANDING.accentColor,
    }
  }

  if (hasBranding(accountBranding)) {
    return {
      source: 'account',
      logoUrl: accountBranding.logoUrl?.trim() || NEUTRAL_BRANDING.logoUrl,
      accentColor: safeAccentColor(accountBranding.primaryColor || accountBranding.primaryButtonColor)
        ?? NEUTRAL_BRANDING.accentColor,
    }
  }

  return NEUTRAL_BRANDING
}

export function resolveEventSignageAccent({
  accent,
  template,
  branding,
}: {
  accent: EventSignageAccent
  template: EventSignageTemplate
  branding: ResolvedEventSignageBranding
}) {
  if (accent === 'event') return branding.source === 'neutral' ? '#0b2344' : branding.accentColor
  return EVENT_SIGNAGE_ACCENTS.find((option) => option.id === accent)?.color ?? '#0b2344'
}

export function resolveEventSignageViewModel({
  configuration,
  eventName,
  survey,
  branding,
}: {
  configuration: EventSignageConfiguration
  eventName: string
  survey: EventSignageSurvey
  branding: ResolvedEventSignageBranding
}): EventSignageViewModel {
  const template = getEventSignageTemplate(configuration.preset)
  const surveyName = configuration.showSurveyName ? survey.name : null
  // Session signs are the only template that exposes the existing target context.
  // No room, time, or sponsor data is invented when a survey does not carry it.
  const eventArea = null
  const visibleIdentity = [eventName, surveyName, eventArea].filter((value): value is string => Boolean(value))
  return {
    eventName,
    surveyName,
    eventArea,
    qrPath: survey.qrPath,
    headline: configuration.headline.trim() || DEFAULT_EVENT_SIGNAGE_CONFIGURATION.headline,
    supportingLine: configuration.supportingLine.trim() || null,
    buttonLabel: configuration.buttonLabel.trim() || null,
    availabilityMessage: configuration.showAvailability ? survey.availabilityMessage : null,
    footer: null,
    showBranding: configuration.useEventBranding,
    template,
    accentColor: resolveEventSignageAccent({ accent: configuration.accent, template, branding }),
    copyDensity: visibleIdentity.some((value) => value.length > 52)
      || visibleIdentity.join(' ').length > 120
      ? 'compact'
      : 'standard',
    branding,
    orientation: configuration.orientation,
  }
}

export function resolveCanonicalQrSignConfiguration({
  viewModel,
  qrUrl,
}: {
  viewModel: EventSignageViewModel
  qrUrl: string
}): CanonicalQrSignConfiguration {
  return {
    templateId: viewModel.template.id,
    orientation: viewModel.orientation,
    qrUrl,
    headline: viewModel.headline,
    supportingText: viewModel.supportingLine,
    buttonLabel: viewModel.buttonLabel,
    primaryColor: viewModel.accentColor,
    showLogo: viewModel.showBranding,
    logoSrc: viewModel.branding.logoUrl,
    footerText: null,
  }
}

export function resolveEventSignageQrUrl(qrPath: string, origin: string) {
  if (!origin || /^(?:data:|https?:)/i.test(qrPath)) return qrPath
  try {
    return new URL(qrPath, origin).toString()
  } catch {
    return qrPath
  }
}

function hasBranding(branding?: EventSignageBranding | null): branding is EventSignageBranding {
  return Boolean(
    branding?.logoUrl?.trim()
      || safeAccentColor(branding?.primaryColor)
      || safeAccentColor(branding?.primaryButtonColor),
  )
}

function safeAccentColor(value?: string | null) {
  const color = value?.trim()
  return color && /^#[0-9a-f]{6}$/i.test(color) ? color : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}
