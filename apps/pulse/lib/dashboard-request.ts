type JsonRequestOptions = {
  credentials?: RequestCredentials
  cache?: RequestCache
  signal?: AbortSignal
}

const pendingJsonRequests = new Map<string, Promise<unknown>>()

/**
 * Coalesces identical in-flight dashboard GETs. React Strict Mode can mount an
 * effect twice in development, and multiple dashboard consumers can ask for
 * the same read model at once; neither case should execute the route twice.
 * Callers still own lifecycle request ids and ignore stale results when their
 * filters change.
 */
export function loadDashboardJson<T>(
  url: string,
  options: JsonRequestOptions = {},
): Promise<T> {
  const key = `GET:${url}`
  // A caller-owned AbortSignal represents one specific UI lifecycle, so it
  // must not share a promise with another lifecycle that could abort it.
  const pending = options.signal ? undefined : pendingJsonRequests.get(key)
  if (pending) return pending as Promise<T>

  const request = fetch(url, {
    credentials: options.credentials ?? 'include',
    cache: options.cache ?? 'no-store',
    signal: options.signal,
  }).then(async (response) => {
    const body = await response.json().catch(() => ({})) as T & {
      success?: boolean
      error?: string
      message?: string
    }
    if (!response.ok || body.success === false) {
      throw new Error(body.error || body.message || 'Request failed')
    }
    return body
  }).finally(() => {
    if (!options.signal && pendingJsonRequests.get(key) === request) pendingJsonRequests.delete(key)
  })

  if (!options.signal) pendingJsonRequests.set(key, request)
  return request
}

export function clearPendingDashboardRequestsForTest() {
  pendingJsonRequests.clear()
}
