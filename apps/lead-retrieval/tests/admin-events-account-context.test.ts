import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("Platform Admin Events account context", () => {
  it("loads platform-context rows exclusively from canonical events records", () => {
    const source = read("lib/data/admin-events.ts");
    assert.match(source, /\.from\("events"\)\s*\.select\(EVENT_SELECT_COLUMNS\)/);
    assert.match(source, /const EVENT_SELECT_COLUMNS = "id, company_id, name, city, state, location/);
  });

  it("scopes entered company context by events.company_id before computing event metrics", () => {
    const source = read("lib/data/admin-events.ts");
    assert.match(source, /getAdminEventSummariesForCompanyId/);
    assert.match(source, /\.eq\("company_id", normalizedCompanyId\)/);
    assert.match(source, /metrics: await getEventMetrics\(supabase, event\.id\)/);
  });

  it("uses the validated account context rather than dashboard mode to select the company event loader", () => {
    const page = read("app/admin/events/page.tsx");
    assert.match(page, /hasActivePlatformAdminAccountContext\(sessionUser\)/);
    assert.match(page, /getAdminEventSummariesForCompanyId\(String\(sessionUser\.company_id/);
    assert.doesNotMatch(page, /AdminDashboardModeSwitcher/);
  });

  it("keeps all metric queries tied to the event id", () => {
    const source = read("lib/data/admin-events.ts");
    assert.match(source, /\.eq\("event_id", eventId\)/);
  });
});
