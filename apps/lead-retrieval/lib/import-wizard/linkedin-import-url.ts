/**
 * Thin LinkedIn profile URL validation for import (aligned with enrichment `sanitizeLinkedinUrl` rules).
 * Empty values are valid (optional field). Invalid URLs are flagged in validation as review-only.
 */

const LINKEDIN_PROFILE_REGEX = /^https?:\/\/(www\.)?linkedin\.com\/(in|pub)\//i;

/** Returns true if empty (no value) or matches a normalized profile URL pattern. */
export function isImportLinkedInUrlFormatValid(raw: string): boolean {
  const t = raw.trim();
  if (t.length === 0) return true;
  if (!LINKEDIN_PROFILE_REGEX.test(t)) return false;
  if (t.toLowerCase().includes("/search/")) return false;
  if (t.includes("?")) return false;
  return true;
}
