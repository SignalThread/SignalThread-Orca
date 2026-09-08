/**
 * enrichLead (lib/enrichment/index.ts) throws if lead_enrichments insert or leads update fails,
 * so a successful "updated" outcome cannot occur without DB persistence.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

const originalFetch = globalThis.fetch;

describe("enrichWithZoomInfo (mocked HTTP)", () => {
  beforeEach(() => {
    process.env.ZOOMINFO_API_KEY = "test-jwt";
    process.env.ZOOMINFO_BASE_URL = "https://api.zoominfo.com/gtm";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("auth failure path returns errorMessage and does not claim success", async () => {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ errors: [{ detail: "Unauthorized", status: "401" }] }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });

    const { enrichWithZoomInfo } = await import("../lib/enrichment/providers/zoominfo");
    const r = await enrichWithZoomInfo(
      { email: "jane@acme.com", fullName: "Jane Doe", company: "Acme Inc" },
      { apiKey: "test-jwt" }
    );

    assert.equal(r.provider, "zoominfo");
    assert.equal(r.shouldUpdateNormalized, false);
    assert.equal(r.noMatch, false);
    assert.ok(r.errorMessage);
    assert.match(r.errorMessage!, /401/);
  });

  it("success path: search then enrich returns normalized fields", async () => {
    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url.includes("/companies/search")) {
        return new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { "Content-Type": "application/vnd.api+json" },
        });
      }
      if (url.includes("/contacts/search")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: "999888777",
                type: "Contact",
                attributes: {
                  firstName: "Jane",
                  lastName: "Doe",
                  contactAccuracyScore: 95,
                  company: { name: "Acme Inc", id: 111 },
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/vnd.api+json" } }
        );
      }
      if (url.includes("/contacts/enrich")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: "344",
                type: "Contact",
                attributes: {
                  jobTitle: "Director of Sales",
                  managementLevel: "Director",
                  companyEmployeeRange: "51 - 200",
                  companyPrimaryIndustry: "Software",
                  companyWebsite: "www.acme.com",
                  contactAccuracyScore: 94,
                },
                meta: {
                  matchStatus: "FULL_MATCH",
                  input: { personId: 999888777 },
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/vnd.api+json" } }
        );
      }
      return new Response("not found", { status: 404 });
    };

    const { enrichWithZoomInfo } = await import("../lib/enrichment/providers/zoominfo");
    const r = await enrichWithZoomInfo(
      { email: "jane@acme.com", fullName: "Jane Doe", company: "Acme Inc" },
      { apiKey: "test-jwt" }
    );

    assert.equal(r.shouldUpdateNormalized, true);
    assert.equal(r.noMatch, false);
    assert.equal(r.normalized.job_title, "Director of Sales");
    assert.equal(r.normalized.company_domain, "acme.com");
    assert.ok(r.rawResponse && typeof r.rawResponse === "object");
  });

  it("no-match path when enrich returns NO_MATCH", async () => {
    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url.includes("/companies/search")) {
        return new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { "Content-Type": "application/vnd.api+json" },
        });
      }
      if (url.includes("/contacts/search")) {
        return new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { "Content-Type": "application/vnd.api+json" },
        });
      }
      if (url.includes("/contacts/enrich")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                attributes: {},
                meta: { matchStatus: "NO_MATCH", input: {} },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/vnd.api+json" } }
        );
      }
      return new Response("not found", { status: 404 });
    };

    const { enrichWithZoomInfo } = await import("../lib/enrichment/providers/zoominfo");
    const r = await enrichWithZoomInfo(
      { email: "x@y.com", fullName: "A B", company: "Co" },
      { apiKey: "test-jwt" }
    );

    assert.equal(r.shouldUpdateNormalized, false);
    assert.equal(r.noMatch, true);
    assert.ok(!r.errorMessage);
  });

  it("skips ZoomInfo calls when contact domain is disabled", async () => {
    let fetchCalls = 0;
    globalThis.fetch = async () => {
      fetchCalls += 1;
      return new Response("unexpected", { status: 500 });
    };

    const { enrichWithZoomInfo } = await import("../lib/enrichment/providers/zoominfo");
    const r = await enrichWithZoomInfo(
      { email: "jane@acme.com", fullName: "Jane Doe", company: "Acme Inc" },
      { apiKey: "test-jwt", enrichmentDomains: { company: true, contact: false, intent: true } }
    );

    assert.equal(fetchCalls, 0);
    assert.equal(r.noMatch, true);
    assert.equal(r.shouldUpdateNormalized, false);
    const raw = r.rawResponse as { steps?: unknown[] };
    assert.equal(raw.steps?.length, 1);
  });

  it("does not call company search when company domain is disabled", async () => {
    const urls: string[] = [];
    globalThis.fetch = async (input) => {
      urls.push(String(input));
      if (String(input).includes("/contacts/search")) {
        return new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { "Content-Type": "application/vnd.api+json" },
        });
      }
      return new Response("not found", { status: 404 });
    };

    const { enrichWithZoomInfo } = await import("../lib/enrichment/providers/zoominfo");
    await enrichWithZoomInfo(
      {
        email: "jane@acme.com",
        fullName: "Jane Doe",
        company: "Acme Inc",
        companyDomain: "acme.com",
      },
      {
        apiKey: "test-jwt",
        enrichmentDomains: { company: false, contact: true, intent: true },
      }
    );

    assert.ok(!urls.some((u) => u.includes("/companies/search")));
    assert.ok(urls.some((u) => u.includes("/contacts/search")));
  });
});
