import { computeSpeakerReadinessFlags, type SpeakerReadinessFlag } from "@/src/server/services/speaker-readiness";
import { getPrisma } from "@/lib/prisma";

export type ReadinessState = "ready" | "attention" | "blocked" | "not_needed";
export type ReadinessReason = Readonly<{ code: string; label: string; href: string }>;
export type ReadinessModule = Readonly<{ id: string; label: string; state: ReadinessState; reasons: readonly ReadinessReason[]; href: string }>;
export type EventReadinessSnapshot = Readonly<{
  dataAsOf: string;
  sessions: readonly Readonly<{ id: string; title: string; state: ReadinessState; reasons: readonly ReadinessReason[]; modules: readonly ReadinessModule[]; href: string }>[];
  summary: Readonly<{ total: number; ready: number; attention: number; blocked: number; notNeeded: number }>;
  speakers: Readonly<{ total: number; complete: number; needsAction: number; rows: readonly Readonly<{ id: string; name: string; state: "ready" | "attention"; flags: readonly SpeakerReadinessFlag[]; href: string }>[] }>;
  staffing: Readonly<{ requiredRoles: number; assignedRoles: number; gaps: readonly ReadinessReason[]; conflicts: readonly ReadinessReason[] }>;
}>;

type NotNeededEvidence = { disposition: string; dispositionReason: string | null; dispositionActorUserId: string | null; dispositionAt: Date | null };

export function hasValidNotNeededEvidence(value: NotNeededEvidence): boolean {
  return value.disposition === "NOT_NEEDED" && Boolean(value.dispositionReason?.trim() && value.dispositionActorUserId && value.dispositionAt);
}

export function classifyApprovalUrgency(input: { submittedAt: Date; dueAt?: Date | null; asOf: Date; riskAfterDays?: number }): "overdue" | "dueSoon" | "risk" | "pending" {
  const dayMs = 86_400_000;
  if (input.dueAt && input.dueAt.getTime() < input.asOf.getTime()) return "overdue";
  if (input.dueAt && input.dueAt.getTime() - input.asOf.getTime() <= 3 * dayMs) return "dueSoon";
  if (input.asOf.getTime() - input.submittedAt.getTime() >= (input.riskAfterDays ?? 5) * dayMs) return "risk";
  return "pending";
}

function timeMinutes(value: Date | null): number | null {
  if (!value) return null;
  return value.getUTCHours() * 60 + value.getUTCMinutes();
}

function overall(modules: readonly ReadinessModule[]): ReadinessState {
  if (modules.some((module) => module.state === "blocked")) return "blocked";
  if (modules.some((module) => module.state === "attention")) return "attention";
  if (modules.every((module) => module.state === "not_needed")) return "not_needed";
  return "ready";
}

function moduleResult(id: string, label: string, state: ReadinessState, href: string, codes: Array<[string, string]>): ReadinessModule {
  return { id, label, state, href, reasons: codes.map(([code, reasonLabel]) => ({ code, label: reasonLabel, href })) };
}

function normalizeRole(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function getEventReadinessSnapshot(eventId: string, asOf = new Date()): Promise<EventReadinessSnapshot> {
  const prisma = getPrisma();
  const [sessions, speakers] = await Promise.all([
    prisma.matrixRow.findMany({
      where: { eventId, archivedAt: null },
      orderBy: [{ dayDate: "asc" }, { startTime: "asc" }, { sortOrder: "asc" }, { id: "asc" }],
      include: {
        room: true,
        sessionSpeakerAssignments: { include: { speaker: { select: { id: true, name: true, status: true } } } },
        sessionAvRequirements: true,
        sessionFoodService: true,
        fnbCatalogAssignments: { include: { safetyResolutions: true } },
        fnbRequirements: true,
        sessionStaffAssignments: { include: { person: { select: { id: true, name: true } } } },
        sessionRequirementSelections: { include: { item: { include: { section: true } } } },
        budgetLineItems: { select: { id: true, approval: true } },
      },
    }),
    prisma.speaker.findMany({
      where: { eventId },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: {
        id: true, name: true, bio: true, headshotUrl: true, title: true, company: true, avNeeds: true, travelNeeds: true, dietaryRestrictions: true,
        intakeTokens: { orderBy: { createdAt: "desc" }, take: 1, select: { submittedAt: true, revokedAt: true, expiresAt: true } },
        profileSubmissions: { where: { status: "PENDING" }, take: 1, select: { id: true } },
        files: { where: { kind: "SLIDES" }, orderBy: [{ version: "desc" }, { createdAt: "desc" }], take: 1, select: { reviewStatus: true } },
        documentRequests: { select: { speakerFileId: true, speakerFile: { select: { reviewStatus: true } }, document: { select: { status: true } } } },
      },
    }),
  ]);

  const staffingConflictsBySession = new Map<string, ReadinessReason[]>();
  for (let leftIndex = 0; leftIndex < sessions.length; leftIndex += 1) {
    const left = sessions[leftIndex]!;
    const leftStart = timeMinutes(left.startTime);
    const leftEnd = timeMinutes(left.endTime);
    if (leftStart === null || leftEnd === null) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < sessions.length; rightIndex += 1) {
      const right = sessions[rightIndex]!;
      if (left.dayDate.getTime() !== right.dayDate.getTime()) continue;
      const rightStart = timeMinutes(right.startTime);
      const rightEnd = timeMinutes(right.endTime);
      if (rightStart === null || rightEnd === null || leftStart >= rightEnd || rightStart >= leftEnd) continue;
      const rightPeople = new Set(right.sessionStaffAssignments.map((assignment) => assignment.personId));
      for (const assignment of left.sessionStaffAssignments) {
        if (!rightPeople.has(assignment.personId)) continue;
        const leftHref = `/events/${eventId}/matrix/sessions/${left.id}?tab=staffing`;
        const rightHref = `/events/${eventId}/matrix/sessions/${right.id}?tab=staffing`;
        staffingConflictsBySession.set(left.id, [...(staffingConflictsBySession.get(left.id) ?? []), { code: "STAFF_DOUBLE_BOOKED", label: `${assignment.person.name} overlaps ${right.sessionName?.trim() || "another session"}.`, href: leftHref }]);
        staffingConflictsBySession.set(right.id, [...(staffingConflictsBySession.get(right.id) ?? []), { code: "STAFF_DOUBLE_BOOKED", label: `${assignment.person.name} overlaps ${left.sessionName?.trim() || "another session"}.`, href: rightHref }]);
      }
    }
  }

  const staffingGaps: ReadinessReason[] = [];
  let totalRequiredRoles = 0;
  let filledRequiredRoles = 0;
  const sessionRows = sessions.map((session) => {
    const baseHref = `/events/${eventId}/matrix/sessions/${session.id}`;
    const href = (tab: string) => `${baseHref}?tab=${tab}`;
    const validTime = session.startTime && session.endTime && session.endTime.getTime() > session.startTime.getTime();
    const validRoom = Boolean(session.roomId && session.room?.eventId === eventId);
    const detailsCodes: Array<[string, string]> = [];
    if (!session.sessionName?.trim()) detailsCodes.push(["SESSION_TITLE_MISSING", "Session title is missing."]);
    if (!validTime) detailsCodes.push(["SESSION_TIME_INVALID", "Start and end times are incomplete or invalid."]);
    if (!validRoom) detailsCodes.push(["SESSION_ROOM_MISSING", "A valid event room is not assigned."]);
    const details = moduleResult("timing-room", "Timing & room", detailsCodes.length ? "blocked" : "ready", href("details"), detailsCodes.length ? detailsCodes : [["TIMING_ROOM_READY", "Timing and room are complete."]]);

    const speakerRows = session.sessionSpeakerAssignments.map((entry) => ({ id: entry.speaker.id, name: entry.speaker.name, status: entry.speaker.status }));
    const needsSpeaker = /keynote|panel|workshop|breakout|presentation|fireside|roundtable/i.test(session.sessionName ?? "") || speakerRows.length > 0;
    const speakerProblems = speakerRows.filter((speaker) => !speaker.name.trim() || speaker.status === "NEEDS_INFO" || speaker.status === "CANCELLED");
    const speakerState: ReadinessState = !needsSpeaker ? "ready" : speakerRows.length === 0 || speakerProblems.length > 0 ? "attention" : "ready";
    const speakerCodes: Array<[string, string]> = speakerRows.length === 0 && needsSpeaker ? [["SPEAKER_ASSIGNMENT_MISSING", "A speaker assignment is required."]] : speakerProblems.length ? [["SPEAKER_DETAILS_INCOMPLETE", "An assigned speaker needs complete confirmed details."]] : [[needsSpeaker ? "SPEAKERS_READY" : "NO_SPEAKER_DEMAND", needsSpeaker ? "Speaker assignments are complete." : "No speaker demand is indicated."]];
    const speakerModule = moduleResult("speakers", "Speakers", speakerState, href("speakers"), speakerCodes);

    const needsAv = /keynote|panel|workshop|breakout|presentation|fireside|roundtable/i.test(session.sessionName ?? "") || session.sessionAvRequirements.length > 0 || Boolean(session.avNeeds?.trim() || session.avNotes?.trim());
    const avModule = moduleResult("av", "AV / production", needsAv && session.sessionAvRequirements.length === 0 && !session.avNeeds?.trim() && !session.avNotes?.trim() ? "attention" : "ready", href("av"), needsAv && session.sessionAvRequirements.length === 0 && !session.avNeeds?.trim() && !session.avNotes?.trim() ? [["AV_REQUIREMENTS_MISSING", "AV / production requirements are missing."]] : [[needsAv ? "AV_READY" : "NO_AV_DEMAND", needsAv ? "AV / production requirements are recorded." : "No AV demand is indicated."]]);

    const activeFnbRequirements = session.fnbRequirements.filter((item) => item.kind !== "ACCESSIBILITY" && item.disposition !== "NOT_NEEDED");
    const notNeededFnb = session.fnbRequirements.filter((item) => item.kind !== "ACCESSIBILITY" && hasValidNotNeededEvidence(item));
    const invalidNotNeededFnb = session.fnbRequirements.filter((item) => item.kind !== "ACCESSIBILITY" && item.disposition === "NOT_NEEDED" && !hasValidNotNeededEvidence(item));
    const needsFnb = session.mealPeriod && session.mealPeriod !== "NONE" || Boolean(session.sessionFoodService) || activeFnbRequirements.length > 0 || session.fnbCatalogAssignments.length > 0;
    const safetyBlock = session.fnbCatalogAssignments.flatMap((assignment) => assignment.safetyResolutions).some((resolution) => ["CONFLICT", "INSUFFICIENT_INFORMATION", "STALE_VERIFICATION"].includes(resolution.outcome) && !(resolution.modification && resolution.modificationStatus === "VERIFIED"));
    const fnbState: ReadinessState = invalidNotNeededFnb.length ? "blocked" : notNeededFnb.length > 0 && !needsFnb ? "not_needed" : safetyBlock ? "blocked" : needsFnb && (!session.sessionFoodService?.headcount && !session.attendance || session.fnbCatalogAssignments.length === 0) ? "attention" : "ready";
    const fnbCodes: Array<[string, string]> = invalidNotNeededFnb.length ? [["NOT_NEEDED_EVIDENCE_INVALID", "Not Needed requires reason, actor and timestamp."]] : fnbState === "not_needed" ? [["FNB_NOT_NEEDED_AUDITED", "F&B is Not Needed with valid disposition evidence."]] : safetyBlock ? [["FNB_SAFETY_BLOCKER", "Dietary or allergen safety has an unresolved blocker."]] : fnbState === "attention" ? [[session.fnbCatalogAssignments.length === 0 ? "FNB_COVERAGE_MISSING" : "FNB_HEADCOUNT_MISSING", session.fnbCatalogAssignments.length === 0 ? "Required F&B menu coverage is missing." : "F&B headcount is missing."]] : [[needsFnb ? "FNB_READY" : "NO_FNB_DEMAND", needsFnb ? "F&B demand has coverage and headcount." : "No F&B demand is indicated."]];
    const fnbModule = moduleResult("fnb", "F&B", fnbState, href("fnb"), fnbCodes);

    const requirementsFor = (key: string) => session.sessionRequirementSelections.filter((selection) => selection.item.section.key.toLowerCase() === key || selection.item.section.label.toLowerCase() === key);
    const supplies = requirementsFor("supplies");
    const signage = requirementsFor("signage");
    const suppliesModule = moduleResult("supplies", "Supplies", supplies.length ? "ready" : "attention", href("supplies"), supplies.length ? [["SUPPLIES_READY", `${supplies.length} supplies requirement${supplies.length === 1 ? " is" : "s are"} recorded.`]] : [["SUPPLIES_DISPOSITION_MISSING", "Record supplies requirements or an audited Not Needed disposition."]]);
    const signageModule = moduleResult("signage", "Signage", signage.length ? "ready" : "attention", href("signage"), signage.length ? [["SIGNAGE_READY", `${signage.length} signage requirement${signage.length === 1 ? " is" : "s are"} recorded.`]] : [["SIGNAGE_DISPOSITION_MISSING", "Record signage requirements or an audited Not Needed disposition."]]);

    const accessibility = session.fnbRequirements.filter((item) => item.kind === "ACCESSIBILITY" && item.disposition !== "NOT_NEEDED");
    const invalidAccessibilityDisposition = session.fnbRequirements.some((item) => item.kind === "ACCESSIBILITY" && item.disposition === "NOT_NEEDED" && !hasValidNotNeededEvidence(item));
    const accessibilityModule = moduleResult("accessibility", "Accessibility", invalidAccessibilityDisposition ? "blocked" : "ready", href("fnb"), invalidAccessibilityDisposition ? [["NOT_NEEDED_EVIDENCE_INVALID", "Accessibility Not Needed requires reason, actor and timestamp."]] : [[accessibility.length ? "ACCESSIBILITY_RECORDED" : "NO_ACCESSIBILITY_REQUIREMENT_RECORDED", accessibility.length ? `${accessibility.length} aggregate accessibility requirement${accessibility.length === 1 ? " is" : "s are"} recorded.` : "No aggregate accessibility requirement is recorded."]]);

    const requiredRoles = requirementsFor("staffing").map((selection) => selection.item.label).filter(Boolean);
    const assignedRoles = new Set(session.sessionStaffAssignments.map((assignment) => normalizeRole(assignment.role ?? "")));
    const missingRoles = requiredRoles.filter((role) => !assignedRoles.has(normalizeRole(role)));
    totalRequiredRoles += requiredRoles.length;
    filledRequiredRoles += requiredRoles.length - missingRoles.length;
    for (const role of missingRoles) staffingGaps.push({ code: "STAFF_ROLE_UNFILLED", label: `${session.sessionName?.trim() || "Untitled session"}: ${role} is unfilled.`, href: href("staffing") });
    const conflicts = staffingConflictsBySession.get(session.id) ?? [];
    const staffingState: ReadinessState = conflicts.length ? "blocked" : missingRoles.length ? "attention" : "ready";
    const staffingModule: ReadinessModule = { id: "staffing", label: "Staffing", state: staffingState, href: href("staffing"), reasons: conflicts.length ? conflicts : missingRoles.length ? missingRoles.map((role) => ({ code: "STAFF_ROLE_UNFILLED", label: `${role} is unfilled.`, href: href("staffing") })) : [{ code: requiredRoles.length ? "STAFFING_READY" : "NO_REQUIRED_STAFF_ROLES", label: requiredRoles.length ? "Every required staff role is assigned." : "No required staff roles are recorded.", href: href("staffing") }] };

    const pendingApprovals = session.budgetLineItems.filter((item) => item.approval === "PENDING");
    const approvalModule = moduleResult("approvals", "Approvals", pendingApprovals.length ? "attention" : "ready", `/events/${eventId}/budget`, pendingApprovals.length ? [["SESSION_APPROVAL_PENDING", `${pendingApprovals.length} linked budget approval${pendingApprovals.length === 1 ? " is" : "s are"} pending.`]] : [["SESSION_APPROVALS_CLEAR", "No linked session approvals are pending."]]);
    const blockerReasons = [...(staffingConflictsBySession.get(session.id) ?? [])];
    const blockersModule: ReadinessModule = { id: "blockers", label: "Blockers", state: blockerReasons.length || safetyBlock ? "blocked" : "ready", href: baseHref, reasons: blockerReasons.length ? blockerReasons : safetyBlock ? [{ code: "FNB_SAFETY_BLOCKER", label: "An unresolved F&B safety blocker exists.", href: href("fnb") }] : [{ code: "NO_ACTIVE_BLOCKERS", label: "No active canonical blocker is detected.", href: baseHref }] };
    const modules = [details, speakerModule, staffingModule, fnbModule, avModule, suppliesModule, signageModule, accessibilityModule, approvalModule, blockersModule];
    const state = overall(modules);
    const reasons = modules.filter((module) => module.state === "blocked" || module.state === "attention").flatMap((module) => module.reasons);
    return { id: session.id, title: session.sessionName?.trim() || "Untitled session", state, reasons, modules, href: baseHref };
  });

  const speakerRows = speakers.map((speaker) => {
    const flags = computeSpeakerReadinessFlags(speaker, asOf);
    const complete = flags.length === 1 && flags[0] === "complete";
    return { id: speaker.id, name: speaker.name, state: complete ? "ready" as const : "attention" as const, flags, href: `/events/${eventId}/speakers/${speaker.id}` };
  });
  const summary = sessionRows.reduce((acc, row) => { acc[row.state === "not_needed" ? "notNeeded" : row.state] += 1; return acc; }, { total: sessionRows.length, ready: 0, attention: 0, blocked: 0, notNeeded: 0 });
  return {
    dataAsOf: asOf.toISOString(), sessions: sessionRows, summary,
    speakers: { total: speakerRows.length, complete: speakerRows.filter((row) => row.state === "ready").length, needsAction: speakerRows.filter((row) => row.state === "attention").length, rows: speakerRows },
    staffing: { requiredRoles: totalRequiredRoles, assignedRoles: filledRequiredRoles, gaps: staffingGaps, conflicts: [...staffingConflictsBySession.values()].flat() },
  };
}
