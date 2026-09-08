/**
 * Pure derivation for the Upcoming / Event Readiness state of the Event
 * Workspace. One readiness path: the server loader supplies scoped rows (or
 * `null` where a secondary query failed), and everything visible — checklist,
 * KPIs, team preparation, the What-Matters-Now blocker — derives here,
 * deterministically, with stable ranking and no fabricated values.
 *
 * `null` inputs mean "unavailable" and surface as such; they are never shown
 * as 0 or as complete. This module never writes; underlying records stay
 * authoritative in their own workflows (settings, users, briefing setup).
 */

import { eventAppPermissionEnabled } from "@/lib/exhibitor/event-app-permission-enabled";
import {
  isContinuousCaptureContainerKind,
  normalizeEventContainerKind
} from "@/lib/events/event-container-kind";
import { normalizeYmd } from "@/lib/events/event-lifecycle";
import { resolveEventLocation } from "@/lib/events/event-location";

/* ================================ Inputs ================================ */

export type ReadinessEventRow = {
  name: string | null;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
  city: string | null;
  state: string | null;
  location?: string | null;
  container_kind: string | null;
  briefing_strategy: unknown;
};

export type ReadinessTeamMemberRow = {
  user_id: string;
  /** `event_users.status`: "active" | "invited" (anything else treated as invited). */
  status: string | null;
  permissions: unknown;
  full_name: string | null;
  email: string | null;
};

export type ReadinessLicenseRow = {
  seats_total: number | null;
  seats_used: number | null;
};

export type ReadinessBriefingCounts = {
  generated: number;
  approved: number;
};

export type EventReadinessHrefs = {
  /** Tenant-aware event settings destination; null when the user has none. */
  settings: string | null;
  team: string;
  strategy: string;
  importWizard: string;
};

export type EventReadinessInput = {
  event: ReadinessEventRow | null;
  /** All `event_users` rows for this event+company (with joined identity), or null on failure. */
  teamMembers: ReadinessTeamMemberRow[] | null;
  /** Outstanding `invite_codes` for this event+company (`used_at IS NULL`), or null on failure. */
  pendingInviteCount: number | null;
  licenses: ReadinessLicenseRow[] | null;
  leadCount: number | null;
  briefingCounts: ReadinessBriefingCounts | null;
  knowledgeItemCount: number | null;
  hrefs: EventReadinessHrefs;
  /** Write affordances are admin-only; viewers get states without action buttons. */
  canManage: boolean;
};

/* ================================ Outputs ================================ */

export type ReadinessItemState = "complete" | "action" | "progress" | "optional" | "unavailable";

export type ReadinessChecklistItem = {
  key:
    | "event_details"
    | "capture_access"
    | "team_invitations"
    | "seats_licenses"
    | "strategy_playbook"
    | "lead_import"
    | "briefs";
  label: string;
  state: ReadinessItemState;
  detail: string;
  /** Present only when there is a real destination and the caller may act. */
  actionLabel: string | null;
  actionHref: string | null;
};

export type ReadinessKpi = {
  key: "setup" | "team" | "seats" | "capture";
  label: string;
  /** Display value, e.g. "3 of 5", "6 / 10", "Not set". Never a fabricated 0. */
  value: string;
  caption: string;
  state: "ok" | "attention" | "unavailable";
};

export type ReadinessWhatMattersNow = {
  key: string;
  title: string;
  body: string;
  actionLabel: string | null;
  actionHref: string | null;
  /** "blocker" renders with urgency; "ready" is the neutral state. */
  tone: "blocker" | "ready";
};

export type ReadinessTeamPanelRow = {
  userId: string;
  displayName: string;
  state: "active" | "invited";
  captureAccess: boolean;
};

export type StrategySummary = {
  configured: boolean;
  eventGoal: string | null;
  productFocus: string | null;
  targetBuyerPersona: string | null;
  toneOfVoice: string | null;
  knowledgeItemCount: number | null;
};

export type EventReadiness = {
  checklist: ReadinessChecklistItem[];
  kpis: ReadinessKpi[];
  whatMattersNow: ReadinessWhatMattersNow;
  team: ReadinessTeamPanelRow[] | null;
  strategy: StrategySummary;
};

/**
 * A conservative account-level readiness percentage derived from the same
 * checklist used inside an Upcoming event workspace.  If any required source
 * is unavailable, callers must render an unavailable state rather than a
 * misleading percentage.
 */
export function deriveEventReadinessPercent(readiness: EventReadiness): number | null {
  const required = readiness.checklist.filter((item) => item.state !== "optional");
  if (required.length === 0 || required.some((item) => item.state === "unavailable")) return null;
  const complete = required.filter((item) => item.state === "complete").length;
  return Math.round((complete / required.length) * 100);
}

/* ================================ Derivation ================================ */

function parseStrategy(raw: unknown): Omit<StrategySummary, "knowledgeItemCount" | "configured"> {
  const obj = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const str = (v: unknown) => {
    const s = typeof v === "string" ? v.trim() : "";
    return s.length > 0 ? s : null;
  };
  return {
    eventGoal: str(obj.eventGoal),
    productFocus: str(obj.productFocus),
    targetBuyerPersona: str(obj.targetBuyerPersona),
    toneOfVoice: str(obj.toneOfVoice)
  };
}

function memberDisplayName(row: ReadinessTeamMemberRow): string {
  const name = String(row.full_name ?? "").trim();
  if (name) return name;
  const email = String(row.email ?? "").trim();
  if (email) return email;
  return "Teammate";
}

function isActiveMember(row: ReadinessTeamMemberRow): boolean {
  return String(row.status ?? "").trim().toLowerCase() === "active";
}

export function deriveEventReadiness(input: EventReadinessInput): EventReadiness {
  const event = input.event;
  const isContinuous = isContinuousCaptureContainerKind(
    normalizeEventContainerKind(event?.container_kind ?? null)
  );

  const startYmd = normalizeYmd(event?.start_date ?? null);
  const endYmd = normalizeYmd(event?.end_date ?? null);
  const hasName = Boolean(String(event?.name ?? "").trim());
  const hasDates = startYmd !== null && endYmd !== null;
  const hasLocation = Boolean(event ? resolveEventLocation(event.city, event.state, event.location) : null);

  const strategyFields = parseStrategy(event?.briefing_strategy);
  const strategyConfigured =
    strategyFields.eventGoal !== null ||
    strategyFields.productFocus !== null ||
    strategyFields.targetBuyerPersona !== null ||
    strategyFields.toneOfVoice !== null;
  const strategy: StrategySummary = {
    configured: strategyConfigured,
    ...strategyFields,
    knowledgeItemCount: input.knowledgeItemCount
  };

  const members = input.teamMembers;
  const activeMembers = members?.filter(isActiveMember) ?? null;
  const invitedMemberCount =
    members === null ? null : members.length - (activeMembers?.length ?? 0);
  const captureCapableCount =
    activeMembers === null
      ? null
      : activeMembers.filter((m) => eventAppPermissionEnabled(m.permissions)).length;
  const outstandingInvites =
    input.pendingInviteCount === null && invitedMemberCount === null
      ? null
      : Math.max(input.pendingInviteCount ?? 0, invitedMemberCount ?? 0);

  const seatsTotals =
    input.licenses === null
      ? null
      : input.licenses.reduce(
          (acc, row) => ({
            used: acc.used + Math.max(0, Number(row.seats_used ?? 0)),
            total: acc.total + Math.max(0, Number(row.seats_total ?? 0))
          }),
          { used: 0, total: 0 }
        );
  const hasActiveLicense = input.licenses === null ? null : input.licenses.length > 0;

  const act = (label: string, href: string | null): Pick<ReadinessChecklistItem, "actionLabel" | "actionHref"> =>
    input.canManage && href ? { actionLabel: label, actionHref: href } : { actionLabel: null, actionHref: null };

  /* ------------------------------ Checklist ------------------------------ */

  const checklist: ReadinessChecklistItem[] = [];

  // 1. Event details — canonical events row.
  if (event === null) {
    checklist.push({
      key: "event_details",
      label: "Event details",
      state: "unavailable",
      detail: "Event details are unavailable right now.",
      actionLabel: null,
      actionHref: null
    });
  } else if (isContinuous) {
    checklist.push({
      key: "event_details",
      label: "Event details",
      state: "complete",
      detail: "Continuous capture — no event dates required.",
      ...act("Edit", input.hrefs.settings)
    });
  } else if (!hasName || !hasDates) {
    const missing = [!hasName ? "name" : null, !hasDates ? "event dates" : null]
      .filter(Boolean)
      .join(" and ");
    checklist.push({
      key: "event_details",
      label: "Event details",
      state: "action",
      detail: `Missing ${missing}. Dates drive the workspace lifecycle.`,
      ...act("Edit settings", input.hrefs.settings)
    });
  } else {
    checklist.push({
      key: "event_details",
      label: "Event details",
      state: "complete",
      detail: hasLocation ? "Name, dates, and location are set." : "Name and dates are set — location is optional.",
      ...act("Edit", input.hrefs.settings)
    });
  }

  // 2. Mobile capture access — event_users app permission. No device/scanner
  // model exists, so this is deliberately about people, not hardware.
  if (captureCapableCount === null) {
    checklist.push({
      key: "capture_access",
      label: "Mobile capture access",
      state: "unavailable",
      detail: "Team capture access could not be loaded right now.",
      actionLabel: null,
      actionHref: null
    });
  } else if (captureCapableCount === 0) {
    checklist.push({
      key: "capture_access",
      label: "Mobile capture access",
      state: "action",
      detail: "No teammate can capture leads in the mobile app yet.",
      ...act("Manage team", input.hrefs.team)
    });
  } else {
    checklist.push({
      key: "capture_access",
      label: "Mobile capture access",
      state: "complete",
      detail: `${captureCapableCount} ${captureCapableCount === 1 ? "teammate" : "teammates"} can capture leads in the mobile app.`,
      ...act("Manage team", input.hrefs.team)
    });
  }

  // 3. Team invitations — event_users + outstanding invite codes.
  if (members === null) {
    checklist.push({
      key: "team_invitations",
      label: "Team & invitations",
      state: "unavailable",
      detail: "Team assignments could not be loaded right now.",
      actionLabel: null,
      actionHref: null
    });
  } else if (members.length === 0 && (outstandingInvites ?? 0) === 0) {
    checklist.push({
      key: "team_invitations",
      label: "Team & invitations",
      state: "action",
      detail: "No team members are assigned to this event yet.",
      ...act("Invite team", input.hrefs.team)
    });
  } else if ((outstandingInvites ?? 0) > 0) {
    checklist.push({
      key: "team_invitations",
      label: "Team & invitations",
      state: "progress",
      detail: `${outstandingInvites} ${outstandingInvites === 1 ? "invitation is" : "invitations are"} still awaiting acceptance.`,
      ...act("Manage invitations", input.hrefs.team)
    });
  } else {
    checklist.push({
      key: "team_invitations",
      label: "Team & invitations",
      state: "complete",
      detail: `${activeMembers?.length ?? 0} active ${(activeMembers?.length ?? 0) === 1 ? "member" : "members"} assigned to this event.`,
      ...act("Manage team", input.hrefs.team)
    });
  }

  // 4. Seats & licenses — active licenses; seats_used is a derived cache
  // (display-only; grants are enforced server-side elsewhere).
  if (input.licenses === null) {
    checklist.push({
      key: "seats_licenses",
      label: "Seats & licenses",
      state: "unavailable",
      detail: "License and seat state could not be loaded right now.",
      actionLabel: null,
      actionHref: null
    });
  } else if (hasActiveLicense === false) {
    checklist.push({
      key: "seats_licenses",
      label: "Seats & licenses",
      state: "action",
      detail: "No active license — app seats cannot be granted.",
      ...act("Manage seats", input.hrefs.team)
    });
  } else if (seatsTotals !== null && seatsTotals.total > 0 && seatsTotals.used >= seatsTotals.total) {
    checklist.push({
      key: "seats_licenses",
      label: "Seats & licenses",
      state: "action",
      detail: `All ${seatsTotals.total} seats are consumed — free a seat or expand the license to add staff.`,
      ...act("Manage seats", input.hrefs.team)
    });
  } else {
    checklist.push({
      key: "seats_licenses",
      label: "Seats & licenses",
      state: "complete",
      detail:
        seatsTotals !== null && seatsTotals.total > 0
          ? `${seatsTotals.used} of ${seatsTotals.total} seats in use — ${Math.max(0, seatsTotals.total - seatsTotals.used)} available.`
          : "An active license is in place.",
      ...act("Manage seats", input.hrefs.team)
    });
  }

  // 5. Strategy & playbook — optional by design; absence never blocks.
  if (strategyConfigured || (input.knowledgeItemCount ?? 0) > 0) {
    checklist.push({
      key: "strategy_playbook",
      label: "Strategy & playbook",
      state: "complete",
      detail: [
        strategy.eventGoal ? `Goal: ${strategy.eventGoal}` : null,
        (input.knowledgeItemCount ?? 0) > 0
          ? `${input.knowledgeItemCount} trusted ${input.knowledgeItemCount === 1 ? "source" : "sources"}`
          : null
      ]
        .filter(Boolean)
        .join(" · ") || "Strategy is configured.",
      ...act("Review", input.hrefs.strategy)
    });
  } else {
    checklist.push({
      key: "strategy_playbook",
      label: "Strategy & playbook",
      state: "optional",
      detail: "Optional — set an event goal, audience, and tone to guide briefings.",
      ...act("Set up", input.hrefs.strategy)
    });
  }

  // 6. Lead import — optional pre-event step; import batches are
  // company-scoped, so the honest event-level signal is the lead count.
  if (input.leadCount === null) {
    checklist.push({
      key: "lead_import",
      label: "Lead import",
      state: "unavailable",
      detail: "Lead counts could not be loaded right now.",
      actionLabel: null,
      actionHref: null
    });
  } else if (input.leadCount === 0) {
    checklist.push({
      key: "lead_import",
      label: "Lead import",
      state: "optional",
      detail: "Optional — import a pre-event list, or capture leads on-site from day one.",
      ...act("Import leads", input.hrefs.importWizard)
    });
  } else {
    checklist.push({
      key: "lead_import",
      label: "Lead import",
      state: "complete",
      detail: `${input.leadCount} ${input.leadCount === 1 ? "lead is" : "leads are"} already in this event.`,
      actionLabel: null,
      actionHref: null
    });
  }

  // 7. Briefs — shown only when the company actually uses briefs for this
  // event's leads (leads exist and counts loaded).
  if ((input.leadCount ?? 0) > 0 && input.briefingCounts !== null && input.briefingCounts.generated > 0) {
    const { generated, approved } = input.briefingCounts;
    checklist.push({
      key: "briefs",
      label: "Lead briefs",
      state: approved >= generated ? "complete" : "progress",
      detail: `${approved} of ${generated} generated ${generated === 1 ? "brief" : "briefs"} approved.`,
      actionLabel: null,
      actionHref: null
    });
  }

  /* ------------------------------ KPIs ------------------------------ */

  // Setup counts only required (non-optional) checklist items with a known state.
  const requiredItems = checklist.filter(
    (item) => item.state !== "optional" && item.state !== "unavailable"
  );
  const completeRequired = requiredItems.filter((item) => item.state === "complete").length;

  const kpis: ReadinessKpi[] = [
    {
      key: "setup",
      label: "Event setup",
      value: requiredItems.length > 0 ? `${completeRequired} of ${requiredItems.length}` : "—",
      caption: "required items complete",
      state:
        requiredItems.length > 0 && completeRequired === requiredItems.length ? "ok" : "attention"
    },
    {
      key: "team",
      label: "Team assigned",
      value:
        members === null
          ? "—"
          : `${activeMembers?.length ?? 0}${(outstandingInvites ?? 0) > 0 ? ` (+${outstandingInvites} invited)` : ""}`,
      caption: members === null ? "unavailable" : "active on this event",
      state: members === null ? "unavailable" : (activeMembers?.length ?? 0) > 0 ? "ok" : "attention"
    },
    {
      key: "seats",
      label: "Seats used",
      value:
        seatsTotals === null ? "—" : seatsTotals.total > 0 ? `${seatsTotals.used} / ${seatsTotals.total}` : "No license",
      caption:
        seatsTotals === null
          ? "unavailable"
          : seatsTotals.total > 0
            ? `${Math.max(0, seatsTotals.total - seatsTotals.used)} available`
            : "no active license",
      state:
        seatsTotals === null
          ? "unavailable"
          : seatsTotals.total === 0 || seatsTotals.used >= seatsTotals.total
            ? "attention"
            : "ok"
    },
    {
      key: "capture",
      label: "Capture access",
      value:
        captureCapableCount === null ? "—" : captureCapableCount === 0 ? "Not set" : String(captureCapableCount),
      caption:
        captureCapableCount === null
          ? "unavailable"
          : captureCapableCount === 0
            ? "no mobile capture yet"
            : "teammates can capture",
      state:
        captureCapableCount === null ? "unavailable" : captureCapableCount === 0 ? "attention" : "ok"
    }
  ];

  /* ------------------------- What Matters Now ------------------------- */
  // Fixed severity ladder (audit §17); first firing condition wins.

  const eventName = String(event?.name ?? "").trim() || "this event";
  let whatMattersNow: ReadinessWhatMattersNow;

  const detailsItem = checklist.find((i) => i.key === "event_details");
  const captureItem = checklist.find((i) => i.key === "capture_access");
  const teamItem = checklist.find((i) => i.key === "team_invitations");
  const seatsItem = checklist.find((i) => i.key === "seats_licenses");

  if (detailsItem?.state === "action") {
    whatMattersNow = {
      key: "details_incomplete",
      title: "Event details are incomplete",
      body: `${detailsItem.detail} The workspace resolves Upcoming, Live, and Completed from the event dates.`,
      actionLabel: input.canManage && input.hrefs.settings ? "Complete event details" : null,
      actionHref: input.canManage ? input.hrefs.settings : null,
      tone: "blocker"
    };
  } else if (captureItem?.state === "action") {
    whatMattersNow = {
      key: "no_capture_access",
      title: "No one can capture leads yet",
      body: "Without mobile capture access, the team can't collect leads on the floor. Grant app access before doors open.",
      actionLabel: input.canManage ? "Grant capture access" : null,
      actionHref: input.canManage ? input.hrefs.team : null,
      tone: "blocker"
    };
  } else if (teamItem?.state === "action" || teamItem?.state === "progress") {
    whatMattersNow = {
      key: "team_incomplete",
      title:
        teamItem.state === "action"
          ? "No team is assigned to this event"
          : "Invitations are still outstanding",
      body: teamItem.detail,
      actionLabel: input.canManage ? "Manage team" : null,
      actionHref: input.canManage ? input.hrefs.team : null,
      tone: "blocker"
    };
  } else if (seatsItem?.state === "action") {
    whatMattersNow = {
      key: "seats_blocked",
      title: "Seats or licensing need attention",
      body: seatsItem.detail,
      actionLabel: input.canManage ? "Manage seats" : null,
      actionHref: input.canManage ? input.hrefs.team : null,
      tone: "blocker"
    };
  } else {
    whatMattersNow = {
      key: "ready",
      title: `${eventName} is ready to operate`,
      body: "Required setup is complete. Team, seats, and capture access are in place.",
      actionLabel: null,
      actionHref: null,
      tone: "ready"
    };
  }

  /* ------------------------------ Team panel ------------------------------ */

  const team: ReadinessTeamPanelRow[] | null =
    members === null
      ? null
      : [...members]
          .sort((a, b) => {
            const stateRank = (m: ReadinessTeamMemberRow) => (isActiveMember(m) ? 0 : 1);
            const rankDiff = stateRank(a) - stateRank(b);
            if (rankDiff !== 0) return rankDiff;
            const nameCmp = memberDisplayName(a).localeCompare(memberDisplayName(b), "en");
            if (nameCmp !== 0) return nameCmp;
            return a.user_id < b.user_id ? -1 : a.user_id > b.user_id ? 1 : 0;
          })
          .map((m) => ({
            userId: m.user_id,
            displayName: memberDisplayName(m),
            state: isActiveMember(m) ? "active" : "invited",
            captureAccess: isActiveMember(m) && eventAppPermissionEnabled(m.permissions)
          }));

  return { checklist, kpis, whatMattersNow, team, strategy };
}
