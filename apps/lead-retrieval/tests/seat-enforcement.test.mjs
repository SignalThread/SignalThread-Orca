/**
 * Regression tests for the canonical seat/license enforcement model.
 *
 * Simulates the DB + enforcement functions in-memory to verify:
 * 1. One license per (event_id, exhibitor_company_id) enforced
 * 2. Seat count derived from active event_users with app=true
 * 3. Invite blocked when no license exists
 * 4. Invite blocked when all seats consumed
 * 5. Invite succeeds when license active and seats remain
 * 6. Toggling app access consumes/releases a seat
 * 7. Duplicate license creation prevented
 * 8. Event isolation: license from event A cannot satisfy event B
 * 9. Reconciliation resets derived seat count from live event_users
 * 10. excludeUserId allows re-assignment of existing user's seat
 */

import assert from "node:assert/strict";
import test from "node:test";

// ---------------------------------------------------------------------------
// In-memory DB simulation
// ---------------------------------------------------------------------------

function createDB() {
  const licenses = [];
  const eventUsers = [];

  function insertLicense(row) {
    const scope = row.scope ?? "event";
    if (
      scope === "company" &&
      row.exhibitor_company_id &&
      licenses.some(
        (l) =>
          (l.scope ?? "event") === "company" &&
          l.exhibitor_company_id === row.exhibitor_company_id
      )
    ) {
      throw new Error(
        'duplicate key value violates unique constraint "licenses_scope_company_exhibitor_company_id_uidx"'
      );
    }
    if (
      row.event_id &&
      row.exhibitor_company_id &&
      scope === "event" &&
      licenses.some(
        (l) =>
          l.event_id === row.event_id &&
          l.exhibitor_company_id === row.exhibitor_company_id &&
          (l.scope ?? "event") === "event"
      )
    ) {
      throw new Error(
        'duplicate key value violates unique constraint "licenses_unique_event_exhibitor"'
      );
    }
    const full = {
      id: row.id ?? `lic-${licenses.length + 1}`,
      event_id: row.event_id,
      exhibitor_company_id: row.exhibitor_company_id,
      scope: row.scope ?? "event",
      seats_total: row.seats_total ?? 0,
      seats_used: 0,
      status: row.status ?? "active",
      expires_at: row.expires_at ?? null,
    };
    licenses.push(full);
    return full;
  }

  function insertEventUser(row) {
    const full = {
      id: row.id ?? `eu-${eventUsers.length + 1}`,
      event_id: row.event_id,
      user_id: row.user_id,
      exhibitor_company_id: row.exhibitor_company_id,
      status: row.status ?? "active",
      permissions: row.permissions ?? { app: false },
    };
    eventUsers.push(full);
    return full;
  }

  function deleteEventUser(userId, eventId) {
    const idx = eventUsers.findIndex(
      (eu) => eu.user_id === userId && eu.event_id === eventId
    );
    if (idx !== -1) eventUsers.splice(idx, 1);
  }

  function updateEventUserPermissions(userId, eventId, permissions) {
    const eu = eventUsers.find(
      (eu) => eu.user_id === userId && eu.event_id === eventId
    );
    if (eu) eu.permissions = permissions;
  }

  return {
    licenses,
    eventUsers,
    insertLicense,
    insertEventUser,
    deleteEventUser,
    updateEventUserPermissions,
  };
}

// ---------------------------------------------------------------------------
// Canonical enforcement functions (mirrors lib/server/event-user-access.ts)
// ---------------------------------------------------------------------------

function getSeatsUsed(db, eventId, exhibitorCompanyId, excludeUserId) {
  return db.eventUsers.filter(
    (eu) =>
      eu.event_id === eventId &&
      eu.exhibitor_company_id === exhibitorCompanyId &&
      eu.status === "active" &&
      eu.permissions?.app === true &&
      (!excludeUserId || eu.user_id !== excludeUserId)
  ).length;
}

function countConsumedAppSeatsForCompanyScope(db, exhibitorCompanyId, excludeUserId) {
  const ids = new Set();
  for (const eu of db.eventUsers) {
    if (eu.exhibitor_company_id !== exhibitorCompanyId) continue;
    if (eu.status !== "active" || eu.permissions?.app !== true) continue;
    if (excludeUserId && eu.user_id === excludeUserId) continue;
    ids.add(eu.user_id);
  }
  return ids.size;
}

/** Mirrors `resolveCompanyScopedSeatGrantIfApplicable`: success object or `null` to fall back to event. */
function resolveCompanyScopedSeatGrantIfApplicable(db, exhibitorCompanyId, excludeUserId) {
  const license = db.licenses.find(
    (l) =>
      (l.scope ?? "event") === "company" &&
      l.exhibitor_company_id === exhibitorCompanyId
  );
  if (!license) return null;

  if (license.status !== "active") {
    return null;
  }
  if (
    license.expires_at &&
    new Date(license.expires_at).getTime() <= Date.now()
  ) {
    return null;
  }

  const seatsTotal = license.seats_total;
  if (seatsTotal < 1) {
    return null;
  }

  const seatsUsed = countConsumedAppSeatsForCompanyScope(
    db,
    exhibitorCompanyId,
    excludeUserId
  );
  if (seatsUsed >= seatsTotal) {
    return null;
  }

  return {
    ok: true,
    licenseId: license.id,
    seatsUsed,
    seatsTotal,
    seatsRemaining: seatsTotal - seatsUsed,
  };
}

/** Event-scoped only (for tests); production uses `enforceSeatAvailability` orchestrator. */
function enforceEventScopedSeatAvailabilityOnly(db, eventId, exhibitorCompanyId, excludeUserId) {
  const license = db.licenses.find(
    (l) =>
      l.event_id === eventId &&
      l.exhibitor_company_id === exhibitorCompanyId &&
      (l.scope ?? "event") === "event"
  );

  if (!license) {
    return { ok: false, error: "No active license for this exhibitor" };
  }
  if (license.status !== "active") {
    return { ok: false, error: "No active license for this exhibitor" };
  }
  if (
    license.expires_at &&
    new Date(license.expires_at).getTime() <= Date.now()
  ) {
    return { ok: false, error: "No active license for this exhibitor" };
  }

  const seatsUsed = getSeatsUsed(
    db,
    eventId,
    exhibitorCompanyId,
    excludeUserId
  );
  const seatsTotal = license.seats_total;

  if (seatsTotal < 1) {
    return { ok: false, error: "No available seats" };
  }

  if (seatsUsed >= seatsTotal) {
    return { ok: false, error: "No available seats" };
  }

  return {
    ok: true,
    licenseId: license.id,
    seatsUsed,
    seatsTotal,
    seatsRemaining: seatsTotal - seatsUsed,
  };
}

function enforceSeatAvailability(db, eventId, exhibitorCompanyId, excludeUserId) {
  if (!exhibitorCompanyId) {
    return { ok: false, error: "Missing exhibitor company scope" };
  }
  const company = resolveCompanyScopedSeatGrantIfApplicable(
    db,
    exhibitorCompanyId,
    excludeUserId
  );
  if (company !== null) return company;
  return enforceEventScopedSeatAvailabilityOnly(
    db,
    eventId,
    exhibitorCompanyId,
    excludeUserId
  );
}

function evaluateAppAccessGrant(
  db,
  eventId,
  exhibitorCompanyId,
  requestedAppAccess,
  excludeUserId
) {
  if (!requestedAppAccess) {
    return { ok: true, decision: "no_app_access_requested" };
  }
  if (!exhibitorCompanyId) {
    return { ok: false, decision: "denied", error: "Missing exhibitor company scope" };
  }
  const companyGrant = resolveCompanyScopedSeatGrantIfApplicable(
    db,
    exhibitorCompanyId,
    excludeUserId
  );
  if (companyGrant !== null) {
    return {
      ok: true,
      decision: "seats_available",
      licenseId: companyGrant.licenseId,
      seatsUsed: companyGrant.seatsUsed,
      seatsTotal: companyGrant.seatsTotal,
      seatsRemaining: companyGrant.seatsRemaining,
    };
  }
  const seat = enforceEventScopedSeatAvailabilityOnly(
    db,
    eventId,
    exhibitorCompanyId,
    excludeUserId
  );
  if (!seat.ok) {
    return { ok: false, decision: "denied", error: seat.error };
  }
  return {
    ok: true,
    decision: "seats_available",
    licenseId: seat.licenseId,
    seatsUsed: seat.seatsUsed,
    seatsTotal: seat.seatsTotal,
    seatsRemaining: seat.seatsRemaining,
  };
}

function reconcileCompanyLicenseSeatsUsed(db, exhibitorCompanyId) {
  const license = db.licenses.find(
    (l) =>
      (l.scope ?? "event") === "company" &&
      l.exhibitor_company_id === exhibitorCompanyId
  );
  if (!license) return { licenseId: "", seatsUsed: 0 };
  const seatsUsed = countConsumedAppSeatsForCompanyScope(db, exhibitorCompanyId);
  license.seats_used = seatsUsed;
  return { licenseId: license.id, seatsUsed };
}

function reconcile(db, eventId, exhibitorCompanyId) {
  const license = db.licenses.find(
    (l) =>
      l.event_id === eventId &&
      l.exhibitor_company_id === exhibitorCompanyId &&
      (l.scope ?? "event") === "event"
  );
  let licenseId = "";
  let seatsUsed = 0;
  if (license) {
    seatsUsed = getSeatsUsed(db, eventId, exhibitorCompanyId);
    license.seats_used = seatsUsed;
    licenseId = license.id;
  }
  reconcileCompanyLicenseSeatsUsed(db, exhibitorCompanyId);
  return { licenseId, seatsUsed };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("invite succeeds when license active and seats remain", () => {
  const db = createDB();
  db.insertLicense({
    event_id: "evt-1",
    exhibitor_company_id: "co-A",
    seats_total: 3,
  });

  const result = enforceSeatAvailability(db, "evt-1", "co-A");
  assert.equal(result.ok, true);
  assert.equal(result.seatsUsed, 0);
  assert.equal(result.seatsTotal, 3);
});

test("invite blocked when no license exists", () => {
  const db = createDB();
  const result = enforceSeatAvailability(db, "evt-1", "co-A");
  assert.equal(result.ok, false);
  assert.equal(result.error, "No active license for this exhibitor");
});

test("invite blocked when license is not active", () => {
  const db = createDB();
  db.insertLicense({
    event_id: "evt-1",
    exhibitor_company_id: "co-A",
    seats_total: 5,
    status: "expired",
  });

  const result = enforceSeatAvailability(db, "evt-1", "co-A");
  assert.equal(result.ok, false);
  assert.equal(result.error, "No active license for this exhibitor");
});

test("invite blocked when license is expired", () => {
  const db = createDB();
  db.insertLicense({
    event_id: "evt-1",
    exhibitor_company_id: "co-A",
    seats_total: 5,
    status: "active",
    expires_at: "2020-01-01T00:00:00Z",
  });

  const result = enforceSeatAvailability(db, "evt-1", "co-A");
  assert.equal(result.ok, false);
});

test("invite blocked when all seats consumed", () => {
  const db = createDB();
  db.insertLicense({
    event_id: "evt-1",
    exhibitor_company_id: "co-A",
    seats_total: 2,
  });
  db.insertEventUser({
    event_id: "evt-1",
    user_id: "u-1",
    exhibitor_company_id: "co-A",
    permissions: { app: true },
  });
  db.insertEventUser({
    event_id: "evt-1",
    user_id: "u-2",
    exhibitor_company_id: "co-A",
    permissions: { app: true },
  });

  const result = enforceSeatAvailability(db, "evt-1", "co-A");
  assert.equal(result.ok, false);
  assert.equal(result.error, "No available seats");
});

test("seat count ignores event_users without app permission", () => {
  const db = createDB();
  db.insertLicense({
    event_id: "evt-1",
    exhibitor_company_id: "co-A",
    seats_total: 1,
  });
  db.insertEventUser({
    event_id: "evt-1",
    user_id: "u-1",
    exhibitor_company_id: "co-A",
    permissions: { app: false },
  });

  const result = enforceSeatAvailability(db, "evt-1", "co-A");
  assert.equal(result.ok, true);
  assert.equal(result.seatsUsed, 0);
});

test("seat count ignores inactive event_users", () => {
  const db = createDB();
  db.insertLicense({
    event_id: "evt-1",
    exhibitor_company_id: "co-A",
    seats_total: 1,
  });
  db.insertEventUser({
    event_id: "evt-1",
    user_id: "u-1",
    exhibitor_company_id: "co-A",
    status: "invited",
    permissions: { app: true },
  });

  const result = enforceSeatAvailability(db, "evt-1", "co-A");
  assert.equal(result.ok, true);
  assert.equal(result.seatsUsed, 0);
});

test("toggling app access consumes a seat", () => {
  const db = createDB();
  db.insertLicense({
    event_id: "evt-1",
    exhibitor_company_id: "co-A",
    seats_total: 1,
  });
  const eu = db.insertEventUser({
    event_id: "evt-1",
    user_id: "u-1",
    exhibitor_company_id: "co-A",
    permissions: { app: false },
  });

  assert.equal(enforceSeatAvailability(db, "evt-1", "co-A").ok, true);

  db.updateEventUserPermissions("u-1", "evt-1", { app: true });

  const after = enforceSeatAvailability(db, "evt-1", "co-A");
  assert.equal(after.ok, false);
  assert.equal(after.error, "No available seats");
});

test("toggling app access off releases a seat", () => {
  const db = createDB();
  db.insertLicense({
    event_id: "evt-1",
    exhibitor_company_id: "co-A",
    seats_total: 1,
  });
  db.insertEventUser({
    event_id: "evt-1",
    user_id: "u-1",
    exhibitor_company_id: "co-A",
    permissions: { app: true },
  });

  assert.equal(enforceSeatAvailability(db, "evt-1", "co-A").ok, false);

  db.updateEventUserPermissions("u-1", "evt-1", { app: false });

  assert.equal(enforceSeatAvailability(db, "evt-1", "co-A").ok, true);
});

test("duplicate license for same event+exhibitor is prevented", () => {
  const db = createDB();
  db.insertLicense({
    event_id: "evt-1",
    exhibitor_company_id: "co-A",
    seats_total: 5,
  });

  assert.throws(
    () => {
      db.insertLicense({
        event_id: "evt-1",
        exhibitor_company_id: "co-A",
        seats_total: 3,
      });
    },
    /licenses_unique_event_exhibitor/,
    "duplicate (event_id, exhibitor_company_id) must be rejected"
  );
});

test("event isolation: license from event A cannot satisfy event B", () => {
  const db = createDB();
  db.insertLicense({
    event_id: "evt-1",
    exhibitor_company_id: "co-A",
    seats_total: 10,
  });

  const result = enforceSeatAvailability(db, "evt-2", "co-A");
  assert.equal(result.ok, false);
  assert.equal(result.error, "No active license for this exhibitor");
});

test("reconciliation resets seats_used from live event_users", () => {
  const db = createDB();
  db.insertLicense({
    id: "lic-1",
    event_id: "evt-1",
    exhibitor_company_id: "co-A",
    seats_total: 5,
  });
  db.licenses[0].seats_used = 99;

  db.insertEventUser({
    event_id: "evt-1",
    user_id: "u-1",
    exhibitor_company_id: "co-A",
    permissions: { app: true },
  });
  db.insertEventUser({
    event_id: "evt-1",
    user_id: "u-2",
    exhibitor_company_id: "co-A",
    permissions: { app: true },
  });

  const result = reconcile(db, "evt-1", "co-A");
  assert.equal(result.seatsUsed, 2);
  assert.equal(db.licenses[0].seats_used, 2);
});

test("reconciliation returns zero when no app users exist", () => {
  const db = createDB();
  db.insertLicense({
    event_id: "evt-1",
    exhibitor_company_id: "co-A",
    seats_total: 5,
  });
  db.licenses[0].seats_used = 5;

  const result = reconcile(db, "evt-1", "co-A");
  assert.equal(result.seatsUsed, 0);
  assert.equal(db.licenses[0].seats_used, 0);
});

test("excludeUserId allows re-assignment of existing user's seat", () => {
  const db = createDB();
  db.insertLicense({
    event_id: "evt-1",
    exhibitor_company_id: "co-A",
    seats_total: 1,
  });
  db.insertEventUser({
    event_id: "evt-1",
    user_id: "u-1",
    exhibitor_company_id: "co-A",
    permissions: { app: true },
  });

  const withoutExclude = enforceSeatAvailability(db, "evt-1", "co-A");
  assert.equal(withoutExclude.ok, false);

  const withExclude = enforceSeatAvailability(db, "evt-1", "co-A", "u-1");
  assert.equal(withExclude.ok, true);
  assert.equal(withExclude.seatsUsed, 0);
});

test("different exhibitors on same event have independent seat pools", () => {
  const db = createDB();
  db.insertLicense({
    event_id: "evt-1",
    exhibitor_company_id: "co-A",
    seats_total: 1,
  });
  db.insertLicense({
    event_id: "evt-1",
    exhibitor_company_id: "co-B",
    seats_total: 1,
  });

  db.insertEventUser({
    event_id: "evt-1",
    user_id: "u-1",
    exhibitor_company_id: "co-A",
    permissions: { app: true },
  });

  assert.equal(enforceSeatAvailability(db, "evt-1", "co-A").ok, false);
  assert.equal(enforceSeatAvailability(db, "evt-1", "co-B").ok, true);
});

test("deleting event_user releases seat for next invite", () => {
  const db = createDB();
  db.insertLicense({
    event_id: "evt-1",
    exhibitor_company_id: "co-A",
    seats_total: 1,
  });
  db.insertEventUser({
    event_id: "evt-1",
    user_id: "u-1",
    exhibitor_company_id: "co-A",
    permissions: { app: true },
  });

  assert.equal(enforceSeatAvailability(db, "evt-1", "co-A").ok, false);

  db.deleteEventUser("u-1", "evt-1");

  assert.equal(enforceSeatAvailability(db, "evt-1", "co-A").ok, true);
});

test("enforceSeatAvailability returns seatsRemaining in structured result", () => {
  const db = createDB();
  db.insertLicense({
    id: "lic-1",
    event_id: "evt-1",
    exhibitor_company_id: "co-A",
    seats_total: 5,
  });
  db.insertEventUser({
    event_id: "evt-1",
    user_id: "u-1",
    exhibitor_company_id: "co-A",
    permissions: { app: true },
  });
  db.insertEventUser({
    event_id: "evt-1",
    user_id: "u-2",
    exhibitor_company_id: "co-A",
    permissions: { app: true },
  });

  const result = enforceSeatAvailability(db, "evt-1", "co-A");
  assert.equal(result.ok, true);
  assert.equal(result.licenseId, "lic-1");
  assert.equal(result.seatsUsed, 2);
  assert.equal(result.seatsTotal, 5);
  assert.equal(result.seatsRemaining, 3);
});

test("evaluateAppAccessGrant skips seat math when app access not requested", () => {
  const db = createDB();
  assert.equal(
    evaluateAppAccessGrant(db, "evt-1", "co-A", false).decision,
    "no_app_access_requested"
  );
  assert.equal(
    evaluateAppAccessGrant(db, "evt-1", null, false).decision,
    "no_app_access_requested"
  );
});

test("evaluateAppAccessGrant delegates to seat enforcement when app access requested", () => {
  const db = createDB();
  db.insertLicense({
    event_id: "evt-1",
    exhibitor_company_id: "co-A",
    seats_total: 1,
  });
  const grant = evaluateAppAccessGrant(db, "evt-1", "co-A", true);
  assert.equal(grant.ok, true);
  assert.equal(grant.decision, "seats_available");
  assert.equal(grant.seatsRemaining, 1);
});

test("company-scoped license grants access without event-scoped license row", () => {
  const db = createDB();
  db.insertLicense({
    id: "lic-co",
    event_id: "evt-1",
    exhibitor_company_id: "co-A",
    seats_total: 5,
    scope: "company",
  });

  const result = enforceSeatAvailability(db, "evt-1", "co-A");
  assert.equal(result.ok, true);
  assert.equal(result.licenseId, "lic-co");
  assert.equal(result.seatsRemaining, 5);
});

test("event-scoped lookup ignores company license (isolation helper)", () => {
  const db = createDB();
  db.insertLicense({
    event_id: "evt-1",
    exhibitor_company_id: "co-A",
    seats_total: 10,
    scope: "company",
  });

  const result = enforceEventScopedSeatAvailabilityOnly(db, "evt-1", "co-A");
  assert.equal(result.ok, false);
  assert.equal(result.error, "No active license for this exhibitor");
});

test("invite blocked when event license has seats_total zero", () => {
  const db = createDB();
  db.insertLicense({
    event_id: "evt-1",
    exhibitor_company_id: "co-A",
    seats_total: 0,
    scope: "event",
  });

  const result = enforceSeatAvailability(db, "evt-1", "co-A");
  assert.equal(result.ok, false);
  assert.equal(result.error, "No available seats");
});

test("reconcile updates event-scoped and company-scoped caches independently", () => {
  const db = createDB();
  db.insertLicense({
    id: "lic-company",
    event_id: "evt-1",
    exhibitor_company_id: "co-A",
    seats_total: 99,
    scope: "company",
  });
  db.insertLicense({
    id: "lic-event",
    event_id: "evt-1",
    exhibitor_company_id: "co-A",
    seats_total: 5,
    scope: "event",
  });
  db.licenses.find((l) => l.id === "lic-event").seats_used = 0;

  db.insertEventUser({
    event_id: "evt-1",
    user_id: "u-1",
    exhibitor_company_id: "co-A",
    permissions: { app: true },
  });

  const result = reconcile(db, "evt-1", "co-A");
  assert.equal(result.licenseId, "lic-event");
  assert.equal(result.seatsUsed, 1);
  assert.equal(db.licenses.find((l) => l.id === "lic-event").seats_used, 1);
  assert.equal(db.licenses.find((l) => l.id === "lic-company").seats_used, 1);
});

test("full company license falls back to event license when event has capacity", () => {
  const db = createDB();
  db.insertLicense({
    id: "lic-co",
    exhibitor_company_id: "co-A",
    seats_total: 1,
    scope: "company",
    event_id: "evt-1",
  });
  db.insertLicense({
    id: "lic-ev",
    event_id: "evt-1",
    exhibitor_company_id: "co-A",
    seats_total: 3,
    scope: "event",
  });
  db.insertEventUser({
    event_id: "evt-1",
    user_id: "u-1",
    exhibitor_company_id: "co-A",
    permissions: { app: true },
  });
  const result = enforceSeatAvailability(db, "evt-1", "co-A");
  assert.equal(result.ok, true);
  assert.equal(result.licenseId, "lic-ev");
  assert.equal(result.seatsUsed, 1);
  assert.equal(result.seatsRemaining, 2);
});

test("full company license with no event license still denies", () => {
  const db = createDB();
  db.insertLicense({
    id: "lic-co",
    exhibitor_company_id: "co-A",
    seats_total: 1,
    scope: "company",
    event_id: "evt-1",
  });
  db.insertEventUser({
    event_id: "evt-1",
    user_id: "u-1",
    exhibitor_company_id: "co-A",
    permissions: { app: true },
  });
  const result = enforceSeatAvailability(db, "evt-1", "co-A");
  assert.equal(result.ok, false);
  assert.equal(result.error, "No active license for this exhibitor");
});

test("expired company license falls back to event license", () => {
  const db = createDB();
  db.insertLicense({
    id: "lic-co",
    exhibitor_company_id: "co-A",
    seats_total: 10,
    scope: "company",
    event_id: "evt-1",
    expires_at: "2020-01-01T00:00:00Z",
  });
  db.insertLicense({
    id: "lic-ev",
    event_id: "evt-1",
    exhibitor_company_id: "co-A",
    seats_total: 5,
    scope: "event",
  });
  const grant = evaluateAppAccessGrant(db, "evt-1", "co-A", true);
  assert.equal(grant.ok, true);
  assert.equal(grant.licenseId, "lic-ev");
});

test("inactive company license falls back to event license", () => {
  const db = createDB();
  db.insertLicense({
    id: "lic-co",
    exhibitor_company_id: "co-A",
    seats_total: 10,
    scope: "company",
    event_id: "evt-1",
    status: "expired",
  });
  db.insertLicense({
    id: "lic-ev",
    event_id: "evt-1",
    exhibitor_company_id: "co-A",
    seats_total: 5,
    scope: "event",
  });
  const grant = evaluateAppAccessGrant(db, "evt-1", "co-A", true);
  assert.equal(grant.ok, true);
  assert.equal(grant.licenseId, "lic-ev");
});

test("no company license falls back to event license", () => {
  const db = createDB();
  db.insertLicense({
    id: "lic-ev",
    event_id: "evt-1",
    exhibitor_company_id: "co-A",
    seats_total: 2,
    scope: "event",
  });
  const grant = evaluateAppAccessGrant(db, "evt-1", "co-A", true);
  assert.equal(grant.ok, true);
  assert.equal(grant.licenseId, "lic-ev");
});

test("valid company license wins over valid event license", () => {
  const db = createDB();
  db.insertLicense({
    id: "lic-co",
    exhibitor_company_id: "co-A",
    seats_total: 5,
    scope: "company",
    event_id: "evt-1",
  });
  db.insertLicense({
    id: "lic-ev",
    event_id: "evt-1",
    exhibitor_company_id: "co-A",
    seats_total: 1,
    scope: "event",
  });
  db.insertEventUser({
    event_id: "evt-1",
    user_id: "u-1",
    exhibitor_company_id: "co-A",
    permissions: { app: true },
  });
  const grant = evaluateAppAccessGrant(db, "evt-1", "co-A", true);
  assert.equal(grant.ok, true);
  assert.equal(grant.licenseId, "lic-co");
  assert.equal(grant.seatsRemaining, 4);
});

test("company scope counts one distinct seat for same user on two events; full company falls back to event", () => {
  const db = createDB();
  db.insertLicense({
    id: "lic-co",
    exhibitor_company_id: "co-A",
    seats_total: 1,
    scope: "company",
    event_id: "evt-1",
  });
  db.insertLicense({
    id: "lic-ev2",
    event_id: "evt-2",
    exhibitor_company_id: "co-A",
    seats_total: 2,
    scope: "event",
  });
  db.insertEventUser({
    event_id: "evt-1",
    user_id: "u-1",
    exhibitor_company_id: "co-A",
    permissions: { app: true },
  });
  db.insertEventUser({
    event_id: "evt-2",
    user_id: "u-1",
    exhibitor_company_id: "co-A",
    permissions: { app: true },
  });
  assert.equal(countConsumedAppSeatsForCompanyScope(db, "co-A"), 1);
  const result = enforceSeatAvailability(db, "evt-2", "co-A");
  assert.equal(result.ok, true);
  assert.equal(result.licenseId, "lic-ev2");
  assert.equal(result.seatsUsed, 1);
  assert.equal(result.seatsRemaining, 1);
});

test("same enforceSeatAvailability function works for platform admin and exhibitor admin scenarios", () => {
  const db = createDB();
  db.insertLicense({
    event_id: "evt-1",
    exhibitor_company_id: "co-A",
    seats_total: 2,
  });

  const platformAdminCheck = enforceSeatAvailability(db, "evt-1", "co-A");
  assert.equal(platformAdminCheck.ok, true);

  db.insertEventUser({
    event_id: "evt-1",
    user_id: "u-1",
    exhibitor_company_id: "co-A",
    permissions: { app: true },
  });

  const exhibitorAdminCheck = enforceSeatAvailability(db, "evt-1", "co-A");
  assert.equal(exhibitorAdminCheck.ok, true);
  assert.equal(exhibitorAdminCheck.seatsRemaining, 1);

  db.insertEventUser({
    event_id: "evt-1",
    user_id: "u-2",
    exhibitor_company_id: "co-A",
    permissions: { app: true },
  });

  const bothFullCheck = enforceSeatAvailability(db, "evt-1", "co-A");
  assert.equal(bothFullCheck.ok, false);
  assert.equal(bothFullCheck.error, "No available seats");
});
