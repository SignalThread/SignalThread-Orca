'use client'

import { useRouter } from 'next/navigation'
import { ProductTemplate } from '@/lib/templates/types'

interface TemplateSwitcherProps {
  eventId: string
  activeTemplate: ProductTemplate
  currentParams: URLSearchParams
}

/**
 * Map templates to their demo event IDs
 * This ensures that switching templates actually switches the underlying dataset,
 * not just the UI presentation
 */
export const TEMPLATE_EVENT_MAP: Record<string, string> = {
  events: 'default-kiosk-event',
  retail: 'retail-demo',
}

export function TemplateSwitcher({ eventId, activeTemplate, currentParams }: TemplateSwitcherProps) {
  const router = useRouter()

  const handleTemplateChange = (useCase: string) => {
    // Get the target event for this template
    const targetEventId = TEMPLATE_EVENT_MAP[useCase] || 'default-kiosk-event'
    
    // Build URL with appropriate query params
    const params = new URLSearchParams()
    
    if (useCase !== 'events') {
      // Add demoUseCase for non-events templates to ensure correct UI mode
      params.set('demoUseCase', useCase)
    }
    
    // Navigate to the target event
    // This changes BOTH the dataset (different event) AND the UI mode (different template)
    const newUrl = `/admin/events/${targetEventId}${params.toString() ? `?${params.toString()}` : ''}`
    router.push(newUrl)
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-zinc-600 dark:text-zinc-400">
        View:
      </span>
      
      <select
        value={activeTemplate.useCase}
        onChange={(e) => handleTemplateChange(e.target.value)}
        className="px-3 py-1.5 text-sm bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-300 dark:border-zinc-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold cursor-pointer"
      >
        <option value="events">🎤 Events</option>
        <option value="retail">🛍️ Retail</option>
      </select>
    </div>
  )
}
