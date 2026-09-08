import { normalizePlatformId } from "@/lib/platform/platform-ids";

/**
 * Canonical SignalThread Platform Core → Lead Retrieval identity resolution.
 *
 * Resolution reads ONLY the three mapping columns in Lead Retrieval's own
 * database -- users.platform_user_id, companies.platform_organization_id,
 * events.platform_event_id -- through the injected loaders. It never queries
 * Platform Core, never crosses a database boundary, and never falls back to
 * email, name, slug, company name or "the first matching row": a value that
 * merely resembles a local attribute must never become authority.
 *
 * Resolving a mapping is not authorization. It answers "which Lead Retrieval
 * rows do these canonical ids name?" and nothing more. Access is decided
 * afterwards by Lead Retrieval's own rules (see lr-authorization.ts).
 *
 * Pure: every database read is an injected dependency, so each rule below is
 * asserted directly in tests. `identity-mapping-supabase.ts` wires the real
 * service-role loaders.
 */

export type LeadRetrievalUserMapping = {
  id: string;
  role: string | null;
  companyId: string | null;
  platformUserId: string;
};

export type LeadRetrievalEventMapping = {
  id: string;
  name: string;
  /** The company that owns the event row (organizer, or the exhibitor company for company-owned events). */
  companyId: string;
  containerKind: string;
  platformEventId: string;
};

export type MappingDeps = {
  /** users.platform_user_id is UNIQUE: at most one row. */
  findUserByPlatformUserId: (platformUserId: string) => Promise<LeadRetrievalUserMapping | null>;
  /** events.platform_event_id is UNIQUE: at most one row. */
  findEventByPlatformEventId: (platformEventId: string) => Promise<LeadRetrievalEventMapping | null>;
  /** companies.platform_organization_id is deliberately NOT unique: zero, one or many rows. */
  findCompanyIdsByPlatformOrganizationId: (platformOrganizationId: string) => Promise<string[]>;
  /** exhibitors.company_id for every exhibitor at the event. */
  findExhibitorCompanyIdsForEvent: (eventId: string) => Promise<string[]>;
  /** event_users.exhibitor_company_id for this user's active/invited memberships at the event. */
  findMembershipCompanyIdsForUserAtEvent: (userId: string, eventId: string) => Promise<string[]>;
};

export type MappingFailureReason =
  | "INVALID_PLATFORM_ID"
  | "USER_MAPPING_NOT_FOUND"
  | "EVENT_MAPPING_NOT_FOUND"
  /** The mapped row is a continuous_capture bucket (or another non-event container), never a Platform event. */
  | "EVENT_NOT_LAUNCHABLE_CONTAINER"
  | "ORGANIZATION_MAPPING_NOT_FOUND"
  /** Companies are mapped to the organization, but none of them owns or exhibits at the mapped event. */
  | "EVENT_ORGANIZATION_MISMATCH"
  /** More than one mapped company is related to the event and the user narrows it to none or several. */
  | "AMBIGUOUS_ORGANIZATION_MAPPING";

export type MappingResult<T> = { ok: true; value: T } | { ok: false; reason: MappingFailureReason };

const failure = <T>(reason: MappingFailureReason): MappingResult<T> => ({ ok: false, reason });

/** The only container kind that may correspond to a Platform event (schema check mirrors this). */
export const LAUNCHABLE_EVENT_CONTAINER_KIND = "event";

function normalizeLocalId(value: unknown): string {
  return String(value ?? "").trim();
}

function uniqueIds(values: readonly (string | null | undefined)[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const id = normalizeLocalId(raw);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export async function resolveUserMapping(
  platformUserId: unknown,
  deps: Pick<MappingDeps, "findUserByPlatformUserId">
): Promise<MappingResult<LeadRetrievalUserMapping>> {
  const id = normalizePlatformId(platformUserId);
  if (!id) return failure("INVALID_PLATFORM_ID");
  const user = await deps.findUserByPlatformUserId(id);
  if (!user || normalizePlatformId(user.platformUserId) !== id) return failure("USER_MAPPING_NOT_FOUND");
  return { ok: true, value: user };
}

export async function resolveEventMapping(
  platformEventId: unknown,
  deps: Pick<MappingDeps, "findEventByPlatformEventId">
): Promise<MappingResult<LeadRetrievalEventMapping>> {
  const id = normalizePlatformId(platformEventId);
  if (!id) return failure("INVALID_PLATFORM_ID");
  const event = await deps.findEventByPlatformEventId(id);
  if (!event || normalizePlatformId(event.platformEventId) !== id) return failure("EVENT_MAPPING_NOT_FOUND");
  // The schema forbids this state; the application refuses it independently.
  if (String(event.containerKind ?? "").trim().toLowerCase() !== LAUNCHABLE_EVENT_CONTAINER_KIND) {
    return failure("EVENT_NOT_LAUNCHABLE_CONTAINER");
  }
  return { ok: true, value: event };
}

export type OrganizationContext = {
  /** The single Lead Retrieval company that is the valid context for this launch. */
  companyId: string;
  /** Every company mapped to the Platform organization (for diagnostics; never used to widen access). */
  mappedCompanyIds: string[];
};

/**
 * Canonical Platform organization id → the one Lead Retrieval company context for this launch.
 *
 * Because one Platform organization may own several Lead Retrieval companies, the
 * organization id alone never resolves. The mapped event narrows it: only mapped
 * companies that own the event (`events.company_id`) or exhibit at it
 * (`exhibitors.company_id`) are candidates. When that still leaves several, the
 * mapped user's own relationships narrow further (`users.company_id`, then the
 * user's `event_users.exhibitor_company_id` at this event). Exactly one company
 * must remain; zero and several are both refusals. Nothing is ever picked by
 * position.
 */
export async function resolveOrganizationContext(
  input: { platformOrganizationId: unknown; event: LeadRetrievalEventMapping; user: LeadRetrievalUserMapping },
  deps: Pick<
    MappingDeps,
    "findCompanyIdsByPlatformOrganizationId" | "findExhibitorCompanyIdsForEvent" | "findMembershipCompanyIdsForUserAtEvent"
  >
): Promise<MappingResult<OrganizationContext>> {
  const organizationId = normalizePlatformId(input.platformOrganizationId);
  if (!organizationId) return failure("INVALID_PLATFORM_ID");

  const mappedCompanyIds = uniqueIds(await deps.findCompanyIdsByPlatformOrganizationId(organizationId));
  if (mappedCompanyIds.length === 0) return failure("ORGANIZATION_MAPPING_NOT_FOUND");

  const eventRelated = new Set(
    uniqueIds([input.event.companyId, ...(await deps.findExhibitorCompanyIdsForEvent(input.event.id))])
  );
  const candidates = mappedCompanyIds.filter((id) => eventRelated.has(id));
  if (candidates.length === 0) return failure("EVENT_ORGANIZATION_MISMATCH");
  if (candidates.length === 1) return { ok: true, value: { companyId: candidates[0], mappedCompanyIds } };

  const candidateSet = new Set(candidates);
  const userCompanyId = normalizeLocalId(input.user.companyId);
  if (userCompanyId && candidateSet.has(userCompanyId)) {
    return { ok: true, value: { companyId: userCompanyId, mappedCompanyIds } };
  }

  const membershipCompanyIds = uniqueIds(
    await deps.findMembershipCompanyIdsForUserAtEvent(input.user.id, input.event.id)
  ).filter((id) => candidateSet.has(id));
  if (membershipCompanyIds.length === 1) {
    return { ok: true, value: { companyId: membershipCompanyIds[0], mappedCompanyIds } };
  }

  return failure("AMBIGUOUS_ORGANIZATION_MAPPING");
}
