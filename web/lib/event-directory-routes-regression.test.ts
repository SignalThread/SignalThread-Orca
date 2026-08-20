import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const base = "app/api/events/[eventId]/directory";
const read = (p: string) => readFileSync(`${base}/${p}`, "utf8");

test("all directory routes exist", () => {
  for (const p of [
    "route.ts",
    "people/route.ts",
    "people/[personId]/route.ts",
    "people/[personId]/roles/route.ts",
    "people/[personId]/roles/[roleId]/route.ts",
    "people/[personId]/merge/route.ts",
    "imports/[batchId]/route.ts",
    "imports/[batchId]/rows/route.ts",
  ]) {
    assert.ok(existsSync(`${base}/${p}`), `${p} should exist`);
  }
});

test("every route resolves the user and routes errors through the shared helper", () => {
  for (const p of [
    "route.ts",
    "people/route.ts",
    "people/[personId]/route.ts",
    "people/[personId]/roles/route.ts",
    "people/[personId]/roles/[roleId]/route.ts",
    "people/[personId]/merge/route.ts",
    "imports/[batchId]/route.ts",
    "imports/[batchId]/rows/route.ts",
  ]) {
    const src = read(p);
    assert.match(src, /resolveDirectoryUser\(request\)/, `${p} resolves user`);
    assert.match(src, /toDirectoryErrorResponse\(/, `${p} maps errors`);
  }
});

test("routes delegate to the canonical service, not inline business logic", () => {
  assert.match(read("route.ts"), /listEventDirectoryPeople|getEventDirectorySummary/);
  assert.match(read("route.ts"), /aggregateEventDirectoryForEvent/);
  assert.match(read("people/route.ts"), /createEventDirectoryPerson/);
  assert.match(read("people/[personId]/route.ts"), /getEventDirectoryPerson/);
  assert.match(read("people/[personId]/route.ts"), /updateEventDirectoryPerson/);
  assert.match(read("people/[personId]/route.ts"), /deleteEventDirectoryPerson/);
  assert.match(read("people/[personId]/roles/route.ts"), /addEventDirectoryRole/);
  assert.match(read("people/[personId]/roles/[roleId]/route.ts"), /removeEventDirectoryRole/);
  assert.match(read("people/[personId]/merge/route.ts"), /mergeEventDirectoryPeople/);
  assert.match(read("imports/[batchId]/route.ts"), /getEventDirectoryImportBatch/);
  assert.match(read("imports/[batchId]/rows/route.ts"), /listEventDirectoryImportRows/);
});

test("directory aggregation is an explicit authenticated POST, never a GET-time write", () => {
  const src = read("route.ts");
  assert.match(src, /async function postHandler/);
  assert.match(src, /createDirectoryPostHandler/);
  assert.match(src, /deps\.resolveUser\(request\)/);
  assert.match(src, /deps\.aggregate\(\{ eventId, user: auth\.user \}\)/);
  assert.match(src, /export const POST/);
  const getStart = src.indexOf("async function getHandler");
  const getEnd = src.indexOf("export const GET");
  assert.doesNotMatch(src.slice(getStart, getEnd), /aggregateEventDirectoryForEvent/);
});

test("create returns 409 on possible_duplicate and 201 on created", () => {
  const src = read("people/route.ts");
  assert.match(src, /status === "possible_duplicate"[\s\S]*status: 409/);
  assert.match(src, /status: 201/);
});

test("merge takes source from URL personId and target from body", () => {
  const src = read("people/[personId]/merge/route.ts");
  assert.match(src, /sourcePersonId: personId/);
  assert.match(src, /targetPersonId,/);
  assert.match(src, /typeof targetPersonId !== "string"/);
});

test("role add validates role presence; uses 201 for created, 200 for idempotent", () => {
  const src = read("people/[personId]/roles/route.ts");
  assert.match(src, /typeof role !== "string"/);
  assert.match(src, /result\.created \? 201 : 200/);
});

test("the shared helper maps EventAccessError and DirectoryServiceError with codes", () => {
  const helper = read("_lib/route-helpers.ts");
  assert.match(helper, /error instanceof EventAccessError/);
  assert.match(helper, /error instanceof DirectoryServiceError/);
  assert.match(helper, /code: error\.code/);
});
