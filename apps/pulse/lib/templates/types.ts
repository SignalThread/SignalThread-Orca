/**
 * Template System Types
 * 
 * Defines the structure for product-line templates (Events, Retail, Hospitality)
 * and their optional verticals (e.g., Retail → Coffee, Pizza, Bakery)
 */

export type UseCase = 'events' | 'retail' | 'hospitality'

export type Vertical = {
  events?: 'conference' | 'trade-show' | 'workshop'
  retail?: 'coffee' | 'pizza' | 'bakery' | 'fashion' | 'grocery'
  hospitality?: 'hotel' | 'restaurant' | 'resort'
}

/**
 * Template context passed to section renderers
 */
export interface TemplateContext {
  useCase: UseCase
  vertical?: string
  eventId: string
  responsesData: any // TODO: Type properly
  analysisData: any | null
  questionStats: any[]
  processedThemes: any[]
  processedActionItems: any[]
  groupedActionItems: Map<string, any[]>
}

/**
 * A renderable section in the admin overview
 */
export interface TemplateSection {
  id: string
  label: string
  order: number
  enabled: boolean
  renderer: (ctx: TemplateContext) => React.ReactNode
}

/**
 * Theme bucket definitions for grouping themes
 */
export interface ThemeBucket {
  name: string
  keywords: string[]
}

/**
 * Question defaults for kiosk flow
 */
export interface DefaultQuestion {
  key: string
  text: string
  order: number
  isRequired: boolean
  isEnabled: boolean
}

/**
 * Template configuration for a product line
 */
export interface ProductTemplate {
  useCase: UseCase
  vertical?: string
  
  // Display
  displayName: string
  description: string
  icon?: string
  
  // Admin Overview Sections (ordered list)
  overviewSections: TemplateSection[]
  
  // Kiosk Configuration
  defaultQuestions: DefaultQuestion[]
  consentText?: string
  completionMessage?: string
  
  // Analysis Configuration
  themeBuckets: ThemeBucket[]
  highImpactKeywords: string[]
  lowImpactKeywords: string[]
  
  // UI Customization
  primaryColor?: string
  brandingText?: string
  
  // Behavior flags
  enableRealTimeNotifications?: boolean
  enableMultiLanguage?: boolean
  requireAttendeeId?: boolean
}

/**
 * Template resolver configuration
 */
export interface TemplateConfig {
  useCase: UseCase
  vertical?: string
}

/**
 * Demo override (dev/admin only)
 */
export interface DemoOverride {
  useCase?: UseCase
  vertical?: string
  enabled: boolean
}
