import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const drawerSource = readFileSync("app/(shell)/matrix-2/_components/Matrix2DetailsDrawer.tsx", "utf8");
const boardSource = readFileSync("app/(shell)/matrix-2/_components/Matrix2Board.tsx", "utf8");
const pageSource = readFileSync("app/(shell)/matrix-2/page.tsx", "utf8");
const quickModulesSource = readFileSync("app/(shell)/matrix-2/_components/matrix2-quick-modules.tsx", "utf8");
const speakerRouteSource = readFileSync("app/api/events/[eventId]/speakers/route.ts", "utf8");
const sessionSpeakerRouteSource = readFileSync("app/api/events/[eventId]/matrix-2/sessions/[sessionId]/speakers/[speakerId]/route.ts", "utf8");
const speakerServiceSource = readFileSync("src/server/services/speakers.ts", "utf8");
const fnbCatalogServiceSource = readFileSync("lib/fnb-catalog.ts", "utf8");

// The quick drawer used to fire up to five network requests (F&B assignments,
// session roster, attendees?limit=200, speakers, F&B catalog) on every open,
// regardless of which panel was active. These tests lock the panel-aware
// gating so opening AV or Staffing (both snapshot-served) fetches nothing.

test("drawer no longer fires the old un-gated fetch effects on open", () => {
  // The three unconditional loaders that ran on every open are gone.
  assert.doesNotMatch(
    drawerSource,
    /useEffect\(\(\) => \{\s*void loadFnbAssignments\(\);\s*\}, \[loadFnbAssignments\]\)/,
    "F&B assignments must not be fetched unconditionally on open",
  );
  assert.doesNotMatch(
    drawerSource,
    /void loadBasicsRoster\(\);\s*void loadBasicsAttendees\(\);/,
    "roster + attendees must not be fetched unconditionally on open",
  );
  assert.doesNotMatch(
    drawerSource,
    /loadQuickPanelCatalogs/,
    "combined speakers+F&B catalog loader must be split into panel-gated loaders",
  );
});

test("opening AV or Staffing triggers no speaker/F&B/attendee fetch loaders", () => {
  // Every fetch effect early-returns unless its own panel is active. AV and
  // Staffing match none of these guards, so all loaders are skipped for them.
  assert.match(drawerSource, /if \(activeQuickPanel !== "speakers"\) return;/);
  assert.match(drawerSource, /if \(activeQuickPanel !== "fnb"\) return;/);
  assert.match(drawerSource, /if \(activeQuickPanel !== null\) return;/);
  // No fetch loader is gated on the "av" or "staffing" panels.
  assert.doesNotMatch(drawerSource, /activeQuickPanel === "av"[\s\S]{0,120}load[A-Z]/);
  assert.doesNotMatch(drawerSource, /activeQuickPanel === "staffing"[\s\S]{0,120}load[A-Z]/);
});

test("opening the Speakers panel loads the event speaker directory only", () => {
  assert.match(
    drawerSource,
    /useEffect\(\(\) => \{\s*if \(activeQuickPanel !== "speakers"\) return;[\s\S]*?void loadSpeakers\(\);\s*\}, \[activeQuickPanel, session\.eventId, loadSpeakers\]\)/,
  );
  assert.match(drawerSource, /const loadSpeakers = useCallback\([\s\S]*?\/events\/\$\{session\.eventId\}\/speakers/);
});

test("opening the F&B panel loads the catalog and this session's assignments only", () => {
  assert.match(
    drawerSource,
    /useEffect\(\(\) => \{\s*if \(activeQuickPanel !== "fnb"\) return;[\s\S]*?void loadFnbCatalog\(\);[\s\S]*?void loadFnbAssignments\(\);/,
  );
  assert.match(drawerSource, /const loadFnbCatalog = useCallback\([\s\S]*?\/events\/\$\{session\.eventId\}\/fnb-catalog/);
  assert.match(drawerSource, /const loadFnbAssignments = useCallback\(async \(\) => \{[\s\S]*?\/events\/\$\{session\.eventId\}\/matrix-2\/sessions\/\$\{session\.id\}\/fnb-catalog-assignments/);
});

test("the canonical event catalog query returns every active approved item without pagination", () => {
  const start = fnbCatalogServiceSource.indexOf("export async function listFnbCatalogItems");
  const end = fnbCatalogServiceSource.indexOf("export async function listFnbSourceMenus", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const catalogQuerySource = fnbCatalogServiceSource.slice(start, end);

  assert.match(catalogQuerySource, /eventFnbCatalogItem\.findMany/);
  assert.match(catalogQuerySource, /eventId,\s*archivedAt: null/);
  assert.doesNotMatch(catalogQuerySource, /\btake\s*:|\bskip\s*:/);
  assert.doesNotMatch(catalogQuerySource, /category:\s*\{|sessionType|sessionTypeId/);
});

test("Basics / root view loads the roster and attendee picker only", () => {
  assert.match(
    drawerSource,
    /useEffect\(\(\) => \{\s*if \(activeQuickPanel !== null\) return;[\s\S]*?void loadBasicsRoster\(\);[\s\S]*?void loadBasicsAttendees\(\);/,
  );
});

test("per-session/event memoization avoids refetching when moving between panels", () => {
  assert.match(drawerSource, /loadedPanelDataRef/);
  assert.match(drawerSource, /loadedPanelDataRef\.current\.speakers === session\.eventId/);
  assert.match(drawerSource, /loadedPanelDataRef\.current\.fnbAssignments !== session\.id/);
  assert.match(drawerSource, /loadedPanelDataRef\.current\.basicsRoster !== session\.rowId/);
});

test("save payload never drops F&B labels when the F&B panel was not opened", () => {
  // Falls back to the snapshot's foodAndBeverage when assignments were not fetched.
  assert.match(
    drawerSource,
    /const fnbCatalogLabels = fnbAssignmentsLoadedRef\.current\s*\?\s*fnbAssignments\.map\(\(assignment\) => assignment\.catalogItem\.itemName\)\s*:\s*session\.foodAndBeverage;/,
  );
  assert.match(
    drawerSource,
    /const fnbRequirementLabels = fnbAssignmentsLoadedRef\.current\s*\?\s*\[\]\s*:\s*selectedRequirementItemsByType\.FNB\.map\(\(item\) => item\.label\);/,
  );
  assert.match(drawerSource, /fnbAssignmentsLoadedRef\.current = true;/);
});

test("existing mutation flows still refresh via direct loader calls and canonical F&B refetches", () => {
  // Basics add/cancel still refresh the roster directly (not via a gated effect).
  assert.match(drawerSource, /async function addBasicsAttendee\(\)[\s\S]*?await loadBasicsRoster\(\);/);
  assert.match(drawerSource, /async function cancelBasicsEnrollment\([\s\S]*?await loadBasicsRoster\(\);/);
  // F&B add/remove persist through assignment routes and then refetch the
  // canonical assignment list so budget-sync-enriched rows cannot drift.
  assert.match(drawerSource, /async function addFnbCatalogAssignment\([\s\S]*?method: "POST"[\s\S]*?eventFnbCatalogItemId: item\.id[\s\S]*?await loadFnbAssignments\(\);/);
  assert.match(drawerSource, /async function removeFnbCatalogAssignment\([\s\S]*?method: "DELETE"[\s\S]*?await loadFnbAssignments\(\);/);
});

test("F&B quick panel uses canonical catalog items and session assignments, not legacy requirement rows", () => {
  const fnbPanelStart = drawerSource.indexOf('if (activeQuickPanel === "fnb")');
  const fnbPanelEnd = drawerSource.indexOf("const hasSelectedStaffing", fnbPanelStart);
  assert.notEqual(fnbPanelStart, -1);
  assert.notEqual(fnbPanelEnd, -1);
  const fnbPanelSource = drawerSource.slice(fnbPanelStart, fnbPanelEnd);

  assert.match(fnbPanelSource, /const hasSelectedFnb = fnbAssignments\.length > 0;/);
  assert.match(fnbPanelSource, /fnbAssignments\.map\(\(assignment\) => \(/);
  assert.match(fnbPanelSource, /filteredFnbCatalogItems\.map\(\(item\) => \(/);
  assert.match(fnbPanelSource, /fnbCategoryFilters\.map\(\(category\) =>/);
  assert.match(fnbPanelSource, /aria-label="F&B categories"/);
  assert.match(fnbPanelSource, /addFnbCatalogAssignment\(item\)/);
  assert.match(fnbPanelSource, /removeFnbCatalogAssignment\(assignment\)/);
  assert.match(fnbPanelSource, /No F&B catalog items yet/);
  assert.match(fnbPanelSource, /\/events\/\$\{session\.eventId\}\/fnb-catalog/);
  assert.doesNotMatch(fnbPanelSource, /filteredFnbRequirementItems/);
  assert.doesNotMatch(fnbPanelSource, /selectedRequirementItemsByType\.FNB\.map/);
  assert.doesNotMatch(fnbPanelSource, /addRequirementItem\(item\.id\)/);
  assert.doesNotMatch(fnbPanelSource, /removeRequirementItem\(item\.id\)/);
  assert.doesNotMatch(fnbPanelSource, /\.slice\(/);
});

test("quick drawer Speakers panel can create or reuse a speaker and assign it to the session", () => {
  assert.match(drawerSource, /const \[quickSpeakerFirstName, setQuickSpeakerFirstName\] = useState\(""\)/);
  assert.match(drawerSource, /const \[quickSpeakerLastName, setQuickSpeakerLastName\] = useState\(""\)/);
  assert.match(drawerSource, /const \[quickSpeakerEmail, setQuickSpeakerEmail\] = useState\(""\)/);
  assert.match(drawerSource, /function isValidEmail\(value: string\): boolean/);
  assert.match(drawerSource, /async function createOrReuseSpeakerFromQuickPanel\(\)/);
  assert.match(drawerSource, /fetch\(`\/api\/events\/\$\{session\.eventId\}\/speakers`, \{[\s\S]*method: "POST"/);
  assert.match(drawerSource, /createResponse\.status === 409[\s\S]*const speakers = await loadSpeakers\(\)/);
  assert.match(drawerSource, /normalizeEmail\(entry\.email \?\? ""\) === email/);
  assert.match(drawerSource, /await assignSpeakerToSession\(speaker\)/);
  assert.match(drawerSource, /setSelectedSpeakers\(\(current\) => uniqueSelections\(\[\.\.\.current, selectionFromSpeaker\(speaker\)\]\)\)/);
});

test("quick drawer speaker creation still relies on canonical write-gated APIs", () => {
  assert.match(speakerRouteSource, /const speaker = await createSpeaker\(eventId, authResult\.user, body\)/);
  assert.match(speakerServiceSource, /await assertEventAccess\(eventId, user, "write"\)/);
  assert.match(speakerServiceSource, /await assertDuplicateEmailAbsent\(eventId, payload\.email \?\? null\)/);
  assert.match(sessionSpeakerRouteSource, /await assertEventAccessForUser\(eventId, authResult\.user, "write"\)/);
  assert.match(sessionSpeakerRouteSource, /addMatrix2SessionSpeakerAssignment\(eventId, sessionId, speakerId, authResult\.user\.id\)/);
});

test("Room Set and Seating quick launchers use the canonical production availability gate", () => {
  assert.match(boardSource, /MATRIX2_QUICK_MODULES\.map/);
  assert.match(quickModulesSource, /isSessionModuleAvailable/);
  assert.match(quickModulesSource, /enabled: MATRIX2_ROOM_SET_SEATING_QUICK_LAUNCH_ENABLED/);
  assert.doesNotMatch(quickModulesSource, /destination: "unavailable"|unavailableLabel|Coming soon/);
  // Overview table no longer exposes Room Set / Seating row-end link-outs.
  assert.doesNotMatch(pageSource, /Open layout/);
  assert.doesNotMatch(pageSource, /Assign seating/);
  assert.match(pageSource, /if \(quickModule && !quickModule\.enabled\) return;/);
  assert.match(pageSource, /router\.push\(roomSetHref\(selectedEventId, sessionId, "layout"\)\)/);
  assert.match(pageSource, /router\.push\(roomSetHref\(selectedEventId, sessionId, "seating"\)\)/);
});

test("session registration is unavailable in the drawer before roster loaders can run", () => {
  assert.match(drawerSource, /const sessionRegistrationComingSoon = shouldGateSessionRegistration\(\);/);
  assert.match(drawerSource, /SessionRegistrationUnavailableCard/);
  // The canonical capability still short-circuits the legacy loaders.
  assert.match(drawerSource, /const loadBasicsRoster = useCallback\(async \(\) => \{\s*if \(sessionRegistrationComingSoon\) \{/);
  assert.match(drawerSource, /const loadBasicsAttendees = useCallback\(async \(\) => \{\s*if \(sessionRegistrationComingSoon\) \{/);
});
