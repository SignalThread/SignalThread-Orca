import test from "node:test";
import assert from "node:assert/strict";
import { serializeSearchParams } from "../lib/url/serializeSearchParams";

test("serializeSearchParams returns empty string for undefined", () => {
  assert.equal(serializeSearchParams(undefined), "");
});

test("serializeSearchParams preserves arbitrary keys and values", () => {
  const qs = serializeSearchParams({
    view: "hot",
    eventId: "evt-1",
    futureParam: "x",
    q: "hello world"
  });
  const parsed = new URLSearchParams(qs);
  assert.equal(parsed.get("view"), "hot");
  assert.equal(parsed.get("eventId"), "evt-1");
  assert.equal(parsed.get("futureParam"), "x");
  assert.equal(parsed.get("q"), "hello world");
});

test("serializeSearchParams encodes array values as repeated keys", () => {
  const qs = serializeSearchParams({ tag: ["a", "b"] });
  assert.ok(qs.includes("tag=a"));
  assert.ok(qs.includes("tag=b"));
});
