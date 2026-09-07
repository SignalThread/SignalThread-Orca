/**
 * Admin Insights Helper
 * 
 * UI-only utilities for processing event analysis data.
 * Handles theme deduplication, action item prioritization, and grouping.
 * 
 * Now template-driven: accepts theme buckets and keywords from templates.
 */

import type { ThemeBucket } from './templates/types'

/**
 * Configuration for insights processing
 */
export interface InsightsConfig {
  themeBuckets: ThemeBucket[]
  highImpactKeywords: string[]
  lowImpactKeywords: string[]
}

// Default configuration (for backward compatibility)
const DEFAULT_THEME_BUCKETS: ThemeBucket[] = [
  {
    name: 'Experience Quality',
    keywords: ['experience', 'quality', 'service', 'satisfaction', 'overall'],
  },
  {
    name: 'Staff & Service',
    keywords: ['staff', 'team', 'employee', 'service', 'help', 'support', 'friendly'],
  },
  {
    name: 'Venue & Facilities',
    keywords: ['venue', 'location', 'facility', 'space', 'room', 'environment', 'atmosphere'],
  },
  {
    name: 'Content & Program',
    keywords: ['content', 'program', 'session', 'presentation', 'speaker', 'topic', 'agenda'],
  },
  {
    name: 'Logistics & Operations',
    keywords: ['logistics', 'organization', 'timing', 'schedule', 'registration', 'food', 'catering'],
  },
  {
    name: 'Communication',
    keywords: ['communication', 'information', 'clarity', 'updates', 'signage'],
  },
]

const DEFAULT_HIGH_IMPACT_KEYWORDS = [
  'immediately', 'urgent', 'critical', 'essential', 'must',
  'improve', 'increase', 'add', 'implement', 'create',
  'staff', 'training', 'quality', 'safety', 'security',
]

const DEFAULT_LOW_IMPACT_KEYWORDS = [
  'minor', 'consider', 'optional', 'nice to have', 'eventually',
  'cosmetic', 'aesthetic', 'signage', 'decor',
]

const DEFAULT_CONFIG: InsightsConfig = {
  themeBuckets: DEFAULT_THEME_BUCKETS,
  highImpactKeywords: DEFAULT_HIGH_IMPACT_KEYWORDS,
  lowImpactKeywords: DEFAULT_LOW_IMPACT_KEYWORDS,
}

/**
 * Normalize a string to Title Case
 */
function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/**
 * Deduplicate and normalize themes (case-insensitive)
 * Returns themes in Title Case with aggregated counts
 */
export function processThemes(
  themes: { theme: string; count: number }[],
  config: InsightsConfig = DEFAULT_CONFIG
): { theme: string; count: number; bucket?: string }[] {
  if (!themes || themes.length === 0) return []

  // Deduplicate by normalized lowercase key
  const deduped = new Map<string, { theme: string; count: number }>()
  
  for (const item of themes) {
    const normalized = item.theme.toLowerCase().trim()
    const existing = deduped.get(normalized)
    
    if (existing) {
      existing.count += item.count
    } else {
      deduped.set(normalized, {
        theme: toTitleCase(item.theme),
        count: item.count,
      })
    }
  }

  // Convert to array and assign buckets
  const processed = Array.from(deduped.values()).map(item => ({
    ...item,
    bucket: assignThemeBucket(item.theme, config.themeBuckets),
  }))

  // Sort by count descending
  return processed.sort((a, b) => b.count - a.count)
}

/**
 * Assign a theme to a bucket based on keyword matching
 */
function assignThemeBucket(theme: string, buckets: ThemeBucket[]): string {
  const lowerTheme = theme.toLowerCase()
  
  for (const bucket of buckets) {
    if (bucket.keywords.some(keyword => lowerTheme.includes(keyword))) {
      return bucket.name
    }
  }
  
  return 'Other'
}

/**
 * Determine impact level for an action item based on keywords
 */
function determineImpact(
  actionItem: string,
  highKeywords: string[],
  lowKeywords: string[]
): 'High' | 'Medium' | 'Low' {
  const lower = actionItem.toLowerCase()
  
  // Check HIGH keywords first
  if (highKeywords.some(keyword => lower.includes(keyword))) {
    return 'High'
  }
  
  // Check LOW keywords
  if (lowKeywords.some(keyword => lower.includes(keyword))) {
    return 'Low'
  }
  
  // Default to Medium
  return 'Medium'
}

/**
 * Process action items: group by theme bucket and add impact tags
 */
export interface ProcessedActionItem {
  text: string
  impact: 'High' | 'Medium' | 'Low'
  bucket: string
}

export function processActionItems(
  actionItems: string[],
  processedThemes: { theme: string; count: number; bucket?: string }[],
  config: InsightsConfig = DEFAULT_CONFIG
): ProcessedActionItem[] {
  if (!actionItems || actionItems.length === 0) return []

  return actionItems.map(item => {
    const impact = determineImpact(item, config.highImpactKeywords, config.lowImpactKeywords)
    const bucket = assignActionItemBucket(item, processedThemes, config.themeBuckets)
    
    return {
      text: item,
      impact,
      bucket,
    }
  })
}

/**
 * Assign an action item to a bucket based on theme matching
 */
function assignActionItemBucket(
  actionItem: string,
  processedThemes: { theme: string; count: number; bucket?: string }[],
  buckets: ThemeBucket[]
): string {
  const lowerAction = actionItem.toLowerCase()
  
  // Try to match against top themes first
  for (const theme of processedThemes) {
    const lowerTheme = theme.theme.toLowerCase()
    if (lowerAction.includes(lowerTheme) || lowerTheme.includes(lowerAction.split(' ')[0])) {
      return theme.bucket || 'Other'
    }
  }
  
  // Fallback to keyword-based bucket assignment
  return assignThemeBucket(actionItem, buckets)
}

/**
 * Group processed action items by bucket
 */
export function groupActionItemsByBucket(actionItems: ProcessedActionItem[]): Map<string, ProcessedActionItem[]> {
  const grouped = new Map<string, ProcessedActionItem[]>()
  
  for (const item of actionItems) {
    const bucket = item.bucket
    if (!grouped.has(bucket)) {
      grouped.set(bucket, [])
    }
    grouped.get(bucket)!.push(item)
  }
  
  // Sort each bucket by impact (High > Medium > Low)
  const impactOrder: Record<string, number> = { High: 0, Medium: 1, Low: 2 }
  for (const items of Array.from(grouped.values())) {
    items.sort((a: any, b: any) => (impactOrder[a.impact] || 999) - (impactOrder[b.impact] || 999))
  }
  
  return grouped
}
