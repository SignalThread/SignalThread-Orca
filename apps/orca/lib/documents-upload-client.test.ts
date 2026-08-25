import assert from "node:assert/strict";
import test from "node:test";
import {
  isSupportedDocumentFile,
  resolveDocumentMimeType,
  uploadAdditionalDocs,
  validateAdditionalDocFile,
} from "./documents-upload-client";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

type MockOptions = {
  categoriesFail?: boolean;
  failPresignFor?: string;
  failPresignOnceFor?: string;
};

function makeFetch(options: MockOptions = {}) {
  const calls: Array<{ url: string; method: string; body: Record<string, unknown> | null }> = [];
  let createdDocCount = 0;
  let oneShotPresignFailureUsed = false;

  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null;
    calls.push({ url, method, body });

    if (url.endsWith("/document-categories")) {
      if (options.categoriesFail) return jsonResponse({ error: "categories down" }, 500);
      return jsonResponse([
        { id: "cat-contracts", name: "Contracts", slug: "contracts", color: null },
        { id: "cat-insurance", name: "Insurance", slug: "insurance", color: null },
      ]);
    }

    if (url.endsWith("/documents/presign") && method === "POST") {
      const filename = String(body?.filename ?? "");
      if (options.failPresignFor && filename.includes(options.failPresignFor)) {
        return jsonResponse({ error: "presign failed" }, 500);
      }
      if (
        options.failPresignOnceFor &&
        filename.includes(options.failPresignOnceFor) &&
        !oneShotPresignFailureUsed
      ) {
        oneShotPresignFailureUsed = true;
        return jsonResponse({ error: "presign failed once" }, 500);
      }
      return jsonResponse({
        provider: "R2",
        method: "PUT",
        uploadUrl: `https://r2.example/upload/${String(body?.documentId ?? "")}`,
        objectKey: `events/evt/${String(body?.documentId ?? "")}/${filename}`,
        versionNumber: 1,
      });
    }

    if (url.endsWith("/finalize-upload") && method === "POST") {
      return jsonResponse({ id: "version-1" }, 201);
    }

    if (url.endsWith("/documents") && method === "POST") {
      createdDocCount += 1;
      return jsonResponse({ id: `doc-${createdDocCount}` }, 201);
    }

    if (url.startsWith("https://r2.example/upload/")) {
      return new Response(null, { status: 200, headers: { etag: '"etag-abc"' } });
    }

    return jsonResponse({ error: `unhandled ${method} ${url}` }, 500);
  }) as typeof fetch;

  return { fetchImpl, calls };
}

function makeFile(name: string, type = "application/pdf", size = 1024): File {
  const blob = new Blob([new Uint8Array(size)], { type });
  return new File([blob], name, { type });
}

test("resolveDocumentMimeType falls back to extension when type is absent", () => {
  assert.equal(resolveDocumentMimeType(makeFile("contract.pdf", "")), "application/pdf");
  assert.equal(isSupportedDocumentFile(makeFile("contract.pdf", "application/pdf")), true);
  assert.equal(isSupportedDocumentFile(makeFile("notes.txt", "text/plain")), false);
});

test("validateAdditionalDocFile rejects unsupported types and oversize files", () => {
  assert.equal(validateAdditionalDocFile(makeFile("contract.pdf", "application/pdf")), null);
  assert.match(validateAdditionalDocFile(makeFile("notes.txt", "text/plain")) ?? "", /Unsupported file type/);
  assert.match(
    validateAdditionalDocFile(makeFile("huge.pdf", "application/pdf", 51 * 1024 * 1024)) ?? "",
    /between 1 byte and 50MB/,
  );
});

test("empty doc list performs no uploads", async () => {
  const { fetchImpl, calls } = makeFetch();
  const results = await uploadAdditionalDocs({ eventId: "evt", docs: [], fetchImpl });
  assert.deepEqual(results, []);
  assert.equal(calls.length, 0);
});

test("uploads a doc through the canonical draft -> presign -> PUT -> finalize sequence", async () => {
  const { fetchImpl, calls } = makeFetch();
  const results = await uploadAdditionalDocs({
    eventId: "evt",
    docs: [{ id: "d1", file: makeFile("hotel-contract.pdf"), categorySlug: "contracts" }],
    fetchImpl,
  });

  assert.equal(results.length, 1);
  assert.equal(results[0]!.ok, true);
  assert.equal(results[0]!.documentId, "doc-1");
  assert.equal(results[0]!.error, null);

  // Order: categories, create draft, presign, R2 PUT, finalize.
  const sequence = calls.map((call) => {
    if (call.url.endsWith("/document-categories")) return "categories";
    if (call.url.endsWith("/documents") && call.method === "POST") return "create";
    if (call.url.endsWith("/documents/presign")) return "presign";
    if (call.url.startsWith("https://r2.example/upload/")) return "put";
    if (call.url.endsWith("/finalize-upload")) return "finalize";
    return call.url;
  });
  assert.deepEqual(sequence, ["categories", "create", "presign", "put", "finalize"]);

  // Finalize carries the resolved category id and object key.
  const finalizeCall = calls.find((call) => call.url.endsWith("/finalize-upload"));
  assert.equal(finalizeCall?.body?.categoryId, "cat-contracts");
  assert.equal(finalizeCall?.body?.objectKey, "events/evt/doc-1/hotel-contract.pdf");
  assert.equal(finalizeCall?.body?.objectEtag, "etag-abc");
});

test("maps chosen category slug to id and falls back to Contracts for unknown slugs", async () => {
  const { fetchImpl, calls } = makeFetch();
  const results = await uploadAdditionalDocs({
    eventId: "evt",
    docs: [
      { id: "d1", file: makeFile("coi.pdf"), categorySlug: "insurance" },
      { id: "d2", file: makeFile("mystery.pdf"), categorySlug: "does-not-exist" },
    ],
    fetchImpl,
  });

  assert.equal(results.every((result) => result.ok), true);
  const createBodies = calls.filter((call) => call.url.endsWith("/documents") && call.method === "POST").map((c) => c.body);
  assert.equal(createBodies[0]?.categoryId, "cat-insurance");
  assert.equal(createBodies[1]?.categoryId, "cat-contracts"); // fallback
});

test("one failing file does not abort the others", async () => {
  const { fetchImpl } = makeFetch({ failPresignFor: "broken" });
  const results = await uploadAdditionalDocs({
    eventId: "evt",
    docs: [
      { id: "d1", file: makeFile("broken.pdf"), categorySlug: "contracts" },
      { id: "d2", file: makeFile("good.pdf"), categorySlug: "contracts" },
    ],
    fetchImpl,
  });

  assert.equal(results.length, 2);
  assert.equal(results[0]!.ok, false);
  assert.match(results[0]!.error ?? "", /presign failed/);
  assert.equal(results[0]!.documentId, "doc-1");
  assert.equal(results[1]!.ok, true);
  assert.equal(results[1]!.documentId, "doc-2");
});

test("retry reuses the draft id returned by a failed upload", async () => {
  const { fetchImpl, calls } = makeFetch({ failPresignOnceFor: "retry-me" });
  const file = makeFile("retry-me.pdf");
  const first = await uploadAdditionalDocs({
    eventId: "evt",
    docs: [{ id: "d1", file, categorySlug: "contracts" }],
    fetchImpl,
  });

  assert.equal(first[0]!.ok, false);
  assert.equal(first[0]!.documentId, "doc-1");

  const retry = await uploadAdditionalDocs({
    eventId: "evt",
    docs: [{ id: "d1", file, categorySlug: "contracts", documentId: first[0]!.documentId }],
    fetchImpl,
  });

  assert.equal(retry[0]!.ok, true);
  assert.equal(retry[0]!.documentId, "doc-1");
  assert.equal(
    calls.filter((call) => call.url.endsWith("/documents") && call.method === "POST").length,
    1,
    "retry must not create a second document draft",
  );
  const presignCalls = calls.filter((call) => call.url.endsWith("/documents/presign"));
  assert.equal(presignCalls.length, 2);
  assert.equal(presignCalls[1]?.body?.documentId, "doc-1");
});

test("category load failure marks all docs failed without throwing", async () => {
  const { fetchImpl, calls } = makeFetch({ categoriesFail: true });
  const results = await uploadAdditionalDocs({
    eventId: "evt",
    docs: [{ id: "d1", file: makeFile("c.pdf"), categorySlug: "contracts" }],
    fetchImpl,
  });

  assert.equal(results[0]!.ok, false);
  // No document draft was created when categories could not be resolved.
  assert.equal(calls.some((call) => call.url.endsWith("/documents") && call.method === "POST"), false);
});
