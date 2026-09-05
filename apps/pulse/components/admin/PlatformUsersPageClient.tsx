'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { PlatformAdminNav } from '@/components/admin/PlatformAdminNav'
import { Badge } from '@/components/ui/Badge'
import { InfoTooltip } from '@/components/ui/InfoTooltip'
import { EventRowActionOverflow } from '@/components/events/EventRowActionControl'
import { PlatformAccountAccessDrawer } from '@/components/admin/PlatformAccountAccessDrawer'

type UserStatus = 'ACTIVE' | 'INVITED' | 'INVITE_EXPIRED' | 'NEVER_LOGGED_IN' | 'DEACTIVATED'
type Row = {
  key: string
  kind: 'USER' | 'INVITE'
  id: string
  name: string
  hasDisplayName: boolean
  email: string
  account: { id: string; name: string; slug: string } | null
  accountIds: string[]
  accountCount: number
  role: 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'VIEWER'
  status: UserStatus
  inviteStatus: 'NONE' | 'PENDING' | 'ACCEPTED' | 'EXPIRED'
  invitedAt: string | null
  lastLoginAt: string | null
  createdAt: string
  hasActiveAccess: boolean
}
type Summary = { total: number; active: number; invited: number; neverLoggedIn: number; deactivated: number }

const statusLabel: Record<UserStatus, string> = {
  ACTIVE: 'Active', INVITED: 'Invited', INVITE_EXPIRED: 'Invite expired',
  NEVER_LOGGED_IN: 'Never logged in', DEACTIVATED: 'Deactivated',
}
const roleLabel: Record<Row['role'], string> = {
  SUPER_ADMIN: 'Platform admin', ADMIN: 'Admin', MANAGER: 'Manager', VIEWER: 'Viewer',
}
const inputClass = 'rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100'
const userStatusVariant: Record<UserStatus, 'default' | 'success' | 'warning' | 'error'> = {
  ACTIVE: 'success',
  INVITED: 'warning',
  INVITE_EXPIRED: 'warning',
  NEVER_LOGGED_IN: 'default',
  DEACTIVATED: 'error',
}
const inviteStatusVariant: Record<Exclude<Row['inviteStatus'], 'NONE'>, 'success' | 'warning'> = {
  ACCEPTED: 'success',
  PENDING: 'warning',
  EXPIRED: 'warning',
}

function tableDate(value: string | null) {
  if (!value) return null
  const parsed = new Date(value)
  return {
    short: new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(parsed),
    full: new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(parsed),
  }
}

function DateCell({ value }: { value: string | null }) {
  const formatted = tableDate(value)
  if (!formatted || !value) return <>—</>
  return (
    <InfoTooltip
      content={formatted.full}
      ariaLabel={`Full timestamp: ${formatted.full}`}
      placement="top"
      trigger={<time dateTime={value}>{formatted.short}</time>}
    />
  )
}

export function PlatformUsersPageClient() {
  const [rows, setRows] = useState<Row[]>([])
  const [accounts, setAccounts] = useState<Array<{ id: string; name: string; slug: string }>>([])
  const [summary, setSummary] = useState<Summary>({ total: 0, active: 0, invited: 0, neverLoggedIn: 0, deactivated: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [account, setAccount] = useState('all')
  const [role, setRole] = useState('all')
  const [status, setStatus] = useState('all')
  const [otp, setOtp] = useState<{ email: string; code: string } | null>(null)
  const [confirm, setConfirm] = useState<Row | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [rolePickerRowKey, setRolePickerRowKey] = useState<string | null>(null)
  const [accountAccessRow, setAccountAccessRow] = useState<Row | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const query = new URLSearchParams({ search, account, role, status })
      const response = await fetch(`/api/admin/users?${query}`, { cache: 'no-store' })
      const json = await response.json()
      if (!response.ok || !json.success) throw new Error(json.error || 'Unable to load users')
      setRows(json.data.rows)
      setAccounts(json.data.accounts)
      setSummary(json.data.summary)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load users')
    } finally {
      setLoading(false)
    }
  }, [account, role, search, status])

  useEffect(() => {
    const timer = setTimeout(load, 180)
    return () => clearTimeout(timer)
  }, [load])

  const generateOtp = async (row: Row) => {
    setBusyKey(row.key)
    try {
      const response = await fetch(`/api/admin/users/${row.id}/otp`, { method: 'POST' })
      const json = await response.json()
      if (!response.ok || !json.success) throw new Error(json.error || 'Unable to generate OTP')
      setOtp({ email: json.data.email, code: json.data.otp })
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to generate OTP') }
    finally { setBusyKey(null) }
  }

  const resend = async (row: Row) => {
    setBusyKey(row.key)
    try {
      const response = await fetch(`/api/admin/users/invites/${row.id}/resend`, { method: 'POST' })
      const json = await response.json()
      if (!response.ok || !json.success) throw new Error(json.error || 'Unable to resend invite')
      await load()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to resend invite') }
    finally { setBusyKey(null) }
  }

  const updateUser = async (row: Row, body: { role?: string; isActive?: boolean }) => {
    setBusyKey(row.key)
    try {
      const response = await fetch(`/api/admin/users/${row.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const json = await response.json()
      if (!response.ok || !json.success) throw new Error(json.error || 'Unable to update user')
      setConfirm(null)
      setRolePickerRowKey(null)
      await load()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to update user') }
    finally { setBusyKey(null) }
  }

  const counts = useMemo(() => [
    ['Total users', summary.total], ['Active', summary.active], ['Invited', summary.invited],
    ['Never logged in', summary.neverLoggedIn], ['Deactivated', summary.deactivated],
  ] as const, [summary])

  return (
    <AdminLayout>
      <header className="mb-5">
        <h1 className="text-2xl font-bold text-zinc-950 dark:text-white">Platform Admin</h1>
        <p className="mt-1 text-sm text-zinc-500">Cross-account user access and onboarding support.</p>
      </header>
      <PlatformAdminNav />

      <section className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5" aria-label="User summary">
        {counts.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="text-2xl font-semibold text-zinc-950 dark:text-white">{value}</div>
            <div className="mt-1 text-xs font-medium text-zinc-500">{label}</div>
          </div>
        ))}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="grid gap-3 border-b border-zinc-200 p-4 sm:grid-cols-2 lg:grid-cols-[minmax(220px,1fr)_180px_150px_180px] dark:border-zinc-800">
          <input aria-label="Search users" className={inputClass} placeholder="Search name or email" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select aria-label="Filter by account" className={inputClass} value={account} onChange={(e) => setAccount(e.target.value)}><option value="all">All accounts</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
          <select aria-label="Filter by role" className={inputClass} value={role} onChange={(e) => setRole(e.target.value)}><option value="all">All roles</option>{Object.entries(roleLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <select aria-label="Filter by status" className={inputClass} value={status} onChange={(e) => setStatus(e.target.value)}><option value="all">All statuses</option>{Object.entries(statusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        </div>
        {error && <p role="alert" className="border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] text-left text-sm">
            <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-950/60">
              <tr>{['Name', 'Email', 'Account', 'Role', 'Status', 'Invite status', 'Invited date', 'Last login', 'Created', 'Actions'].map((h) => <th key={h} className={`px-3 py-3 font-semibold ${h === 'Actions' ? 'sticky right-0 z-30 min-w-[96px] border-l border-zinc-200 bg-zinc-50 shadow-[-8px_0_12px_-12px_rgba(15,23,42,0.35)] dark:border-zinc-700 dark:bg-zinc-950' : ''}`}>{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {!loading && rows.map((row) => (
                <tr key={row.key} className="group align-top hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                  <td className="px-3 py-3 font-medium text-zinc-950 dark:text-white">{row.name}</td>
                  <td className="px-3 py-3 text-zinc-600 dark:text-zinc-300">{row.hasDisplayName ? row.email : '—'}</td>
                  <td className="px-3 py-3">{row.role === 'SUPER_ADMIN' ? 'Platform' : row.account ? `${row.account.name}${row.accountCount > 1 ? ` +${row.accountCount - 1}` : ''}` : '—'}</td>
                  <td className="px-3 py-3">{roleLabel[row.role]}</td>
                  <td className="px-3 py-3"><Badge variant={userStatusVariant[row.status]} size="sm" className="whitespace-nowrap">{statusLabel[row.status]}</Badge></td>
                  <td className="px-3 py-3">{row.inviteStatus === 'NONE' ? '—' : <Badge variant={inviteStatusVariant[row.inviteStatus]} size="sm" className="whitespace-nowrap">{row.inviteStatus.charAt(0) + row.inviteStatus.slice(1).toLowerCase()}</Badge>}</td>
                  <td className="whitespace-nowrap px-3 py-3"><DateCell value={row.invitedAt} /></td>
                  <td className="whitespace-nowrap px-3 py-3">{row.lastLoginAt ? <DateCell value={row.lastLoginAt} /> : 'Never'}</td>
                  <td className="whitespace-nowrap px-3 py-3"><DateCell value={row.createdAt} /></td>
                  <td className="sticky right-0 z-20 min-w-[96px] border-l border-zinc-200 bg-white px-3 py-3 shadow-[-8px_0_12px_-12px_rgba(15,23,42,0.35)] group-hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:group-hover:bg-zinc-800">
                    <EventRowActionOverflow label={`Actions for ${row.email}`} menuClassName="w-64 p-1.5" onOpenChange={(open) => { if (!open) setRolePickerRowKey(null) }}>
                      {rolePickerRowKey === row.key ? <>
                        <button type="button" role="menuitem" className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800" onClick={() => setRolePickerRowKey(null)}><span aria-hidden="true">‹</span> Back to actions</button>
                        <div className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Change role</div>
                        {(['ADMIN', 'MANAGER', 'VIEWER'] as const).map((nextRole) => {
                          const isCurrent = row.role === nextRole
                          return <button key={nextRole} type="button" role="menuitemradio" aria-checked={isCurrent} disabled={isCurrent || busyKey === row.key} onClick={() => updateUser(row, { role: nextRole })} className="flex min-h-9 w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm text-zinc-800 hover:bg-zinc-100 disabled:cursor-default disabled:opacity-60 dark:text-zinc-100 dark:hover:bg-zinc-800"><span>{roleLabel[nextRole]}</span>{isCurrent && <span aria-label="Current role">✓</span>}</button>
                        })}
                      </> : <>
                        <button type="button" role="menuitem" className="block min-h-9 w-full rounded-md px-3 py-2 text-left text-sm text-zinc-800 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800" onClick={() => navigator.clipboard.writeText(row.email)}>Copy email</button>
                        {row.account && <a role="menuitem" className="block min-h-9 rounded-md px-3 py-2 text-sm text-zinc-800 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800" href={`/app?account=${encodeURIComponent(row.account.slug)}`}>Open account</a>}
                        {row.kind === 'USER' && row.hasActiveAccess && <button type="button" role="menuitem" className="block min-h-9 w-full rounded-md px-3 py-2 text-left text-sm text-zinc-800 hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-100 dark:hover:bg-zinc-800" disabled={busyKey === row.key} onClick={() => generateOtp(row)}>Generate OTP</button>}
                        {row.kind === 'INVITE' && row.inviteStatus === 'PENDING' && <button type="button" role="menuitem" className="block min-h-9 w-full rounded-md px-3 py-2 text-left text-sm text-zinc-800 hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-100 dark:hover:bg-zinc-800" disabled={busyKey === row.key} onClick={() => resend(row)}>Resend invite</button>}
                        {row.kind === 'USER' && row.role === 'ADMIN' && <button type="button" role="menuitem" className="block min-h-9 w-full rounded-md px-3 py-2 text-left text-sm text-zinc-800 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800" onClick={() => setAccountAccessRow(row)}>Manage account access</button>}
                        {row.kind === 'USER' && row.account && row.role !== 'SUPER_ADMIN' && <button type="button" role="menuitem" className="flex min-h-9 w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm text-zinc-800 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800" onClick={() => setRolePickerRowKey(row.key)}>Change role <span aria-hidden="true">›</span></button>}
                        {row.kind === 'USER' && row.account && row.role !== 'SUPER_ADMIN' && <div role="separator" className="my-1 border-t border-zinc-200 dark:border-zinc-700" />}
                        {row.kind === 'USER' && row.account && row.role !== 'SUPER_ADMIN' && <button type="button" role="menuitem" className="block min-h-9 w-full rounded-md px-3 py-2 text-left text-sm font-medium text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/40" onClick={() => setConfirm(row)}>{row.hasActiveAccess ? 'Deactivate' : 'Reactivate'}</button>}
                      </>}
                    </EventRowActionOverflow>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {loading && <p className="py-12 text-center text-sm text-zinc-500">Loading users…</p>}
          {!loading && rows.length === 0 && <p className="py-12 text-center text-sm text-zinc-500">No users match these filters.</p>}
        </div>
      </section>

      {otp && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Generated OTP"><div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl dark:bg-zinc-900"><h2 className="text-lg font-semibold">One-time email OTP</h2><p className="mt-2 text-sm text-zinc-500">Show this code once for {otp.email}. It is not saved by SignalThread.</p><p className="my-5 select-all rounded-lg bg-zinc-100 p-4 text-center font-mono text-3xl tracking-[0.25em] dark:bg-zinc-800">{otp.code}</p><button className="w-full rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white" onClick={() => setOtp(null)}>Done</button></div></div>}
      {confirm && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label={`${confirm.hasActiveAccess ? 'Deactivate' : 'Reactivate'} user`}><div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-zinc-900"><h2 className="text-lg font-semibold">{confirm.hasActiveAccess ? 'Deactivate' : 'Reactivate'} {confirm.name}?</h2><p className="mt-2 text-sm text-zinc-500">{confirm.hasActiveAccess ? 'This globally deactivates login access across every assigned account. Memberships and historical data are preserved.' : 'This restores login access across the user’s assigned accounts.'}</p><div className="mt-6 flex justify-end gap-2"><button className="rounded-lg border px-4 py-2" onClick={() => setConfirm(null)}>Cancel</button><button className={`rounded-lg px-4 py-2 font-semibold text-white ${confirm.hasActiveAccess ? 'bg-red-600' : 'bg-blue-600'}`} disabled={busyKey === confirm.key} onClick={() => updateUser(confirm, { isActive: !confirm.hasActiveAccess })}>Confirm</button></div></div></div>}
      {accountAccessRow && <PlatformAccountAccessDrawer userId={accountAccessRow.id} onClose={() => setAccountAccessRow(null)} onChanged={load} />}
    </AdminLayout>
  )
}
