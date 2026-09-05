interface PageHeaderProps {
  title: string
  subtitle?: string
  breadcrumbs?: { label: string; href?: string }[]
  actions?: React.ReactNode
}

export function PageHeader({ title, subtitle, breadcrumbs, actions }: PageHeaderProps) {
  return (
    <div className="mb-8">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="mb-3 flex items-center space-x-2 text-sm">
          {breadcrumbs.map((crumb, index) => (
            <div key={index} className="flex items-center">
              {index > 0 && <span className="text-zinc-400 dark:text-zinc-600 mx-2">/</span>}
              {crumb.href ? (
                <a href={crumb.href} className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors">
                  {crumb.label}
                </a>
              ) : (
                <span className="text-zinc-600 dark:text-zinc-400">{crumb.label}</span>
              )}
            </div>
          ))}
        </nav>
      )}
      
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-4xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">{title}</h1>
          {subtitle && <p className="text-lg text-zinc-600 dark:text-zinc-400">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-3">{actions}</div>}
      </div>
    </div>
  )
}
