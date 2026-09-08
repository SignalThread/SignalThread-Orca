import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));

const tabsSource = readFileSync(
  join(here, "..", "components", "leads", "exhibitor-lead-detail-tabs.tsx"),
  "utf8"
);

describe("Exhibitor lead detail tabs key stability", () => {
  it("renders tab triggers from canonical tab identities with stable keys", () => {
    assert.ok(
      tabsSource.includes("tabs.map((item) => renderTabTrigger(item))"),
      "tab triggers should render from the canonical tab collection"
    );
    assert.ok(
      tabsSource.includes("key={item.id}"),
      "tab trigger keys should use stable tab id"
    );
  });

  it("renders tab panels from canonical tab identities with stable keys", () => {
    assert.ok(
      tabsSource.includes("tabs.map((item) => ("),
      "tab panels should render from the canonical tab collection"
    );
    assert.ok(
      tabsSource.includes("<section key={item.id}"),
      "tab panels should use stable tab id keys"
    );
  });
});
