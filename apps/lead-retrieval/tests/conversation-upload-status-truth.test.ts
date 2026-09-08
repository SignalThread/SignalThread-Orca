import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");

const uploadRoute = read("app/api/conversations/upload/route.ts");
const finalizeRoute = read("app/api/conversations/upload/finalize/route.ts");

describe("audio upload status truth — new conversations start pending, never fake-complete", () => {
  for (const [name, src] of [
    ["upload", uploadRoute],
    ["finalize", finalizeRoute],
  ] as const) {
    it(`${name} route inserts transcription_status: "pending" on a fresh conversation`, () => {
      assert.match(src, /transcription_status:\s*"pending"/);
      // A fresh insert must not hardcode a completed transcription/synthesis state.
      assert.doesNotMatch(src, /\.insert\(\{[\s\S]*transcription_status:\s*"completed"[\s\S]*\}\)/);
      assert.doesNotMatch(src, /\.insert\(\{[\s\S]*synthesis_status:\s*"completed"[\s\S]*\}\)/);
    });

    it(`${name} route validates upload access before writing the conversation row`, () => {
      const accessAt = src.indexOf("assertLeadUploadAccess");
      const insertAt = src.indexOf(".insert(");
      assert.ok(accessAt >= 0, `${name} route must gate on assertLeadUploadAccess`);
      assert.ok(insertAt >= 0, `${name} route must insert a conversation row`);
      assert.ok(accessAt < insertAt, `${name} route must assert access before inserting`);
    });
  }

  it("finalize reflects the real persisted transcription/synthesis status, not a hardcoded value", () => {
    // Reads the actual row status back rather than assuming completion.
    assert.match(finalizeRoute, /transcription_status,\s*synthesis_status/);
    assert.match(finalizeRoute, /transcriptionStatus:\s*String\(row\?\.transcription_status\s*\?\?\s*"pending"\)/);
  });

  it("finalize validates the storage path is scoped to the lead before touching the DB", () => {
    const pathCheckAt = finalizeRoute.indexOf("isValidConversationStoragePath");
    const insertAt = finalizeRoute.indexOf(".insert(");
    assert.ok(pathCheckAt >= 0 && pathCheckAt < insertAt, "finalize must validate storage path before insert");
  });
});
