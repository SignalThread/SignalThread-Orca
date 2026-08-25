import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { UserRole } from "@prisma/client";
import { createExecutiveBriefingGetHandler } from "@/app/api/events/[eventId]/ai-workspace/executive-briefing/route";
import { EventCommandCenterServiceError, type EventCommandCenterPayload } from "@/src/server/services/event-command-center";
import type { ExecutiveBriefing } from "@/lib/executive-briefing";

const EVENT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_EVENT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const briefing: ExecutiveBriefing = {
  event: { id: EVENT_ID, name: "Leadership Summit" },
  dataAsOf: "2026-08-11T14:00:00.000Z",
  freshness: "current",
  generation: { mode: "deterministic_fallback", status: "unavailable", message: "Canonical fallback." },
  facts: [{ id: "fact", title: "Fact", detail: "Grounded detail", severity: "warning", evidence: { id: "evidence", label: "Readiness", href: `/events/${EVENT_ID}/matrix` } }],
  recommendations: [{ id: "recommendation", title: "Review readiness", reason: "Grounded", priority: "medium", href: `/events/${EVENT_ID}/matrix`, evidenceIds: ["evidence"], actionMode: "view_only" }],
  unavailableSources: [],
};

const user = { id: "user-1", email: "viewer@example.com", name: "Viewer", orgId: "org-1", role: UserRole.MEMBER };

test("briefing route is authenticated, event scoped, and private/no-store", async () => {
  let receivedEventId = "";
  const handler = createExecutiveBriefingGetHandler({
    resolveUser: async () => ({ user }),
    retrieveCommandCenter: async (eventId, requestUser) => {
      receivedEventId = eventId;
      assert.equal(requestUser?.id, user.id);
      return { event: { executiveBriefing: briefing } } as unknown as EventCommandCenterPayload;
    },
  });
  const response = await handler(new NextRequest(`http://localhost/api/events/${EVENT_ID}/ai-workspace/executive-briefing`), { params: Promise.resolve({ eventId: EVENT_ID }) });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(receivedEventId, EVENT_ID);
  assert.deepEqual(await response.json(), briefing);
});

test("briefing route preserves authorization failures and never returns another event", async () => {
  const handler = createExecutiveBriefingGetHandler({
    resolveUser: async () => ({ user }),
    retrieveCommandCenter: async (eventId) => {
      assert.equal(eventId, OTHER_EVENT_ID);
      throw new EventCommandCenterServiceError("Event is outside the active organization scope", 403);
    },
  });
  const response = await handler(new NextRequest(`http://localhost/api/events/${OTHER_EVENT_ID}/ai-workspace/executive-briefing`), { params: Promise.resolve({ eventId: OTHER_EVENT_ID }) });
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "Event is outside the active organization scope" });
});

test("briefing route rejects invalid event identifiers before retrieval", async () => {
  let called = false;
  const handler = createExecutiveBriefingGetHandler({
    resolveUser: async () => ({ user }),
    retrieveCommandCenter: async () => { called = true; throw new Error("must not run"); },
  });
  const response = await handler(new NextRequest("http://localhost/api/events/not-an-id/ai-workspace/executive-briefing"), { params: Promise.resolve({ eventId: "not-an-id" }) });
  assert.equal(response.status, 400);
  assert.equal(called, false);
});
