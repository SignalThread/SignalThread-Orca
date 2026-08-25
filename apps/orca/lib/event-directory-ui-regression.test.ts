import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const dir = "app/(shell)/events/[eventId]/directory/_components";
const main = readFileSync(`${dir}/event-directory.tsx`, "utf8");
const form = readFileSync(`${dir}/person-form-drawer.tsx`, "utf8");
const detail = readFileSync(`${dir}/person-detail-drawer.tsx`, "utf8");
const nav = readFileSync("components/event/event-nav.tsx", "utf8");
const page = readFileSync("app/(shell)/events/[eventId]/directory/page.tsx", "utf8");

test("Directory route + page exist", () => {
  assert.ok(existsSync("app/(shell)/events/[eventId]/directory/page.tsx"));
  assert.ok(existsSync(`${dir}/event-directory.tsx`));
  assert.match(page, /h-full min-h-0 overflow-y-auto/);
});

test("Directory is added to the event nav after Run of Show", () => {
  assert.match(nav, /key: "directory", label: "Directory", suffix: "\/directory"/);
  const matrixIdx = nav.indexOf('label: "Run of Show"');
  const dirIdx = nav.indexOf('label: "Directory"');
  const speakersIdx = nav.indexOf('label: "Speakers"');
  assert.ok(matrixIdx < dirIdx && dirIdx < speakersIdx, "Directory sits between Run of Show and Speakers");
});

test("page renders canonical summary cards including Needs review", () => {
  assert.match(main, /Total people/);
  assert.match(main, /Contacts/);
  assert.match(main, /Attendees \/ Registrants/);
  assert.match(main, /Speakers/);
  assert.match(main, /Sponsors \/ Exhibitors/);
  assert.match(main, /VIP \/ Press/);
  assert.match(main, /Needs review/);
});

test("summary cards are clickable button filters with active state and clear behavior", () => {
  assert.match(main, /type="button"/);
  assert.match(main, /aria-pressed=\{isActive\}/);
  assert.match(main, /setSummaryFilter\(card\.key\)/);
  assert.match(main, /summaryFilter !== "all"/);
  assert.match(main, /setSummaryFilter\("all"\)/);
  assert.match(main, /filteredPeople/);
});

test("page has search + role + source + status filters that feed the API query", () => {
  assert.match(main, /aria-label="Search directory"/);
  assert.match(main, /aria-label="Filter by role"/);
  assert.match(main, /aria-label="Filter by source"/);
  assert.match(main, /aria-label="Filter by status"/);
  assert.match(main, /params\.set\("search", debouncedSearch\)/);
  assert.match(main, /params\.set\("role", roleFilter\)/);
});

test("table has the required columns and clickable role chips", () => {
  for (const col of ["Name", "Email", "Company", "Roles", "Source", "Used in", "Status", "Updated", "Actions"]) {
    assert.ok(main.includes(`>${col}<`), `column ${col}`);
  }
  assert.match(main, /Select page/);
  assert.match(main, /Select \$\{person\.displayName\}/);
  assert.match(main, /roleChipClasses\(role\)/);
  assert.match(main, /uniqueDisplayRoles\(person\.roles\)/);
});

test("Directory bulk selection can create Marketing Audiences from selected or filtered people", () => {
  assert.match(main, /audienceSelectionMode/);
  assert.match(main, /Create Audience/);
  assert.match(main, /Select all matching filters/);
  assert.match(main, /selectionMode: audienceSelectionMode === "filtered" \? "filtered" : "manual"/);
  assert.match(main, /personIds: \[\.\.\.selectedPersonIds\]/);
  assert.match(main, /summaryFilter/);
  assert.match(main, /\/api\/events\/\$\{eventId\}\/marketing\/audiences\/from-directory/);
  assert.match(main, /Create Marketing Audience/);
  assert.match(main, /Audience Name/);
  assert.match(main, /All people matching the current Event Directory filters/);
  assert.match(main, /Manually selected Event Directory people/);
  assert.match(main, /View Audience/);
  assert.match(main, /createCampaignFromAudience=\$\{audienceResult\.audience\.id\}/);
});

test("Directory selected email action validates recipients and reports no-provider results", () => {
  assert.match(main, /selectedPersonIds/);
  assert.match(main, /Email selected/);
  assert.match(main, /Email directory people/);
  assert.match(main, /selectedWithEmail/);
  assert.match(main, /selectedMissingEmail/);
  assert.match(main, /missing\/invalid email/);
  assert.match(main, /\/api\/events\/\$\{eventId\}\/directory\/email/);
  assert.match(main, /No selected people have a valid email address/);
  assert.match(main, /not delivered because no provider is configured/);
  assert.match(main, /Server confirms delivery, failure, or no-provider status per recipient/);
});

test("empty + loading states render", () => {
  assert.match(main, /Loading directory…/);
  assert.match(main, /No people yet\./);
  assert.match(main, /Directory data is unavailable\./);
  assert.match(main, /Try again/);
});

test("directory loading is paginated, cancellable, and stale-response safe", () => {
  assert.match(main, /new AbortController\(\)/);
  assert.match(main, /directoryRequestSequence/);
  assert.match(main, /controller\.signal\.aborted/);
  assert.match(main, /params\.set\("cursor", nextCursor\)/);
  assert.match(main, /new URLSearchParams\(\{ limit: "200" \}\)/);
  assert.match(main, /setPeople\(\[\]\)/);
  assert.match(main, /setSummary\(null\)/);
  assert.match(main, /loadedEventId !== eventId/);
  assert.match(detail, /new AbortController\(\)/);
  assert.match(detail, /requestSequence/);
  assert.match(detail, /Loading person details…/);
  assert.match(detail, /Try again/);
});

test("module aggregation requires an explicit user action", () => {
  assert.match(main, /Sync module people/);
  assert.match(main, /method: "POST"/);
  assert.match(main, /\/api\/events\/\$\{eventId\}\/directory/);
});

test("add flow surfaces possible-duplicate response with use-existing / create-separate choices", () => {
  assert.match(form, /response\.status === 409 && payload\?\.status === "possible_duplicate"/);
  assert.match(form, /Open existing person/);
  assert.match(form, /Create separate person/);
  assert.match(form, /submitAdd\(true\)/); // create-separate uses allowDuplicate
});

test("role pickers expose MVP labels and avoid legacy role terminology", () => {
  assert.match(form, /DIRECTORY_ROLE_OPTIONS\.map/);
  assert.match(form, /Contact is for event-tied leads who are not registered yet/);
  assert.doesNotMatch(form, /Prospect\/Marketing contact/);
  assert.doesNotMatch(form, /Registrant/);
});

test("edit reconciles roles via add/remove endpoints (no person deletion)", () => {
  assert.ok(form.includes("/roles`"));
  assert.ok(form.includes('method: "POST"'));
  assert.match(form, /\/roles\/\$\{roleId\}`/);
  assert.ok(form.includes('method: "DELETE"'));
});

test("delete confirmation distinguishes delete vs removed-due-to-links and never claims external deletion", () => {
  assert.match(main, /Delete person\?/);
  assert.match(main, /hard_deleted/);
  assert.match(main, /kept because of linked records or history/);
  assert.match(main, /does not delete anyone in an external registration platform/);
});

test("detail drawer shows profile, roles, source, and used-in module records", () => {
  assert.match(detail, /Roles/);
  assert.match(detail, /Source/);
  assert.match(detail, /Used in/);
  assert.match(detail, /read-only/);
  assert.doesNotMatch(detail, /Seating guest/);
  assert.doesNotMatch(detail, /Seating module/);
});

test("import button opens the CSV import modal", () => {
  assert.match(main, /setIsImportOpen\(true\)/);
  assert.match(main, /<DirectoryImportModal/);
});
