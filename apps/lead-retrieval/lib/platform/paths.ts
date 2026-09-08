/**
 * Platform → Lead Retrieval entry paths.
 *
 * These routes are reached by a browser that holds no Lead Retrieval session yet,
 * so the middleware treats them as public. Each handler authenticates the request
 * itself: the start route only writes browser-bound launch state, and the entry
 * route redeems a one-time Platform handoff before opening any session.
 */
export const PLATFORM_ENTRY_PATH = "/platform-entry" as const;
export const PLATFORM_ENTRY_START_PATH = "/platform-entry/start" as const;

export function isPlatformEntryPath(pathname: string): boolean {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return normalized === PLATFORM_ENTRY_PATH || normalized === PLATFORM_ENTRY_START_PATH;
}
