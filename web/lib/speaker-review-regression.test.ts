import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const reviewServiceSource = readFileSync("src/server/services/speaker-submissions.ts", "utf8");
const listRouteSource = readFileSync("app/api/events/[eventId]/speaker-submissions/route.ts", "utf8");
const speakerSubmissionRouteSource = readFileSync(
  "app/api/events/[eventId]/speakers/[speakerId]/submission/route.ts",
  "utf8",
);
const approveRouteSource = readFileSync(
  "app/api/events/[eventId]/speaker-submissions/[submissionId]/approve/route.ts",
  "utf8",
);
const rejectRouteSource = readFileSync(
  "app/api/events/[eventId]/speaker-submissions/[submissionId]/reject/route.ts",
  "utf8",
);

function sourceBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

test("approve requires write access, event-scoped submission, and updates canonical Speaker", () => {
  const approveSource = sourceBetween(
    reviewServiceSource,
    "export async function approveSpeakerSubmission",
    "export async function rejectSpeakerSubmission",
  );
  assert.equal(approveSource.includes('await assertEventAccessForUser(eventId, user, "write")'), true);
  assert.equal(approveSource.includes("getSubmissionInEventOrThrow(eventId, submissionId)"), true);
  assert.equal(approveSource.includes("tx.speaker.updateMany"), true);
  assert.equal(approveSource.includes("where: { id: submission.speakerId, eventId }"), true);
  assert.equal(approveSource.includes("speakerUpdate.count !== 1"), true);
  assert.equal(approveSource.includes("toApprovedSpeakerData(submission)"), true);
  assert.equal(approveSource.includes('status: "APPROVED"'), true);
  assert.equal(approveSource.includes("reviewedAt: now"), true);
  assert.equal(approveSource.includes("reviewedByUserId: user.id"), true);
});

test("reject requires write access and never touches canonical Speaker", () => {
  const rejectSource = reviewServiceSource.slice(
    reviewServiceSource.indexOf("export async function rejectSpeakerSubmission"),
  );
  assert.equal(rejectSource.includes('await assertEventAccessForUser(eventId, user, "write")'), true);
  assert.equal(rejectSource.includes("getSubmissionInEventOrThrow(eventId, submissionId)"), true);
  assert.equal(rejectSource.includes('status: "REJECTED"'), true);
  assert.equal(rejectSource.includes("reviewedAt: new Date()"), true);
  assert.equal(rejectSource.includes("reviewedByUserId: user.id"), true);
  assert.equal(rejectSource.includes("speaker.update"), false, "reject must not update the canonical Speaker");
});

test("repeated approval or rejection is safely rejected with 409", () => {
  const approveSource = sourceBetween(
    reviewServiceSource,
    "export async function approveSpeakerSubmission",
    "export async function rejectSpeakerSubmission",
  );
  const rejectSource = reviewServiceSource.slice(
    reviewServiceSource.indexOf("export async function rejectSpeakerSubmission"),
  );
  for (const source of [approveSource, rejectSource]) {
    assert.equal(source.includes('if (submission.status !== "PENDING")'), true);
    assert.equal(source.includes("409"), true);
  }
});

test("approval never applies internal notes and never clears canonical values", () => {
  const applySource = sourceBetween(
    reviewServiceSource,
    "function toApprovedSpeakerData",
    "export async function approveSpeakerSubmission",
  );
  assert.equal(applySource.includes("data.notes"), false, "internal notes must never come from a portal submission");
  assert.equal(applySource.includes("noteToPlanner"), false, "note to planner is review context, not profile data");
  // Only non-null values applied
  assert.equal(applySource.includes("!== null"), true);
  assert.equal(applySource.includes("data.status"), false, "speaker lifecycle status is admin-controlled");
});

test("submission lookups are event-scoped so cross-event admins cannot review", () => {
  const lookupSource = sourceBetween(
    reviewServiceSource,
    "async function getSubmissionInEventOrThrow",
    "export async function listPendingSpeakerSubmissions",
  );
  assert.equal(lookupSource.includes("id: submissionId, eventId"), true);
  assert.equal(lookupSource.includes('new SpeakerSubmissionError("Submission not found", 404)'), true);

  const listSource = sourceBetween(
    reviewServiceSource,
    "export async function listPendingSpeakerSubmissions",
    "export async function getSpeakerPendingSubmission",
  );
  assert.equal(listSource.includes('eventId, status: "PENDING"'), true);
});

test("review and suggestion paths cannot directly overwrite canonical Matrix session content", () => {
  assert.equal(reviewServiceSource.includes("matrixRow.update"), false);
  assert.equal(reviewServiceSource.includes("updateMatrixRow"), false);
  assert.equal(reviewServiceSource.includes("sessionName"), false);
  assert.equal(reviewServiceSource.includes("sessionDescription"), false);
});

test("review routes are authenticated and pass the request user to the service", () => {
  assert.equal(listRouteSource.includes("resolveRequestUser(request)"), true);
  assert.equal(listRouteSource.includes("listPendingSpeakerSubmissions(eventId, authResult.user)"), true);

  assert.equal(speakerSubmissionRouteSource.includes("resolveRequestUser(request)"), true);
  assert.equal(
    speakerSubmissionRouteSource.includes("getSpeakerPendingSubmission(eventId, speakerId, authResult.user)"),
    true,
  );

  assert.equal(approveRouteSource.includes("resolveRequestUser(request)"), true);
  assert.equal(approveRouteSource.includes("approveSpeakerSubmission(eventId, submissionId, authResult.user)"), true);

  assert.equal(rejectRouteSource.includes("resolveRequestUser(request)"), true);
  assert.equal(rejectRouteSource.includes("rejectSpeakerSubmission(eventId, submissionId, authResult.user)"), true);
});

test("approve and reject are POST-only admin routes, not reachable from the portal", () => {
  for (const source of [approveRouteSource, rejectRouteSource]) {
    assert.equal(source.includes("export const POST"), true);
    assert.equal(source.includes("export const GET"), false);
    assert.equal(source.includes("resolveSpeakerPortalToken"), false, "portal tokens must not authorize review actions");
  }
});
