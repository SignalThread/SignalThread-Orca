interface ThemeTagProps {
  theme: string
  count: number
  sentiment?: 'positive' | 'negative' | 'neutral'
  onClick?: () => void
}

export function ThemeTag({ theme, count, sentiment, onClick }: ThemeTagProps) {
  const sentimentColors = {
    positive: 'bg-green-100 dark:bg-green-950/30 text-green-800 dark:text-green-300 border-green-200 dark:border-green-900/50',
    negative: 'bg-red-100 dark:bg-red-950/30 text-red-800 dark:text-red-300 border-red-200 dark:border-red-900/50',
    neutral: 'bg-zinc-100 dark:bg-zinc-800/50 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700',
  }

  const colorClass = sentiment ? sentimentColors[sentiment] : sentimentColors.neutral

  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${colorClass} ${
        onClick ? 'hover:scale-105 cursor-pointer' : 'cursor-default'
      }`}
    >
      <span>{theme}</span>
      <span className="font-bold">{count}</span>
    </button>
  )
}
