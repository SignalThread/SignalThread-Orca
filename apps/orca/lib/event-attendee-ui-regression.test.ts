import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const dir = "app/(shell)/events/[eventId]/attendees/_components";
const main = readFileSync(`${dir}/event-attendees.tsx`, "utf8");
const form = readFileSync(`${dir}/attendee-form-drawer.tsx`, "utf8");
const importModal = readFileSync(`${dir}/attendee-import-modal.tsx`, "utf8");
const detail = readFileSync(`${dir}/attendee-detail-drawer.tsx`, "utf8");
const page = readFileSync("app/(shell)/events/[eventId]/attendees/page.tsx", "utf8");
const nav = readFileSync("components/event/event-nav.tsx", "utf8");

test("attendees route + page exist and the page scrolls", () => {
  assert.ok(existsSync("app/(shell)/events/[eventId]/attendees/page.tsx"));
  assert.ok(existsSync(`${dir}/event-attendees.tsx`));
  assert.match(page, /h-full min-h-0 overflow-y-auto/);
});

test("Attendees is added to the event nav after Directory", () => {
  assert.match(nav, /key: "attendees", label: "Attendees", suffix: "\/attendees"/);
  const dirIdx = nav.indexOf('label: "Directory"');
  const attIdx = nav.indexOf('label: "Attendees"');
  const speakersIdx = nav.indexOf('label: "Speakers"');
  assert.ok(dirIdx < attIdx && attIdx < speakersIdx, "Attendees sits between Directory and Speakers");
});

test("page renders the operational summary cards as clickable filters", () => {
  for (const c of ["Total attendees", "Registered", "Pending / waitlisted", "Cancelled", "VIP / Press", "Missing email", "Needs review", "Sync conflicts"]) {
    assert.ok(main.includes(c), `card ${c}`);
  }
  assert.match(main, /aria-pressed=\{isActive\}/);
  assert.match(main, /setSummaryFilter\(card\.key\)/);
  assert.match(main, /filteredAttendees/);
});

test("page has search + registration + role + source filters feeding the API", () => {
  assert.match(main, /aria-label="Search attendees"/);
  assert.match(main, /aria-label="Filter by registration status"/);
  assert.match(main, /aria-label="Filter by role"/);
  assert.match(main, /aria-label="Filter by source"/);
  assert.match(main, /params\.set\("registrationStatus", registrationFilter\)/);
});

test("table separates roles from registration status and shows source + sync + used-in", () => {
  for (const col of ["Name", "Email", "Company", "Roles", "Registration", "Type", "Source", "Sync", "Used in", "Actions"]) {
    assert.ok(main.includes(`>${col}<`), `column ${col}`);
  }
  // role chips come from Directory roles, registration is a separate status chip
  assert.match(main, /roleChipClasses\(role\)/);
  assert.match(main, /registrationStatusChip\(a\.registrationStatus\)/);
});

test("empty + loading states explain manual add and CSV import", () => {
  assert.match(main, /Loading attendees…/);
  assert.match(main, /Add one manually or import a CSV/);
});

test("add drawer separates Profile (Directory) / Attendance / Registration and explains email linking + optional registration record", () => {
  assert.match(form, /Profile \(Directory\)/);
  assert.match(form, />Attendance</);
  assert.match(form, /Registration \/ source \(optional\)/);
  assert.match(form, /no duplicate is created/);
  assert.match(form, /registration record is only created when provider\/registration data is entered/);
});

test("CSV import modal maps attendee columns, previews, and posts to the attendee import endpoint", () => {
  assert.match(importModal, /buildAttendeeInitialMapping/);
  assert.match(importModal, /attendees\/imports`/);
  assert.match(importModal, /Conflicts/);
  assert.match(importModal, /Invalid/);
});

test("detail drawer is a 360 view (profile/attendance/registration/roles/used-in) with cancel + remove lifecycle", () => {
  assert.match(detail, /title="Profile \(Directory\)"/);
  assert.match(detail, /title="Attendance"/);
  assert.match(detail, /title="Registration \/ source"/);
  assert.match(detail, /title="Roles"/);
  assert.match(detail, /title="Used in"/);
  assert.match(detail, /Cancel registration/);
  assert.match(detail, /Remove attendee/);
  // delete removes participation but keeps the Directory person
  assert.match(detail, /Directory person kept/);
});

test("attendee UI does not surface internal model or provider-specific terms in core copy", () => {
  // (EventAttendees is the legitimate component name, so it is not checked here.)
  for (const term of ["EventRegistrationRecord", "Prisma", "mutation", "Bizzabo-specific"]) {
    assert.ok(!main.includes(term), `list should not surface ${term}`);
  }
});
