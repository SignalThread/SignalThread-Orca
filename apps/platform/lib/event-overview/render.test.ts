import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EventOverview } from "../../app/(event)/events/[eventId]/_components/event-overview";
import Loading from "../../app/(event)/loading";
import ErrorState from "../../app/(event)/error";
import { buildEventOverview } from "./view-model";
import { overviewFixture } from "./test-fixtures";

// The shared UI package preserves JSX for Next/SWC. tsx's standalone runner
// uses classic JSX for that package, so provide its runtime only in this test process.
Object.assign(globalThis, { React });

test("real components render the selected event and one shared architecture for zero through five products", () => {
  for (let count = 0; count <= 5; count++) {
    const fixture = overviewFixture(count);
    fixture.event.name = "Selected customer event <with markup>";
    const html = renderToStaticMarkup(createElement(EventOverview, { model: buildEventOverview(fixture) }));
    assert.match(html, /Selected customer event &lt;with markup&gt;/);
    assert.equal((html.match(/data-testid="lifecycle-row-/g) ?? []).length, count);
    assert.equal((html.match(/data-testid="go-deeper-row-/g) ?? []).length, count);
    assert.match(html, /href="\/events"/);
    assert.doesNotMatch(html, /Nothing is waiting|None are open|\b282\b|24%|is live for this event/);
  }
});

test("populated components show provenance, ranked attention and only event-scoped secure launch actions", () => {
  const fixture = overviewFixture(5, true);
  const model = buildEventOverview(fixture);
  const html = renderToStaticMarkup(createElement(EventOverview, { model }));
  assert.equal((html.match(/data-testid="insight-provenance"/g) ?? []).length, 6);
  const severities = Array.from(html.matchAll(/data-testid="attention-severity">[\s\S]*?<\/svg>(.*?)<\/span>/g), (m) => m[1]);
  assert.deepEqual(severities, ["Critical", "At risk", "Review"]);
  for (const link of html.matchAll(/href="([^\"]+)"/g)) {
    if (link[1] === "/events") continue;
    assert.match(link[1], new RegExp(`^/api/launch/[^?]+\\?event_id=${fixture.event.id}$`));
  }
});

test("archived and unavailable products cannot render launch anchors", () => {
  const fixture = overviewFixture(5, true);
  fixture.event.status = "ARCHIVED";
  const html = renderToStaticMarkup(createElement(EventOverview, { model: buildEventOverview(fixture) }));
  assert.doesNotMatch(html, /href="\/api\/launch/);
  assert.equal((html.match(/aria-disabled="true"/g) ?? []).length, 5);
  assert.match(html, /Archived events cannot be opened/);
});

test("loading and error states disclose unavailable data without leaking errors or inventing metrics", () => {
  const loading = renderToStaticMarkup(createElement(Loading));
  assert.match(loading, /role="status"/);
  assert.match(loading, /Loading event overview/);
  const error = renderToStaticMarkup(createElement(ErrorState, { error: new Error("private database detail"), retry: () => {} }));
  assert.match(error, /role="alert"/);
  assert.match(error, /Try again/);
  assert.match(error, /href="\/events"/);
  assert.doesNotMatch(error, /private database detail|Sessions planned|Responses heard/);
});

test("mis-scoped feeds and unentitled product data cannot enter the event model", () => {
  const fixture = overviewFixture(5, true);
  const pulse = fixture.feeds.pulse;
  for (const changed of [{ ...pulse, productKey: "orca" }, { ...pulse, eventId: "other" }, { ...pulse, organizationId: "other" }]) {
    const model = buildEventOverview({ ...fixture, feeds: { pulse: changed } });
    assert.equal(model.connectedProductCount, 0);
    assert.ok(model.attention.every((a) => !a.id.startsWith("pulse:")));
  }
  assert.equal(buildEventOverview({ ...fixture, entitledProducts: [] }).connectedProductCount, 0);
});

test("reported product risk raises event health even without an individual blocker", () => {
  const fixture = overviewFixture(5, true);
  const pulse = { ...fixture.feeds.pulse, status: "at-risk" as const, attention: [] };
  assert.equal(buildEventOverview({ ...fixture, feeds: { pulse } }).health.label, "At risk");
});
