import test from "node:test";
import assert from "node:assert/strict";

import {
  buildRemediationSummary,
  diagnoseUser,
  groupInviteRowsForRemediation,
  planUserRemediation,
  type RemediationEventUsersSnapshot,
  type RemediationInviteRow,
  type RemediationUserSnapshot
} from "../lib/server/invites/invite-remediation-plan";

const NOW = "2026-04-25T12:00:00.000Z";

function makeInvite(overrides: Partial<RemediationInviteRow> = {}): RemediationInviteRow {
  return {
    id: "invite-1",
    event_id: "e1",
    exhibitor_company_id: "co1",
    email: "app@example.com",
    permissions: { admin: false, app: true },
    event_access_mode: "all_company_events",
    used_at: null,
    used_by_user_id: null,
    ...overrides
  };
}

function makeUserSnap(overrides: Partial<RemediationUserSnapshot> = {}): RemediationUserSnapshot {
  return {
    id: "u1",
    email: "app@example.com",
    role: "exhibitor_viewer",
    company_id: "co1",
    event_access_mode: "all_company_events",
    ...overrides
  };
}

function makeEU(overrides: Partial<RemediationEventUsersSnapshot> = {}): RemediationEventUsersSnapshot {
  return {
    user_id: "u1",
    event_id: "e1",
    exhibitor_company_id: "co1",
    status: "active",
    permissions: { admin: false, app: true },
    ...overrides
  };
}

test("groupInviteRowsForRemediation: groups by (email, company) and pins userId from any used row", () => {
  const rows: RemediationInviteRow[] = [
    makeInvite({ id: "i1", event_id: "e1", used_at: NOW, used_by_user_id: "u1" }),
    makeInvite({ id: "i2", event_id: "e2" }),
    makeInvite({ id: "i3", event_id: "e3" })
  ];
  const groups = groupInviteRowsForRemediation(rows);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].userId, "u1");
  assert.equal(groups[0].inviteRows.length, 3);
});

test("groupInviteRowsForRemediation: ambiguous userId surfaces an empty userId for skipping", () => {
  const rows: RemediationInviteRow[] = [
    makeInvite({ id: "i1", event_id: "e1", used_at: NOW, used_by_user_id: "u1" }),
    makeInvite({ id: "i2", event_id: "e2", used_at: NOW, used_by_user_id: "u2" })
  ];
  const groups = groupInviteRowsForRemediation(rows);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].userId, "");
});

test("groupInviteRowsForRemediation: drops rows missing email or company", () => {
  const rows: RemediationInviteRow[] = [
    makeInvite({ id: "i1", email: "", used_by_user_id: "u1", used_at: NOW }),
    makeInvite({ id: "i2", exhibitor_company_id: "", used_by_user_id: "u1", used_at: NOW })
  ];
  const groups = groupInviteRowsForRemediation(rows);
  assert.equal(groups.length, 0);
});

test("groupInviteRowsForRemediation: ignores groups with zero used rows (nothing to anchor to)", () => {
  const rows: RemediationInviteRow[] = [
    makeInvite({ id: "i1", event_id: "e1" }),
    makeInvite({ id: "i2", event_id: "e2" })
  ];
  const groups = groupInviteRowsForRemediation(rows);
  assert.equal(groups.length, 0);
});

test("planUserRemediation: backfills event_users for every invited event + consumes pending siblings", () => {
  const inviteRows: RemediationInviteRow[] = [
    makeInvite({ id: "i1", event_id: "e1", used_at: NOW, used_by_user_id: "u1" }),
    makeInvite({ id: "i2", event_id: "e2" }),
    makeInvite({ id: "i3", event_id: "e3" })
  ];
  const [group] = groupInviteRowsForRemediation(inviteRows);
  const plan = planUserRemediation({
    group,
    userSnapshot: makeUserSnap({ event_access_mode: "assigned_events_only" }),
    existingEventUsers: [makeEU({ event_id: "e1" })],
    nowIso: NOW
  });

  const ensureSteps = plan.steps.filter((s) => s.kind === "ensure_event_users");
  assert.equal(ensureSteps.length, 2);
  const targetEventIds = ensureSteps
    .map((s) => (s.kind === "ensure_event_users" ? s.eventId : ""))
    .sort();
  assert.deepEqual(targetEventIds, ["e2", "e3"]);

  const consumeSteps = plan.steps.filter((s) => s.kind === "consume_invite");
  assert.equal(consumeSteps.length, 2);

  const modeStep = plan.steps.find((s) => s.kind === "set_user_event_access_mode");
  assert.ok(modeStep);
  if (modeStep?.kind === "set_user_event_access_mode") {
    assert.equal(modeStep.eventAccessMode, "all_company_events");
  }
});

test("planUserRemediation: idempotent — all rows already correct → zero steps", () => {
  const inviteRows: RemediationInviteRow[] = [
    makeInvite({ id: "i1", event_id: "e1", used_at: NOW, used_by_user_id: "u1" }),
    makeInvite({ id: "i2", event_id: "e2", used_at: NOW, used_by_user_id: "u1" })
  ];
  const [group] = groupInviteRowsForRemediation(inviteRows);
  const plan = planUserRemediation({
    group,
    userSnapshot: makeUserSnap({ event_access_mode: "all_company_events" }),
    existingEventUsers: [makeEU({ event_id: "e1" }), makeEU({ event_id: "e2" })],
    nowIso: NOW
  });
  assert.equal(plan.steps.length, 0);
  assert.equal(plan.skipped, undefined);
});

test("planUserRemediation: upgrades existing event_users with app=false or status=invited", () => {
  const inviteRows: RemediationInviteRow[] = [
    makeInvite({ id: "i1", event_id: "e1", used_at: NOW, used_by_user_id: "u1" })
  ];
  const [group] = groupInviteRowsForRemediation(inviteRows);
  const plan = planUserRemediation({
    group,
    userSnapshot: makeUserSnap(),
    existingEventUsers: [
      makeEU({ event_id: "e1", permissions: { admin: false, app: false }, status: "invited" })
    ],
    nowIso: NOW
  });
  const ensure = plan.steps.find((s) => s.kind === "ensure_event_users");
  assert.ok(ensure, "must emit an ensure step for the downgraded row");
});

test("planUserRemediation: skips ambiguous user group with reason 'ambiguous_user'", () => {
  const inviteRows: RemediationInviteRow[] = [
    makeInvite({ id: "i1", event_id: "e1", used_at: NOW, used_by_user_id: "u1" }),
    makeInvite({ id: "i2", event_id: "e2", used_at: NOW, used_by_user_id: "u2" })
  ];
  const [group] = groupInviteRowsForRemediation(inviteRows);
  const plan = planUserRemediation({
    group,
    userSnapshot: makeUserSnap(),
    existingEventUsers: [],
    nowIso: NOW
  });
  assert.equal(plan.skipped?.reason, "ambiguous_user");
  assert.deepEqual(plan.steps, []);
});

test("planUserRemediation: skips when invite company disagrees with users.company_id", () => {
  const inviteRows: RemediationInviteRow[] = [
    makeInvite({ id: "i1", event_id: "e1", used_at: NOW, used_by_user_id: "u1", exhibitor_company_id: "co2" })
  ];
  const [group] = groupInviteRowsForRemediation(inviteRows);
  const plan = planUserRemediation({
    group,
    userSnapshot: makeUserSnap({ company_id: "co1" }),
    existingEventUsers: [],
    nowIso: NOW
  });
  assert.equal(plan.skipped?.reason, "company_mismatch");
});

test("planUserRemediation: skips when user_record is missing", () => {
  const inviteRows: RemediationInviteRow[] = [
    makeInvite({ id: "i1", event_id: "e1", used_at: NOW, used_by_user_id: "u-missing" })
  ];
  const [group] = groupInviteRowsForRemediation(inviteRows);
  const plan = planUserRemediation({
    group,
    userSnapshot: null,
    existingEventUsers: [],
    nowIso: NOW
  });
  assert.equal(plan.skipped?.reason, "user_record_missing");
});

test("planUserRemediation: deduplicates event_id across multiple invite rows", () => {
  const inviteRows: RemediationInviteRow[] = [
    makeInvite({ id: "i1", event_id: "e1", used_at: NOW, used_by_user_id: "u1" }),
    makeInvite({ id: "i2", event_id: "e1" })
  ];
  const [group] = groupInviteRowsForRemediation(inviteRows);
  const plan = planUserRemediation({
    group,
    userSnapshot: makeUserSnap(),
    existingEventUsers: [],
    nowIso: NOW
  });
  const ensure = plan.steps.filter((s) => s.kind === "ensure_event_users");
  assert.equal(ensure.length, 1);
});

test("planUserRemediation: mixed event_access_mode in group leaves users.event_access_mode alone", () => {
  const inviteRows: RemediationInviteRow[] = [
    makeInvite({
      id: "i1",
      event_id: "e1",
      used_at: NOW,
      used_by_user_id: "u1",
      event_access_mode: "all_company_events"
    }),
    makeInvite({ id: "i2", event_id: "e2", event_access_mode: "assigned_events_only" })
  ];
  const [group] = groupInviteRowsForRemediation(inviteRows);
  const plan = planUserRemediation({
    group,
    userSnapshot: makeUserSnap({ event_access_mode: "assigned_events_only" }),
    existingEventUsers: [makeEU({ event_id: "e1" }), makeEU({ event_id: "e2" })],
    nowIso: NOW
  });
  assert.equal(
    plan.steps.find((s) => s.kind === "set_user_event_access_mode"),
    undefined
  );
});

test("diagnoseUser: ok when everything is aligned", () => {
  const flags = diagnoseUser({
    userSnapshot: makeUserSnap(),
    inviteRows: [makeInvite({ used_at: NOW, used_by_user_id: "u1" })],
    eventUsers: [makeEU()]
  });
  assert.deepEqual(flags, ["ok"]);
});

test("diagnoseUser: partial-consume + event_users_missing when old bug applied", () => {
  const flags = diagnoseUser({
    userSnapshot: makeUserSnap(),
    inviteRows: [
      makeInvite({ id: "i1", event_id: "e1", used_at: NOW, used_by_user_id: "u1" }),
      makeInvite({ id: "i2", event_id: "e2" }),
      makeInvite({ id: "i3", event_id: "e3" })
    ],
    eventUsers: [makeEU({ event_id: "e1" })]
  });
  assert.ok(flags.includes("invite_partially_consumed"));
  assert.ok(flags.includes("event_users_missing"));
});

test("diagnoseUser: missing_user_id when company is blank", () => {
  const flags = diagnoseUser({
    userSnapshot: makeUserSnap({ company_id: null }),
    inviteRows: [makeInvite({ used_at: NOW, used_by_user_id: "u1" })],
    eventUsers: []
  });
  assert.ok(flags.includes("missing_company_id"));
});

test("diagnoseUser: flags event_users.permissions.app=false", () => {
  const flags = diagnoseUser({
    userSnapshot: makeUserSnap(),
    inviteRows: [makeInvite({ used_at: NOW, used_by_user_id: "u1" })],
    eventUsers: [makeEU({ permissions: { admin: false, app: false } })]
  });
  assert.ok(flags.includes("event_users_permissions_app_false"));
});

test("diagnoseUser: flags event_access_mode_mismatch when group declares vs user stored disagree", () => {
  const flags = diagnoseUser({
    userSnapshot: makeUserSnap({ event_access_mode: "assigned_events_only" }),
    inviteRows: [
      makeInvite({
        used_at: NOW,
        used_by_user_id: "u1",
        event_access_mode: "all_company_events"
      })
    ],
    eventUsers: [makeEU()]
  });
  assert.ok(flags.includes("event_access_mode_mismatch"));
});

test("buildRemediationSummary: counts actionable vs skipped correctly", () => {
  const inviteRowsA: RemediationInviteRow[] = [
    makeInvite({ id: "a1", event_id: "e1", used_at: NOW, used_by_user_id: "uA" }),
    makeInvite({ id: "a2", event_id: "e2" })
  ];
  const inviteRowsB: RemediationInviteRow[] = [
    makeInvite({
      id: "b1",
      email: "b@example.com",
      exhibitor_company_id: "coB",
      event_id: "eB",
      used_at: NOW,
      used_by_user_id: "uB"
    })
  ];
  const groups = groupInviteRowsForRemediation([...inviteRowsA, ...inviteRowsB]);
  const plans = groups.map((g) =>
    planUserRemediation({
      group: g,
      userSnapshot: g.userId === "uA" ? makeUserSnap({ id: "uA" }) : null,
      existingEventUsers: [],
      nowIso: NOW
    })
  );
  const summary = buildRemediationSummary(plans);
  assert.equal(summary.actionableGroupCount + summary.skippedGroupCount, plans.length);
  assert.equal(summary.skippedGroupCount, 1, "uB without user snapshot must be skipped");
});
