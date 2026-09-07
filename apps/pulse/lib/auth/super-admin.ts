import type { UserRole } from '@prisma/client'

/**
 * Platform super admin: env allowlist and/or Prisma User.role SUPER_ADMIN.
 * Used for account-scoped admin actions that super admins should perform (e.g. team user management).
 */
export function isSuperAdminActor(
  user: { email?: string | null },
  dbUser: { role: UserRole } | null | undefined
): boolean {
  const emails = (process.env.SUPER_ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean)
  if (user.email && emails.includes(user.email)) return true
  if (dbUser?.role === 'SUPER_ADMIN') return true
  return false
}
