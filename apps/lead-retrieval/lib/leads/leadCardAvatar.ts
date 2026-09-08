/**
 * Deterministic hash for a lead id (e.g. shared with optional demo tooling scripts).
 */
export function leadIdStringHash(leadId: string): number {
  let h = 0;
  for (let i = 0; i < leadId.length; i++) h = (h * 31 + leadId.charCodeAt(i)) >>> 0;
  return h;
}

/** DiceBear 9.x style — clean illustrated faces, deterministic per seed. */
const DICEBEAR_STYLE = "notionists";

/**
 * Deterministic avatar URL for exhibitor lead cards/profile (no DB fields).
 * Uses the lead id as the DiceBear `seed` so the same lead always maps to the same portrait.
 * SVG scales crisply at any CSS size (list vs profile). UI still shows initials on load error.
 *
 * @see https://www.dicebear.com/styles/notionists/
 */
export function seededAvatarSrc(leadId: string, size: 48 | 128 = 48): string {
  void size;
  const params = new URLSearchParams({ seed: leadId });
  return `https://api.dicebear.com/9.x/${DICEBEAR_STYLE}/svg?${params.toString()}`;
}

/**
 * Prefer a stored URL when present; otherwise seeded DiceBear portrait.
 * (No DB usage in current exhibitor flows — kept for optional future use.)
 */
export function resolveLeadAvatarSrc(
  leadId: string,
  avatarUrl: string | null | undefined,
  size: 48 | 128 = 48
): string {
  const trimmed = String(avatarUrl ?? "").trim();
  if (trimmed.length > 0) {
    return trimmed;
  }
  return seededAvatarSrc(leadId, size);
}
