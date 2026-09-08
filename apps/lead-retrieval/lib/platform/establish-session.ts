/**
 * Establish a Lead Retrieval Supabase Auth session for an already-resolved LR user.
 *
 * Lead Retrieval owns its own Supabase Auth project, so a Platform identity can
 * never be "shared" into it. The safest supported way to open a session for a
 * specific existing Auth user without a password or an email round trip is the
 * primitive LR already uses for its passwordless server-side sign-ins (Apple
 * review login, E2E seeding) and Platform itself uses for the handoff:
 *
 *   admin.generateLink({ type: "magiclink" })  ->  hashed_token   (service role)
 *   verifyOtp({ token_hash })                  ->  session         (anon key, SSR cookies)
 *
 * Both calls happen on the server inside one request. The hashed token is never
 * sent anywhere, never logged, and is spent immediately, so no link, code or
 * credential ever reaches the browser or an inbox. The `verifyOtp` dependency is
 * a request-scoped SSR client whose Set-Cookie mutations the route attaches to
 * the final redirect -- the same cookies a normal login writes, so middleware and
 * every page treat the result as an ordinary LR session.
 *
 * Why this is safe even though `generateLink` is addressed by email:
 *   - the Auth user is looked up **by id** first; the address is that user's own,
 *     read back from Auth, never supplied by a caller;
 *   - `generateLink` reports the user it minted for, and the function refuses to
 *     continue unless that id equals the id it was asked for;
 *   - the established session's user id is checked again after `verifyOtp`.
 * Email is transport for the OTP, not identity.
 *
 * Pure orchestration with injected dependencies; `platform-entry-server.ts`
 * wires the real admin and SSR clients.
 */

export type EstablishSessionFailure =
  /** SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL missing. */
  | "AUTH_NOT_CONFIGURED"
  /** No LR Auth user has this id (the public.users row exists but its Auth identity is gone). */
  | "AUTH_IDENTITY_MISSING"
  | "AUTH_IDENTITY_BANNED"
  | "AUTH_IDENTITY_NO_EMAIL"
  /** Minting returned an error or a different user than requested. */
  | "SESSION_MINT_FAILED"
  | "SESSION_IDENTITY_MISMATCH"
  /** The OTP could not be exchanged for a session bound to this user. */
  | "SESSION_ESTABLISH_FAILED";

export type EstablishSessionResult = { ok: true; userId: string } | { ok: false; reason: EstablishSessionFailure };

export type EstablishSessionDeps = {
  /** Auth user by id (service role). Null when absent or on error. */
  getAuthUserById: (userId: string) => Promise<{ id: string; email: string | null; bannedUntil: string | null } | null>;
  /** `auth.admin.generateLink({ type: "magiclink", email })` → the hashed token and the user it was minted for. */
  generateMagicLink: (email: string) => Promise<{ hashedToken: string; userId: string | null } | null>;
  /** `verifyOtp({ type: "magiclink", token_hash })` on the request-scoped SSR client → the session's user id. */
  verifyOtp: (hashedToken: string) => Promise<{ userId: string | null } | null>;
  now?: () => Date;
};

const fail = (reason: EstablishSessionFailure): EstablishSessionResult => ({ ok: false, reason });

export async function establishLeadRetrievalSessionWithDeps(
  userId: string,
  deps: EstablishSessionDeps
): Promise<EstablishSessionResult> {
  const id = String(userId ?? "").trim();
  if (!id) return fail("AUTH_IDENTITY_MISSING");
  const now = deps.now ?? (() => new Date());

  // Identity is fixed here, by id. Everything after this merely opens a session for it.
  const authUser = await deps.getAuthUserById(id);
  if (!authUser || authUser.id !== id) return fail("AUTH_IDENTITY_MISSING");
  if (authUser.bannedUntil && new Date(authUser.bannedUntil).getTime() > now().getTime()) {
    return fail("AUTH_IDENTITY_BANNED");
  }
  const email = String(authUser.email ?? "").trim();
  if (!email) return fail("AUTH_IDENTITY_NO_EMAIL");

  const link = await deps.generateMagicLink(email);
  if (!link || !link.hashedToken) return fail("SESSION_MINT_FAILED");
  // Bind to the id, not the address: refuse anything minted for another user.
  if (link.userId !== id) return fail("SESSION_IDENTITY_MISMATCH");

  const session = await deps.verifyOtp(link.hashedToken);
  if (!session || session.userId !== id) return fail("SESSION_ESTABLISH_FAILED");

  return { ok: true, userId: id };
}
