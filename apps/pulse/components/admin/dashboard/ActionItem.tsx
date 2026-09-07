interface ActionItemProps {
  text: string
  impact: 'High' | 'Medium' | 'Low'
  category?: string
  evidence?: string
}

export function ActionItem({ text, impact, category, evidence }: ActionItemProps) {
  const impactColors = {
    High: 'bg-red-100 dark:bg-red-950/30 text-red-800 dark:text-red-300 border-red-300 dark:border-red-900/50',
    Medium: 'bg-amber-100 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-900/50',
    Low: 'bg-blue-100 dark:bg-blue-950/30 text-blue-800 dark:text-blue-300 border-blue-300 dark:border-blue-900/50',
  }

  return (
    <div className="flex items-start gap-3 p-4 bg-zinc-50 dark:bg-zinc-900/50 rounded-lg border border-zinc-200 dark:border-zinc-800">
      <div className={`px-2 py-0.5 rounded text-xs font-bold border ${impactColors[impact]} flex-shrink-0 mt-0.5`}>
        {impact}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-1">
          {text}
        </p>
        {category && (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {category}
          </p>
        )}
        {evidence && (
          <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-2 italic">
            "{evidence}"
          </p>
        )}
      </div>
    </div>
  )
}
