'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { EventRowActionOverflow } from '@/components/events/EventRowActionControl'

type UserRow = {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  role: string
  isActive: boolean
  createdAt: string
  updatedAt: string
  status: 'ACTIVE' | 'NEVER_LOGGED_IN' | 'DEACTIVATED'
  inviteStatus: 'NONE' | 'PENDING' | 'ACCEPTED' | 'EXPIRED'
  invitedAt: string | null
  joinedAt: string | null
  lastLoginAt: string | null
}

type PendingRow = {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  role: string
  createdAt: string
  status: 'INVITED' | 'INVITE_EXPIRED'
  inviteStatus: 'PENDING' | 'EXPIRED'
  invitedAt: string
  joinedAt: null
  lastLoginAt: null
}

const ROLE_LABEL: Record<string, string> = {
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  VIEWER: 'Viewer',
}

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Active',
  NEVER_LOGGED_IN: 'Never logged in',
  DEACTIVATED: 'Access removed',
  INVITED: 'Invited',
  INVITE_EXPIRED: 'Invite expired',
}

type ConfirmAction =
  | { kind: 'cancel-invite'; email: string; name: string }
  | { kind: 'remove-access'; userId: string; name: string }

function formatDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
    : '—'
}

export function AccountUsersPanel({ accountSlug }: { accountSlug: string }) {
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [users, setUsers] = useState<UserRow[]>([])
  const [pendingInvites, setPendingInvites] = useState<PendingRow[]>([])
  const [inviteRoles, setInviteRoles] = useState<string[]>(['ADMIN', 'MANAGER', 'VIEWER'])
  const [error, setError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)
  const [otp, setOtp] = useState<{ email: string; code: string } | null>(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'ADMIN' | 'MANAGER' | 'VIEWER'>('MANAGER')

  const q = `account=${encodeURIComponent(accountSlug)}`

  const showToast = useCallback((type: 'success' | 'error', text: string) => {
    setSaveMessage({ type, text })
    setTimeout(() => setSaveMessage(null), 2800)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    setForbidden(false)
    try {
      const res = await fetch(`/api/app/account/users?${q}`)
      if (res.status === 403) {
        setForbidden(true)
        setUsers([])
        setPendingInvites([])
        return
      }
      const json = await res.json()
      if (!res.ok || !json.success) {
        setError(json.message || json.error || 'Failed to load users')
        return
      }
      setUsers(json.data.users)
      setPendingInvites(json.data.pendingInvites)
      if (Array.isArray(json.data.inviteRoles) && json.data.inviteRoles.length > 0) {
        setInviteRoles(json.data.inviteRoles)
      }
    } catch {
      setError('Failed to load users')
    } finally {
      setLoading(false)
    }
  }, [q])

  useEffect(() => {
    load()
  }, [load])

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/app/account/users?${q}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          role,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        showToast('error', json.message || json.error || 'Could not send invite')
        return
      }
      showToast('success', json.message || 'Invitation sent')
      setModalOpen(false)
      setFirstName('')
      setLastName('')
      setEmail('')
      setRole('MANAGER')
      await load()
    } catch {
      showToast('error', 'Request failed')
    } finally {
      setSaving(false)
    }
  }

  const resend = async (inviteEmail: string) => {
    setBusyAction(`resend:${inviteEmail}`)
    try {
      const res = await fetch(`/api/app/account/users/resend?${q}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail }),
      })
      const json = await res.json()
      if (!res.ok) {
        showToast('error', json.message || 'Could not resend')
        return
      }
      showToast('success', 'Invite resent')
    } catch {
      showToast('error', 'Request failed')
    } finally {
      setBusyAction(null)
    }
  }

  const revoke = async (inviteEmail: string) => {
    setBusyAction(`cancel:${inviteEmail}`)
    try {
      const res = await fetch(`/api/app/account/users/revoke-invite?${q}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail }),
      })
      const json = await res.json()
      if (!res.ok) {
        showToast('error', json.message || 'Could not cancel invite')
        return
      }
      showToast('success', 'Invite cancelled')
      await load()
    } catch {
      showToast('error', 'Request failed')
    } finally {
      setBusyAction(null)
    }
  }

  const removeAccess = async (userId: string) => {
    setBusyAction(`remove:${userId}`)
    try {
      const res = await fetch(`/api/app/account/users/${userId}?${q}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: false }),
      })
      const json = await res.json()
      if (!res.ok) {
        showToast('error', json.message || 'Could not update user')
        return
      }
      showToast('success', json.message || 'Access removed')
      await load()
    } catch {
      showToast('error', 'Request failed')
    } finally {
      setBusyAction(null)
    }
  }

  const changeRole = async (userId: string, nextRole: string) => {
    setBusyAction(`role:${userId}`)
    try {
      const res = await fetch(`/api/app/account/users/${userId}?${q}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: nextRole }),
      })
      const json = await res.json()
      if (!res.ok) {
        showToast('error', json.message || 'Could not update role')
        return
      }
      showToast('success', json.message || 'Role updated')
      await load()
    } catch {
      showToast('error', 'Request failed')
    } finally {
      setBusyAction(null)
    }
  }

  const generateOtp = async (user: UserRow) => {
    setBusyAction(`otp:${user.id}`)
    try {
      const res = await fetch(`/api/app/account/users/${user.id}/otp?${q}`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok || !json.success) {
        showToast('error', json.message || 'Could not generate login OTP')
        return
      }
      setOtp({ email: json.data.email, code: json.data.otp })
    } catch {
      showToast('error', 'Request failed')
    } finally {
      setBusyAction(null)
    }
  }

  const displayName = (u: { firstName: string | null; lastName: string | null; email: string }) => {
    const n = [u.firstName, u.lastName].filter(Boolean).join(' ').trim()
    return n || u.email
  }

  if (forbidden) {
    return (
      <Card className="mb-6">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          You don&apos;t have permission to manage users. Only account admins can invite or remove team members.
        </p>
      </Card>
    )
  }

  return (
    <>
      {saveMessage && (
        <div
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
            saveMessage.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
          }`}
        >
          {saveMessage.text}
        </div>
      )}

      <Card className="mb-6" data-tour="users-panel">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Users</h2>
            <p className="text-base text-zinc-500 dark:text-zinc-400 mt-1">
              Invite teammates and assign roles for this account only.
            </p>
          </div>
          <Button type="button" onClick={() => setModalOpen(true)} disabled={loading}>
            Add User
          </Button>
        </div>

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400 mb-4" role="alert">
            {error}
          </p>
        )}

        {loading ? (
          <p className="text-center text-zinc-500 py-10">Loading…</p>
        ) : users.length === 0 && pendingInvites.length === 0 ? (
          <p className="text-center text-zinc-500 dark:text-zinc-400 py-10 border border-dashed border-zinc-200 dark:border-zinc-700 rounded-lg">
            No users yet. Invite someone to collaborate on this account.
          </p>
        ) : (
          <div className="space-y-8 overflow-x-auto">
            {users.length > 0 && (
              <div className="min-w-[900px]">
                <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-3">Team members</h3>
                <div className="divide-y divide-zinc-200 dark:divide-zinc-700 rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden">
                  <div className="grid grid-cols-[minmax(210px,1.5fr)_100px_130px_110px_110px_130px_110px] gap-3 bg-zinc-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:bg-zinc-800/60">
                    <span>Name / email</span><span>Role</span><span>Status</span><span>Invited</span><span>Joined</span><span>Last login</span><span className="sticky right-0 z-30 -mr-4 border-l border-zinc-200 bg-zinc-50 pl-3 dark:border-zinc-700 dark:bg-zinc-800">Actions</span>
                  </div>
                  {users.map((u) => (
                    <div
                      key={u.id}
                      className="grid grid-cols-[minmax(210px,1.5fr)_100px_130px_110px_110px_130px_110px] items-center gap-3 px-4 py-3 bg-white dark:bg-zinc-900/40"
                    >
                      <div>
                        <p className="font-medium text-zinc-900 dark:text-zinc-100">{displayName(u)}</p>
                        <p className="text-sm text-zinc-500">{u.email}</p>
                      </div>
                      <span className="text-sm text-zinc-600 dark:text-zinc-300">{ROLE_LABEL[u.role] || u.role}</span>
                      <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">{STATUS_LABEL[u.status]}</span>
                      <span className="text-sm text-zinc-500">{formatDate(u.invitedAt)}</span>
                      <span className="text-sm text-zinc-500">{formatDate(u.joinedAt)}</span>
                      <span className="text-sm text-zinc-500">{u.lastLoginAt ? formatDate(u.lastLoginAt) : 'Never'}</span>
                      <div className="sticky right-0 z-20 -mr-4 border-l border-zinc-200 bg-white pl-3 dark:border-zinc-700 dark:bg-zinc-900/40">
                        <EventRowActionOverflow label={`Actions for ${u.email}`} menuClassName="w-52">
                          {u.isActive && <button type="button" role="menuitem" disabled={busyAction === `otp:${u.id}`} onClick={() => generateOtp(u)} className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-zinc-100 disabled:opacity-50 dark:hover:bg-zinc-800">Generate login OTP</button>}
                          {u.inviteStatus === 'PENDING' && <button type="button" role="menuitem" disabled={busyAction === `resend:${u.email}`} onClick={() => resend(u.email)} className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-zinc-100 disabled:opacity-50 dark:hover:bg-zinc-800">Resend invite</button>}
                          {u.isActive && <details className="relative">
                            <summary className="flex cursor-pointer list-none items-center justify-between rounded px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800">Change role <span aria-hidden="true">›</span></summary>
                            <div role="menu" aria-label={`Roles for ${u.email}`} className="absolute left-[calc(100%+0.25rem)] top-0 z-[110] w-40 rounded-lg border border-zinc-200 bg-white p-1 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
                              {inviteRoles.map((nextRole) => {
                                const isCurrent = u.role === nextRole
                                return <button key={nextRole} type="button" role="menuitemradio" aria-checked={isCurrent} disabled={isCurrent || busyAction === `role:${u.id}`} onClick={() => changeRole(u.id, nextRole)} className="flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm hover:bg-zinc-100 disabled:cursor-default disabled:opacity-60 dark:hover:bg-zinc-800"><span>{ROLE_LABEL[nextRole] || nextRole}</span>{isCurrent && <span aria-label="Current role">✓</span>}</button>
                              })}
                            </div>
                          </details>}
                          {u.isActive && <div role="separator" className="my-1 border-t border-zinc-200 dark:border-zinc-700" />}
                          {u.isActive && <button type="button" role="menuitem" onClick={() => setConfirmAction({ kind: 'remove-access', userId: u.id, name: displayName(u) })} className="block w-full rounded px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/40">Remove access</button>}
                        </EventRowActionOverflow>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {pendingInvites.length > 0 && (
              <div className="min-w-[900px]">
                <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-3">Pending invites</h3>
                <div className="divide-y divide-zinc-200 dark:divide-zinc-700 rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden">
                  <div className="grid grid-cols-[minmax(210px,1.5fr)_100px_130px_110px_110px_130px_110px] gap-3 bg-amber-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:bg-amber-950/30">
                    <span>Name / email</span><span>Role</span><span>Status</span><span>Invited</span><span>Joined</span><span>Last login</span><span className="sticky right-0 z-30 -mr-4 border-l border-amber-200 bg-amber-50 pl-3 dark:border-amber-900 dark:bg-amber-950/30">Actions</span>
                  </div>
                  {pendingInvites.map((p) => (
                    <div
                      key={p.id}
                      className="grid grid-cols-[minmax(210px,1.5fr)_100px_130px_110px_110px_130px_110px] items-center gap-3 px-4 py-3 bg-amber-50/50 dark:bg-amber-950/20"
                    >
                      <div>
                        <p className="font-medium text-zinc-900 dark:text-zinc-100">{displayName(p)}</p>
                        <p className="text-sm text-zinc-500">{p.email}</p>
                      </div>
                      <span className="text-sm text-zinc-600 dark:text-zinc-300">{ROLE_LABEL[p.role] || p.role}</span>
                      <span className="text-sm font-medium text-amber-800 dark:text-amber-300">{STATUS_LABEL[p.status]}</span>
                      <span className="text-sm text-zinc-500">{formatDate(p.invitedAt)}</span>
                      <span className="text-sm text-zinc-500">—</span>
                      <span className="text-sm text-zinc-500">Never</span>
                      <div className="sticky right-0 z-20 -mr-4 border-l border-amber-200 bg-amber-50/50 pl-3 dark:border-amber-900 dark:bg-amber-950/20">
                        <EventRowActionOverflow label={`Actions for ${p.email}`} menuClassName="w-48">
                          <button type="button" role="menuitem" disabled={busyAction === `resend:${p.email}`} onClick={() => resend(p.email)} className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-zinc-100 disabled:opacity-50 dark:hover:bg-zinc-800">Resend invite</button>
                          <div role="separator" className="my-1 border-t border-zinc-200 dark:border-zinc-700" />
                          <button type="button" role="menuitem" onClick={() => setConfirmAction({ kind: 'cancel-invite', email: p.email, name: displayName(p) })} className="block w-full rounded px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/40">Cancel invite</button>
                        </EventRowActionOverflow>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      {modalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50" role="dialog">
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-xl max-w-md w-full p-6 border border-zinc-200 dark:border-zinc-700">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Invite user</h3>
            <form onSubmit={handleInvite} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">First name</label>
                  <input
                    className="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    autoComplete="given-name"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Last name</label>
                  <input
                    className="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    autoComplete="family-name"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Email</label>
                <input
                  type="email"
                  required
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Role</label>
                <select
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm"
                  value={role}
                  onChange={(e) => setRole(e.target.value as 'ADMIN' | 'MANAGER' | 'VIEWER')}
                >
                  {inviteRoles.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r] || r}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-zinc-500 mt-1">Admins can manage users and billing; managers and viewers cannot.</p>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400"
                  disabled={saving}
                >
                  Cancel
                </button>
                <Button type="submit" disabled={saving}>
                  {saving ? 'Sending…' : 'Send invite'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {otp && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Generated login OTP">
          <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">One-time login code</h3>
            <p className="mt-2 text-sm text-zinc-500">Show this code once for {otp.email}. It is not saved by SignalThread.</p>
            <p className="my-5 select-all rounded-lg bg-zinc-100 p-4 text-center font-mono text-3xl tracking-[0.25em] text-zinc-950 dark:bg-zinc-800 dark:text-white">{otp.code}</p>
            <Button type="button" className="w-full" onClick={() => setOtp(null)}>Done</Button>
          </div>
        </div>
      )}

      {confirmAction && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label={confirmAction.kind === 'remove-access' ? 'Remove user access' : 'Cancel invite'}>
          <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{confirmAction.kind === 'remove-access' ? `Remove ${confirmAction.name}'s access?` : `Cancel ${confirmAction.name}'s invite?`}</h3>
            <p className="mt-2 text-sm text-zinc-500">{confirmAction.kind === 'remove-access' ? 'This revokes access to this account without deleting historical data.' : 'This cancels the outstanding invitation for this account.'}</p>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400" onClick={() => setConfirmAction(null)}>Cancel</button>
              <button
                type="button"
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                disabled={confirmAction.kind === 'remove-access' ? busyAction === `remove:${confirmAction.userId}` : busyAction === `cancel:${confirmAction.email}`}
                onClick={async () => {
                  const current = confirmAction
                  setConfirmAction(null)
                  if (current.kind === 'remove-access') await removeAccess(current.userId)
                  else await revoke(current.email)
                }}
              >
                {confirmAction.kind === 'remove-access' ? 'Remove access' : 'Cancel invite'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
