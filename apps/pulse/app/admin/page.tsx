'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { Button } from '@/components/ui/Button'
import { InfoTooltip } from '@/components/ui/InfoTooltip'
import { useRouter } from 'next/navigation'
import { getTourEnabled, setTourEnabled } from '@/lib/tour-preference'
import { PlatformAdminNav } from '@/components/admin/PlatformAdminNav'

interface Account {
  id: string
  name: string
  slug: string
  accountType: string
  tier: string
  isActive: boolean
  email: string | null
  createdAt: string
  _count: {
    locations: number
    admins: number
  }
}

type AccountTypeValue = 'RETAIL' | 'EVENTS' | 'HOSPITALITY'
type AccountTierValue = 'starter' | 'growth' | 'enterprise'

const ACCOUNT_TYPE_OPTIONS: Array<{ value: AccountTypeValue; label: string }> = [
  { value: 'RETAIL', label: 'Retail' },
  { value: 'EVENTS', label: 'Events' },
  { value: 'HOSPITALITY', label: 'Hospitality' },
]

const ACCOUNT_TIER_OPTIONS: Array<{ value: AccountTierValue; label: string }> = [
  { value: 'starter', label: 'Starter' },
  { value: 'growth', label: 'Growth' },
  { value: 'enterprise', label: 'Enterprise' },
]

const ITEMS_PER_PAGE = 8
const LOCATION_TEAM_TOOLTIP =
  'A Location or Team is where feedback is collected. For example, a store, office, or crew.'

function getTypeColor(type: string) {
  switch (type) {
    case 'RETAIL': return 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
    case 'EVENTS':
    case 'EVENT': return 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
    case 'HOTEL': return 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300'
    default: return 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
  }
}

function getTierColor(tier: string) {
  switch (tier.toLowerCase()) {
    case 'starter':
    case 'free': return 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300'
    case 'growth': return 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
    case 'enterprise': return 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
    default: return 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
  }
}

function normalizeTierLabel(tier: string) {
  const t = tier.toLowerCase()
  if (t === 'free') return 'starter'
  return t
}

function getIconBg(type: string) {
  switch (type) {
    case 'RETAIL': return 'bg-purple-100 dark:bg-purple-900/40'
    case 'EVENTS':
    case 'EVENT': return 'bg-blue-100 dark:bg-blue-900/40'
    case 'HOTEL': return 'bg-green-100 dark:bg-green-900/40'
    default: return 'bg-zinc-100 dark:bg-zinc-800'
  }
}

function getIconColor(type: string) {
  switch (type) {
    case 'RETAIL': return 'text-purple-600 dark:text-purple-400'
    case 'EVENTS':
    case 'EVENT': return 'text-blue-600 dark:text-blue-400'
    case 'HOTEL': return 'text-green-600 dark:text-green-400'
    default: return 'text-zinc-600 dark:text-zinc-400'
  }
}

export default function PlatformAdminPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [tierFilter, setTierFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [tourOn, setTourOn] = useState(() => getTourEnabled())
  const [deleteModalAccount, setDeleteModalAccount] = useState<Account | null>(null)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleteSubmitting, setDeleteSubmitting] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [fieldSaving, setFieldSaving] = useState<Record<string, { accountType?: boolean; tier?: boolean }>>({})

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type })
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4500)
    return () => clearTimeout(t)
  }, [toast])

  useEffect(() => {
    async function loadAccounts() {
      try {
        const response = await fetch('/api/admin/accounts', { cache: 'no-store' })
        if (!response.ok) {
          throw new Error(`Failed to load accounts: ${response.statusText}`)
        }
        const data = await response.json()
        if (!data.success) {
          throw new Error(data.error || 'Failed to load accounts')
        }
        setAccounts(data.accounts)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load accounts')
      } finally {
        setLoading(false)
      }
    }

    loadAccounts()
  }, [])

  const filtered = useMemo(() => {
    let result = accounts
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(a =>
        a.name.toLowerCase().includes(q) ||
        a.slug.toLowerCase().includes(q) ||
        (a.email && a.email.toLowerCase().includes(q))
      )
    }
    if (typeFilter !== 'all') {
      result = result.filter(a => a.accountType === typeFilter)
    }
    if (tierFilter !== 'all') {
      result = result.filter(a => normalizeTierLabel(a.tier) === tierFilter.toLowerCase())
    }
    return result
  }, [accounts, search, typeFilter, tierFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE))
  const currentPage = Math.min(page, totalPages)
  const paginated = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE)

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1) }, [search, typeFilter, tierFilter])

  const uniqueTypes = useMemo(() => Array.from(new Set(accounts.map(a => a.accountType))), [accounts])
  const uniqueTiers = useMemo(() => Array.from(new Set(accounts.map(a => normalizeTierLabel(a.tier)))), [accounts])

  const updateAccountField = async (
    accountId: string,
    field: 'accountType' | 'tier',
    value: string
  ) => {
    const target = accounts.find((account) => account.id === accountId)
    if (!target) return

    const previousValue = target[field]

    setAccounts((prev) =>
      prev.map((account) =>
        account.id === accountId
          ? {
              ...account,
              [field]: value,
            }
          : account
      )
    )
    setFieldSaving((prev) => ({
      ...prev,
      [accountId]: {
        ...(prev[accountId] || {}),
        [field]: true,
      },
    }))

    try {
      const response = await fetch(`/api/admin/accounts/${accountId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.success) {
        throw new Error(data.message || data.error || `Failed to update ${field}`)
      }

      setAccounts((prev) =>
        prev.map((account) =>
          account.id === accountId
            ? {
                ...account,
                accountType: data.account.accountType,
                tier: data.account.tier,
              }
            : account
        )
      )
    } catch (error) {
      setAccounts((prev) =>
        prev.map((account) =>
          account.id === accountId
            ? {
                ...account,
                [field]: previousValue,
              }
            : account
        )
      )
      showToast(error instanceof Error ? error.message : `Failed to update ${field}`, 'error')
    } finally {
      setFieldSaving((prev) => ({
        ...prev,
        [accountId]: {
          ...(prev[accountId] || {}),
          [field]: false,
        },
      }))
    }
  }

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
            <p className="text-zinc-500 dark:text-zinc-400">Loading accounts...</p>
          </div>
        </div>
      </AdminLayout>
    )
  }

  if (error) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-8 max-w-md shadow-md">
            <div className="text-center">
              <div className="w-12 h-12 mx-auto mb-4 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">Error Loading Accounts</h2>
              <p className="text-zinc-500 dark:text-zinc-400 mb-4">{error}</p>
              <Button onClick={() => window.location.reload()}>Retry</Button>
            </div>
          </div>
        </div>
      </AdminLayout>
    )
  }

  const handleDeleteAccount = async () => {
    if (!deleteModalAccount || deleteConfirmText !== deleteModalAccount.name) return
    setDeleteSubmitting(true)
    try {
      const res = await fetch(`/api/admin/accounts/${deleteModalAccount.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmName: deleteConfirmText }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        showToast(data.message || data.error || 'Delete failed', 'error')
        return
      }
      setAccounts((prev) => prev.filter((a) => a.id !== deleteModalAccount.id))
      setDeleteModalAccount(null)
      setDeleteConfirmText('')
      showToast('Account deleted', 'success')
    } catch {
      showToast('Delete request failed', 'error')
    } finally {
      setDeleteSubmitting(false)
    }
  }

  return (
    <AdminLayout>
      {toast && (
        <div
          className={`fixed top-6 right-6 z-[100] px-5 py-3 rounded-lg shadow-xl font-medium text-sm max-w-md ${
            toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
          }`}
          role="status"
        >
          {toast.message}
        </div>
      )}

      {deleteModalAccount && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-account-title"
        >
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl max-w-md w-full p-6">
            <h2 id="delete-account-title" className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
              Delete account
            </h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              This permanently removes <span className="font-semibold text-zinc-900 dark:text-zinc-100">{deleteModalAccount.name}</span>, all
              locations, events, responses, and linked data. Stripe billing is not auto-canceled — check the dashboard if needed.
            </p>
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
              Type the account name exactly to confirm:
            </p>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              className="mt-2 w-full px-3 py-2 text-sm border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
              placeholder={deleteModalAccount.name}
              autoComplete="off"
              disabled={deleteSubmitting}
            />
            <div className="mt-6 flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={deleteSubmitting}
                onClick={() => {
                  setDeleteModalAccount(null)
                  setDeleteConfirmText('')
                }}
              >
                Cancel
              </Button>
              <button
                type="button"
                disabled={deleteSubmitting || deleteConfirmText !== deleteModalAccount.name}
                onClick={handleDeleteAccount}
                className="inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleteSubmitting ? 'Deleting…' : 'Delete account'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header row */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Platform Admin</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">Manage customer accounts and access</p>
        </div>
        <div className="flex items-center gap-4">
          {/* Tour on/off toggle */}
          <div className="flex items-center gap-3">
            <div className="flex flex-col">
              <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Product Tour</span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">{tourOn ? 'On' : 'Off'}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                const next = !tourOn
                setTourOn(next)
                setTourEnabled(next)
              }}
              className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              style={{
                backgroundColor: tourOn ? '#3b82f6' : '#d1d5db',
              }}
              role="switch"
              aria-checked={tourOn}
              aria-label={`Product tour ${tourOn ? 'on' : 'off'}`}
            >
              <span
                className="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                style={{
                  transform: tourOn ? 'translateX(1.5rem)' : 'translateX(0.25rem)',
                }}
              />
            </button>
          </div>
          <Button
            size="sm"
            onClick={() => router.push('/admin/provision')}
          >
            <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create New Account
          </Button>
        </div>
      </div>

      <PlatformAdminNav />

      {/* Search + Filters row */}
      <div className="flex items-center gap-3 mb-6">
        {/* Search */}
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search by name, handle, or email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Type filter */}
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="px-3 py-2.5 text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer min-w-[120px]"
        >
          <option value="all">All Types</option>
          {uniqueTypes.map(t => (
            <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>
          ))}
        </select>

        {/* Tier filter */}
        <select
          value={tierFilter}
          onChange={e => setTierFilter(e.target.value)}
          className="px-3 py-2.5 text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer min-w-[110px]"
        >
          <option value="all">All Tiers</option>
            {uniqueTiers.map(t => (
              <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1).toLowerCase()}</option>
            ))}
        </select>
      </div>

      {/* Account list */}
      {filtered.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-12 text-center shadow-sm">
          <div className="w-12 h-12 mx-auto mb-4 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center">
            <svg className="w-6 h-6 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-1">No accounts found</h3>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {search || typeFilter !== 'all' || tierFilter !== 'all'
              ? 'Try adjusting your search or filters.'
              : 'Accounts will appear here once they are created.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {paginated.map((account) => (
            <div
              key={account.id}
              className="w-full flex items-stretch gap-2 sm:gap-3"
            >
            <div className="flex-1 min-w-0 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-5 py-4 shadow-sm hover:shadow-md hover:border-zinc-300 dark:hover:border-zinc-700 transition-all group">
              <div className="flex items-center gap-4">
                {/* Icon tile */}
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${getIconBg(account.accountType)}`}>
                  <svg className={`w-5 h-5 ${getIconColor(account.accountType)}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {account.accountType === 'RETAIL' ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    ) : account.accountType === 'HOTEL' ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    )}
                  </svg>
                </div>

                {/* Name + handle */}
                <button
                  type="button"
                  onClick={() => router.push(`/app?account=${account.slug}`)}
                  className="min-w-0 flex-shrink text-left"
                >
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                      {account.name}
                    </h3>
                    {!account.isActive && (
                      <span className="text-[10px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 px-1.5 py-0.5 rounded">
                        Inactive
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-400 dark:text-zinc-500">@{account.slug}</p>
                </button>

                {/* Stats row */}
                <div className="hidden sm:flex items-center gap-4 ml-auto mr-4 text-xs text-zinc-500 dark:text-zinc-400 flex-shrink-0">
                  {/* Locations/Teams */}
                  <span className="inline-flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    {account._count.locations} {account._count.locations === 1 ? 'location/team' : 'locations/teams'}
                    <InfoTooltip content={LOCATION_TEAM_TOOLTIP} />
                  </span>
                  {/* Admins */}
                  <span className="inline-flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    {account._count.admins} {account._count.admins === 1 ? 'admin' : 'admins'}
                  </span>
                  {/* Email */}
                  {account.email && (
                    <span className="inline-flex items-center gap-1 max-w-[180px] truncate">
                      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      <span className="truncate">{account.email}</span>
                    </span>
                  )}
                  {/* Created */}
                  <span className="inline-flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    {new Date(account.createdAt).toLocaleDateString()}
                  </span>
                </div>

                {/* Inline account controls */}
                <div className="flex items-center gap-2 flex-shrink-0 ml-auto sm:ml-0">
                  <div className="relative">
                    <select
                      aria-label={`Account type for ${account.name}`}
                      value={account.accountType as AccountTypeValue}
                      disabled={Boolean(fieldSaving[account.id]?.accountType)}
                      onChange={(e) => updateAccountField(account.id, 'accountType', e.target.value)}
                      className={`appearance-none rounded-full px-3 py-1 pr-7 text-[11px] font-semibold border-none focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed ${getTypeColor(account.accountType)}`}
                    >
                      {ACCOUNT_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-current opacity-70">
                      {fieldSaving[account.id]?.accountType ? '…' : '▾'}
                    </span>
                  </div>
                  <div className="relative">
                    <select
                      aria-label={`Tier for ${account.name}`}
                      value={normalizeTierLabel(account.tier) as AccountTierValue}
                      disabled={Boolean(fieldSaving[account.id]?.tier)}
                      onChange={(e) => updateAccountField(account.id, 'tier', e.target.value)}
                      className={`appearance-none rounded-full px-3 py-1 pr-7 text-[11px] font-semibold border-none focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed ${getTierColor(account.tier)}`}
                    >
                      {ACCOUNT_TIER_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-current opacity-70">
                      {fieldSaving[account.id]?.tier ? '…' : '▾'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Mobile stats (visible below sm) */}
              <div className="flex sm:hidden items-center gap-3 mt-2.5 ml-14 text-xs text-zinc-500 dark:text-zinc-400 flex-wrap">
                <span className="inline-flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {account._count.locations}
                </span>
                <span className="inline-flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  {account._count.admins}
                </span>
                {account.email && (
                  <span className="truncate max-w-[160px]">{account.email}</span>
                )}
                <span>{new Date(account.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setDeleteModalAccount(account)
                  setDeleteConfirmText('')
                }}
                className="shrink-0 self-center px-3 py-2 text-xs font-semibold rounded-lg border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-950/50 transition-colors"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {filtered.length > ITEMS_PER_PAGE && (
        <div className="flex items-center justify-between mt-6 pt-4 border-t border-zinc-200 dark:border-zinc-800">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            className={`text-sm font-medium transition-colors ${
              currentPage <= 1
                ? 'text-zinc-300 dark:text-zinc-600 cursor-not-allowed'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
            }`}
          >
            &larr; Previous
          </button>
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
            className={`text-sm font-medium transition-colors ${
              currentPage >= totalPages
                ? 'text-zinc-300 dark:text-zinc-600 cursor-not-allowed'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
            }`}
          >
            Next &rarr;
          </button>
        </div>
      )}
    </AdminLayout>
  )
}
