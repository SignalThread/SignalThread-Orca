interface InsightCardProps {
  title: string
  children: React.ReactNode
  action?: {
    label: string
    onClick: () => void
  }
  variant?: 'default' | 'highlight'
  className?: string
}

export function InsightCard({ title, children, action, variant = 'default', className = '' }: InsightCardProps) {
  return (
    <div className={`bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-6 shadow-sm ${
      variant === 'highlight' ? 'ring-2 ring-blue-500/20 dark:ring-blue-500/30' : ''
    } ${className}`}>
      <div className="flex items-start justify-between mb-4">
        <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          {title}
        </h3>
        {action && (
          <button
            onClick={action.onClick}
            className="text-xs font-medium text-blue-600 dark:text-blue-500 hover:text-blue-700 dark:hover:text-blue-400 transition-colors"
          >
            {action.label} →
          </button>
        )}
      </div>
      <div className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
        {children}
      </div>
    </div>
  )
}
