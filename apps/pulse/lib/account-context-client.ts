export interface AccountContext {
  id: string
  name: string
  slug: string
  accountType: string
  tier: string
  branding: {
    logoUrl: string | null
    primaryColor: string | null
    primaryButtonColor: string | null
  }
}

interface AccountContextPayload {
  success?: boolean
  account?: AccountContext
  error?: string
}

export interface LoadAccountContextOptions {
  /**
   * Bypass the cache and any in-flight request. Retry actions must use this so
   * a retry issues a real new request instead of joining a stale hung one.
   */
  forceRefresh?: boolean
}

const pendingAccountContexts = new Map<string, Promise<AccountContext>>()
const resolvedAccountContexts = new Map<string, { context: AccountContext; expiresAt: number }>()
const ACCOUNT_CONTEXT_TIMEOUT_MS = 10_000
// Account identity/branding changes rarely; a short cache keeps mutation
// refreshes from re-resolving the account on every write.
const ACCOUNT_CONTEXT_CACHE_TTL_MS = 60_000
const ACCOUNT_CONTEXT_MAX_ATTEMPTS = 2

async function fetchAccountContext(key: string): Promise<AccountContext> {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), ACCOUNT_CONTEXT_TIMEOUT_MS)
  try {
    const response = await fetch(`/api/app/account?account=${encodeURIComponent(key)}&scope=context`, {
      credentials: 'include',
      cache: 'no-store',
      signal: controller.signal,
    })
    const body = await response.json().catch(() => ({})) as AccountContextPayload
    if (!response.ok || !body.success || !body.account) {
      const error = new Error(body.error || 'Failed to load account context') as Error & { status?: number }
      error.status = response.status
      throw error
    }
    return body.account
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error('Account context request timed out. Please retry.')
    }
    throw error
  } finally {
    window.clearTimeout(timeoutId)
  }
}

function isTransientAccountContextError(error: unknown): boolean {
  const status = (error as { status?: number } | null)?.status
  if (typeof status === 'number') return status >= 500
  // Timeouts and network failures have no HTTP status and may recover.
  return true
}

export function loadAccountContext(
  accountSlug: string,
  options: LoadAccountContextOptions = {},
): Promise<AccountContext> {
  const key = accountSlug.trim()

  if (!options.forceRefresh) {
    const cached = resolvedAccountContexts.get(key)
    if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.context)
    const pending = pendingAccountContexts.get(key)
    if (pending) return pending
  }

  const request = (async () => {
    let lastError: unknown
    for (let attempt = 1; attempt <= ACCOUNT_CONTEXT_MAX_ATTEMPTS; attempt++) {
      try {
        const context = await fetchAccountContext(key)
        resolvedAccountContexts.set(key, { context, expiresAt: Date.now() + ACCOUNT_CONTEXT_CACHE_TTL_MS })
        return context
      } catch (error) {
        lastError = error
        if (attempt >= ACCOUNT_CONTEXT_MAX_ATTEMPTS || !isTransientAccountContextError(error)) break
      }
    }
    throw lastError
  })()

  pendingAccountContexts.set(key, request)
  void request.finally(() => {
    if (pendingAccountContexts.get(key) === request) pendingAccountContexts.delete(key)
  }).catch(() => undefined)
  return request
}

export function clearPendingAccountContextsForTest() {
  pendingAccountContexts.clear()
  resolvedAccountContexts.clear()
}
