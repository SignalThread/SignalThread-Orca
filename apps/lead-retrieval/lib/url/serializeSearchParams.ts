/**
 * Serialize Next.js App Router `searchParams` to a query string.
 * Iterates all entries — no hardcoded param names — so current and future query keys survive redirects.
 */
export function serializeSearchParams(
  params: Record<string, string | string[] | undefined> | undefined
): string {
  if (!params) return "";
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) {
        sp.append(key, v);
      }
    } else {
      sp.set(key, value);
    }
  }
  return sp.toString();
}
