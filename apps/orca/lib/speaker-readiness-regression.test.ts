import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readinessServiceSource = readFileSync("src/server/services/speaker-readiness.ts", "utf8");
const readinessRouteSource = readFileSync("app/api/events/[eventId]/speaker-readiness/route.ts", "utf8");
const directorySource = readFileSync(
  "app/(shell)/events/[eventId]/speakers/_components/speaker-directory.tsx",
  "utf8",
);

function sourceBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

test("readiness overview is event-scoped and requires read access", () => {
  const overviewSource = readinessServiceSource.slice(
    readinessServiceSource.indexOf("export async function getSpeakerReadinessOverview"),
  );
  assert.equal(overviewSource.includes('await assertEventAccessForUser(eventId, user, "read")'), true);
  assert.equal(overviewSource.includes("where: { eventId }"), true);
  assert.equal(readinessRouteSource.includes("resolveRequestUser(request)"), true);
  assert.equal(readinessRouteSource.includes("getSpeakerReadinessOverview(eventId, authResult.user)"), true);
});

test("readiness never mixes token or submission state across events", () => {
  const overviewSource = readinessServiceSource.slice(
    readinessServiceSource.indexOf("export async function getSpeakerReadinessOverview"),
  );
  assert.equal(overviewSource.includes("speaker.findMany"), true);
  assert.equal(overviewSource.includes("where: { eventId }"), true);
  assert.equal(overviewSource.includes("intakeTokens:"), true);
  assert.equal(overviewSource.includes("profileSubmissions:"), true);
  assert.equal(overviewSource.includes("speakerIntakeToken.findMany"), false);
  assert.equal(overviewSource.includes("speakerProfileSubmission.findMany"), false);
});

test("readiness flags are computed deterministically in a pure server-side helper", () => {
  const computeSource = sourceBetween(
    readinessServiceSource,
    "export function computeSpeakerReadinessFlags",
    "export async function getSpeakerReadinessOverview",
  );
  for (const flag of [
    "missing_bio",
    "missing_headshot",
    "missing_title_company",
    "missing_av_needs",
    "missing_travel_needs",
    "missing_dietary",
    "request_not_sent",
    "request_pending",
    "submitted_pending_review",
    "complete",
  ]) {
    assert.equal(computeSource.includes(`"${flag}"`), true, `missing readiness flag: ${flag}`);
  }
  // Pure helper: no DB calls, no Date-free randomness beyond expiry comparison
  assert.equal(computeSource.includes("getPrisma"), false);
  assert.equal(computeSource.includes("fetch("), false);
});

test("readiness uses canonical speaker data plus token and submission state, no duplication", () => {
  const overviewSource = readinessServiceSource.slice(
    readinessServiceSource.indexOf("export async function getSpeakerReadinessOverview"),
  );
  assert.equal(overviewSource.includes("speaker.findMany"), true);
  assert.equal(overviewSource.includes("intakeTokens"), true);
  assert.equal(overviewSource.includes('where: { status: "PENDING" }'), true);
  // No new speaker-like rows are written
  assert.equal(overviewSource.includes(".create"), false);
  assert.equal(overviewSource.includes(".update"), false);
});

test("approved vs pending submission state changes readiness output", () => {
  const computeSource = sourceBetween(
    readinessServiceSource,
    "export function computeSpeakerReadinessFlags",
    "export async function getSpeakerReadinessOverview",
  );
  // Pending review flag derives from PENDING submissions presence
  assert.equal(computeSource.includes("profileSubmissions.length > 0"), true);
  // Complete only when nothing else flagged
  assert.equal(computeSource.includes("flags.length === 0"), true);
});

test("directory renders readiness dashboard with summary counts and compact filters", () => {
  assert.equal(directorySource.includes("Speaker Readiness"), true);
  assert.equal(directorySource.includes("READINESS_CHIPS"), true);
  assert.equal(directorySource.includes("/speaker-readiness`)"), true);
  assert.equal(directorySource.includes("setReadinessFilter"), true);
  assert.equal(directorySource.includes("readinessFlagsBySpeakerId"), true);
  assert.equal(directorySource.includes("Complete"), true);
  assert.equal(directorySource.includes("Needs action"), true);
  assert.equal(directorySource.includes("Requests pending"), true);
  assert.equal(directorySource.includes("Scheduling conflicts"), true);
  assert.equal(directorySource.includes("Clear readiness filter"), true);
  assert.equal(directorySource.includes("Review conflict"), false);
  assert.equal(directorySource.includes("SpeakerConflictDisclosure"), true);
  assert.equal(directorySource.includes("Conflict details"), true);
  assert.equal(directorySource.includes("All speakers"), true);
  assert.equal(directorySource.includes("Speakers missing profile details"), true);
  assert.equal(directorySource.includes("Speakers with scheduling conflicts"), true);
  assert.equal(directorySource.includes("Speakers needing attention"), false);
  // Directory mutations keep counts in sync.
  assert.equal(directorySource.includes("void loadReadiness()"), true);
});

test("speaker directory owns vertical scrolling inside the event workspace shell", () => {
  assert.equal(
    directorySource.includes('className="h-full min-h-0 space-y-5 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"'),
    true,
  );
  assert.equal(directorySource.includes('className="overflow-x-auto"'), true);
});

test("readiness summary tiles drive the same speaker list filter state as pills", () => {
  assert.equal(directorySource.includes('type SummaryReadinessFilterKey = "complete" | "needs_action";'), true);
  assert.equal(directorySource.includes('if (filter === "complete") return flags.includes("complete");'), true);
  assert.equal(directorySource.includes('if (filter === "needs_action") return !flags.includes("complete");'), true);
  assert.equal(directorySource.includes('aria-pressed={readinessFilter === "complete"}'), true);
  assert.equal(directorySource.includes('aria-pressed={readinessFilter === "needs_action"}'), true);
  assert.equal(directorySource.includes('aria-pressed={readinessFilter === "requests_pending"}'), true);
  assert.equal(directorySource.includes('aria-pressed={readinessFilter === "conflicts"}'), true);
  assert.equal(directorySource.includes('setReadinessFilter(readinessFilter === "requests_pending" ? "ALL" : "requests_pending")'), true);
  assert.equal(directorySource.includes('setReadinessFilter(readinessFilter === "conflicts" ? "ALL" : "conflicts")'), true);
});

test("speaker tools sit above readiness and never below the searchable speaker list", () => {
  const headerIndex = directorySource.indexOf("Speaker Directory");
  const readinessIndex = directorySource.indexOf("Speaker Readiness");
  const searchIndex = directorySource.indexOf('placeholder="Search name, title, company, or email"');
  const tableIndex = directorySource.indexOf('<table className="w-full min-w-[1080px]">');
  const toolsIndex = directorySource.indexOf('aria-label="Speaker Tools"');
  const toolsLastIndex = directorySource.lastIndexOf('aria-label="Speaker Tools"');
  const toolsSource = sourceBetween(directorySource, 'aria-label="Speaker Tools"', 'aria-label="Speaker readiness dashboard"');
  const onsiteIndex = directorySource.indexOf("<SpeakerOnsitePanel");

  assert.notEqual(headerIndex, -1);
  assert.notEqual(readinessIndex, -1);
  assert.notEqual(searchIndex, -1);
  assert.notEqual(tableIndex, -1);
  assert.notEqual(toolsIndex, -1);
  assert.notEqual(onsiteIndex, -1);
  assert.equal(toolsIndex, toolsLastIndex);
  assert.equal(headerIndex < toolsIndex, true);
  assert.equal(toolsIndex < readinessIndex, true);
  assert.equal(readinessIndex < searchIndex, true);
  assert.equal(searchIndex < tableIndex, true);
  assert.equal(toolsIndex < onsiteIndex, true);
  assert.equal(tableIndex < toolsIndex, false);
  assert.equal(directorySource.includes("isSpeakerToolsOpen"), true);
  assert.equal(directorySource.includes("setIsSpeakerToolsOpen((current) => !current)"), true);
  assert.equal(directorySource.includes('aria-expanded={isSpeakerToolsOpen}'), true);
  assert.equal(directorySource.includes('aria-controls="speaker-tools-accordion"'), true);
  assert.equal(directorySource.includes('id="speaker-tools-accordion"'), true);
  assert.equal(directorySource.includes("Reminders and speaker portal instructions"), true);
  assert.equal(toolsSource.includes("<SpeakerRemindersPanel"), true);
  assert.equal(toolsSource.includes('variant="inline"'), true);
  assert.equal(toolsSource.includes("Portal and reminder utilities."), false);
});

test("readiness filter composes with existing status and search filters", () => {
  const filterSource = sourceBetween(directorySource, "const filteredSpeakers = useMemo", "const readinessListCopy");
  assert.equal(filterSource.includes('statusFilter !== "ALL"'), true);
  assert.equal(filterSource.includes('readinessFilter !== "ALL"'), true);
  assert.equal(filterSource.includes("matchesReadinessFilter"), true);
});

test("main speaker list shows readiness details inline instead of duplicating a second table", () => {
  assert.equal(directorySource.includes("Missing items"), true);
  assert.equal(directorySource.includes("Request status"), true);
  assert.equal(directorySource.includes("Conflict"), true);
  assert.equal(directorySource.includes("<SpeakerConflictDisclosure conflicts={speakerConflicts} />"), true);
  assert.equal(directorySource.includes("missingItems.slice(0, 2)"), true);
  assert.equal(directorySource.includes("Open speaker"), true);
  assert.equal(directorySource.includes("speakerRowRefs"), true);
  assert.equal(directorySource.includes("setHighlightedSpeakerId"), true);
});

// --- Prompt 19: onsite packet + readiness extension ---

const onsiteServiceSource = readFileSync("src/server/services/speaker-onsite.ts", "utf8");
const onsiteRouteSource = readFileSync("app/api/events/[eventId]/speaker-onsite/route.ts", "utf8");
const portalServiceSource = readFileSync("src/server/services/speaker-portal.ts", "utf8");
const portalOnsiteComponentSource = readFileSync(
  "app/speaker-portal/[token]/_components/speaker-portal-onsite.tsx",
  "utf8",
);
const onsitePanelSource = readFileSync(
  "app/(shell)/events/[eventId]/speakers/_components/speaker-onsite-panel.tsx",
  "utf8",
);
const prismaSchemaSource = readFileSync("prisma/schema.prisma", "utf8");
const onsiteMigrationSource = readFileSync(
  "test-fixtures/legacy-orca-migrations/20260611170000_add_speaker_onsite_info/migration.sql",
  "utf8",
);

test("readiness now derives deck and document state from canonical sources", () => {
  const computeSource = sourceBetween(
    readinessServiceSource,
    "export function computeSpeakerReadinessFlags",
    "export async function getSpeakerReadinessOverview",
  );
  for (const flag of ["missing_deck", "deck_not_approved", "docs_incomplete"]) {
    assert.equal(computeSource.includes(`"${flag}"`), true, `missing readiness flag: ${flag}`);
  }
  // Docs Hub status wins for linked documents; review status otherwise.
  assert.equal(computeSource.includes('request.document.status !== "APPROVED"'), true);
  assert.equal(computeSource.includes("request.speakerFileId === null"), true);
  // Still a pure helper — readiness is derived, never stored or faked.
  assert.equal(computeSource.includes("getPrisma"), false);

  const overviewSource = readinessServiceSource.slice(
    readinessServiceSource.indexOf("export async function getSpeakerReadinessOverview"),
  );
  assert.equal(overviewSource.includes('where: { kind: "SLIDES" }'), true);
  assert.equal(overviewSource.includes("documentRequests:"), true);
  assert.equal(overviewSource.includes(".create"), false, "readiness must stay read-only");
  assert.equal(overviewSource.includes(".update"), false, "readiness must stay read-only");
});

test("onsite info is a single additive event-scoped record", () => {
  const modelSource = sourceBetween(prismaSchemaSource, "model SpeakerOnsiteInfo {", "model ");
  assert.equal(modelSource.includes("eventId             String   @unique @db.Uuid"), true);
  for (const field of ["greenRoomLocation", "arrivalInstructions", "badgePickupInfo", "onsiteContact", "avRehearsalInfo"]) {
    assert.equal(modelSource.includes(field), true, `onsite info must include ${field}`);
  }
  assert.equal(modelSource.includes("Json"), false);
  assert.equal(onsiteMigrationSource.includes("DROP"), false, "migration must stay additive");
  // Onsite info never duplicates Matrix schedule fields.
  for (const field of ["sessionName", "roomName", "dayDate", "startTime"]) {
    assert.equal(modelSource.includes(field), false, `onsite info must not copy Matrix field ${field}`);
  }
});

test("onsite admin route authenticates and the service enforces event access + audit", () => {
  assert.equal(onsiteRouteSource.includes("resolveRequestUser(request)"), true);
  assert.equal(onsiteRouteSource.includes("authResult.user"), true);

  const upsertSource = onsiteServiceSource.slice(
    onsiteServiceSource.indexOf("export async function upsertSpeakerOnsiteInfo"),
  );
  assert.equal(upsertSource.includes('await assertEventAccessForUser(eventId, user, "write")'), true);
  assert.equal(upsertSource.includes("updatedByUserId: user.id"), true);
  assert.equal(upsertSource.includes("logSpeakerActivity("), true);
});

test("portal onsite packet uses canonical Matrix sessions plus event onsite info only", () => {
  // Portal view fetches onsite info inside the scoped view builder, whose
  // eventId comes only from a resolved token or planner-authorized preview.
  const builderSource = portalServiceSource.slice(
    portalServiceSource.indexOf("async function buildSpeakerPortalViewData"),
    portalServiceSource.indexOf("export async function submitSpeakerPortalProfile"),
  );
  assert.equal(builderSource.includes("speakerOnsiteInfo.findUnique"), true);
  assert.equal(builderSource.includes("where: { eventId }"), true);
  // Schedule in the packet comes from the same canonical sessions the view already exposes.
  assert.equal(portalOnsiteComponentSource.includes("sessions.map"), true);
  assert.equal(portalOnsiteComponentSource.includes("Onsite Packet"), true);
  // The packet component is display-only: no fetches, no client mutations.
  assert.equal(portalOnsiteComponentSource.includes("fetch("), false);
  assert.equal(portalOnsiteComponentSource.includes('"use client"'), false);
});

test("planner onsite panel edits through the event-scoped API", () => {
  assert.equal(onsitePanelSource.includes("/speaker-onsite"), true);
  assert.equal(onsitePanelSource.includes("shown to all speakers"), true);
  assert.equal(directorySource.includes("SpeakerOnsitePanel"), true);
});
