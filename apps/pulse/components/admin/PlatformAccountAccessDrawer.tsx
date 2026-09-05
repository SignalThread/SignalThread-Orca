'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

type DrawerUser = {
  id: string
  name: string
  email: string
  role: 'ADMIN'
  primaryAccountId: string | null
}
type DrawerAccount = { id: string; name: string; slug: string; accountType: string }
type DrawerMembership = DrawerAccount & { isPrimary: boolean; createdAt: string }
type DrawerData = { user: DrawerUser; memberships: DrawerMembership[]; accounts: DrawerAccount[] }

export function PlatformAccountAccessDrawer({
  userId,
  onClose,
  onChanged,
}: {
  userId: string
  onClose: () => void
  onChanged: () => void | Promise<void>
}) {
  const [data, setData] = useState<DrawerData | null>(null)
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/account-access`, { cache: 'no-store' })
    const json = await response.json().catch(() => ({}))
    if (!response.ok || !json.success) throw new Error(json.error || 'Unable to load account access')
    setData(json.data)
  }, [userId])

  useEffect(() => {
    load().catch((cause) => setError(cause instanceof Error ? cause.message : 'Unable to load account access'))
  }, [load])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const mutate = async (method: 'POST' | 'PATCH' | 'DELETE', body: Record<string, string>) => {
    setBusy(`${method}:${body.accountId}`)
    setError(null)
    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/account-access`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await response.json().catch(() => ({}))
      if (!response.ok || !json.success) throw new Error(json.error || 'Unable to update account access')
      await load()
      await onChanged()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update account access')
    } finally {
      setBusy(null)
    }
  }

  const availableAccounts = useMemo(() => {
    if (!data) return []
    const assigned = new Set(data.memberships.map((membership) => membership.id))
    const query = search.trim().toLowerCase()
    return data.accounts.filter((account) => !assigned.has(account.id) && (
      !query || `${account.name} ${account.slug}`.toLowerCase().includes(query)
    ))
  }, [data, search])

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="Manage account access">
      <button type="button" aria-label="Close account access drawer" className="absolute inset-0 bg-black/35" onClick={onClose} />
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
        <header className="flex items-start justify-between border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <div>
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">Manage account access</h2>
            <p className="mt-1 text-xs text-zinc-500">Regular Admin access only</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-xl text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label="Close">×</button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {error && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {!data ? <p className="text-sm text-zinc-500">Loading account access…</p> : <div className="space-y-6">
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">User</h3>
              <p className="mt-2 font-semibold text-zinc-950 dark:text-white">{data.user.name}</p>
              <p className="text-sm text-zinc-500">{data.user.email}</p>
              <p className="mt-1 text-xs font-medium text-zinc-600 dark:text-zinc-300">Role: Admin</p>
            </section>

            <section>
              <label htmlFor="primary-account" className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Primary account</label>
              <select
                id="primary-account"
                value={data.user.primaryAccountId ?? ''}
                disabled={busy !== null || data.memberships.length === 0}
                onChange={(event) => mutate('PATCH', { accountId: event.target.value })}
                className="mt-2 h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              >
                {data.memberships.length === 0 && <option value="">No assigned accounts</option>}
                {data.memberships.map((membership) => <option key={membership.id} value={membership.id}>{membership.name}</option>)}
              </select>
              <p className="mt-1.5 text-xs text-zinc-500">Used as the landing account after login.</p>
            </section>

            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Account access</h3>
              <div className="mt-2 divide-y divide-zinc-100 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
                {data.memberships.length === 0 && <p className="px-3 py-4 text-sm text-zinc-500">No accounts assigned.</p>}
                {data.memberships.map((membership) => (
                  <div key={membership.id} className="flex min-h-12 items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">✓ {membership.name}</p>
                      <p className="text-xs text-zinc-500">{membership.isPrimary ? 'Primary' : membership.accountType.toLowerCase()}</p>
                    </div>
                    {membership.isPrimary && data.memberships.length > 1
                      ? <span className="rounded-full bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">Primary</span>
                      : <button type="button" disabled={busy !== null} onClick={() => mutate('DELETE', { accountId: membership.id })} className="rounded-md px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50 dark:text-red-300 dark:hover:bg-red-950/40">Remove</button>}
                  </div>
                ))}
              </div>
              {data.memberships.some((membership) => membership.isPrimary) && data.memberships.length > 1 && (
                <p className="mt-2 text-xs text-zinc-500">To remove the primary account, choose a different primary account first.</p>
              )}
            </section>

            <section>
              <label htmlFor="account-search" className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Add account</label>
              <input id="account-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search accounts" className="mt-2 h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-700 dark:bg-zinc-900" />
              <div className="mt-2 max-h-44 overflow-y-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
                {availableAccounts.slice(0, 20).map((account) => (
                  <button key={account.id} type="button" disabled={busy !== null} onClick={() => mutate('POST', { accountId: account.id })} className="flex min-h-10 w-full items-center justify-between border-b border-zinc-100 px-3 py-2 text-left text-sm last:border-0 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:hover:bg-zinc-900">
                    <span className="truncate">{account.name}</span><span className="ml-3 shrink-0 font-semibold text-blue-700 dark:text-blue-300">+ Add</span>
                  </button>
                ))}
                {availableAccounts.length === 0 && <p className="px-3 py-3 text-sm text-zinc-500">No matching unassigned accounts.</p>}
              </div>
            </section>
          </div>}
        </div>
      </aside>
    </div>
  )
}
