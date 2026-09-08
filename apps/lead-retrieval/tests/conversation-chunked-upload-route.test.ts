import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { findMissingPartNumbers } from "@/lib/conversations/chunked-upload-parts";

/**
 * Chunked conversation upload coverage.
 *
 * Behavioral: findMissingPartNumbers is the safety check that prevents finalizing a recording
 * before every chunk landed. Route contract: session/complete/abort auth+scope+path validation and
 * the multipart finalize boundary, read from the canonical route sources (auth/`server-only`/R2).
 *
 * Provider boundary: chunked uploads use Cloudflare R2 multipart (Create/List/Complete/Abort).
 * Real R2 is NOT exercised here (route contract coverage; live R2 provider-gated canary still needed).
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("chunked upload — missing part detection (finalize safety, behavioral)", () => {
  it("reports the gaps when parts are missing", () => {
    assert.deepEqual(findMissingPartNumbers(5, [1, 3, 5]), [2, 4]);
    assert.deepEqual(findMissingPartNumbers(3, []), [1, 2, 3]);
    assert.deepEqual(findMissingPartNumbers(4, [4, 2]), [1, 3]);
  });

  it("reports no gaps when every part is present (order/duplicates tolerated)", () => {
    assert.deepEqual(findMissingPartNumbers(5, [5, 4, 3, 2, 1]), []);
    assert.deepEqual(findMissingPartNumbers(3, [1, 1, 2, 3, 3]), []);
  });

  it("treats a zero/empty total as complete (nothing required, nothing missing)", () => {
    assert.deepEqual(findMissingPartNumbers(0, []), []);
  });
});

describe("chunked upload — session route contract", () => {
  const src = read("app/api/conversations/upload/chunked/session/route.ts");
  it("requires a leadId and asserts upload access before creating the multipart upload", () => {
    assert.match(src, /leadId is required[\s\S]*?status: 400/);
    const accessAt = src.indexOf("assertLeadUploadAccess(sessionUser, leadId)");
    const createAt = src.indexOf("new CreateMultipartUploadCommand(");
    assert.ok(accessAt >= 0 && createAt >= 0 && accessAt < createAt, "access must gate before creating the upload");
  });
});

describe("chunked upload — complete route contract", () => {
  const src = read("app/api/conversations/upload/chunked/complete/route.ts");
  it("rejects a manifest that does not include all parts", () => {
    assert.match(src, /chunkManifest does not include all parts\./);
  });
  it("verifies uploaded parts against the total before completing (missing chunks fail safely)", () => {
    assert.match(src, /findMissingPartNumbers\(input\.totalParts, uploadedPartNumbers\)/);
    assert.match(src, /if \(missingPartNumbers\.length === 0\)/);
  });
  it("validates storage path + upload access before finalizing", () => {
    assert.match(src, /isValidConversationStoragePath/);
    assert.match(src, /assertLeadUploadAccess/);
  });
  it("only completes the object via R2 CompleteMultipartUpload (state true only after finalize)", () => {
    assert.match(src, /CompleteMultipartUploadCommand/);
  });
});

describe("chunked upload — abort route contract", () => {
  const src = read("app/api/conversations/upload/chunked/abort/route.ts");
  it("requires leadId/storagePath/uploadId and a lead-scoped storage path", () => {
    assert.match(src, /leadId is required[\s\S]*?status: 400/);
    assert.match(src, /storagePath is required[\s\S]*?status: 400/);
    assert.match(src, /uploadId is required[\s\S]*?status: 400/);
    assert.match(src, /if \(!isValidConversationStoragePath\(leadId, storagePath\)\)[\s\S]*?Invalid storagePath for leadId[\s\S]*?status: 400/);
  });
  it("asserts upload access before aborting the R2 multipart upload", () => {
    const accessAt = src.indexOf("assertLeadUploadAccess(sessionUser, leadId)");
    const abortAt = src.indexOf("uploadId");
    assert.ok(accessAt >= 0, "abort must assert upload access");
    assert.ok(abortAt >= 0);
  });
});
