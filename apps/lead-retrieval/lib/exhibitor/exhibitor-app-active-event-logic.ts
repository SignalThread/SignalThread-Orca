/**
 * Pure selection order for exhibitor app active event (URL > cookie > first accessible).
 * Server routes call this after loading the accessible id list and optional cookie/url values.
 */
export function pickExhibitorAppActiveEventId(
  accessibleIds: readonly string[],
  urlEventId: string | null | undefined,
  cookieEventId: string | null | undefined
): string | null {
  const urlNorm = String(urlEventId ?? "").trim();
  if (urlNorm && accessibleIds.includes(urlNorm)) {
    return urlNorm;
  }
  const cookieNorm = String(cookieEventId ?? "").trim();
  if (cookieNorm && accessibleIds.includes(cookieNorm)) {
    return cookieNorm;
  }
  return accessibleIds[0] ?? null;
}

/**
 * The exhibitor app can use a company-scoped event resolution for normal
 * exhibitor roles, plus a platform admin only after the server has projected
 * a validated company context. Keep this decision adjacent to selection so
 * callers cannot accidentally turn an unscoped platform-admin result into an
 * exhibitor event scope.
 */
export function mayUseExhibitorAppEventResolution(
  role: string | null | undefined,
  resolution: string | null | undefined
): boolean {
  return (
    role === "exhibitor_admin" ||
    role === "exhibitor_viewer" ||
    (role === "platform_admin" && resolution === "company_all_events")
  );
}
