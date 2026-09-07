import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();

function readSource(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

test("event settings page renders the categorized settings hub", () => {
  const pageSource = readSource("app/(shell)/events/[eventId]/settings/page.tsx");
  const hubSource = readSource("app/(shell)/events/[eventId]/settings/_components/event-settings-hub.tsx");

  assert.match(pageSource, /<EventSettingsHub/);
  assert.match(pageSource, /eventId=\{eventId\}/);
  assert.match(hubSource, /Event settings/);
  assert.match(hubSource, /Manage workspace configuration, defaults, and module options for this event\./);
  assert.match(hubSource, /title=\{`\$\{props\.initialTerminology\.terms\.runOfShow\} settings`\}/);
  assert.match(hubSource, /Event workspace settings/);
  assert.doesNotMatch(pageSource, /SessionRequirementsSettings/);
});

test("run of show settings exposes session types and supported catalogs", () => {
  const hubSource = readSource("app/(shell)/events/[eventId]/settings/_components/event-settings-hub.tsx");

  assert.match(hubSource, /title: "Built-in session types"/);
  assert.match(hubSource, /View the starter chips, filters, and grouping options shown in \{terminology\.runOfShow\}\./);
  assert.match(hubSource, /actionLabel: "View defaults"/);
  assert.match(hubSource, /title: "AV Requirements"/);
  assert.match(hubSource, /title: "Staffing"/);
  assert.match(hubSource, /title: "Supplies"/);
  assert.match(hubSource, /title: "Signage"/);
  assert.match(hubSource, /title: "Status options"/);
  assert.match(hubSource, /Read-only defaults/);
  assert.match(hubSource, /Custom session types need an event-scoped session type model/);
});

test("session configuration exposes permanent operational catalogs while hiding fnb and room setup", () => {
  const settingsSource = readSource("app/(shell)/events/[eventId]/settings/_components/session-requirements-settings.tsx");

  assert.match(
    settingsSource,
    /const DEFAULT_VISIBLE_CATALOG_TYPES: SessionRequirementCatalogType\[\] = \["AV", "STAFFING", "SUPPLIES", "SIGNAGE", "STATUS"\]/,
  );
  assert.match(settingsSource, /if \(!visibleTypeSet\.has\(sectionType\)\) return false;/);
  assert.match(settingsSource, /focusCatalogType && sectionType !== focusCatalogType/);
  assert.doesNotMatch(settingsSource, /Catalog-style editor for Matrix session options/);
});

test("run of show keeps session types in the canonical add session flow", () => {
  const topStripSource = readSource("app/(shell)/matrix-2/_components/Matrix2TopStrip.tsx");
  const pageSource = readSource("app/(shell)/matrix-2/page.tsx");

  assert.doesNotMatch(topStripSource, /settingsHref\?: string \| null/);
  assert.doesNotMatch(topStripSource, /Manage session types/);
  assert.doesNotMatch(pageSource, /\/settings\?section=session-types/);
  assert.match(pageSource, /sessionTypeOptionsForSavedValue/);
  assert.match(pageSource, /DEFAULT_SESSION_TYPE/);
});
