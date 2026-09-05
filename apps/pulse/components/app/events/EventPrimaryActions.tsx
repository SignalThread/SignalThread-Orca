import type { ReactNode } from 'react'

/**
 * Event-only action cluster. Renders labeled primary/secondary actions and
 * keeps destructive actions visually separated, per the redesign rule that
 * critical event actions must have text labels (never icon-only) and that
 * destructive actions must not sit inline with normal operations.
 *
 * EVENTS-only primitive. Does not affect retail/SMB surfaces.
 */
export interface EventAction {
  /** Always required — no icon-only critical actions. */
  label: string
  /** When set, renders an anchor; otherwise a button. */
  href?: string
  onClick?: () => void
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  /** Optional leading icon node (decorative; label still required). */
  icon?: ReactNode
  disabled?: boolean
  /** Opens the href in a new tab. */
  external?: boolean
  title?: string
}

const VARIANT_CLASSES: Record<NonNullable<EventAction['variant']>, string> = {
  primary:
    'bg-blue-50 text-blue-700 border border-blue-100 hover:bg-blue-100 focus-visible:ring-indigo-400 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-900/60 dark:hover:bg-blue-950/50',
  secondary:
    'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 focus-visible:ring-indigo-400 dark:bg-zinc-800 dark:text-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-700',
  ghost:
    'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 focus-visible:ring-indigo-400 dark:bg-zinc-900 dark:text-zinc-200 dark:border-zinc-700 dark:hover:bg-zinc-800',
  danger:
    'text-red-700 dark:text-red-300 border border-red-300 dark:border-red-800/60 hover:bg-red-50 dark:hover:bg-red-950/40 focus-visible:ring-red-500',
}

const DISABLED_CLASSES =
  'opacity-50 cursor-not-allowed pointer-events-none'

const SIZE_CLASSES = {
  sm: 'px-3 py-1.5 text-sm min-h-[40px]',
  md: 'px-4 py-2 text-sm min-h-[44px]',
} as const

function ActionControl({ action, size }: { action: EventAction; size: 'sm' | 'md' }) {
  const variant = action.variant ?? 'secondary'
  const classes = `inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-900 ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${action.disabled ? DISABLED_CLASSES : ''}`

  const content = (
    <>
      {action.icon && <span aria-hidden className="inline-flex shrink-0">{action.icon}</span>}
      <span>{action.label}</span>
    </>
  )

  if (action.href && !action.disabled) {
    return (
      <a
        href={action.href}
        title={action.title}
        className={classes}
        {...(action.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        onClick={action.onClick}
      >
        {content}
      </a>
    )
  }

  return (
    <button
      type="button"
      title={action.title}
      className={classes}
      disabled={action.disabled}
      onClick={action.onClick}
    >
      {content}
    </button>
  )
}

interface EventPrimaryActionsProps {
  actions: EventAction[]
  /** Rendered after a visual divider so delete/remove never sits inline. */
  destructiveActions?: EventAction[]
  size?: 'sm' | 'md'
  align?: 'start' | 'end'
  className?: string
}

export function EventPrimaryActions({
  actions,
  destructiveActions = [],
  size = 'md',
  align = 'start',
  className = '',
}: EventPrimaryActionsProps) {
  const hasDestructive = destructiveActions.length > 0
  return (
    <div
      className={`flex flex-wrap items-center gap-2 ${align === 'end' ? 'justify-end' : ''} ${className}`}
    >
      {actions.map((action, index) => (
        <ActionControl key={`${action.label}-${index}`} action={{ ...action, variant: action.variant ?? 'secondary' }} size={size} />
      ))}
      {hasDestructive && (
        <span aria-hidden className="mx-1 hidden h-6 w-px bg-zinc-200 dark:bg-zinc-700 sm:block" />
      )}
      {destructiveActions.map((action, index) => (
        <ActionControl key={`destructive-${action.label}-${index}`} action={{ ...action, variant: 'danger' }} size={size} />
      ))}
    </div>
  )
}
