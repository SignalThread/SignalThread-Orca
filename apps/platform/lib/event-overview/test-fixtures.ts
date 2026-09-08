/** Test-only design fixtures. Production loaders never import this module. */
import { productDefinition, KNOWN_PRODUCT_KEYS } from "./product-catalog";
import type { BuildEventOverviewInput } from "./view-model";
import type { ProductFeed } from "./product-feed";

export function overviewFixture(count = 5, reported = false): BuildEventOverviewInput {
  const event = {
    id: "3f1e2d4c-5b6a-4c7d-8e9f-0a1b2c3d4e5f", slug: "tech-summit-2026", name: "Tech Summit 2026",
    status: "ACTIVE", startsAt: "2026-11-03T20:00:00Z", endsAt: "2026-11-05T20:00:00Z",
    venue: "Moscone Center, San Francisco", timezone: "America/Los_Angeles",
  };
  const organization = { id: "org-fixture", name: "SignalThread Demo", slug: "demo", role: "OWNER" };
  const entitledProducts = KNOWN_PRODUCT_KEYS.slice(0, count);
  const scope = { eventId: event.id, organizationId: organization.id };
  const input: BuildEventOverviewInput = {
    event, organization, entitledProducts, deployedProducts: reported ? entitledProducts : ["orca", "pulse"],
    launchHrefFor: (key, id) => `/api/launch/${key}?event_id=${id}`,
    feeds: {}, insights: [], now: new Date("2026-08-21T15:00:00Z"), adminHref: null,
  };
  if (!reported) return input;
  const headlines = ["24% roadmap · 18 sessions · 1 overdue", "Registration launch pending", "Awaiting hotel countersign", "6 leads · 2 hot · 0 follow-ups", "282 responses · 2 to review"];
  input.feeds = Object.fromEntries(entitledProducts.map((key, index): [string, ProductFeed] => {
    const definition = productDefinition(key);
    const pending = key === "registration" || key === "housing";
    return [key, {
      ...scope, productKey: key, status: pending ? "setup" : index === 0 || key === "pulse" ? "needs-review" : "active",
      headline: headlines[index], fact: pending ? { kind: "state", label: index === 1 ? "Not open" : "Contracts pending" } : { kind: "count", value: [18, 0, 0, 6, 282][index] },
      metrics: [
        { label: definition.metricLabels[0], value: pending ? null : ["24%", "", "", "6", "282"][index] },
        { label: definition.metricLabels[1], value: pending ? null : "2" },
      ],
      narrative: pending ? "Setup is still in progress. Planning work must be completed before the product opens for this event." : "The event is progressing, with outstanding work to review. Open the product to see the underlying details.",
      attention: pending ? [] : [{ id: `issue-${key}`, severity: index === 0 ? "critical" : key === "pulse" ? "review" : "at-risk", title: index === 0 ? "Hotel planning work is overdue" : key === "pulse" ? "Arrival signage needs review" : "Hot leads need follow-up", context: "Reported by the event product · review the supporting work", action: { label: "Open product" } }],
      reportedAt: input.now.toISOString(),
    }];
  }));
  const pairings = [["orca", "registration"], ["orca", "housing"], ["registration", "housing"], ["orca", "pulse"], ["pulse", "lead-retrieval"], ["orca", "pulse"]];
  const titles = ["Registration is waiting on an at-risk roadmap item", "The housing block is waiting on overdue planning work", "Housing setup depends on the registration schedule", "Wayfinding feedback points at room labels in the run of show", "Expo floor signage is hiding exhibitor destinations", "Session feedback identifies outstanding speaker work"];
  input.insights = pairings.map((pair, index) => ({
    ...scope, id: `insight-${index}`, provenance: pair.map((key) => ({ key, label: productDefinition(key).displayName })),
    title: titles[index], evidence: "Test fixture: a supported finding combining product facts for the selected event. The underlying evidence remains in the contributing products.",
    action: { productKey: pair[0] },
  }));
  return input;
}
