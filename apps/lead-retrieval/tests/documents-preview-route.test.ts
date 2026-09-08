import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

/**
 * Route contract for the document preview endpoint
 * (`GET /api/exhibitor/documents/[documentId]/preview`). Auth/session-bound and streams from R2,
 * so this proves auth/role/scope and the storage boundary by reading the canonical route source.
 * Create/edit/delete + send-to-lead are covered by documents-library-link-contract.test.ts and
 * tests/journeys/lead-document.e2e.test.ts.
 *
 * Provider boundary: file previews stream from Cloudflare R2 (GetObjectCommand). Real R2 is NOT
 * exercised here (route contract coverage; live R2 provider-gated canary still needed).
 */
const src = readFileSync(
  join(process.cwd(), "app/api/exhibitor/documents/[documentId]/preview/route.ts"),
  "utf8"
);

describe("document preview route — auth, role & tenant scope", () => {
  it("requires authentication (401) and a document-admin role (403)", () => {
    assert.match(src, /if \(!sessionUser\)[\s\S]*?status: 401/);
    assert.match(src, /if \(role !== "exhibitor_admin" && role !== "platform_admin"\)[\s\S]*?status: 403/);
  });

  it("requires exhibitor company scope", () => {
    assert.match(src, /const accountId = String\(sessionUser\.company_id \?\? ""\)\.trim\(\)/);
    assert.match(src, /Missing exhibitor scope\.[\s\S]*?status: 400/);
  });

  it("scopes the document to the caller's account and excludes archived (404 for wrong-tenant/missing)", () => {
    assert.match(src, /\.eq\("id", documentId\)\s*\.eq\("account_id", accountId\)\s*\.eq\("is_archived", false\)/);
    assert.match(src, /Item not found\.[\s\S]*?status: 404/);
  });
});

describe("document preview route — storage boundary & asset handling", () => {
  it("streams file assets from R2 and maps a missing object to 404, unconfigured bucket to 500", () => {
    assert.match(src, /r2Client\.send\(\s*new GetObjectCommand\(/);
    assert.match(src, /if \(!R2_BUCKET\)[\s\S]*?R2 bucket is not configured\.[\s\S]*?status: 500/);
    assert.match(src, /if \(isMissingObjectError\(error\)\)[\s\S]*?Document file not found in storage\.[\s\S]*?status: 404/);
  });

  it("redirects link assets to their external URL rather than streaming", () => {
    assert.match(src, /const r2Key = assetKind === "link" \? null : toR2Key\(storagePath\)/);
    assert.match(src, /if \(fileUrl\)\s*\{\s*return NextResponse\.redirect\(fileUrl, \{ status: 302 \}\)/);
  });

  it("returns a stable 404 when a document has no playable storage path", () => {
    assert.match(src, /no playable storage path is configured[\s\S]*?status: 404/);
  });

  it("validates auth/role/scope before performing any storage read", () => {
    const roleAt = src.indexOf('role !== "exhibitor_admin"');
    const r2At = src.indexOf("r2Client.send(");
    assert.ok(roleAt >= 0 && r2At >= 0 && roleAt < r2At, "auth/role must gate before storage access");
  });
});
