/**
 * Conversation upload access: exhibitor_viewer uses the same mobile event scope as lead APIs.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { requireLeadEventIdForExhibitorViewerUpload } from "@/lib/conversations/conversation-upload-lead-scope";

const root = process.cwd();
function read(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

test("requireLeadEventIdForExhibitorViewerUpload rejects null / empty", () => {
  assert.throws(() => requireLeadEventIdForExhibitorViewerUpload(null), /Forbidden/);
  assert.throws(() => requireLeadEventIdForExhibitorViewerUpload(undefined), /Forbidden/);
  assert.throws(() => requireLeadEventIdForExhibitorViewerUpload("   "), /Forbidden/);
  assert.equal(requireLeadEventIdForExhibitorViewerUpload("  ev-1  "), "ev-1");
});

test("exhibitor_viewer + app permission path: assertLeadUploadAccess loads event_id and calls userHasExhibitorMobileAppEventAccess", () => {
  const src = read("lib/conversations/upload-access.ts");
  assert.match(src, /isExhibitorViewer/);
  assert.match(src, /\.select\("id, company_id, event_id"\)/);
  assert.match(src, /userHasExhibitorMobileAppEventAccess\(\{\s*userId:\s*sessionUser\.userId/);
  assert.match(src, /requireLeadEventIdForExhibitorViewerUpload\(leadRow\.event_id\)/);
});

test("exhibitor_viewer without app permission returns Forbidden when membership check fails", () => {
  const src = read("lib/conversations/upload-access.ts");
  assert.match(src, /if \(!ok\)[\s\S]*?throw new Error\("Forbidden"\)/);
});

test("userHasExhibitorMobileAppEventAccess is only used inside the exhibitor_viewer branch", () => {
  const src = read("lib/conversations/upload-access.ts");
  assert.match(src, /if \(isExhibitorViewer\) \{[\s\S]*?userHasExhibitorMobileAppEventAccess/s);
  const calls = src.match(/userHasExhibitorMobileAppEventAccess\(/g) ?? [];
  assert.equal(calls.length, 1, "single membership check for viewer uploads only");
});

test("chunked session POST delegates to assertLeadUploadAccess", () => {
  const src = read("app/api/conversations/upload/chunked/session/route.ts");
  assert.match(src, /assertLeadUploadAccess\(sessionUser,\s*leadId\)/);
});

test("all conversation upload entrypoints use assertLeadUploadAccess", () => {
  const paths = [
    "app/api/conversations/upload/route.ts",
    "app/api/conversations/upload/signed-url/route.ts",
    "app/api/conversations/upload/finalize/route.ts",
    "app/api/conversations/upload/chunked/session/route.ts",
    "app/api/conversations/upload/chunked/chunk-urls/route.ts",
    "app/api/conversations/upload/chunked/complete/route.ts",
    "app/api/conversations/upload/chunked/abort/route.ts"
  ];
  for (const p of paths) {
    assert.match(read(p), /assertLeadUploadAccess\(/, `${p} must call assertLeadUploadAccess`);
  }
});

test("assertLeadUploadAccess validates role before opening a DB client", () => {
  const src = read("lib/conversations/upload-access.ts");
  const roleGuard = src.indexOf("if (!isPlatform && !isExhibitorAdmin && !isExhibitorViewer)");
  const adminClient = src.indexOf("createAdminClient()");
  assert.ok(roleGuard >= 0 && adminClient > roleGuard);
});
