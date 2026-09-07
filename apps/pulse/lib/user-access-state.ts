import type { User as SupabaseAuthUser } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

export type CanonicalUserStatus = 'ACTIVE' | 'INVITED' | 'INVITE_EXPIRED' | 'NEVER_LOGGED_IN' | 'DEACTIVATED'
export type CanonicalInviteStatus = 'NONE' | 'PENDING' | 'ACCEPTED' | 'EXPIRED'

export type AuthUserMetadata = {
  id: string
  email: string | null
  invitedAt: string | null
  activatedAt: string | null
  lastLoginAt: string | null
}

export type CanonicalUserAccessState = {
  status: CanonicalUserStatus
  inviteStatus: CanonicalInviteStatus
  lastLoginAt: string | null
  activatedAt: string | null
  hasActiveAccess: boolean
}

export function deriveCanonicalUserAccessState(input: {
  isActive?: boolean
  hasUser: boolean
  inviteCreatedAt?: Date | string | null
  inviteUsedAt?: Date | string | null
  inviteExpiresAt?: Date | string | null
  auth: AuthUserMetadata | null
  now?: Date
}): CanonicalUserAccessState {
  const now = input.now ?? new Date()
  const expired = Boolean(input.inviteExpiresAt && new Date(input.inviteExpiresAt).getTime() <= now.getTime())
  const lastLoginAt = input.auth?.lastLoginAt ?? null
  const activatedAt = input.inviteUsedAt
    ? new Date(input.inviteUsedAt).toISOString()
    : input.auth?.activatedAt ?? null

  if (!input.hasUser) {
    return {
      status: expired ? 'INVITE_EXPIRED' : 'INVITED',
      inviteStatus: expired ? 'EXPIRED' : 'PENDING',
      lastLoginAt: null,
      activatedAt: null,
      hasActiveAccess: false,
    }
  }

  const inviteStatus: CanonicalInviteStatus = input.inviteUsedAt
    ? 'ACCEPTED'
    : input.inviteCreatedAt
      ? (expired ? 'EXPIRED' : 'PENDING')
      : 'NONE'
  if (input.isActive === false) {
    return { status: 'DEACTIVATED', inviteStatus, lastLoginAt, activatedAt, hasActiveAccess: false }
  }
  if (!lastLoginAt) {
    return { status: 'NEVER_LOGGED_IN', inviteStatus, lastLoginAt: null, activatedAt, hasActiveAccess: true }
  }
  return { status: 'ACTIVE', inviteStatus, lastLoginAt, activatedAt, hasActiveAccess: true }
}

function authMetadata(user: SupabaseAuthUser): AuthUserMetadata {
  return {
    id: user.id,
    email: user.email?.trim().toLowerCase() ?? null,
    invitedAt: user.invited_at ?? null,
    activatedAt: user.email_confirmed_at ?? user.confirmed_at ?? null,
    lastLoginAt: user.last_sign_in_at ?? null,
  }
}

/** Load Supabase Auth users once, in bounded pages, then index locally. */
export async function loadSupabaseAuthUserMetadata(): Promise<{
  byId: Map<string, AuthUserMetadata>
  byEmail: Map<string, AuthUserMetadata>
}> {
  const admin = createAdminClient()
  const all: AuthUserMetadata[] = []
  const perPage = 1000
  const maxPages = 100

  for (let page = 1; page <= maxPages; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error) throw error
    all.push(...data.users.map(authMetadata))
    if (data.users.length < perPage) break
    if (page === maxPages) throw new Error('Supabase Auth user directory exceeded the supported page limit')
  }

  return {
    byId: new Map(all.map((user) => [user.id, user])),
    byEmail: new Map(all.flatMap((user) => user.email ? [[user.email, user] as const] : [])),
  }
}

export function authMetadataFor(
  indexes: Awaited<ReturnType<typeof loadSupabaseAuthUserMetadata>>,
  input: { id?: string | null; email: string },
): AuthUserMetadata | null {
  return (input.id ? indexes.byId.get(input.id) : null)
    ?? indexes.byEmail.get(input.email.trim().toLowerCase())
    ?? null
}
