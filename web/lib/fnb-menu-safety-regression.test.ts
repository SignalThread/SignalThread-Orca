import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("safety mutation is authorized, event isolated, concurrent, and audited", async () => {
  const [route, service] = await Promise.all([
    readFile("app/api/events/[eventId]/fnb-catalog/[itemId]/safety/route.ts", "utf8"),
    readFile("lib/fnb-menu-safety.ts", "utf8"),
  ]);
  assert.match(route, /requireEventRouteAccess\(request, eventId, "write"\)/);
  assert.match(service, /findFirst\(\{ where: \{ id: itemId, eventId, archivedAt: null \}/);
  assert.match(service, /expectedVersion !== existing\.version/);
  assert.match(service, /eventFnbCatalogItemSafetyRevision\.create/);
  assert.match(service, /verificationStatus === FnbVerificationStatus\.VERIFIED \? actorUserId : null/);
});

test("external item projection excludes private audit and internal notes", async () => {
  const service = await readFile("lib/fnb-menu-safety.ts", "utf8");
  for (const field of ["internalNotes", "safetyRevisions", "verifiedByUserId", "modificationVerifiedByUserId"]) {
    assert.match(service, new RegExp(`privateFields.*${field}|${field}.*privateFields`, "s"));
  }
});
