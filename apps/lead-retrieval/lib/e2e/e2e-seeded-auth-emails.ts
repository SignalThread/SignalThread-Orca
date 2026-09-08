/**
 * Allowlist for non-production Playwright E2E auth bypass.
 * Must stay in sync with `e2e/auth.setup.ts` account emails (case-insensitive).
 */
export const E2E_SEEDED_AUTH_EMAILS_CANONICAL = [
  "playwright-pa@test.com",
  "playwright-oa@test.com",
  "playwright-ea@test.com",
  "kamyab.ali+ex@gmail.com"
] as const;

const LOWER_SET = new Set(
  E2E_SEEDED_AUTH_EMAILS_CANONICAL.map((e) => e.toLowerCase())
);

export function normalizeE2eAuthEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function isSeededE2eAuthEmail(value: unknown): boolean {
  const email = normalizeE2eAuthEmail(value);
  return email.length > 0 && LOWER_SET.has(email);
}
