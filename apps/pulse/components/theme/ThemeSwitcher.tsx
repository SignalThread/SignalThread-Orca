'use client'

import { useTheme } from './ThemeProvider'

export function ThemeSwitcher() {
  const { resolvedTheme, setTheme } = useTheme()

  const handleToggle = () => {
    // Toggle between light and dark (sets explicit theme, not system)
    setTheme(resolvedTheme === 'light' ? 'dark' : 'light')
  }

  const isDark = resolvedTheme === 'dark'

  return (
    <div className="flex items-center justify-between">
      <div className="flex flex-col">
        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Theme</span>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">{isDark ? 'Dark' : 'Light'}</span>
      </div>
      
      {/* iOS-style Toggle Switch */}
      <button
        onClick={handleToggle}
        className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        style={{
          backgroundColor: isDark ? '#3b82f6' : '#d1d5db'
        }}
        role="switch"
        aria-checked={isDark}
        aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
      >
        <span
          className="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
          style={{
            transform: isDark ? 'translateX(1.5rem)' : 'translateX(0.25rem)'
          }}
        />
      </button>
    </div>
  )
}
