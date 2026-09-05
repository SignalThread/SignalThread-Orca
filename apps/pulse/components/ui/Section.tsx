interface SectionProps {
  title?: string
  description?: string
  children: React.ReactNode
  className?: string
  headerAction?: React.ReactNode
}

export function Section({ title, description, children, className = '', headerAction }: SectionProps) {
  return (
    <section className={`mb-8 ${className}`}>
      {(title || description || headerAction) && (
        <div className="mb-4 flex items-start justify-between">
          <div>
            {title && <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-1">{title}</h2>}
            {description && <p className="text-sm text-zinc-600 dark:text-zinc-400">{description}</p>}
          </div>
          {headerAction && <div>{headerAction}</div>}
        </div>
      )}
      {children}
    </section>
  )
}
