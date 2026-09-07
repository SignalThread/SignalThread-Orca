interface CardProps {
  children: React.ReactNode
  className?: string
  padding?: 'none' | 'sm' | 'md' | 'lg'
  variant?: 'default' | 'bordered' | 'elevated'
}

export function Card({ children, className = '', padding = 'md', variant = 'default' }: CardProps) {
  const paddingClasses = {
    none: '',
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8',
  }

  const variantClasses = {
    // Enhanced light mode: better contrast with subtle shadow
    default: 'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-md dark:shadow-sm',
    bordered: 'bg-white dark:bg-zinc-900 border-2 border-zinc-300 dark:border-zinc-700 shadow-md dark:shadow-sm',
    elevated: 'bg-white dark:bg-zinc-900 shadow-xl',
  }

  return (
    <div className={`rounded-lg ${variantClasses[variant]} ${paddingClasses[padding]} ${className}`}>
      {children}
    </div>
  )
}
