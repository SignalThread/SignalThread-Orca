import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  filterEligibleTemplatesForLead,
  isTemplateEligibleForLead
} from "../lib/workflows/emit/trigger-resolver";

const EVENT_A = "11111111-1111-1111-1111-111111111111";
const EVENT_B = "22222222-2222-2222-2222-222222222222";

describe("trigger-resolver: isTemplateEligibleForLead", () => {
  it("scope=any matches every container kind, including null", () => {
    const t = { scope: "any" as const, event_id: null };
    assert.equal(isTemplateEligibleForLead(t, { eventId: null, containerKind: null }), true);
    assert.equal(isTemplateEligibleForLead(t, { eventId: EVENT_A, containerKind: "event" }), true);
    assert.equal(
      isTemplateEligibleForLead(t, { eventId: EVENT_A, containerKind: "continuous_capture" }),
      true
    );
  });

  it("scope=event only matches finite event leads, never null containers", () => {
    const t = { scope: "event" as const, event_id: null };
    assert.equal(isTemplateEligibleForLead(t, { eventId: EVENT_A, containerKind: "event" }), true);
    assert.equal(
      isTemplateEligibleForLead(t, { eventId: EVENT_A, containerKind: "continuous_capture" }),
      false
    );
    assert.equal(isTemplateEligibleForLead(t, { eventId: null, containerKind: null }), false);
  });

  it("scope=continuous_capture matches CC bucket leads AND null-container leads", () => {
    const t = { scope: "continuous_capture" as const, event_id: null };
    assert.equal(
      isTemplateEligibleForLead(t, { eventId: EVENT_A, containerKind: "continuous_capture" }),
      true
    );
    assert.equal(isTemplateEligibleForLead(t, { eventId: null, containerKind: null }), true);
    assert.equal(isTemplateEligibleForLead(t, { eventId: EVENT_A, containerKind: "event" }), false);
  });

  it("event_id pin restricts to that exact event", () => {
    const t = { scope: "event" as const, event_id: EVENT_A };
    assert.equal(isTemplateEligibleForLead(t, { eventId: EVENT_A, containerKind: "event" }), true);
    assert.equal(isTemplateEligibleForLead(t, { eventId: EVENT_B, containerKind: "event" }), false);
  });

  it("production-shaped event-scoped workflow matches a lead in the same event container", () => {
    const template = {
      scope: "event" as const,
      event_id: "9375c363-83ef-4da4-9f73-8021507c5ded"
    };

    assert.equal(
      isTemplateEligibleForLead(template, {
        eventId: "9375c363-83ef-4da4-9f73-8021507c5ded",
        containerKind: "event"
      }),
      true
    );
  });

  it("event_id pin still requires the scope check to pass", () => {
    const t = { scope: "continuous_capture" as const, event_id: EVENT_A };
    assert.equal(isTemplateEligibleForLead(t, { eventId: EVENT_A, containerKind: "event" }), false);
    assert.equal(
      isTemplateEligibleForLead(t, { eventId: EVENT_A, containerKind: "continuous_capture" }),
      true
    );
  });
});

describe("trigger-resolver: filterEligibleTemplatesForLead", () => {
  it("returns only matching templates and preserves input order", () => {
    const templates = [
      { id: "t1", scope: "any" as const, event_id: null },
      { id: "t2", scope: "event" as const, event_id: null },
      { id: "t3", scope: "continuous_capture" as const, event_id: null },
      { id: "t4", scope: "event" as const, event_id: EVENT_B }
    ];

    const eligibleForCC = filterEligibleTemplatesForLead(templates, {
      eventId: EVENT_A,
      containerKind: "continuous_capture"
    });
    assert.deepEqual(eligibleForCC.map((t) => t.id), ["t1", "t3"]);

    const eligibleForEventA = filterEligibleTemplatesForLead(templates, {
      eventId: EVENT_A,
      containerKind: "event"
    });
    assert.deepEqual(eligibleForEventA.map((t) => t.id), ["t1", "t2"]);

    const eligibleForEventB = filterEligibleTemplatesForLead(templates, {
      eventId: EVENT_B,
      containerKind: "event"
    });
    assert.deepEqual(eligibleForEventB.map((t) => t.id), ["t1", "t2", "t4"]);

    const eligibleForNullContainer = filterEligibleTemplatesForLead(templates, {
      eventId: null,
      containerKind: null
    });
    assert.deepEqual(eligibleForNullContainer.map((t) => t.id), ["t1", "t3"]);
  });
});
