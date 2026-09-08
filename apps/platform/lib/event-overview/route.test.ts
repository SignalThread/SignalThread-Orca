import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * Contract tests over the event overview route, in the same source-text style
 * the launcher tests use: the app has no DOM test runner, and these guard the
 * properties that matter most — no fabricated data, real launcher, event
 * context preserved, responsive layout, and honest not-found behaviour.
 */

const ROUTE_DIR = path.join(process.cwd(), "app", "(event)", "events", "[eventId]");
const COMPONENT_DIR = path.join(ROUTE_DIR, "_components");
const read = (file: string) => readFileSync(file, "utf8");

const PAGE = read(path.join(ROUTE_DIR, "page.tsx"));
const LAYOUT = read(path.join(ROUTE_DIR, "layout.tsx"));
const LOADER = read(path.join(process.cwd(), "lib", "event-overview", "load.ts"));
const SERVER_LOADER = read(path.join(process.cwd(), "lib", "server", "event-overview.ts"));
const LAUNCHER = read(path.join(process.cwd(), "lib", "server", "launcher.ts"));
const COMPONENTS = readdirSync(COMPONENT_DIR)
  .filter((f) => f.endsWith(".tsx"))
  .map((f) => ({ name: f, source: read(path.join(COMPONENT_DIR, f)) }));
const ALL_UI = COMPONENTS.map((c) => c.source).join("\n");

test("the route resolves the event from the URL through the access-scoped loader and 404s otherwise", () => {
  assert.match(PAGE, /await params/);
  assert.match(PAGE, /loadEventOverview\(user\.id, eventId, admin\)/);
  assert.match(PAGE, /if \(!model\) notFound\(\)/);
  assert.match(LOADER, /isSafeCanonicalId\(input\.eventId\)/, "malformed ids never reach the database");
  assert.match(LOADER, /access\.find\(\(entry\) => entry\.organizationId === String\(row\.organization_id\)\)/);
  assert.match(LOADER, /if \(!organization\) return null/, "an event outside the user's organizations reads as absent");
});

test("the layout shows the event's organization through the one shared shell", () => {
  assert.match(LAYOUT, /PlatformShell/);
  assert.match(LAYOUT, /model\.organization\.name/);
  assert.equal(/<header/.test(LAYOUT), false, "no duplicate header markup");
});

test("product launches use Platform's authorizing launcher and preserve the selected event", () => {
  assert.match(LOADER, /launchHrefFor: registry\.buildLaunchHref/);
  assert.match(SERVER_LOADER, /buildLaunchHref,/);
  assert.match(LAUNCHER, /\/api\/launch\/\$\{encodeURIComponent\(productKey\)\}\?event_id=\$\{encodeURIComponent\(eventId\)\}/);
  // Launch anchors are full navigations to the endpoint, not client transitions,
  // and nothing in the UI constructs a product URL of its own.
  assert.equal(/platform-entry|ORCA_APP_URL|PULSE_APP_URL/.test(ALL_UI), false);
  assert.match(ALL_UI, /href=\{product\.launchHref\}/);
});

test("nothing in the dashboard hardcodes demo content or example metrics", () => {
  const banned = [/Tech Summit/, /Moscone/, /24% roadmap/, /282 responses/, /\b6 leads\b/, /\b2 hot\b/];
  for (const { name, source } of COMPONENTS) {
    for (const pattern of banned) assert.equal(pattern.test(source), false, `${name} contains ${pattern}`);
  }
  assert.equal(/Tech Summit|Moscone/.test(LOADER + PAGE + LAYOUT), false);
});

test("facts and insights come only from the typed feed boundary; the production sources are empty", () => {
  assert.match(LOADER, /NO_PRODUCT_FEEDS/);
  assert.match(LOADER, /NO_INSIGHTS/);
  const feed = read(path.join(process.cwd(), "lib", "event-overview", "product-feed.ts"));
  assert.match(feed, /export const NO_PRODUCT_FEEDS: ProductFeedSource/);
  assert.match(feed, /return \{\};/);
});

test("every cross-product card shows its provenance", () => {
  const across = COMPONENTS.find((c) => c.name === "across-signalthread.tsx")!.source;
  assert.match(across, /data-testid="insight-provenance"/);
  assert.match(across, /insight\.provenance\.map/);
  assert.match(across, /data-testid="insights-empty"/, "an honest empty state exists");
});

test("the attention queue renders one ranked list, not per-product boxes", () => {
  const attention = COMPONENTS.find((c) => c.name === "needs-attention.tsx")!.source;
  assert.match(attention, /<ol/);
  assert.match(attention, /attention\.map\(/);
  assert.equal(/products\.map\(/.test(attention), false);
});

test("layout reflows at narrow widths instead of relying on fixed desktop columns", () => {
  const connected = COMPONENTS.find((c) => c.name === "connected-platform.tsx")!.source;
  const deeper = COMPONENTS.find((c) => c.name === "go-deeper.tsx")!.source;
  const across = COMPONENTS.find((c) => c.name === "across-signalthread.tsx")!.source;
  const footer = COMPONENTS.find((c) => c.name === "event-footer.tsx")!.source;
  assert.match(connected, /grid-cols-1 .*xl:grid-cols-\[300px_40px_minmax\(0,1fr\)\]/);
  assert.match(connected, /md:grid-cols-\[190px_minmax\(0,1fr\)_112px_70px\]/);
  assert.match(deeper, /grid-cols-1 .*lg:grid-cols-\[4px_200px_128px_150px_minmax\(0,1fr\)_auto\]/);
  assert.match(across, /grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3/);
  assert.match(footer, /grid-cols-2 .*sm:grid-cols-3 lg:grid-cols-6/);
  // Fixed pixel widths only ever appear behind a breakpoint prefix.
  for (const match of ALL_UI.matchAll(/(?<![a-z:-])grid-cols-\[[^\]]*\d+px[^\]]*\]/g)) {
    assert.fail(`unprefixed fixed-width grid: ${match[0]}`);
  }
});

test("the events list and home keep the event navigation working", () => {
  const events = read(path.join(process.cwd(), "app", "(app)", "events", "page.tsx"));
  const home = read(path.join(process.cwd(), "app", "(app)", "home", "page.tsx"));
  assert.match(events, /href=\{`\/events\/\$\{event\.id\}`\}/);
  assert.match(events, /formatDateRange\(event\.startsAt, event\.endsAt, event\.timezone\)/);
  assert.match(home, /href=\{`\/events\/\$\{event\.id\}`\}/);
  const heading = COMPONENTS.find((c) => c.name === "event-heading.tsx")!.source;
  assert.match(heading, /href="\/events"/, "Events back-navigation");
});
