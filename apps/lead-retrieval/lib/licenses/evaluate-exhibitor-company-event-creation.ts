/**
 * Single source of truth for direct-buyer (exhibitor company) event-creation capability
 * from a company-scoped license row. Independent of seats and organizer identity.
 *
 * Callers supply the authoritative current event count for `events.company_id = exhibitorCompanyId`.
 */

export type ExhibitorCompanyEventCreationReason =
  | "allowed"
  | "no_license"
  | "wrong_scope"
  | "capability_disabled"
  | "license_inactive"
  | "license_expired"
  | "event_limit_reached";

export type ExhibitorCompanyEventCreationResult = {
  allowed: boolean;
  reason: ExhibitorCompanyEventCreationReason;
  /** Stable, human-readable detail (not for branching logic in callers). */
  message: string;
  licenseId: string | null;
  currentEventCount: number;
  maxEvents: number | null;
};

export type ExhibitorCompanyLicenseForEventCreation = {
  id: string;
  scope: string;
  status: string;
  expiresAt: string | null;
  canCreateEvents: boolean;
  maxEvents: number | null;
};

function isLicenseExpired(expiresAt: string | null, nowMs: number): boolean {
  if (!expiresAt) return false;
  const t = new Date(expiresAt).getTime();
  if (Number.isNaN(t)) return false;
  return t <= nowMs;
}

function isActiveStatus(status: string): boolean {
  return String(status ?? "").trim().toLowerCase() === "active";
}

function baseDenied(
  reason: Exclude<ExhibitorCompanyEventCreationReason, "allowed">,
  message: string,
  licenseId: string | null,
  currentEventCount: number,
  maxEvents: number | null
): ExhibitorCompanyEventCreationResult {
  return {
    allowed: false,
    reason,
    message,
    licenseId,
    currentEventCount,
    maxEvents
  };
}

export function evaluateExhibitorCompanyEventCreationFromLicenseRow(input: {
  license: ExhibitorCompanyLicenseForEventCreation | null;
  currentEventCount: number;
  nowMs: number;
}): ExhibitorCompanyEventCreationResult {
  const { license, currentEventCount, nowMs } = input;

  if (!license) {
    return baseDenied(
      "no_license",
      "No company-scoped license exists for this exhibitor company.",
      null,
      currentEventCount,
      null
    );
  }

  if (String(license.scope ?? "").trim().toLowerCase() !== "company") {
    return baseDenied(
      "wrong_scope",
      "Event creation is only available under a company-scoped license.",
      license.id,
      currentEventCount,
      license.maxEvents
    );
  }

  if (!license.canCreateEvents) {
    return baseDenied(
      "capability_disabled",
      "This license does not include event creation.",
      license.id,
      currentEventCount,
      license.maxEvents
    );
  }

  if (!isActiveStatus(license.status)) {
    return baseDenied(
      "license_inactive",
      "The license is not active.",
      license.id,
      currentEventCount,
      license.maxEvents
    );
  }

  if (isLicenseExpired(license.expiresAt, nowMs)) {
    return baseDenied(
      "license_expired",
      "The license has expired.",
      license.id,
      currentEventCount,
      license.maxEvents
    );
  }

  if (license.maxEvents != null && currentEventCount >= license.maxEvents) {
    return baseDenied(
      "event_limit_reached",
      "The maximum number of events allowed under this license has been reached.",
      license.id,
      currentEventCount,
      license.maxEvents
    );
  }

  return {
    allowed: true,
    reason: "allowed",
    message: "Event creation is permitted under this license.",
    licenseId: license.id,
    currentEventCount,
    maxEvents: license.maxEvents
  };
}
