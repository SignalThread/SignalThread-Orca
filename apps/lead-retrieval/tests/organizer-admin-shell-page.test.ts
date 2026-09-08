import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const pageSrc = readFileSync(path.join(process.cwd(), "app/app/organizer/page.tsx"), "utf8");
const sidebarSrc = readFileSync(path.join(process.cwd(), "components/layout/sidebar.tsx"), "utf8");

test("organizer overview keeps the role guard and uses only the existing organizer scope before event selection", () => {
  assert.match(pageSrc, /requireRole\("organizer_admin"\)/);
  assert.match(pageSrc, /const scope = await getOrganizerScope\(sessionUser\.id\)/);
  assert.match(pageSrc, /if \(!hasValidEventId\) \{\s*return <OrganizerOverviewPortfolio events=\{scope\.events\} \/>;\s*\}/);
  assert.match(pageSrc, /if \(scope\.events\.length === 0\)[\s\S]*?mode="empty"/);
});

test("organizer overview renders scoped event metadata and canonical open links", () => {
  assert.match(pageSrc, /Organizer Overview/);
  assert.match(pageSrc, /Your events/);
  assert.match(pageSrc, /formatEventEntrySubtitle\(event\.startDate, event\.status\)/);
  assert.match(pageSrc, /eventLocation\(event\)/);
  assert.match(pageSrc, /href=\{`\/app\/organizer\?eventId=\$\{encodeURIComponent\(event\.id\)\}`\}/);
  assert.match(pageSrc, /Open workspace/);
});

test("organizer sidebar has compact grouped navigation, active state, collapse behavior, and bottom help", () => {
  assert.match(sidebarSrc, /function buildOrganizerSections/);
  assert.match(sidebarSrc, /title: "Primary"/);
  assert.match(sidebarSrc, /title: "Administration"/);
  assert.match(sidebarSrc, /label: "Overview"/);
  assert.match(sidebarSrc, /function organizerRowClass/);
  assert.match(sidebarSrc, /h-11/);
  assert.match(sidebarSrc, /role === "organizer_admin" && !effectiveCollapsed/);
  assert.match(sidebarSrc, /aria-label="Organizer navigation"/);
  assert.match(sidebarSrc, /className="mt-auto border-t/);
  assert.match(sidebarSrc, /title=\{item\.label\}/, "collapsed icons retain accessible hover labels");
});

test("organizer sidebar retains only established organizer destinations", () => {
  for (const href of [
    "/app/organizer",
    "/app/organizer/events",
    "/app/organizer/exhibitors",
    "/app/organizer/performance",
    "/app/organizer/licenses",
    "/app/organizer/users",
    "/help"
  ]) {
    assert.match(sidebarSrc, new RegExp(`href: "${href.replace(/\//g, "\\/")}"`));
  }
});
