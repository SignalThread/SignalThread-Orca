import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Fetch-dedup coverage for the Timeline Dashboard (Roadmap/Timeline performance
// Prompt 3). The dashboard view is conditionally mounted, so switching views
// used to unmount/remount it and refetch /timeline-dashboard every time. A
// module-scoped cache keyed by (eventId, refreshToken) survives remounts, so
// revisiting the dashboard with unchanged inputs reuses the payload; a mutation
// bumps refreshToken and forces a refetch. This is a source-regression: the
// client component is not rendered in the node --test runner.

const shellSource = readFileSync("app/(shell)/timeline/_components/TimelineDashboardView.tsx", "utf8");
const pageSource = readFileSync("app/(shell)/timeline/page.tsx", "utf8");

test("dashboard payload is cached at module scope keyed by event and refresh token", () => {
  assert.match(shellSource, /const dashboardCache = new Map<string, EventTimelineDashboard>\(\);/);
  assert.match(shellSource, /function dashboardCacheKey\(eventId: string, refreshToken: number\): string \{/);
  assert.match(shellSource, /return `\$\{eventId\}::\$\{refreshToken\}`;/);
});

test("load consults the cache before fetching, and only fetches on a miss", () => {
  // Cache hit path returns without hitting the network.
  assert.match(shellSource, /const cached = dashboardCache\.get\(cacheKey\);/);
  assert.match(shellSource, /if \(cached\) \{[\s\S]*setState\(\{ phase: "ready", data: cached \}\);[\s\S]*return;/);
  // Miss path still fetches the canonical endpoint and remembers the result.
  assert.match(shellSource, /fetch\(`\/api\/events\/\$\{eventId\}\/timeline-dashboard`/);
  assert.match(shellSource, /rememberDashboard\(cacheKey, eventId, data\);/);
  // load is keyed on refreshToken so a mutation bump produces a fresh cache key.
  assert.match(shellSource, /\}, \[eventId, refreshToken\]\);/);
});

test("a refresh-token bump invalidates stale entries for the same event", () => {
  assert.match(shellSource, /for \(const existing of Array\.from\(dashboardCache\.keys\(\)\)\) \{/);
  assert.match(shellSource, /existing\.startsWith\(eventPrefix\)/);
  assert.match(shellSource, /dashboardCache\.delete\(existing\);/);
  // The cache is bounded so it cannot grow without limit across events.
  assert.match(shellSource, /const DASHBOARD_CACHE_MAX = 8;/);
  assert.match(shellSource, /while \(dashboardCache\.size > DASHBOARD_CACHE_MAX\)/);
});

test("the remount effect reuses cache; explicit retry forces a refetch", () => {
  // View switches remount the component; the effect runs but hits the cache.
  assert.match(shellSource, /\}, \[load, refreshToken\]\);/);
  // Error retry must bypass the cache to actually re-attempt the network call.
  assert.match(shellSource, /onClick=\{\(\) => void load\(\{ force: true \}\)\}/);
  assert.match(shellSource, /if \(!options\?\.force\) \{/);
});

test("dashboard metrics stay server-authoritative — no client-side rollup invention", () => {
  // The cache stores the server payload verbatim; the view still reads only
  // payload fields (semantics unchanged from the server dashboard).
  assert.match(shellSource, /const data = payload as EventTimelineDashboard;/);
  assert.match(shellSource, /data\.totals\.totalItems/);
  assert.match(shellSource, /health=\{data\.health\}/);
});

test("mutations still trigger dashboard refresh via the refresh token", () => {
  // The page bumps the token only after server-confirmed writes (unchanged),
  // which changes the cache key and forces the next load to refetch.
  assert.match(pageSource, /setDashboardRefreshToken\(\(current\) => current \+ 1\);/);
  assert.match(pageSource, /refreshToken=\{dashboardRefreshToken\}/);
});
