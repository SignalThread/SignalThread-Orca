import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { NextRequest } from "next/server";
import { EventMemberRole } from "@prisma/client";
import { createAttentionGetHandler } from "@/app/api/events/[eventId]/ai-workspace/attention/route";
import { createQuestionContextPostHandler } from "@/app/api/events/[eventId]/ai-workspace/question-context/route";
import {
  createPlannerFixtureHarness,
  hasPlannerTestDatabaseUrl,
  type PlannerFixtureHarness,
} from "@/lib/test-harness/planner-fixtures";
import type { EventAccessUser } from "@/lib/event-access";

function createHarnessOrSkip(t: TestContext): PlannerFixtureHarness | null {
  if (!hasPlannerTestDatabaseUrl()) {
    t.skip("DATABASE_URL is not configured for authenticated route integration tests.");
    return null;
  }
  return createPlannerFixtureHarness({ runLabel: `ai-question-context-${randomUUID().slice(0, 8)}` });
}

function request(eventId: string, body: string): NextRequest {
  return new NextRequest(`http://localhost/api/events/${eventId}/ai-workspace/question-context`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

function attentionRequest(eventId: string): NextRequest {
  return new NextRequest(`http://localhost/api/events/${eventId}/ai-workspace/attention`);
}

function handlerFor(user: EventAccessUser) {
  return createQuestionContextPostHandler({
    resolveUser: async () => ({ user }),
  });
}

function attentionHandlerFor(user: EventAccessUser) {
  return createAttentionGetHandler({
    resolveUser: async () => ({ user }),
  });
}

async function call(
  handler: ReturnType<typeof createQuestionContextPostHandler>,
  eventId: string,
  body: string,
) {
  return handler(request(eventId, body), { params: Promise.resolve({ eventId }) });
}

async function callAttention(
  handler: ReturnType<typeof createAttentionGetHandler>,
  eventId: string,
) {
  return handler(attentionRequest(eventId), { params: Promise.resolve({ eventId }) });
}

test("authenticated question-context route enforces access, isolation, validation, and safe errors", async (t) => {
  const harness = createHarnessOrSkip(t);
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const eventA = roles.event;
    const eventB = await harness.createEvent({
      orgId: roles.organization.id,
      createdByUserId: roles.owner.user.id,
      name: "Second Event",
      timezone: "America/Los_Angeles",
    });
    await harness.createEventMember({
      eventId: eventB.id,
      userId: roles.member.user.id,
      eventRole: EventMemberRole.EVENT_EDITOR,
    });
    const eventC = await harness.createEvent({
      orgId: roles.unrelatedOtherOrgMember.user.orgId,
      createdByUserId: roles.unrelatedOtherOrgMember.user.id,
      name: "Other Organization Event",
      timezone: "UTC",
    });

    const sessionA = await harness.createMatrixRow({ eventId: eventA.id, sessionName: "Identical Session", roomId: null });
    const sessionB = await harness.createMatrixRow({ eventId: eventB.id, sessionName: "Identical Session", roomId: null });
    const sessionC = await harness.createMatrixRow({ eventId: eventC.id, sessionName: "Identical Session", roomId: null });

    const authorizedAttention = attentionHandlerFor(roles.member.accessUser);
    const attentionSuccess = await callAttention(authorizedAttention, eventA.id);
    assert.equal(attentionSuccess.status, 200);
    const attentionBody = await attentionSuccess.json();
    assert.equal(attentionBody.eventId, eventA.id);
    assert.ok(attentionBody.findings.every((finding: { eventId: string }) => finding.eventId === eventA.id));
    assert.equal((await callAttention(attentionHandlerFor(roles.eventViewer.accessUser), eventA.id)).status, 200);

    const unauthenticatedAttention = createAttentionGetHandler({
      resolveUser: async () => ({ error: { status: 401, reason: "UNAUTHENTICATED", hint: "Sign in" } }),
    });
    assert.equal((await callAttention(unauthenticatedAttention, eventA.id)).status, 401);
    assert.equal((await callAttention(attentionHandlerFor(roles.unrelatedSameOrgMember.accessUser), eventA.id)).status, 403);
    const crossOrgAttention = await callAttention(authorizedAttention, eventC.id);
    assert.equal(crossOrgAttention.status, 403);
    assert.equal(JSON.stringify(await crossOrgAttention.json()).includes(sessionC.id), false);
    assert.equal((await callAttention(attentionHandlerFor(roles.owner.accessUser), randomUUID())).status, 404);
    assert.equal((await callAttention(authorizedAttention, "not-a-uuid")).status, 400);

    const failedAttention = createAttentionGetHandler({
      resolveUser: async () => ({ user: roles.member.accessUser }),
      retrieveAttention: async () => {
        throw new Error("secret attention database detail");
      },
    });
    const attentionFailure = await callAttention(failedAttention, eventA.id);
    assert.equal(attentionFailure.status, 500);
    const attentionFailureText = JSON.stringify(await attentionFailure.json());
    assert.equal(attentionFailureText.includes("secret attention database detail"), false);
    assert.equal(attentionFailureText.includes("stack"), false);

    const authorized = handlerFor(roles.member.accessUser);
    const success = await call(authorized, eventA.id, JSON.stringify({ question: "Which sessions are at greatest risk?" }));
    assert.equal(success.status, 200);
    const successBody = await success.json();
    assert.equal(successBody.eventId, eventA.id);
    assert.equal(successBody.intent, "session_risk");
    assert.equal(successBody.support, "supported");
    assert.ok(successBody.attentionFindings.length <= 50);
    assert.ok(successBody.attentionFindings.every((finding: { eventId: string }) => finding.eventId === eventA.id));
    assert.ok(successBody.sources.every((source: { entityId: string; route?: string }) =>
      source.entityId !== sessionB.id &&
      source.entityId !== sessionC.id &&
      (!source.route || source.route.includes(`/events/${eventA.id}/`)),
    ));
    assert.ok(successBody.sources.some((source: { entityId: string }) => source.entityId === sessionA.id));

    const fnbStatus = await call(authorized, eventA.id, JSON.stringify({ question: "What sessions do now have food selected?" }));
    assert.equal(fnbStatus.status, 200);
    const fnbStatusBody = await fnbStatus.json();
    assert.equal(fnbStatusBody.intent, "session_fnb_selected");
    assert.equal(fnbStatusBody.support, "supported");
    assert.equal(typeof fnbStatusBody.resultSummary, "string");
    assert.ok(Array.isArray(fnbStatusBody.sessions));
    assert.equal(typeof fnbStatusBody.facts.sessionsWithFnbSelected, "number");
    assert.equal(typeof fnbStatusBody.facts.sessionsWithoutFnbSelected, "number");
    assert.equal(typeof fnbStatusBody.facts.sessionsWithFnbUnavailable, "number");
    assert.equal(typeof fnbStatusBody.facts.sessionsNotRequiringFnb, "number");
    assert.ok(fnbStatusBody.sessions.every((session: { sessionId: string; route: string }) =>
      session.sessionId !== sessionB.id &&
      session.sessionId !== sessionC.id &&
      session.route.includes(`/events/${eventA.id}/`),
    ));

    const unsupported = await call(authorized, eventA.id, JSON.stringify({ question: "Who should cater this event?" }));
    assert.equal(unsupported.status, 200);
    const unsupportedBody = await unsupported.json();
    assert.equal(unsupportedBody.support, "unsupported");
    assert.deepEqual(unsupportedBody.attentionFindings, []);
    assert.deepEqual(unsupportedBody.sources, []);

    const partial = await call(authorized, eventA.id, JSON.stringify({ question: "What information is still missing?" }));
    assert.equal(partial.status, 200);
    const partialBody = await partial.json();
    assert.equal(partialBody.support, "partial");
    assert.ok(partialBody.limitations.length > 0);

    const unauthenticated = createQuestionContextPostHandler({
      resolveUser: async () => ({ error: { status: 401, reason: "UNAUTHENTICATED", hint: "Sign in" } }),
    });
    assert.equal((await call(unauthenticated, eventA.id, JSON.stringify({ question: "Why is this event showing warnings?" }))).status, 401);

    const sameOrgNoAccess = handlerFor(roles.unrelatedSameOrgMember.accessUser);
    assert.equal((await call(sameOrgNoAccess, eventA.id, JSON.stringify({ question: "Why is this event showing warnings?" }))).status, 403);

    const crossOrganization = handlerFor(roles.member.accessUser);
    const crossOrgResponse = await call(crossOrganization, eventC.id, JSON.stringify({ question: "Which sessions are at greatest risk?" }));
    assert.equal(crossOrgResponse.status, 403);
    assert.equal(JSON.stringify(await crossOrgResponse.json()).includes(sessionC.id), false);

    const missingEvent = await call(handlerFor(roles.owner.accessUser), randomUUID(), JSON.stringify({ question: "Why is this event showing warnings?" }));
    assert.equal(missingEvent.status, 404);

    for (const body of [
      "{}",
      JSON.stringify({ question: "" }),
      JSON.stringify({ question: "   " }),
      JSON.stringify({ question: "x".repeat(1001) }),
      "{not-json",
    ]) {
      assert.equal((await call(authorized, eventA.id, body)).status, 400);
    }

    const failed = createQuestionContextPostHandler({
      resolveUser: async () => ({ user: roles.member.accessUser }),
      retrieveContext: async () => {
        throw new Error("secret prisma connection detail");
      },
    });
    const failureResponse = await call(failed, eventA.id, JSON.stringify({ question: "What should I focus on today?" }));
    assert.equal(failureResponse.status, 500);
    const failureText = JSON.stringify(await failureResponse.json());
    assert.equal(failureText.includes("secret prisma connection detail"), false);
    assert.equal(failureText.includes("stack"), false);
  } finally {
    await harness.cleanup();
  }
});
