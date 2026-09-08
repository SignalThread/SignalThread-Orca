import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));

const profileCardSource = readFileSync(
  join(here, "..", "components", "leads", "exhibitor-lead-profile-card.tsx"),
  "utf8"
);

const detailToolbarSource = readFileSync(
  join(here, "..", "components", "leads", "exhibitor-lead-detail-toolbar.tsx"),
  "utf8"
);

describe("Lead detail schedule follow-up action", () => {
  it("uses in-place button action instead of list-page href navigation", () => {
    assert.ok(
      detailToolbarSource.includes('data-testid="lead-detail-schedule-follow-up"'),
      "schedule follow-up control should exist in lead detail header actions"
    );
    assert.ok(
      !profileCardSource.includes('data-testid="lead-detail-schedule-follow-up"'),
      "schedule follow-up must not duplicate in profile card"
    );
    assert.ok(
      !profileCardSource.includes("href={scheduleHref}"),
      "schedule follow-up must not navigate away to list view"
    );
  });

  it("uses the canonical in-place follow-up control in the top action area", () => {
    assert.ok(
      detailToolbarSource.includes("<LeadCardDateField"),
      "schedule action area should reuse the canonical date picker control"
    );
    assert.ok(
      detailToolbarSource.includes('variant="toolbar"'),
      "schedule action should use compact toolbar styling in the header row"
    );
    assert.ok(
      !profileCardSource.includes('ProfileStatCard label="Next follow-up"'),
      "follow-up should not be duplicated in the lower profile grid"
    );
  });

  it("keeps company in the top identity row and not as a lower stat card", () => {
    assert.ok(
      profileCardSource.includes("htmlFor={`lead-${leadId}-company_text`}"),
      "company should be rendered with top-row identity fields"
    );
    assert.ok(
      profileCardSource.includes("lg:grid-cols-3"),
      "top identity grid should expand for multiple profile fields"
    );
    assert.ok(
      !profileCardSource.includes('ProfileStatCard label="Company"'),
      "company should no longer render as a lower stat card"
    );
  });
});
