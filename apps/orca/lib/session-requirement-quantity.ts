/** PostgreSQL INTEGER / Prisma Int upper bound used by persisted session quantities. */
export const SESSION_REQUIREMENT_QUANTITY_MAX = 2_147_483_647;

export class SessionRequirementQuantityError extends Error {}

export function sessionRequirementQuantityErrorMessage(label?: string): string {
  const prefix = label ? `${label} quantity` : "Requirement quantity";
  return `${prefix} must be a whole number from 1 to ${SESSION_REQUIREMENT_QUANTITY_MAX.toLocaleString("en-US")}.`;
}

export function parseSessionRequirementQuantity(value: unknown, label?: string): number | null {
  if (value === null || typeof value === "undefined") return null;

  if (typeof value === "string") {
    const normalized = value.trim();
    if (!normalized) return null;
    if (!/^\d+$/.test(normalized)) {
      throw new SessionRequirementQuantityError(sessionRequirementQuantityErrorMessage(label));
    }
    value = normalized;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > SESSION_REQUIREMENT_QUANTITY_MAX) {
    throw new SessionRequirementQuantityError(sessionRequirementQuantityErrorMessage(label));
  }

  return parsed;
}
