import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const portalServiceSource = readFileSync("src/server/services/speaker-portal.ts", "utf8");
const portalViewRouteSource = readFileSync("app/api/public/speaker-portal/[token]/route.ts", "utf8");
const portalSubmissionRouteSource = readFileSync(
  "app/api/public/speaker-portal/[token]/submission/route.ts",
  "utf8",
);
const portalPresignRouteSource = readFileSync(
  "app/api/public/speaker-portal/[token]/headshot/presign/route.ts",
  "utf8",
);
const portalPageSource = readFileSync("app/speaker-portal/[token]/page.tsx", "utf8");
const portalFormSource = readFileSync("app/speaker-portal/[token]/_components/speaker-portal-form.tsx", "utf8");
const portalDashboardSource = readFileSync(
  "app/speaker-portal/[token]/_components/speaker-portal-dashboard.tsx",
  "utf8",
);
const portalWorkspaceSource = readFileSync(
  "app/speaker-portal/[token]/_components/speaker-portal-workspace.tsx",
  "utf8",
);
const portalSessionsSource = readFileSync(
  "app/speaker-portal/[token]/_components/speaker-portal-sessions.tsx",
  "utf8",
);

function sourceBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

test("portal view resolves through the persistent token and loads only that speaker", () => {
  const tokenPathSource = sourceBetween(
    portalServiceSource,
    "export async function getSpeakerPortalView",
    "export async function getSpeakerPortalViewForAdminPreview",
  );
  assert.equal(tokenPathSource.includes("await resolveSpeakerPortalToken(rawToken)"), true);
  assert.equal(
    tokenPathSource.includes("buildSpeakerPortalViewData(resolved.speakerId, resolved.eventId)"),
    true,
    "the token path must pass only resolved token identity into the view builder",
  );

  const viewSource = sourceBetween(
    portalServiceSource,
    "async function buildSpeakerPortalViewData",
    "export async function getSpeakerPortalView",
  );
  assert.equal(viewSource.includes("id: speakerId, eventId"), true);
  assert.equal(viewSource.includes("findFirst"), true);
  assert.equal(viewSource.includes("findMany"), false, "portal must never list other speakers");
});

test("portal view excludes internal notes and admin-only data", () => {
  const selectSource = sourceBetween(portalServiceSource, "async function buildSpeakerPortalViewData", "sessionAssignments");
  assert.equal(selectSource.includes("notes: true"), false);
  assert.equal(selectSource.includes("intakeTokenSentAt"), false);

  const profileTypeSource = sourceBetween(portalServiceSource, "export type SpeakerPortalProfile", "};");
  assert.equal(profileTypeSource.includes("notes"), false);
  assert.equal(profileTypeSource.includes("eventId"), false);
});

test("portal view includes assigned sessions read-only", () => {
  const viewSource = sourceBetween(
    portalServiceSource,
    "async function buildSpeakerPortalViewData",
    "export async function submitSpeakerPortalProfile",
  );
  assert.equal(viewSource.includes("sessionAssignments"), true);
  assert.equal(viewSource.includes("sessionName: true"), true);
  assert.equal(viewSource.includes("roomName: true"), true);
  // No assignment mutation anywhere in the portal service
  assert.equal(portalServiceSource.includes("sessionSpeakerAssignment.create"), false);
  assert.equal(portalServiceSource.includes("sessionSpeakerAssignment.delete"), false);
  assert.equal(portalServiceSource.includes('INSERT INTO "SessionSpeakerAssignment"'), false);
  assert.equal(portalServiceSource.includes('DELETE FROM "SessionSpeakerAssignment"'), false);
});

test("portal session display comes from canonical Matrix rows for the resolved speaker only", () => {
  const viewSource = sourceBetween(
    portalServiceSource,
    "async function buildSpeakerPortalViewData",
    "export async function submitSpeakerPortalProfile",
  );
  const assignmentSource = sourceBetween(viewSource, "sessionAssignments:", "profileSubmissions:");
  assert.equal(assignmentSource.includes("session:"), true);
  assert.equal(assignmentSource.includes("sessionName: true"), true);
  assert.equal(assignmentSource.includes("roomName: true"), true);
  assert.equal(assignmentSource.includes("dayDate: true"), true);
  assert.equal(viewSource.includes("where: { id: speakerId, eventId }"), true);
  assert.equal(viewSource.includes("matrixRow.update"), false);
  assert.equal(viewSource.includes("sessionName:"), true);
});

test("portal submit creates a pending submission and never updates canonical Speaker", () => {
  const submitSource = portalServiceSource.slice(
    portalServiceSource.indexOf("export async function submitSpeakerPortalProfile"),
  );
  assert.equal(submitSource.includes("speakerProfileSubmission.create"), true);
  assert.equal(submitSource.includes('status: "PENDING"'), true);
  assert.equal(submitSource.includes("speaker.update"), false, "portal submit must not touch canonical Speaker fields");
  assert.equal(submitSource.includes("markSpeakerPortalTokenSubmitted(resolved.tokenId)"), true);
  // Internal notes can never be written from the portal
  assert.equal(submitSource.includes("notes:"), false);
  assert.equal(submitSource.includes("matrixRow"), false, "portal submissions must not update canonical Matrix sessions");
  assert.equal(submitSource.includes("sessionName"), false, "portal submissions must not accept session title edits");
});

test("portal payloads exclude internal planner notes, token state, and storage metadata", () => {
  const profileTypeSource = sourceBetween(portalServiceSource, "export type SpeakerPortalProfile", "};");
  const viewSource = sourceBetween(
    portalServiceSource,
    "async function buildSpeakerPortalViewData",
    "export async function submitSpeakerPortalProfile",
  );
  for (const internalField of [
    "notes",
    "tokenHash",
    "intakeTokenSentAt",
    "intakeSubmittedAt",
    "reminderSentAt",
    "objectKey",
    "uploadedByUserId",
  ]) {
    assert.equal(profileTypeSource.includes(internalField), false, `profile type leaked ${internalField}`);
    assert.equal(viewSource.includes(`${internalField}: true`), false, `portal select leaked ${internalField}`);
  }
  assert.equal(viewSource.includes("noteToPlanner: true"), false, "planner notes from submissions must not appear in portal view");
});

test("portal submission validates input and requires at least one field", () => {
  const submitSource = portalServiceSource.slice(
    portalServiceSource.indexOf("export async function submitSpeakerPortalProfile"),
  );
  assert.equal(submitSource.includes('throw new SpeakerPortalError("name cannot be empty", 400)'), true);
  assert.equal(submitSource.includes("Submission must include at least one field"), true);
  assert.equal(portalServiceSource.includes("topics must be an array of strings"), true);
});

test("public portal routes are unauthenticated but token-gated, with no admin imports", () => {
  for (const [name, source] of [
    ["view", portalViewRouteSource],
    ["submission", portalSubmissionRouteSource],
    ["presign", portalPresignRouteSource],
  ] as const) {
    assert.equal(source.includes("resolveRequestUser"), false, `${name} route must not use admin auth`);
    assert.equal(source.includes("assertEventAccessForUser"), false, `${name} route must not use event access`);
  }

  assert.equal(portalViewRouteSource.includes("getSpeakerPortalView(token)"), true);
  assert.equal(portalSubmissionRouteSource.includes("submitSpeakerPortalProfile(token, body)"), true);
  assert.equal(portalPresignRouteSource.includes("await resolveSpeakerPortalToken(token)"), true);
  assert.equal(portalPresignRouteSource.includes("eventId: resolved.eventId"), true);
  assert.equal(portalPresignRouteSource.includes("speakerId: resolved.speakerId"), true);
});

test("portal page surfaces token errors as an unavailable state", () => {
  assert.equal(portalPageSource.includes("getSpeakerPortalView(token)"), true);
  assert.equal(portalPageSource.includes("Link unavailable"), true);
  assert.equal(portalPageSource.includes("SpeakerPortalTokenError"), true);
});

test("portal page is dashboard-first and uses only token-scoped public portal summaries", () => {
  assert.equal(portalPageSource.includes("<SpeakerPortalDashboard"), true);
  assert.ok(portalPageSource.indexOf("<SpeakerPortalForm") > portalPageSource.indexOf("<SpeakerPortalDashboard"));
  assert.equal(portalPageSource.includes("listPortalSpeakerFiles(token)"), true);
  assert.equal(portalPageSource.includes("listPortalSpeakerDocumentRequests(token)"), true);
  assert.equal(portalPageSource.includes("listPortalSpeakerMessages(token)"), true);
  assert.equal(portalDashboardSource.includes("Secure speaker workspace"), true);
  assert.equal(portalDashboardSource.includes("Requirements"), true);
  assert.equal(portalDashboardSource.includes("requirements complete"), true);
  assert.equal(portalDashboardSource.includes("Your readiness checklist"), true);
  assert.equal(portalDashboardSource.includes("Next actions"), true);
  assert.equal(portalDashboardSource.includes("Upload presentation deck"), true);
  assert.equal(portalDashboardSource.includes("Respond to document requests"), true);
  assert.equal(portalDashboardSource.includes("Check onsite instructions"), true);
  assert.equal(portalDashboardSource.includes(">Tasks<"), false);
  assert.equal(portalDashboardSource.includes("speaker tasks complete"), false);
  assert.equal(portalDashboardSource.includes("PortalTask"), false);
  assert.equal(portalDashboardSource.includes("buildTasks"), false);
  assert.equal(portalDashboardSource.includes("/api/events/"), false);
  assert.equal(portalDashboardSource.toLowerCase().includes("internalnote"), false);
});

test("portal workspace renders one active speaker section instead of stacked content", () => {
  assert.equal(portalPageSource.includes("<SpeakerPortalWorkspace"), true);
  for (const prop of ["overview={", "profile={", "sessions={", "presentations={", "documents={", "messages={", "onsite={"]) {
    assert.equal(portalPageSource.includes(prop), true, `missing workspace slot: ${prop}`);
  }
  assert.equal(portalWorkspaceSource.includes("useState<SpeakerPortalSection>"), true);
  assert.equal(portalWorkspaceSource.includes("activeSection === \"overview\""), true);
  assert.equal(portalWorkspaceSource.includes("onClickCapture={handleWorkspaceClick}"), true);
  assert.equal(portalWorkspaceSource.includes("aria-current"), true);
  assert.equal(portalWorkspaceSource.includes("files: \"presentations\""), true);
  assert.equal(portalWorkspaceSource.includes("dashboard: \"overview\""), true);
  assert.equal(portalDashboardSource.includes('href: "#presentations"'), true);
  assert.equal(portalDashboardSource.includes('href="#sessions"'), true);
  assert.equal(portalDashboardSource.includes('href="#messages"'), true);
  assert.equal(portalDashboardSource.includes('href="#onsite"'), true);
});

test("portal sessions section is speaker-friendly and avoids planner tables", () => {
  assert.equal(portalSessionsSource.includes("Review your sessions"), true);
  assert.equal(portalSessionsSource.includes("Room coming soon"), true);
  assert.equal(portalSessionsSource.includes("No sessions assigned"), true);
  assert.equal(portalSessionsSource.includes("<table"), false);
  assert.equal(portalSessionsSource.includes("Speaker"), true);
});

test("portal form submits to the pending-submission endpoint and shows review state", () => {
  assert.equal(portalFormSource.includes("/submission"), true);
  assert.equal(portalFormSource.includes("sent to the event team for review"), true);
  assert.equal(portalFormSource.includes("pendingSubmission"), true);
  // No admin or assignment mutations from portal UI
  assert.equal(portalFormSource.includes("/api/events/"), false);
  assert.equal(portalFormSource.includes("matrix-2"), false);
  // Internal notes never rendered
  assert.equal(portalFormSource.includes("speaker.notes"), false);
});

test("existing public intake flow remains untouched", () => {
  const intakeRouteSource = readFileSync("app/api/public/speaker-intake/[token]/route.ts", "utf8");
  assert.equal(intakeRouteSource.includes("verifySpeakerIntakeToken(token)"), true);
  assert.equal(intakeRouteSource.includes("submitSpeakerPublicIntake"), true);
});
