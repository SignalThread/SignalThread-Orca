import assert from "node:assert/strict";
import test from "node:test";
import {
  sendEmailWithDependencies,
  type EmailSendDependencies
} from "../lib/integrations/email/send-core";
import type { EmailActivity } from "../lib/integrations/email/types";

const KEY = "10000000-0000-4000-8000-000000000001";
const activity: EmailActivity = {
  id: "activity-1",
  companyId: "company-1",
  eventId: "event-1",
  leadId: "lead-1",
  documentId: null,
  provider: "google_workspace",
  providerConnectionId: "connection-1",
  actingUserId: "user-1",
  recipientEmail: "lead@example.com",
  idempotencyKey: KEY,
  providerMessageId: null,
  providerThreadId: null,
  status: "pending",
  safeErrorCategory: null,
  providerHttpStatus: null,
  retryAfterSeconds: null,
  createdAt: "2026-07-31T12:00:00.000Z",
  sentAt: null,
  failedAt: null
};

function deps(overrides: Partial<EmailSendDependencies> = {}): EmailSendDependencies {
  return {
    loadLead: async () => ({ id: "lead-1", companyId: "company-1", eventId: "event-1", email: "lead@example.com" }),
    canWriteLead: async () => true,
    resolveProvider: async () => ({
      ok: true,
      source: "only_healthy",
      connection: { id: "connection-1", provider: "google_workspace", senderEmail: "sender@example.com", senderName: "Sender" }
    }),
    claimActivity: async () => ({ claimed: true, activity }),
    reclaimFailedActivity: async () => ({ ...activity, status: "pending", safeErrorCategory: null }),
    sendMessage: async () => ({ ok: true, providerMessageId: "gmail-1", providerThreadId: "thread-1", status: 200 }),
    updateActivity: async (update) => ({
      ...activity,
      status: update.status,
      safeErrorCategory: update.safeErrorCategory,
      providerMessageId: update.providerMessageId ?? null,
      providerThreadId: update.providerThreadId ?? null,
      providerHttpStatus: update.providerHttpStatus ?? null,
      retryAfterSeconds: update.retryAfterSeconds ?? null,
      sentAt: update.status === "sent" ? "2026-07-31T12:01:00.000Z" : null,
      failedAt: update.status === "failed" || update.status === "unknown" ? "2026-07-31T12:01:00.000Z" : null
    }),
    ...overrides
  };
}

const input = (overrides: Partial<{
  userId: string;
  companyId: string;
  leadId: string;
  idempotencyKey: string;
  subject: string;
  body: string;
  providerOverride: "google_workspace" | "microsoft_365";
}> = {}) => ({
  userId: "user-1",
  companyId: "company-1",
  leadId: "lead-1",
  idempotencyKey: KEY,
  subject: "Following up",
  body: "Hello from the show.",
  ...overrides
});

test("canonical send scopes the lead, locks the recipient, claims before provider, and persists IDs", async () => {
  const order: string[] = [];
  let recipient = "";
  const result = await sendEmailWithDependencies(deps({
    claimActivity: async (claim) => {
      order.push("claim");
      recipient = claim.recipientEmail;
      assert.equal("subject" in claim, false);
      return { claimed: true, activity: { ...activity, recipientEmail: claim.recipientEmail } };
    },
    sendMessage: async (message) => {
      order.push("send");
      assert.equal(message.recipientEmail, "Locked@Example.com");
      return { ok: true, providerMessageId: "gmail-1", providerThreadId: "thread-1", status: 200 };
    },
    loadLead: async () => ({ id: "lead-1", companyId: "company-1", eventId: "event-1", email: "Locked@Example.com" })
  }), input());
  assert.deepEqual(order, ["claim", "send"]);
  assert.equal(recipient, "Locked@Example.com");
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.providerMessageId, "gmail-1");
  assert.equal(result.ok && result.providerThreadId, "thread-1");
});

test("missing email, viewer, and cross-company lead stop before side effects", async () => {
  let effects = 0;
  const sideEffects = {
    claimActivity: async () => { effects += 1; return { claimed: true as const, activity }; },
    sendMessage: async () => { effects += 1; return { ok: true as const, providerMessageId: null, providerThreadId: null, status: 202 }; }
  };
  assert.equal((await sendEmailWithDependencies(deps({ ...sideEffects, loadLead: async () => ({ id: "lead-1", companyId: "company-1", eventId: null, email: null }) }), input())).outcome, "missing_email");
  assert.equal((await sendEmailWithDependencies(deps({ ...sideEffects, canWriteLead: async () => false }), input())).outcome, "unauthorized");
  assert.equal((await sendEmailWithDependencies(deps({ ...sideEffects, loadLead: async () => null }), input())).outcome, "lead_not_found");
  assert.equal(effects, 0);
});

test("provider selection failures never claim or send", async () => {
  for (const outcome of ["missing_connection", "reconnect_required", "provider_selection_required"] as const) {
    let effects = 0;
    const result = await sendEmailWithDependencies(deps({
      resolveProvider: async () => ({ ok: false, outcome }),
      claimActivity: async () => { effects += 1; return { claimed: true, activity }; },
      sendMessage: async () => { effects += 1; return { ok: true, providerMessageId: null, providerThreadId: null, status: 202 }; }
    }), input());
    assert.equal(result.outcome, outcome);
    assert.equal(effects, 0);
  }
});

test("the canonical send passes a one-time override to the server resolver without persisting it", async () => {
  let providerOverride: string | undefined;
  const microsoftActivity = {
    ...activity,
    provider: "microsoft_365" as const,
    providerConnectionId: "ms-1"
  };
  const result = await sendEmailWithDependencies(deps({
    resolveProvider: async (_userId, _companyId, requestedProvider) => {
      providerOverride = requestedProvider;
      return {
        ok: true,
        source: "override",
        connection: {
          id: "ms-1",
          provider: "microsoft_365",
          senderEmail: "sender@outlook.test",
          senderName: null
        }
      };
    },
    claimActivity: async () => ({ claimed: true, activity: microsoftActivity }),
    updateActivity: async (update) => ({
      ...microsoftActivity,
      status: update.status,
      safeErrorCategory: update.safeErrorCategory,
      providerMessageId: update.providerMessageId ?? null,
      providerThreadId: update.providerThreadId ?? null,
      providerHttpStatus: update.providerHttpStatus ?? null,
      retryAfterSeconds: update.retryAfterSeconds ?? null,
      sentAt: update.status === "sent" ? "2026-07-31T12:01:00.000Z" : null,
      failedAt: null
    })
  }), input({ providerOverride: "microsoft_365" }));
  assert.equal(result.ok && result.provider, "microsoft_365");
  assert.equal(providerOverride, "microsoft_365");
});

test("duplicate sent returns prior success without provider call", async () => {
  let sends = 0;
  const existing = { ...activity, status: "sent" as const, providerMessageId: "existing" };
  const result = await sendEmailWithDependencies(deps({
    claimActivity: async () => ({ claimed: false, activity: existing }),
    sendMessage: async () => { sends += 1; return { ok: true, providerMessageId: "new", providerThreadId: null, status: 200 }; }
  }), input());
  assert.equal(result.ok, true);
  assert.equal(result.outcome, "duplicate");
  assert.equal(result.ok && result.providerMessageId, "existing");
  assert.equal(sends, 0);
});

test("pending and unknown activities are never resent", async () => {
  for (const status of ["pending", "unknown"] as const) {
    let sends = 0;
    const result = await sendEmailWithDependencies(deps({
      claimActivity: async () => ({ claimed: false, activity: { ...activity, status } }),
      sendMessage: async () => { sends += 1; return { ok: true, providerMessageId: null, providerThreadId: null, status: 202 }; }
    }), input());
    assert.equal(result.outcome, "unknown");
    assert.equal(sends, 0);
  }
});

test("failed activity is reclaimed atomically and provider cannot change", async () => {
  const failed = { ...activity, status: "failed" as const, safeErrorCategory: "provider_unavailable" as const };
  let sends = 0;
  const retried = await sendEmailWithDependencies(deps({
    claimActivity: async () => ({ claimed: false, activity: failed }),
    sendMessage: async () => { sends += 1; return { ok: true, providerMessageId: "retry", providerThreadId: null, status: 200 }; }
  }), input());
  assert.equal(retried.ok, true);
  assert.equal(sends, 1);

  sends = 0;
  let reclaims = 0;
  const changed = await sendEmailWithDependencies(deps({
    resolveProvider: async (_userId, _companyId, providerOverride) => {
      assert.equal(providerOverride, "microsoft_365");
      return { ok: true, source: "override", connection: { id: "ms-1", provider: "microsoft_365", senderEmail: "sender@outlook.test", senderName: null } };
    },
    claimActivity: async () => ({ claimed: false, activity: failed }),
    reclaimFailedActivity: async () => { reclaims += 1; return { ...failed, status: "pending" }; },
    sendMessage: async () => { sends += 1; return { ok: true, providerMessageId: null, providerThreadId: null, status: 202 }; }
  }), input({ providerOverride: "microsoft_365" }));
  assert.equal(changed.outcome, "unknown");
  assert.equal(reclaims, 0);
  assert.equal(sends, 0);
});

test("Microsoft 202 succeeds with nullable provider IDs", async () => {
  const microsoftActivity = { ...activity, provider: "microsoft_365" as const, providerConnectionId: "ms-1" };
  const result = await sendEmailWithDependencies(deps({
    resolveProvider: async () => ({ ok: true, source: "only_healthy", connection: { id: "ms-1", provider: "microsoft_365", senderEmail: "sender@outlook.test", senderName: null } }),
    claimActivity: async () => ({ claimed: true, activity: microsoftActivity }),
    sendMessage: async () => ({ ok: true, providerMessageId: null, providerThreadId: null, status: 202 }),
    updateActivity: async (update) => ({ ...microsoftActivity, status: update.status, safeErrorCategory: update.safeErrorCategory, providerHttpStatus: 202, providerMessageId: null, providerThreadId: null, sentAt: "2026-07-31T12:01:00.000Z" })
  }), input());
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.provider, "microsoft_365");
  assert.equal(result.ok && result.providerMessageId, null);
});

test("network uncertainty becomes unknown and is persisted without content", async () => {
  let persisted: Record<string, unknown> | null = null;
  const result = await sendEmailWithDependencies(deps({
    sendMessage: async () => ({ ok: false, outcome: "unknown", category: "unknown_outcome", status: null }),
    updateActivity: async (update) => {
      persisted = update;
      return { ...activity, status: "unknown", safeErrorCategory: "unknown_outcome" };
    }
  }), input());
  assert.equal(result.outcome, "unknown");
  assert.equal(JSON.stringify(persisted).includes("Hello from the show"), false);
});

test("provider acceptance plus persistence failure becomes unknown", async () => {
  let updates = 0;
  const result = await sendEmailWithDependencies(deps({
    updateActivity: async (update) => {
      updates += 1;
      if (update.status === "sent") throw new Error("write failed");
      return { ...activity, status: "unknown", safeErrorCategory: "persistence_failure", providerMessageId: update.providerMessageId ?? null };
    }
  }), input());
  assert.equal(result.outcome, "unknown");
  assert.equal(result.activity?.safeErrorCategory, "persistence_failure");
  assert.equal(updates, 2);
});

test("failed provider call never creates false sent activity", async () => {
  let status = "";
  const result = await sendEmailWithDependencies(deps({
    sendMessage: async () => ({ ok: false, outcome: "failed", category: "provider_permission_denied", status: 403 }),
    updateActivity: async (update) => {
      status = update.status;
      return { ...activity, status: update.status, safeErrorCategory: update.safeErrorCategory, providerHttpStatus: 403 };
    }
  }), input());
  assert.equal(result.ok, false);
  assert.equal(status, "failed");
});

test("a selected provider failure never resolves or sends through an alternate provider", async () => {
  const microsoftActivity = {
    ...activity,
    provider: "microsoft_365" as const,
    providerConnectionId: "ms-1"
  };
  let resolutions = 0;
  const sends: string[] = [];
  const result = await sendEmailWithDependencies(deps({
    resolveProvider: async () => {
      resolutions += 1;
      return {
        ok: true,
        source: "only_healthy",
        connection: {
          id: "ms-1",
          provider: "microsoft_365",
          senderEmail: "sender@outlook.test",
          senderName: null
        }
      };
    },
    claimActivity: async () => ({ claimed: true, activity: microsoftActivity }),
    sendMessage: async ({ connection }) => {
      sends.push(connection.provider);
      return {
        ok: false,
        outcome: "failed",
        category: "provider_permission_denied",
        status: 403
      };
    },
    updateActivity: async (update) => ({
      ...microsoftActivity,
      status: update.status,
      safeErrorCategory: update.safeErrorCategory
    })
  }), input());
  assert.equal(result.ok, false);
  assert.equal(result.outcome, "failed");
  assert.equal(resolutions, 1);
  assert.deepEqual(sends, ["microsoft_365"]);
});
