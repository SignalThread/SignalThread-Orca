'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

type AccountOption = { id: string; name: string; slug: string; accountType: string }

export function AccountSwitcher() {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const [primaryAccountId, setPrimaryAccountId] = useState<string | null>(null)
  const [isRegularAdmin, setIsRegularAdmin] = useState(false)

  useEffect(() => {
    if (pathname.startsWith('/admin')) return
    let cancelled = false
    fetch('/api/app/accounts', { credentials: 'include', cache: 'no-store' })
      .then(async (response) => {
        const json = await response.json().catch(() => ({}))
        if (!response.ok || !json.success) return
        if (!cancelled) {
          setAccounts(json.data.accounts)
          setPrimaryAccountId(json.data.primaryAccountId)
          setIsRegularAdmin(json.data.role === 'ADMIN')
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [pathname])

  if (!isRegularAdmin || accounts.length <= 1) return null

  const requestedSlug = searchParams.get('account')
  const current = accounts.find((account) => account.slug === requestedSlug)
    ?? accounts.find((account) => account.id === primaryAccountId)
    ?? accounts[0]

  return (
    <label className="flex items-center gap-2">
      <span className="sr-only">Switch account</span>
      <select
        aria-label="Switch account"
        value={current.id}
        onChange={(event) => {
          const selected = accounts.find((account) => account.id === event.target.value)
          if (selected) router.push(`/app?account=${encodeURIComponent(selected.slug)}`)
        }}
        className="h-9 max-w-48 rounded-lg border border-zinc-200 bg-white px-2.5 text-xs font-semibold text-zinc-700 outline-none transition hover:border-zinc-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
      >
        {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
      </select>
    </label>
  )
}
