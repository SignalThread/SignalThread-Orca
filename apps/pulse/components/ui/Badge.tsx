interface BadgeProps {
  children: React.ReactNode
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info' | 'purple'
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function Badge({ children, variant = 'default', size = 'md', className = '' }: BadgeProps) {
  const variantClasses = {
    default: 'bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300',
    success: 'bg-green-600 dark:bg-green-600 text-white',
    warning: 'bg-amber-500 dark:bg-amber-500 text-black dark:text-black',
    error: 'bg-red-600 dark:bg-red-600 text-white',
    info: 'bg-blue-600 dark:bg-blue-600 text-white',
    purple: 'bg-purple-600 dark:bg-purple-600 text-white',
  }

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-3 py-1',
    lg: 'text-base px-4 py-1.5',
  }

  return (
    <span
      className={`inline-block rounded font-semibold ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
    >
      {children}
    </span>
  )
}
