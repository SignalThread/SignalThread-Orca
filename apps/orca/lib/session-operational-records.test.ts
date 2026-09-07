import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const service = readFileSync(new URL("./session-operational-records.ts", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/events/[eventId]/matrix-2/sessions/[sessionId]/operations/route.ts", import.meta.url), "utf8");

test("session operations scope every record mutation to the event and session", () => {
  assert.match(service, /where: \{ id: sessionId, eventId, archivedAt: null \}/);
  assert.match(service, /where: \{ id: recordId, eventId, sessionId \}/);
  assert.match(service, /eventId, sessionId, module/);
});
test("session operations API requires event membership for reads and writes", () => {
  assert.match(route, /requireEventRouteAccess\(request, eventId, "read"\)/);
  assert.match(route, /requireEventRouteAccess\(request, eventId, "write"\)/);
});
