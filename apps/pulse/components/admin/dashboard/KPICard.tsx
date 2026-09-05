interface KPICardProps {
  label: string
  value: string | number
  change?: {
    value: string
    trend: 'up' | 'down' | 'neutral'
  }
  variant?: 'default' | 'success' | 'warning' | 'info'
  icon?: React.ReactNode
}

export function KPICard({ label, value, change, variant = 'default', icon }: KPICardProps) {
  const variantStyles = {
    default: 'border-zinc-200 dark:border-zinc-800',
    success: 'border-green-200 dark:border-green-900/30 bg-green-50/50 dark:bg-green-950/20',
    warning: 'border-amber-200 dark:border-amber-900/30 bg-amber-50/50 dark:bg-amber-950/20',
    info: 'border-blue-200 dark:border-blue-900/30 bg-blue-50/50 dark:bg-blue-950/20',
  }

  return (
    <div className={`bg-white dark:bg-zinc-900 border rounded-lg p-3 shadow-sm ${variantStyles[variant]}`}>
      <div className="flex items-start justify-between mb-2">
        <p className="text-[10px] font-medium text-zinc-600 dark:text-zinc-400 uppercase tracking-wide">
          {label}
        </p>
        {icon && <div className="text-zinc-500 dark:text-zinc-600">{icon}</div>}
      </div>
      
      <div className="flex items-baseline gap-2">
        <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          {value}
        </p>
        
        {change && (
          <span className={`text-[10px] font-semibold ${
            change.trend === 'up' ? 'text-green-600 dark:text-green-500' :
            change.trend === 'down' ? 'text-red-600 dark:text-red-500' :
            'text-zinc-600 dark:text-zinc-400'
          }`}>
            {change.value}
          </span>
        )}
      </div>
    </div>
  )
}
