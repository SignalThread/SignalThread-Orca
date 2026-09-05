import type { UserRole } from '@prisma/client'

function emailsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = a?.trim().toLowerCase()
  const y = b?.trim().toLowerCase()
  return Boolean(x && y && x === y)
}

/**
 * Pure policy: who may manage account users (invite, deactivate, etc.).
 * - Account contact email (owner) always may.
 * - Otherwise: Prisma User must be ADMIN for this account (not MANAGER/VIEWER).
 */
export function isAccountAdminForAccount(opts: {
  accountEmail: string | null
  sessionEmail: string | null
  dbUser: { role: UserRole } | null
  hasAccountAccess: boolean
}): boolean {
  if (emailsMatch(opts.accountEmail, opts.sessionEmail)) return true
  if (!opts.dbUser || !opts.hasAccountAccess) return false
  return opts.dbUser.role === 'ADMIN'
}
