/**
 * Pure logic that merges pending mobile-app `invite_codes` rows into the Company team
 * table alongside real `public.users` rows.
 *
 * - Groups multiple pending codes for the same email into ONE invited row.
 * - Flags status as `"invited"` when any code in the group is unexpired,
 *   `"expired"` when every code's `expires_at` is in the past.
 * - Never touches redeemed (`used_at IS NOT NULL`) codes — callers must pre-filter.
 * - If an email already exists as an active user, the user row wins; pending rows are dropped.
 *
 * No Supabase imports, no `server-only` — safe to test from Node.
 */

import type { EventAccessMode } from "@/lib/access/event-access-mode";
import { buildCompanyTeamEventAccessSummary } from "@/lib/exhibitor/company-team-access-present";
import type {
  CompanyTeamMemberRow,
  CompanyTeamMemberStatus
} from "@/lib/exhibitor/company-team-types";

export type PendingInviteCodeRow = {
  event_id: string;
  email: string;
  expires_at: string;
};

export type CompanyEventLite = { id: string; name: string };

export const PENDING_INVITE_ROW_ID_PREFIX = "pending:";

/** Stable synthetic id for a pending-invite row keyed by invitee email. */
export function pendingInviteRowId(email: string): string {
  return `${PENDING_INVITE_ROW_ID_PREFIX}${String(email ?? "").trim().toLowerCase()}`;
}

export function isPendingInviteRowId(id: string | null | undefined): boolean {
  return String(id ?? "").startsWith(PENDING_INVITE_ROW_ID_PREFIX);
}

export function pendingInviteEmailFromRowId(id: string | null | undefined): string {
  const s = String(id ?? "");
  if (!s.startsWith(PENDING_INVITE_ROW_ID_PREFIX)) return "";
  return s.slice(PENDING_INVITE_ROW_ID_PREFIX.length);
}

function normalizeEmail(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

export function buildPendingInviteRows(input: {
  pendingInvites: readonly PendingInviteCodeRow[];
  companyEvents: readonly CompanyEventLite[];
  activeEmails: ReadonlySet<string>;
  nowMs?: number;
}): CompanyTeamMemberRow[] {
  const now = input.nowMs ?? Date.now();
  const companyEventIds = new Set(input.companyEvents.map((e) => String(e.id)));
  const eventNameById = new Map(
    input.companyEvents.map((e) => [String(e.id), String(e.name ?? "Event")] as const)
  );

  const byEmail = new Map<string, PendingInviteCodeRow[]>();
  for (const invite of input.pendingInvites) {
    const email = normalizeEmail(invite.email);
    if (!email) continue;
    if (input.activeEmails.has(email)) continue;
    const list = byEmail.get(email) ?? [];
    list.push(invite);
    byEmail.set(email, list);
  }

  const rows: CompanyTeamMemberRow[] = [];
  for (const [email, invites] of byEmail) {
    const eventIds = Array.from(
      new Set(
        invites
          .map((i) => String(i.event_id ?? "").trim())
          .filter((id) => id && companyEventIds.has(id))
      )
    );
    if (eventIds.length === 0) continue;

    const coversAll =
      companyEventIds.size > 0 && eventIds.length === companyEventIds.size;

    const eventAccessMode: EventAccessMode = coversAll
      ? "all_company_events"
      : "assigned_events_only";

    const assignedEventDetails = eventIds
      .map((id) => ({ id, name: eventNameById.get(id) ?? "Event" }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const anyUnexpired = invites.some((i) => {
      const ms = new Date(i.expires_at).getTime();
      return Number.isFinite(ms) && ms > now;
    });
    const status: CompanyTeamMemberStatus = anyUnexpired ? "invited" : "expired";

    const eventSummary = buildCompanyTeamEventAccessSummary({
      eventAccessMode,
      companyOwnedEventCount: companyEventIds.size,
      assignedEvents: assignedEventDetails
    });

    rows.push({
      id: pendingInviteRowId(email),
      fullName: null,
      email,
      companyRole: "viewer",
      eventAccessMode,
      status,
      lastSignInAt: null,
      eventSummary,
      assignedEventDetails,
      isPendingInvite: true
    });
  }

  rows.sort((a, b) => (a.email ?? "").localeCompare(b.email ?? ""));
  return rows;
}

export function mergePendingInvitesIntoTeamRows(input: {
  activeRows: readonly CompanyTeamMemberRow[];
  pendingInvites: readonly PendingInviteCodeRow[];
  companyEvents: readonly CompanyEventLite[];
  nowMs?: number;
}): CompanyTeamMemberRow[] {
  const activeEmails = new Set<string>();
  for (const row of input.activeRows) {
    const e = normalizeEmail(row.email);
    if (e) activeEmails.add(e);
  }

  const pendingRows = buildPendingInviteRows({
    pendingInvites: input.pendingInvites,
    companyEvents: input.companyEvents,
    activeEmails,
    nowMs: input.nowMs
  });

  return [...input.activeRows, ...pendingRows];
}
