import { isCanonicalPlatformId } from "@/lib/platform/platform-ids";

/**
 * Lead Retrieval → Platform: claim a one-time launch handoff.
 *
 * This is the ONLY place Lead Retrieval talks to the SignalThread Platform at
 * runtime, and it is a plain HTTPS call to Platform's own API. Lead Retrieval
 * never holds Platform Core Auth credentials (not even the anon key), never opens
 * a Platform Core session, and never reads Platform's database. The token the
 * browser arrived with is handed back to Platform, which exchanges it exactly
 * once against Platform Core Auth and answers with the canonical user /
 * organization / event it re-derived from live registry state.
 *
 * What comes back is context, not authorization. Lead Retrieval still resolves
 * each id through its own mapping columns and applies its own access model.
 */

export const LEAD_RETRIEVAL_PRODUCT_KEY = "lead-retrieval";

export const DEFAULT_CLAIM_TIMEOUT_MS = 10_000;

export type PlatformLaunchContext = {
  platformUserId: string;
  platformOrganizationId: string;
  platformEventId: string;
};

export type ClaimFailureReason =
  /** PLATFORM_APP_URL is missing or unsafe; nothing was sent. */
  | "PLATFORM_NOT_CONFIGURED"
  /** Platform refused the token: malformed, expired, already consumed, or for the wrong project. */
  | "HANDOFF_INVALID"
  /** Platform accepted the token but it was older than its freshness bound. */
  | "HANDOFF_EXPIRED"
  /** Platform re-ran launch authorization and denied it (`platformReason` says why). */
  | "PLATFORM_DENIED"
  /** Platform could not be reached, timed out, or answered with something unusable. */
  | "PLATFORM_UNAVAILABLE";

export type ClaimResult =
  | { ok: true; context: PlatformLaunchContext }
  | { ok: false; reason: ClaimFailureReason; platformReason?: string };

const fail = (reason: ClaimFailureReason, platformReason?: string): ClaimResult => ({
  ok: false,
  reason,
  ...(platformReason ? { platformReason } : {})
});

/** Stable reason codes only; anything else from the wire is dropped. */
const REASON_CODE = /^[A-Z][A-Z0-9_]{2,40}$/;

/**
 * Platform's base URL, server-only. In production it must be HTTPS: the claim
 * response is what Lead Retrieval trusts for identity, so it may only travel over
 * TLS to the host Lead Retrieval was configured with.
 */
export function resolvePlatformAppUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = env.PLATFORM_APP_URL?.trim();
  if (!raw) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && env.NODE_ENV === "production") return null;
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  if (parsed.search || parsed.hash) return null;
  return parsed.origin + parsed.pathname.replace(/\/$/, "");
}

/**
 * Where a browser is sent to (re)start a launch for an event. Built from the
 * configured Platform base, a canonical event id and this browser's launch
 * correlator only -- never from anything else in a request -- so it can never
 * become an open redirect.
 */
export function buildPlatformLaunchUrl(
  eventId: string,
  launchCorrelator?: string | null,
  env: NodeJS.ProcessEnv = process.env
): string | null {
  const base = resolvePlatformAppUrl(env);
  if (!base || !isCanonicalPlatformId(eventId)) return null;
  const url = new URL(`${base}/api/launch/${LEAD_RETRIEVAL_PRODUCT_KEY}`);
  url.searchParams.set("event_id", eventId.trim().toLowerCase());
  if (launchCorrelator) {
    if (!/^[0-9a-f]{64}$/.test(launchCorrelator)) return null;
    url.searchParams.set("state", launchCorrelator);
  }
  return url.toString();
}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/**
 * Resolve `work` unless `signal` aborts first, so the timeout covers headers,
 * body and JSON parsing as one budget.
 */
function untilAbort<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new Error("aborted"));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new Error("aborted"));
    signal.addEventListener("abort", onAbort, { once: true });
    work.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      }
    );
  });
}

export async function claimPlatformHandoff(
  input: { handoff: string; eventId: string },
  options: { fetch?: FetchLike; env?: NodeJS.ProcessEnv; timeoutMs?: number } = {}
): Promise<ClaimResult> {
  const base = resolvePlatformAppUrl(options.env ?? process.env);
  if (!base) return fail("PLATFORM_NOT_CONFIGURED");

  const doFetch: FetchLike = options.fetch ?? ((url, init) => fetch(url, init));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_CLAIM_TIMEOUT_MS);

  let status: number;
  let body: unknown = null;
  try {
    const response = await untilAbort(
      doFetch(`${base}/api/launch/${LEAD_RETRIEVAL_PRODUCT_KEY}/claim`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ handoff: input.handoff, event_id: input.eventId }),
        cache: "no-store",
        redirect: "error",
        signal: controller.signal
      }),
      controller.signal
    );
    status = response.status;
    body = await untilAbort(response.json().catch(() => null), controller.signal);
  } catch {
    return fail("PLATFORM_UNAVAILABLE");
  } finally {
    clearTimeout(timer);
  }

  const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const reason = typeof record.reason === "string" && REASON_CODE.test(record.reason) ? record.reason : undefined;

  if (status === 401) {
    return fail(reason === "HANDOFF_EXPIRED" ? "HANDOFF_EXPIRED" : "HANDOFF_INVALID", reason);
  }
  if (status === 400 || status === 403 || status === 404) {
    return fail("PLATFORM_DENIED", reason);
  }
  if (status !== 200) return fail("PLATFORM_UNAVAILABLE");

  // The response is trusted only for its shape: three canonical uuids for this
  // product. Anything else is treated as an unusable answer, never as context.
  const { platform_user_id: user, organization_id: organization, event_id: event, product } = record;
  if (product !== LEAD_RETRIEVAL_PRODUCT_KEY) return fail("PLATFORM_UNAVAILABLE");
  if (!isCanonicalPlatformId(user) || !isCanonicalPlatformId(organization) || !isCanonicalPlatformId(event)) {
    return fail("PLATFORM_UNAVAILABLE");
  }

  return {
    ok: true,
    context: {
      platformUserId: user.trim().toLowerCase(),
      platformOrganizationId: organization.trim().toLowerCase(),
      platformEventId: event.trim().toLowerCase()
    }
  };
}
