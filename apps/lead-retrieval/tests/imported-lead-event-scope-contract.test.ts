import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("imported lead event scope", () => {
  it("passes the server-resolved event through wizard publish and persists it on each lead", () => {
    const flow = read("components/import-wizard/import-wizard-flow.tsx");
    const complete = read("app/api/exhibitor/import-wizard/batches/[batchId]/complete/route.ts");
    const materializer = read("lib/server/import-wizard/publish-leads-materialization.ts");
    assert.match(flow, /complete\?eventId=\$\{encodeURIComponent\(activeEventId\)\}/);
    assert.match(complete, /Select an accessible event before importing leads/);
    assert.match(materializer, /event_id:\s*eventId/);
    assert.match(materializer, /throw new Error\("missing_event_scope"\)/);
  });

  it("keeps list reads event-scoped even when an API caller omits eventId", () => {
    const list = read("app/api/exhibitor/leads/list/route.ts");
    assert.match(list, /resolveExhibitorAppActiveEventId\(userId, null\)/);
    assert.match(list, /An accessible event is required for lead reads/);
    assert.match(list, /query = query\.eq\("event_id", eventId\)/);
  });

  it("allows only licensed multi-event managers to use the explicit accountScope list mode", () => {
    const page = read("app/(app)/exhibitor/leads/page.tsx");
    assert.match(page, /const accountScope = requestedAccountScope && showEventsPortfolioChrome/);
    assert.match(page, /query = query\.in\("event_id", accessibleEventIds\)/);
    assert.match(page, /query = query\.in\("event_id", \[\]\)/);
  });

  it("rejects a direct detail route outside the selected event", () => {
    const detail = read("app/(app)/exhibitor/leads/[leadId]/page.tsx");
    assert.match(detail, /resolveExhibitorAppActiveEventId\(sessionUser\.id, requestedEventId\)/);
    assert.match(detail, /leadQuery\.eq\("event_id", activeEventId\)/);
  });
});
