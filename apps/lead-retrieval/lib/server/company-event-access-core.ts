/**
 * Server resolver core (no Supabase / no server-only imports).
 * Keeps the orchestration logic pure and testable via injected deps.
 * The production wrapper lives in lib/server/company-event-access.ts.
 */

import {
  computeCompanyEventAccessSet,
  DEFAULT_EVENT_ACCESS_MODE,
  type EventAccessMode,
  type EventAccessResolution
} from "@/lib/access/event-access-mode";

export type ResolveAccessibleEventIdsInput = {
  userId: string;
  nowMs?: number;
  /** Server-validated only; never populate directly from request input. */
  platformAdminCompanyId?: string | null;
};

export type ResolveAccessibleEventIdsResult = {
  eventIds: string[];
  resolution: EventAccessResolution;
  licenseEligible: boolean;
  eventAccessMode: EventAccessMode | null;
  companyId: string | null;
  role: string | null;
};

export type ResolveAccessibleEventIdsDeps = {
  loadUser: (userId: string) => Promise<{
    id: string;
    role: string | null;
    companyId: string | null;
    eventAccessMode: EventAccessMode | null;
  } | null>;
  loadCompanyLicenseEligibility: (exhibitorCompanyId: string, nowMs: number) => Promise<boolean>;
  loadCompanyOwnedEventIds: (exhibitorCompanyId: string) => Promise<string[]>;
  loadAssignedCompanyEventIds: (
    userId: string,
    exhibitorCompanyId: string,
    appRole: string | null
  ) => Promise<string[]>;
  loadLegacyEventIds: (
    userId: string,
    exhibitorCompanyId: string,
    appRole: string | null
  ) => Promise<string[]>;
  loadOrganizerEventIds: (organizerUserId: string) => Promise<string[]>;
};

function normalizeRole(role: string | null | undefined): string | null {
  const v = String(role ?? "").trim().toLowerCase();
  if (!v) return null;
  if (v === "organizer" || v === "event_organizer") return "organizer_admin";
  return v;
}

export async function resolveAccessibleEventIdsForUserWithDeps(
  input: ResolveAccessibleEventIdsInput,
  deps: ResolveAccessibleEventIdsDeps
): Promise<ResolveAccessibleEventIdsResult> {
  const nowMs = input.nowMs ?? Date.now();
  const userId = String(input.userId ?? "").trim();

  if (!userId) {
    return {
      eventIds: [],
      resolution: "none",
      licenseEligible: false,
      eventAccessMode: null,
      companyId: null,
      role: null
    };
  }

  const user = await deps.loadUser(userId);
  if (!user) {
    return {
      eventIds: [],
      resolution: "none",
      licenseEligible: false,
      eventAccessMode: null,
      companyId: null,
      role: null
    };
  }

  const role = normalizeRole(user.role);

  if (role === "platform_admin") {
    const activeCompanyId = String(input.platformAdminCompanyId ?? "").trim();
    if (activeCompanyId) {
      const eventIds = await deps.loadCompanyOwnedEventIds(activeCompanyId);
      return {
        eventIds: dedupe(eventIds),
        resolution: "company_all_events",
        licenseEligible: true,
        eventAccessMode: "all_company_events",
        companyId: activeCompanyId,
        role
      };
    }
    return {
      eventIds: [],
      resolution: "platform_all",
      licenseEligible: false,
      eventAccessMode: user.eventAccessMode,
      companyId: user.companyId,
      role
    };
  }

  if (role === "organizer_admin") {
    const eventIds = await deps.loadOrganizerEventIds(userId);
    return {
      eventIds: dedupe(eventIds),
      resolution: "organizer_scope",
      licenseEligible: false,
      eventAccessMode: user.eventAccessMode,
      companyId: user.companyId,
      role
    };
  }

  const companyId = user.companyId;
  if (!companyId) {
    return {
      eventIds: [],
      resolution: "none",
      licenseEligible: false,
      eventAccessMode: user.eventAccessMode,
      companyId: null,
      role
    };
  }

  const licenseEligible = await deps.loadCompanyLicenseEligibility(companyId, nowMs);

  if (!licenseEligible) {
    const legacyEventIds = await deps.loadLegacyEventIds(userId, companyId, role);
    const pure = computeCompanyEventAccessSet({
      licenseEligible: false,
      eventAccessMode: user.eventAccessMode ?? DEFAULT_EVENT_ACCESS_MODE,
      companyOwnedEventIds: [],
      assignedCompanyEventIds: [],
      legacyEventIds
    });
    return {
      eventIds: pure.eventIds,
      resolution: pure.resolution,
      licenseEligible: false,
      eventAccessMode: user.eventAccessMode,
      companyId,
      role
    };
  }

  const storedMode = user.eventAccessMode;
  let licensedMode: EventAccessMode;
  let assignedCompanyEventIdsEarly: string[] | undefined;

  if (storedMode != null) {
    licensedMode = storedMode;
  } else if (role === "exhibitor_admin") {
    assignedCompanyEventIdsEarly = await deps.loadAssignedCompanyEventIds(userId, companyId, role);
    licensedMode =
      assignedCompanyEventIdsEarly.length > 0 ? "assigned_events_only" : DEFAULT_EVENT_ACCESS_MODE;
  } else {
    licensedMode = "assigned_events_only";
  }

  if (licensedMode === "all_company_events") {
    const companyOwnedEventIds = await deps.loadCompanyOwnedEventIds(companyId);
    const pure = computeCompanyEventAccessSet({
      licenseEligible: true,
      eventAccessMode: "all_company_events",
      companyOwnedEventIds,
      assignedCompanyEventIds: [],
      legacyEventIds: []
    });
    return {
      eventIds: pure.eventIds,
      resolution: pure.resolution,
      licenseEligible: true,
      eventAccessMode: licensedMode,
      companyId,
      role
    };
  }

  const assignedCompanyEventIds =
    assignedCompanyEventIdsEarly ??
    (await deps.loadAssignedCompanyEventIds(userId, companyId, role));
  const pure = computeCompanyEventAccessSet({
    licenseEligible: true,
    eventAccessMode: "assigned_events_only",
    companyOwnedEventIds: [],
    assignedCompanyEventIds,
    legacyEventIds: []
  });

  return {
    eventIds: pure.eventIds,
    resolution: pure.resolution,
    licenseEligible: true,
    eventAccessMode: licensedMode,
    companyId,
    role
  };
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (!v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}
