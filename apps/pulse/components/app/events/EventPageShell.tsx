import type { ReactNode } from 'react'

/**
 * Event-only page container. Gives the three Events tiers (Home, Workspace,
 * Command Center) a consistent max-width, padding, and vertical rhythm so they
 * read as one connected product rather than three separate redesigns.
 *
 * EVENTS-only primitive. Does not affect retail/SMB surfaces.
 */
interface EventPageShellProps {
  children: ReactNode
  /** Optional sticky/inline top bar (breadcrumbs, back link). */
  topBar?: ReactNode
  /** Constrain content width. `wide` suits dense dashboards. */
  width?: 'default' | 'wide'
  className?: string
}

const WIDTH_CLASSES = {
  default: 'max-w-6xl',
  wide: 'max-w-7xl',
} as const

export function EventPageShell({
  children,
  topBar,
  width = 'default',
  className = '',
}: EventPageShellProps) {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {topBar && (
        <div className="border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/80">
          <div className={`mx-auto ${WIDTH_CLASSES[width]} px-4 py-3 sm:px-6`}>{topBar}</div>
        </div>
      )}
      <div className={`mx-auto ${WIDTH_CLASSES[width]} px-4 py-6 sm:px-6 sm:py-8 ${className}`}>
        <div className="flex flex-col gap-6">{children}</div>
      </div>
    </div>
  )
}
