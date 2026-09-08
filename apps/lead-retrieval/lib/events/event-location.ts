/** Canonical event display contract: explicit `events.location` wins, then city/state. */
export function resolveEventLocation(
  city: string | null | undefined,
  state: string | null | undefined,
  location?: string | null
): string | null {
  const explicit = String(location ?? "").trim();
  if (explicit) return explicit;
  const structured = [city, state]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(", ");
  return structured || null;
}
