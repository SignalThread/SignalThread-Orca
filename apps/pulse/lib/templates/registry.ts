/**
 * Template Registry
 * 
 * Central registry for all product templates and verticals.
 * Resolves the active template based on useCase + optional vertical.
 */

import { ProductTemplate, UseCase, TemplateConfig, DemoOverride } from './types'
import { eventsTemplate, conferenceVertical } from './events'
import { retailTemplate, coffeeVertical, pizzaVertical } from './retail'

/**
 * Template Registry
 * Maps useCase → base template
 */
const TEMPLATE_REGISTRY: Record<UseCase, ProductTemplate> = {
  events: eventsTemplate,
  retail: retailTemplate,
  // Legacy demo/template mode only. Account product mode is still determined by
  // Account.accountType via lib/account-product-mode.ts, not by this registry.
  hospitality: eventsTemplate, // Placeholder until hospitality template is built
}

/**
 * Vertical Registry
 * Maps useCase.vertical → partial template overrides
 */
const VERTICAL_REGISTRY: Record<string, Partial<ProductTemplate>> = {
  'events.conference': conferenceVertical,
  'retail.coffee': coffeeVertical,
  'retail.pizza': pizzaVertical,
}

/**
 * Resolve template based on useCase and optional vertical
 * 
 * @param config - Template configuration (useCase + vertical)
 * @returns Complete ProductTemplate with vertical overrides applied
 */
export function resolveTemplate(config: TemplateConfig): ProductTemplate {
  const { useCase, vertical } = config
  
  // Get base template
  const baseTemplate = TEMPLATE_REGISTRY[useCase]
  if (!baseTemplate) {
    console.warn(`[Templates] Unknown useCase: ${useCase}, falling back to events`)
    return TEMPLATE_REGISTRY.events
  }
  
  // Apply vertical overrides if specified
  if (vertical) {
    const verticalKey = `${useCase}.${vertical}`
    const verticalOverrides = VERTICAL_REGISTRY[verticalKey]
    
    if (verticalOverrides) {
      return {
        ...baseTemplate,
        ...verticalOverrides,
        vertical,
      }
    } else {
      console.warn(`[Templates] Unknown vertical: ${verticalKey}, using base template`)
    }
  }
  
  return baseTemplate
}

/**
 * Get template for a specific event from database
 * 
 * For MVP, this returns the default 'events' template.
 * In production, this would query the database to get the event's configured template.
 * 
 * @param eventId - Event ID
 * @returns Template configuration
 */
export async function getTemplateForEvent(eventId: string): Promise<TemplateConfig> {
  // TODO: In production, query database:
  // const event = await prisma.event.findUnique({ where: { id: eventId } })
  // return { useCase: event.useCase, vertical: event.vertical }
  
  // Legacy admin/demo behavior: this route predates account product mode and
  // does not define the retail/events app boundary.
  return { useCase: 'events' }
}

/**
 * Check if demo mode is allowed
 * 
 * Demo mode is only enabled in:
 * 1. Development environment (NODE_ENV=development)
 * 2. When ENABLE_TEMPLATE_DEMO=true flag is set
 * 
 * @returns True if demo mode is allowed
 */
export function isDemoModeAllowed(): boolean {
  // Always allow in development
  if (process.env.NODE_ENV === 'development') {
    return true
  }
  
  // Allow in production only if explicitly enabled via feature flag
  if (process.env.NEXT_PUBLIC_ENABLE_TEMPLATE_DEMO === 'true') {
    return true
  }
  
  return false
}

/**
 * Parse demo override from query parameters
 * 
 * Safe to use in dev/admin contexts only. Should not be exposed in kiosk mode.
 * 
 * Example: ?demoUseCase=retail&demoVertical=coffee
 * 
 * @param searchParams - URLSearchParams from Next.js
 * @returns DemoOverride if valid, otherwise disabled override
 */
export function parseDemoOverride(searchParams: URLSearchParams): DemoOverride {
  // Safety gate: Only allow demo mode in dev or with feature flag
  if (!isDemoModeAllowed()) {
    return { enabled: false }
  }
  
  // Support both 'demoUseCase' and 'demo' for backward compatibility
  const demoParam = searchParams.get('demoUseCase') || searchParams.get('demo')
  const verticalParam = searchParams.get('demoVertical') || searchParams.get('vertical')
  
  if (!demoParam) {
    return { enabled: false }
  }
  
  const validUseCases: UseCase[] = ['events', 'retail', 'hospitality']
  const useCase = validUseCases.includes(demoParam as UseCase)
    ? (demoParam as UseCase)
    : undefined
  
  if (!useCase) {
    console.warn(`[Templates] Invalid demo override: ${demoParam}`)
    return { enabled: false }
  }
  
  console.log(`[Templates] Demo override active: ${useCase}${verticalParam ? ` (${verticalParam})` : ''}`)
  
  return {
    enabled: true,
    useCase,
    vertical: verticalParam || undefined,
  }
}

/**
 * Get all available templates (for demo/testing UI)
 * 
 * @returns Array of all registered templates
 */
export function getAllTemplates(): ProductTemplate[] {
  return Object.values(TEMPLATE_REGISTRY)
}

/**
 * Get all available verticals for a useCase (for demo/testing UI)
 * 
 * @param useCase - UseCase to get verticals for
 * @returns Array of partial templates representing verticals
 */
export function getVerticalsForUseCase(useCase: UseCase): Array<Partial<ProductTemplate>> {
  const verticals: Array<Partial<ProductTemplate>> = []
  
  for (const [key, template] of Object.entries(VERTICAL_REGISTRY)) {
    if (key.startsWith(`${useCase}.`)) {
      verticals.push(template)
    }
  }
  
  return verticals
}

/**
 * Validate template configuration
 * 
 * @param config - Template configuration
 * @returns True if valid, false otherwise
 */
export function isValidTemplateConfig(config: TemplateConfig): boolean {
  const validUseCases: UseCase[] = ['events', 'retail', 'hospitality']
  
  if (!validUseCases.includes(config.useCase)) {
    return false
  }
  
  if (config.vertical) {
    const verticalKey = `${config.useCase}.${config.vertical}`
    return verticalKey in VERTICAL_REGISTRY
  }
  
  return true
}
