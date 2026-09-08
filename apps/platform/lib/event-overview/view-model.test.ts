import assert from "node:assert/strict";
import test from "node:test";
import { rankAttention, type AttentionItem } from "./attention";
import { prepareInsights, type CrossProductInsight } from "./insights";
import { KNOWN_PRODUCT_KEYS, orderProductKeys, productDefinition, spanColumns } from "./product-catalog";
import type { ProductFeed } from "./product-feed";
import { buildEventOverview, productCountLabel, type BuildEventOverviewInput, type EventRecord } from "./view-model";

const NOW = new Date("2026-08-21T15:00:00Z");

const EVENT: EventRecord = {
  id: "3f1e2d4c-5b6a-4c7d-8e9f-0a1b2c3d4e5f",
  slug: "demo-summit",
  name: "Demo Summit",
  status: "ACTIVE",
  startsAt: "2026-11-03T12:00:00Z",
  endsAt: "2026-11-05T12:00:00Z",
  venue: "Moscone Center",
  timezone: "America/Los_Angeles",
};

const ORG = { id: "org-1", slug: "demo", name: "Demo Org", role: "OWNER" };

const ALL_FIVE = ["orca", "registration", "housing", "lead-retrieval", "pulse"];

function launchHrefFor(productKey: string, eventId: string): string | null {
  return ["orca", "pulse"].includes(productKey) ? `/api/launch/${productKey}?event_id=${eventId}` : null;
}

function build(overrides: Partial<BuildEventOverviewInput> = {}) {
  return buildEventOverview({
    event: EVENT,
    organization: ORG,
    entitledProducts: ALL_FIVE,
    deployedProducts: ["orca", "pulse"],
    launchHrefFor,
    feeds: {},
    insights: [],
    now: NOW,
    adminHref: null,
    ...overrides,
  });
}

test("the selected event's own data drives the heading and footer", () => {
  const model = build();
  assert.equal(model.event.name, "Demo Summit");
  assert.deepEqual(model.headingMeta, ["Nov 3–5, 2026", "Moscone Center", "74 days out", "Planning"]);
  assert.deepEqual(
    model.footer.map((f) => [f.label, f.value]),
    [
      ["Organization", "Demo Org"],
      ["Dates", "Nov 3–5, 2026"],
      ["Venue", "Moscone Center"],
      ["Timezone", "America/Los_Angeles"],
      ["Lifecycle", "Active · Planning"],
      ["Event ID", EVENT.id],
    ],
  );
});

test("only entitled products participate, in lifecycle order, whatever order the registry returns", () => {
  const model = build({ entitledProducts: ["pulse", "orca", "housing"] });
  assert.deepEqual(
    model.products.map((p) => p.key),
    ["orca", "housing", "pulse"],
  );
  assert.equal(model.products.some((p) => p.key === "registration"), false);
});

test("the frame holds from one product to five without changing shape", () => {
  for (let count = 1; count <= 5; count += 1) {
    const model = build({ entitledProducts: ALL_FIVE.slice(0, count) });
    assert.equal(model.products.length, count);
    assert.equal(model.footer.length, 6);
    assert.ok(model.headingMeta.length >= 1);
  }
  assert.equal(productCountLabel(1), "1 product enabled");
  assert.equal(productCountLabel(5), "5 products enabled");
});

test("no entitled products is an honest empty state, not an error", () => {
  const model = build({ entitledProducts: [] });
  assert.deepEqual(model.products, []);
  assert.equal(model.attention.length, 0);
  assert.equal(model.health.label, "Active");
});

test("product spans follow the lifecycle architecture", () => {
  assert.deepEqual(spanColumns(productDefinition("orca").span), { start: 1, end: 4 });
  assert.deepEqual(spanColumns(productDefinition("registration").span), { start: 1, end: 3 });
  assert.deepEqual(spanColumns(productDefinition("housing").span), { start: 1, end: 3 });
  assert.deepEqual(spanColumns(productDefinition("lead-retrieval").span), { start: 2, end: 4 });
  assert.deepEqual(spanColumns(productDefinition("pulse").span), { start: 2, end: 4 });
});

test("a configured launch alone cannot claim an event product is active", () => {
  const model = build();
  const orca = model.products.find((p) => p.key === "orca")!;
  assert.equal(orca.status.kind, "available");
  assert.equal(orca.status.tone, "neutral");
  assert.equal(orca.connected, false);
  assert.deepEqual(orca.fact, { kind: "unavailable", label: "Not connected" });
  assert.deepEqual(orca.metrics.map((m) => m.value), [null, null]);
  assert.match(orca.band.copy, /not connected/i);
  assert.equal(model.connectedProductCount, 0);
});

test("an entitled product without a deployed app sits in Setup with a pending band and no launch", () => {
  const model = build();
  const registration = model.products.find((p) => p.key === "registration")!;
  assert.equal(registration.status.kind, "setup");
  assert.equal(registration.band.pending, true);
  assert.equal(registration.launchHref, null);
  assert.equal(registration.deployed, false);
  assert.deepEqual(registration.fact, { kind: "unavailable", label: "Setup" });
  assert.equal(registration.purpose, "Will know who is coming");
});

test("launch actions carry the selected event through Platform's authorizing launcher", () => {
  const model = build();
  for (const product of model.products.filter((p) => p.deployed)) {
    assert.equal(product.launchHref, `/api/launch/${product.key}?event_id=${EVENT.id}`);
  }
});

test("an archived event has no launch actions even for deployed products", () => {
  const model = build({ event: { ...EVENT, status: "ARCHIVED" } });
  assert.ok(model.products.every((p) => p.launchHref === null));
  assert.equal(model.health.label, "Archived");
});

test("a connected feed drives status, band copy, facts, metrics and narrative", () => {
  const feed: ProductFeed = {
    productKey: "pulse",
    organizationId: ORG.id,
    eventId: EVENT.id,
    status: "needs-review",
    headline: "12 responses · 2 to review",
    fact: { kind: "count", value: 12 },
    metrics: [
      { label: "Responses", value: "12" },
      { label: "To review", value: "2" },
    ],
    narrative: "Two findings await review.",
    attention: [{ id: "f1", severity: "at-risk", title: "Signage complaint", context: "5 mentions", action: { label: "Review signal" } }],
    reportedAt: NOW.toISOString(),
  };
  const model = build({ feeds: { pulse: feed } });
  const pulse = model.products.find((p) => p.key === "pulse")!;
  assert.equal(pulse.connected, true);
  assert.equal(pulse.status.label, "Needs review");
  assert.equal(pulse.band.copy, "12 responses · 2 to review");
  assert.deepEqual(pulse.fact, { kind: "count", value: 12 });
  assert.equal(model.connectedProductCount, 1);
  const item = model.attention.find((a) => a.id === "pulse:f1")!;
  assert.equal(item.source.label, "Pulse");
  assert.equal(item.action?.href, `/api/launch/pulse?event_id=${EVENT.id}`, "the action opens the product for this event");
});

test("attention is one queue ranked by severity, not grouped by product", () => {
  const items: AttentionItem[] = [
    { id: "a", severity: "review", source: { key: "orca", label: "OrcaOS" }, title: "Z", context: "", action: null },
    { id: "b", severity: "critical", source: { key: "pulse", label: "Pulse" }, title: "Y", context: "", action: null },
    { id: "c", severity: "at-risk", source: { key: "housing", label: "Housing" }, title: "X", context: "", action: null },
    { id: "d", severity: "critical", source: { key: "orca", label: "OrcaOS" }, title: "W", context: "", action: null },
  ];
  assert.deepEqual(
    rankAttention(items).map((i) => i.id),
    ["d", "b", "c", "a"],
  );
});

test("registry gaps become attention items and lift the event's health badge", () => {
  const model = build({ event: { ...EVENT, startsAt: null, endsAt: null, status: "DRAFT" }, adminHref: "/admin" });
  const titles = model.attention.map((a) => a.title);
  assert.ok(titles.includes("Event dates are not set"));
  assert.ok(titles.includes("Event is still a draft"));
  assert.ok(titles.includes("Registration launch is not connected"));
  assert.ok(model.attention.every((a) => a.severity === "review"));
  assert.equal(model.health.label, "Needs review");
  assert.equal(model.attention[0].action?.href, "/admin");
  assert.deepEqual(model.headingMeta, ["Dates not set", "Moscone Center"]);
});

test("a viewer who is not a Platform admin gets no admin action", () => {
  const model = build({ event: { ...EVENT, startsAt: null, endsAt: null } });
  const dates = model.attention.find((a) => a.id === "registry:dates")!;
  assert.equal(dates.action, null);
});

test("a fully configured event with nothing reported has an empty queue and an Active badge", () => {
  const model = build({ entitledProducts: ["orca", "pulse"] });
  assert.deepEqual(model.attention, []);
  assert.deepEqual(model.health, { label: "Active", tone: "neutral" });
});

test("insights carry provenance from at least two participating products; anything else is dropped", () => {
  const insights: CrossProductInsight[] = [
    {
      id: "good",
      organizationId: ORG.id,
      eventId: EVENT.id,
      provenance: [
        { key: "pulse", label: "Pulse" },
        { key: "orca", label: "OrcaOS" },
      ],
      title: "Wayfinding friction points at room labels the run of show owns",
      evidence: "…",
      action: { productKey: "orca" },
    },
    { id: "single", organizationId: ORG.id, eventId: EVENT.id, provenance: [{ key: "orca", label: "OrcaOS" }], title: "Not cross-product", evidence: "", action: null },
    {
      id: "foreign",
      organizationId: ORG.id,
      eventId: EVENT.id,
      provenance: [
        { key: "orca", label: "OrcaOS" },
        { key: "housing", label: "Housing" },
      ],
      title: "Mentions a product this event does not have",
      evidence: "",
      action: null,
    },
  ];
  const prepared = prepareInsights(insights, ["orca", "pulse"]);
  assert.deepEqual(prepared.map((i) => i.id), ["good"]);
  assert.deepEqual(
    prepared[0].provenance.map((p) => p.key),
    ["orca", "pulse"],
    "provenance reads in lifecycle order",
  );
  const model = build({ insights });
  assert.equal(model.insights.length, 2, "with all five enabled the housing pairing is valid too");
  assert.ok(model.insights.every((i) => i.provenance.length >= 2));
  assert.equal(model.insights[0].action?.href, launchHrefFor("orca", EVENT.id));
  assert.equal(build({ insights, event: { ...EVENT, status: "ARCHIVED" } }).insights[0].action, null);
  assert.equal(build({ insights: insights.map((i) => ({ ...i, eventId: "different-event" })) }).insights.length, 0);
  assert.equal(build({ insights: insights.map((i) => ({ ...i, organizationId: "different-org" })) }).insights.length, 0);
  assert.equal(build({ insights: [{ ...insights[0], action: { productKey: "housing" } }] }).insights[0].action, null,
    "actions cannot target products outside the insight's provenance");
});

test("with no insight source connected the section is empty rather than filled", () => {
  assert.deepEqual(build().insights, []);
});

test("an unknown product key joins the frame with a generic definition instead of breaking the page", () => {
  const model = build({ entitledProducts: ["orca", "badging"], productNames: new Map([["badging", "Badging"]]) });
  const badging = model.products.find((p) => p.key === "badging")!;
  assert.equal(badging.definition.displayName, "Badging");
  assert.deepEqual(badging.definition.span, { from: "before", to: "after" });
  assert.equal(model.products[model.products.length - 1].key, "badging", "unknown products sort last");
  assert.deepEqual(orderProductKeys(["Pulse ", "orca", "orca"]), ["orca", "pulse"]);
  assert.equal(KNOWN_PRODUCT_KEYS.length, 5);
});
