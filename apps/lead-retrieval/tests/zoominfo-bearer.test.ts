import assert from "node:assert/strict";
import { test } from "node:test";
import {
  maskZoomInfoBearerForPublic,
  toZoomInfoPublicStatus,
  type ZoomInfoConnectionRow
} from "../lib/integrations/zoominfo/oauth-core";
import {
  coerceZoomInfoEnrichmentDomainsFromApiBody,
  DEFAULT_ZOOMINFO_ENRICHMENT_DOMAINS,
  parseZoomInfoEnrichmentDomainsFromMetadata,
} from "../lib/integrations/zoominfo/enrichment-domain-settings";
import { probeZoomInfoBearerToken } from "../lib/integrations/zoominfo/validate-bearer";

function baseRow(overrides: Partial<ZoomInfoConnectionRow>): ZoomInfoConnectionRow {
  return {
    id: "i1",
    company_id: "c1",
    provider: "zoominfo",
    zoominfo_bearer_token: null,
    zoominfo_connection_label: null,
    connected_by_user_id: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    status: "connected",
    metadata: null,
    ...overrides
  };
}

test("maskZoomInfoBearerForPublic does not echo full secret", () => {
  const raw = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.very-long-secret-part";
  const m = maskZoomInfoBearerForPublic(raw);
  assert.ok(!m.includes("very-long-secret-part"));
  assert.ok(m.includes("eyJ"));
});

test("toZoomInfoPublicStatus never exposes raw bearer in JSON", () => {
  const row = baseRow({
    zoominfo_bearer_token: "0123456789abcdef0123456789abcdef",
    status: "connected"
  });
  const pub = toZoomInfoPublicStatus(row);
  const json = JSON.stringify(pub);
  assert.ok(!json.includes("0123456789abcdef0123456789abcdef"));
  assert.ok(!json.includes("56789abcdef0123456789"));
  assert.equal(pub.tokenSaved, true);
  assert.equal(pub.connected, true);
  assert.equal(pub.invalidToken, false);
});

test("toZoomInfoPublicStatus invalid token when status error", () => {
  const pub = toZoomInfoPublicStatus(
    baseRow({
      zoominfo_bearer_token: "x",
      status: "error"
    })
  );
  assert.equal(pub.invalidToken, true);
  assert.equal(pub.connected, false);
});

test("toZoomInfoPublicStatus exposes enrichmentDomains without raw bearer", () => {
  const row = baseRow({
    zoominfo_bearer_token: "secret-token-value",
    status: "connected",
    metadata: { enrichment_domains: { company: true, contact: false, intent: true } }
  });
  const pub = toZoomInfoPublicStatus(row);
  assert.equal(pub.enrichmentDomains.contact, false);
  assert.equal(pub.enrichmentDomains.intent, true);
  const json = JSON.stringify(pub);
  assert.ok(!json.includes("secret-token-value"));
});

test("parseZoomInfoEnrichmentDomainsFromMetadata uses defaults when missing", () => {
  const d = parseZoomInfoEnrichmentDomainsFromMetadata(null);
  assert.deepEqual(d, DEFAULT_ZOOMINFO_ENRICHMENT_DOMAINS);
});

test("coerceZoomInfoEnrichmentDomainsFromApiBody rejects non-booleans", () => {
  assert.equal(coerceZoomInfoEnrichmentDomainsFromApiBody({ company: "yes" }), null);
  assert.equal(coerceZoomInfoEnrichmentDomainsFromApiBody({ company: true })?.company, true);
});

test("probeZoomInfoBearerToken rejects 401", async () => {
  const prev = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  try {
    const r = await probeZoomInfoBearerToken("tok");
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.httpStatus, 401);
  } finally {
    globalThis.fetch = prev;
  }
});

test("probeZoomInfoBearerToken accepts 200", async () => {
  const prev = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ data: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  try {
    const r = await probeZoomInfoBearerToken("tok");
    assert.equal(r.ok, true);
  } finally {
    globalThis.fetch = prev;
  }
});
