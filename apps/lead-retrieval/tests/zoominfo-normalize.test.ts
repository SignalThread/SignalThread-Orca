import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  hasMeaningfulZoomInfoNormalized,
  mapZoomInfoContactEnrichItemToNormalized,
  zoomInfoMatchStatusIsNoMatch,
} from "../lib/integrations/zoominfo/normalize-enrichment";

describe("ZoomInfo normalize + match status", () => {
  it("maps enrich item fields into internal shape", () => {
    const item = {
      attributes: {
        jobTitle: "VP Sales",
        managementLevel: "Vice President",
        companyEmployeeRange: "201 - 500",
        companyPrimaryIndustry: "Software",
        companyWebsite: "www.acme.com",
        externalUrls: [{ type: "LINKED_IN", url: "https://linkedin.com/in/example" }],
        contactAccuracyScore: 92,
        company: {
          employeeRange: "201 - 500",
          primaryIndustry: ["Software", "SaaS"],
          website: "www.acme.com",
        },
      },
      meta: {
        matchStatus: "FULL_MATCH",
      },
    };

    const n = mapZoomInfoContactEnrichItemToNormalized(item);
    assert.equal(n.job_title, "VP Sales");
    assert.equal(n.company_size, "201 - 500");
    assert.equal(n.industry, "Software");
    assert.equal(n.company_domain, "acme.com");
    assert.equal(n.linkedin_url, "https://linkedin.com/in/example");
    assert.equal(n.match_score, 92);
    assert.ok(hasMeaningfulZoomInfoNormalized(n));
  });

  it("treats blocked match statuses as no-match", () => {
    assert.equal(zoomInfoMatchStatusIsNoMatch("NO_MATCH"), true);
    assert.equal(zoomInfoMatchStatusIsNoMatch("FULL_MATCH"), false);
    assert.equal(zoomInfoMatchStatusIsNoMatch("COMPANY_ONLY_MATCH"), false);
  });

  it("empty normalized payload is not meaningful", () => {
    const n = mapZoomInfoContactEnrichItemToNormalized({
      attributes: {},
      meta: { matchStatus: "FULL_MATCH" },
    });
    assert.equal(hasMeaningfulZoomInfoNormalized(n), false);
  });
});
