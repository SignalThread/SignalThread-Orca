import type { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import { launchStateCookieSecure } from '@/lib/platform/launch-state'

/**
 * Establish a Pulse Supabase Auth session for an already-resolved Pulse user.
 *
 * Pulse owns its own Supabase Auth project, so a Platform identity can never be
 * "shared" into it. The safest supported way to open a session for a specific
 * existing Auth user without a password or an email round trip is the same
 * primitive Platform itself uses for the handoff:
 *
 *   admin.generateLink({ type: 'magiclink' })  ->  hashed_token   (service role)
 *   verifyOtp({ token_hash })                  ->  session         (anon key, SSR cookies)
 *
 * Both calls happen here, on the server, inside one request. The hashed token is
 * never sent anywhere, never logged, and is spent immediately, so no link, code
 * or credential ever reaches the browser or an inbox.
 *
 * Why this is safe even though `generateLink` is addressed by email:
 *   - the Auth user is looked up **by id** first; the address used is that
 *     user's own, read back from Auth, never supplied by a caller;
 *   - `generateLink` returns the user it minted for, and this function refuses
 *     to continue unless that id equals the id it was asked for -- so a mailbox
 *     collision or an unexpected new user can never yield a session;
 *   - the established session's user id is checked again after `verifyOtp`.
 * Email is transport for the OTP, not identity. No Auth user is ever created,
 * no `User.id` is touched, and the service-role key stays in `SUPABASE_SERVICE_ROLE_KEY`.
 */

export type EstablishSessionFailure =
  /** SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL missing. */
  | 'AUTH_NOT_CONFIGURED'
  /** No Pulse Auth user has this id (the Prisma User exists but its Auth identity is gone). */
  | 'AUTH_IDENTITY_MISSING'
  /** The Auth user is banned. */
  | 'AUTH_IDENTITY_BANNED'
  /** The Auth user has no email address, so no OTP can be minted for it. */
  | 'AUTH_IDENTITY_NO_EMAIL'
  /** Minting returned an error or a different user than requested. */
  | 'SESSION_MINT_FAILED'
  | 'SESSION_IDENTITY_MISMATCH'
  /** The OTP could not be exchanged for a session bound to this user. */
  | 'SESSION_ESTABLISH_FAILED'

export type EstablishSessionResult =
  | { ok: true; userId: string }
  | { ok: false; reason: EstablishSessionFailure }

const fail = (reason: EstablishSessionFailure): EstablishSessionResult => ({ ok: false, reason })

export async function establishPulseSessionForUser(
  userId: string,
  request: NextRequest,
  response: NextResponse,
): Promise<EstablishSessionResult> {
  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return fail('AUTH_NOT_CONFIGURED')
  }

  // Identity is fixed here, by id. Everything after this merely opens a session for it.
  const { data: found, error: lookupError } = await admin.auth.admin.getUserById(userId)
  const authUser = found?.user
  if (lookupError || !authUser || authUser.id !== userId) return fail('AUTH_IDENTITY_MISSING')
  if (authUser.banned_until && new Date(authUser.banned_until).getTime() > Date.now()) {
    return fail('AUTH_IDENTITY_BANNED')
  }
  if (!authUser.email) return fail('AUTH_IDENTITY_NO_EMAIL')

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: authUser.email,
  })
  if (linkError || !link?.properties?.hashed_token) return fail('SESSION_MINT_FAILED')
  // Bind to the id, not the address: refuse anything minted for another user.
  if (link.user?.id !== userId) return fail('SESSION_IDENTITY_MISMATCH')

  // Same scope the browser client uses (Path=/, SameSite=Lax, host-only), plus
  // Secure whenever this deployment is served over HTTPS.
  const client = createRouteHandlerClient(request, response, { secure: launchStateCookieSecure() })
  const { data: session, error: verifyError } = await client.auth.verifyOtp({
    type: 'magiclink',
    token_hash: link.properties.hashed_token,
  })
  if (verifyError || !session?.session || session.user?.id !== userId) {
    return fail('SESSION_ESTABLISH_FAILED')
  }

  return { ok: true, userId }
}
