import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  buildPendingInviteRows,
  mergePendingInvitesIntoTeamRows,
  pendingInviteRowId,
  isPendingInviteRowId,
  pendingInviteEmailFromRowId
} from "../lib/exhibitor/company-team-pending-invites";
import type {
  CompanyTeamMemberRow
} from "../lib/exhibitor/company-team-types";
import { buildCompanyTeamEventAccessSummary } from "../lib/exhibitor/company-team-access-present";

const root = process.cwd();
function read(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

const NOW_MS = Date.parse("2026-04-24T12:00:00Z");
const FUTURE = "2026-05-01T00:00:00Z";
const PAST = "2026-04-20T00:00:00Z";

const COMPANY_EVENTS = [
  { id: "e1", name: "Alpha" },
  { id: "e2", name: "Beta" },
  { id: "e3", name: "Gamma" }
];

function activeUserRow(partial: Partial<CompanyTeamMemberRow> & { id: string; email: string }): CompanyTeamMemberRow {
  return {
    id: partial.id,
    fullName: partial.fullName ?? null,
    email: partial.email,
    companyRole: partial.companyRole ?? "exhibitor_admin",
    eventAccessMode: partial.eventAccessMode ?? "all_company_events",
    status: partial.status ?? "active",
    lastSignInAt: partial.lastSignInAt ?? "2026-04-23T00:00:00Z",
    eventSummary: partial.eventSummary ?? buildCompanyTeamEventAccessSummary({
      eventAccessMode: partial.eventAccessMode ?? "all_company_events",
      companyOwnedEventCount: COMPANY_EVENTS.length,
      assignedEvents: partial.assignedEventDetails ?? []
    }),
    assignedEventDetails: partial.assignedEventDetails ?? []
  };
}

test("pending invite appears in team table as a single invited row with App-user role", () => {
  const rows = mergePendingInvitesIntoTeamRows({
    activeRows: [],
    pendingInvites: [
      { event_id: "e1", email: "booth@example.com", expires_at: FUTURE }
    ],
    companyEvents: COMPANY_EVENTS,
    nowMs: NOW_MS
  });

  assert.equal(rows.length, 1);
  const row = rows[0];
  assert.equal(row.isPendingInvite, true);
  assert.equal(row.email, "booth@example.com");
  assert.equal(row.companyRole, "viewer");
  assert.equal(row.status, "invited");
  assert.equal(row.id, pendingInviteRowId("booth@example.com"));
  assert.equal(isPendingInviteRowId(row.id), true);
  assert.equal(pendingInviteEmailFromRowId(row.id), "booth@example.com");
  assert.equal(row.assignedEventDetails.length, 1);
  assert.equal(row.assignedEventDetails[0]?.name, "Alpha");
});

test("active user appears once and dedupes against a pending invite for the same email", () => {
  const active = activeUserRow({
    id: "u1",
    email: "dupe@example.com",
    companyRole: "exhibitor_admin",
    status: "active"
  });

  const rows = mergePendingInvitesIntoTeamRows({
    activeRows: [active],
    pendingInvites: [
      { event_id: "e1", email: "dupe@example.com", expires_at: FUTURE }
    ],
    companyEvents: COMPANY_EVENTS,
    nowMs: NOW_MS
  });

  const bySameEmail = rows.filter((r) => (r.email ?? "").toLowerCase() === "dupe@example.com");
  assert.equal(bySameEmail.length, 1, "active user trumps pending invite for the same email");
  assert.equal(bySameEmail[0]?.isPendingInvite, undefined);
  assert.equal(bySameEmail[0]?.id, "u1");
});

test("same email with multiple event invite_codes is grouped into ONE invited row", () => {
  const rows = mergePendingInvitesIntoTeamRows({
    activeRows: [],
    pendingInvites: [
      { event_id: "e1", email: "staff@example.com", expires_at: FUTURE },
      { event_id: "e2", email: "staff@example.com", expires_at: FUTURE },
      { event_id: "e3", email: "staff@example.com", expires_at: FUTURE }
    ],
    companyEvents: COMPANY_EVENTS,
    nowMs: NOW_MS
  });

  const sameEmail = rows.filter((r) => r.email === "staff@example.com");
  assert.equal(sameEmail.length, 1, "multiple event codes for one email are ONE row");
  const row = sameEmail[0]!;
  assert.equal(row.assignedEventDetails.length, 3);
  assert.equal(
    row.eventAccessMode,
    "all_company_events",
    "when codes cover every company event, mode is all_company_events"
  );
});

test("expired invite: every code past expires_at -> status is 'expired' (shows 'Expired' in UI)", () => {
  const rows = mergePendingInvitesIntoTeamRows({
    activeRows: [],
    pendingInvites: [
      { event_id: "e1", email: "lapsed@example.com", expires_at: PAST },
      { event_id: "e2", email: "lapsed@example.com", expires_at: PAST }
    ],
    companyEvents: COMPANY_EVENTS,
    nowMs: NOW_MS
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.status, "expired");
});

test("mixed expiry: at least one unexpired code keeps status 'invited'", () => {
  const rows = mergePendingInvitesIntoTeamRows({
    activeRows: [],
    pendingInvites: [
      { event_id: "e1", email: "mixed@example.com", expires_at: PAST },
      { event_id: "e2", email: "mixed@example.com", expires_at: FUTURE }
    ],
    companyEvents: COMPANY_EVENTS,
    nowMs: NOW_MS
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.status, "invited");
});

test("invite_codes for events no longer in the company are ignored (no orphan rows)", () => {
  const rows = mergePendingInvitesIntoTeamRows({
    activeRows: [],
    pendingInvites: [
      { event_id: "orphan", email: "ghost@example.com", expires_at: FUTURE }
    ],
    companyEvents: COMPANY_EVENTS,
    nowMs: NOW_MS
  });

  assert.equal(rows.length, 0, "no row built when every invite's event is not in this company");
});

test("partial scope: 2/3 events -> assigned_events_only with 2 events", () => {
  const rows = mergePendingInvitesIntoTeamRows({
    activeRows: [],
    pendingInvites: [
      { event_id: "e1", email: "partial@example.com", expires_at: FUTURE },
      { event_id: "e2", email: "partial@example.com", expires_at: FUTURE }
    ],
    companyEvents: COMPANY_EVENTS,
    nowMs: NOW_MS
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.eventAccessMode, "assigned_events_only");
  assert.equal(rows[0]?.assignedEventDetails.length, 2);
});

test("buildPendingInviteRows emits rows deterministically sorted by email", () => {
  const rows = buildPendingInviteRows({
    pendingInvites: [
      { event_id: "e1", email: "zee@example.com", expires_at: FUTURE },
      { event_id: "e1", email: "aaa@example.com", expires_at: FUTURE },
      { event_id: "e1", email: "mmm@example.com", expires_at: FUTURE }
    ],
    companyEvents: COMPANY_EVENTS,
    activeEmails: new Set(),
    nowMs: NOW_MS
  });

  assert.deepEqual(
    rows.map((r) => r.email),
    ["aaa@example.com", "mmm@example.com", "zee@example.com"]
  );
});

// ------------------- Server wiring / source-level regressions -------------------

test("getCompanyTeamTableRows loads unused invite_codes for the company and merges via the pure helper", () => {
  const src = read("lib/server/company-team-management.ts");
  assert.match(src, /mergePendingInvitesIntoTeamRows/);

  const inviteSelect = src.match(
    /\.from\(["']invite_codes["']\)[\s\S]*?\.select\(["']event_id,\s*email,\s*expires_at["']\)[\s\S]*?\.is\(["']used_at["'],\s*null\)/
  );
  assert.ok(
    inviteSelect,
    "must select (event_id, email, expires_at) from invite_codes filtered by used_at IS NULL"
  );
});

test("resendCompanyAppUserInviteAction: derives scope from pending codes and routes through canonical orchestrator (no auth.admin.inviteUserByEmail)", () => {
  const src = read("lib/server/company-team-management.ts");

  const fn = src.match(
    /export async function resendCompanyAppUserInviteAction[\s\S]*?\n\}\n/
  )?.[0];
  assert.ok(fn, "resendCompanyAppUserInviteAction body must exist");

  assert.match(fn, /\.from\(["']invite_codes["']\)/);
  assert.match(fn, /\.select\(["']event_id["']\)/);
  assert.match(fn, /\.is\(["']used_at["'],\s*null\)/);
  assert.match(fn, /createCompanyAppUserInviteCodes/, "routes through the canonical orchestrator wiring");

  const codeOnly = fn.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(
    codeOnly,
    /auth\.admin\.inviteUserByEmail/,
    "resend must never call Supabase web-auth invite"
  );
});

test("cancelCompanyAppUserInviteAction: deletes only used_at IS NULL rows — never touches redeemed codes", () => {
  const src = read("lib/server/company-team-management.ts");

  const fn = src.match(
    /export async function cancelCompanyAppUserInviteAction[\s\S]*?\n\}\n/
  )?.[0];
  assert.ok(fn, "cancelCompanyAppUserInviteAction body must exist");

  assert.match(
    fn,
    /deletePendingInviteCodesForCompanyEmail/,
    "cancel must reuse the pending-only helper (which filters used_at IS NULL)"
  );

  const codeOnly = fn.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(
    codeOnly,
    /used_at\s*:\s*(?!null\b)/,
    "cancel must not mark codes as consumed"
  );
  assert.doesNotMatch(codeOnly, /used_by_user_id\s*:/, "cancel must never write used_by_user_id");
});

test("deletePendingInviteCodesForCompanyEmail helper deletes by company + email scoped to used_at IS NULL", () => {
  const src = read("lib/server/company-team-management.ts");

  const fn = src.match(
    /async function deletePendingInviteCodesForCompanyEmail[\s\S]*?\n\}\n/
  )?.[0];
  assert.ok(fn, "deletePendingInviteCodesForCompanyEmail body must exist");

  assert.match(fn, /\.from\(["']invite_codes["']\)/);
  assert.match(fn, /\.delete\(\)/);
  assert.match(fn, /\.eq\(["']exhibitor_company_id["']/);
  assert.match(fn, /\.eq\(["']email["']/);
  assert.match(fn, /\.is\(["']used_at["'],\s*null\)/);
});

test("team-actions.ts exports the two new App-user invite row actions", () => {
  const src = read("app/app/settings/team-actions.ts");
  assert.match(src, /export async function resendCompanyAppUserInviteAction/);
  assert.match(src, /export async function cancelCompanyAppUserInviteAction/);
});

test("Client renders Resend + Cancel for pending invite rows (and passes email, not a user id)", () => {
  const src = read("app/app/settings/company-team-settings-client.tsx");

  assert.match(src, /resendCompanyAppUserInviteAction/, "client imports resend action");
  assert.match(src, /cancelCompanyAppUserInviteAction/, "client imports cancel action");

  assert.match(src, /row\.isPendingInvite/, "client branches on row.isPendingInvite");
  assert.match(src, />[\s\n]*Cancel invite/, "Cancel invite menu item present");

  assert.match(
    src,
    /resendCompanyAppUserInviteAction,\s*\(fd\)\s*=>\s*\n?\s*fd\.set\(["']email["'],/,
    "resend action receives the invite email (pending rows have no user id)"
  );
  assert.match(
    src,
    /cancelCompanyAppUserInviteAction,\s*\(fd\)\s*=>\s*\n?\s*fd\.set\(["']email["'],/,
    "cancel action receives the invite email (pending rows have no user id)"
  );

  assert.match(
    src,
    /case "Expired":\s*\n\s*return "bg-orange-/,
    "Expired status has its own pill styling"
  );
});

test("Company team edit UI documents read-only email rules", () => {
  const src = read("app/app/settings/company-team-settings-client.tsx");

  assert.match(src, /Email is managed by the user's login identity and cannot be edited here\./);
  assert.match(src, /To correct an email, remove this invite and send a new one\./);
  assert.match(src, /editMember\.email \?\? "No email on file"/);
});

test("Pending invite row has no auth/users id: synthetic id pattern pending:<email>", () => {
  const rows = buildPendingInviteRows({
    pendingInvites: [
      { event_id: "e1", email: "X@Example.COM", expires_at: FUTURE }
    ],
    companyEvents: COMPANY_EVENTS,
    activeEmails: new Set(),
    nowMs: NOW_MS
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.id, "pending:x@example.com", "id normalizes email to lowercase");
  assert.equal(rows[0]?.email, "x@example.com");
});

test("resend does not create duplicate pending rows: orchestrator's clear-before-create guarantee is documented in resend source", () => {
  // The guarantee is end-to-end: resend delegates to the orchestrator, which always
  // clears pending rows for (company, email, event_ids) before creating new ones
  // (proven in tests/company-team-app-user-invite.test.ts). Here we verify the
  // delegation is wired, so resend inherits that guarantee.
  const src = read("lib/server/company-team-management.ts");
  const fn = src.match(
    /export async function resendCompanyAppUserInviteAction[\s\S]*?\n\}\n/
  )?.[0] ?? "";
  assert.match(
    fn,
    /return createCompanyAppUserInviteCodes\(/,
    "resend must delegate to the canonical orchestrator (which clears pending before create)"
  );
});
