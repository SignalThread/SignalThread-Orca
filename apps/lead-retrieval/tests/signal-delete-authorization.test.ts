import assert from "node:assert/strict";
import test from "node:test";
import { authorizeSignalDelete } from "../lib/signals/signal-delete-authorization";

const exhibitorAdmin = {
  id: "user-1",
  role: "exhibitor_admin" as const,
  company_id: "company-1"
};

test("authorized exhibitor admin can delete a non-default company Campaign Agent", () => {
  const result = authorizeSignalDelete({
    sessionUser: exhibitorAdmin,
    signal: {
      signal_scope: "company",
      company_id: "company-1",
      event_id: null,
      owner_user_id: "user-1",
      source_signal_id: null
    }
  });

  assert.deepEqual(result, { ok: true });
});

test("authorized exhibitor admin can delete an event Campaign Agent inside the active event scope", () => {
  const result = authorizeSignalDelete({
    sessionUser: exhibitorAdmin,
    signal: {
      signal_scope: "event",
      company_id: "company-1",
      event_id: "event-1",
      owner_user_id: null,
      source_signal_id: null
    },
    eventContext: {
      companyId: "company-1",
      eventId: "event-1",
      eventArchived: false
    }
  });

  assert.deepEqual(result, { ok: true });
});

test("default and default-derived Campaign Agents cannot be deleted", () => {
  const defaultResult = authorizeSignalDelete({
    sessionUser: exhibitorAdmin,
    signal: {
      signal_scope: "default",
      company_id: null,
      event_id: null,
      owner_user_id: null,
      source_signal_id: null
    }
  });
  assert.equal(defaultResult.ok, false);
  if (!defaultResult.ok) {
    assert.equal(defaultResult.status, 403);
    assert.match(defaultResult.error, /Default Campaign Agents/);
  }

  const derivedResult = authorizeSignalDelete({
    sessionUser: exhibitorAdmin,
    signal: {
      signal_scope: "event",
      company_id: "company-1",
      event_id: "event-1",
      owner_user_id: null,
      source_signal_id: "default-source-1"
    },
    eventContext: {
      companyId: "company-1",
      eventId: "event-1",
      eventArchived: false
    }
  });
  assert.equal(derivedResult.ok, false);
  if (!derivedResult.ok) {
    assert.equal(derivedResult.status, 403);
    assert.match(derivedResult.error, /Default Campaign Agents/);
  }
});

test("event and private Campaign Agent deletes remain scoped to event and owner", () => {
  const wrongEvent = authorizeSignalDelete({
    sessionUser: exhibitorAdmin,
    signal: {
      signal_scope: "event",
      company_id: "company-1",
      event_id: "event-2",
      owner_user_id: null,
      source_signal_id: null
    },
    eventContext: {
      companyId: "company-1",
      eventId: "event-1",
      eventArchived: false
    }
  });
  assert.equal(wrongEvent.ok, false);

  const otherPrivateOwner = authorizeSignalDelete({
    sessionUser: exhibitorAdmin,
    signal: {
      signal_scope: "private",
      company_id: "company-1",
      event_id: "event-1",
      owner_user_id: "user-2",
      source_signal_id: null
    },
    eventContext: {
      companyId: "company-1",
      eventId: "event-1",
      eventArchived: false
    }
  });
  assert.equal(otherPrivateOwner.ok, false);
});
