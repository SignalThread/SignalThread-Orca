import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const speakersServiceSource = readFileSync("src/server/services/speakers.ts", "utf8");
const submissionsServiceSource = readFileSync("src/server/services/speaker-submissions.ts", "utf8");
const filesServiceSource = readFileSync("src/server/services/speaker-files.ts", "utf8");
const documentsServiceSource = readFileSync("src/server/services/speaker-documents.ts", "utf8");
const commsServiceSource = readFileSync("src/server/services/speaker-comms.ts", "utf8");
const tokensServiceSource = readFileSync("src/server/services/speaker-portal-tokens.ts", "utf8");
const onsiteServiceSource = readFileSync("src/server/services/speaker-onsite.ts", "utf8");
const remindersServiceSource = readFileSync("src/server/services/speaker-reminders.ts", "utf8");
const previewServiceSource = readFileSync("src/server/services/speaker-portal-preview.ts", "utf8");
const matrix2SessionSource = readFileSync("lib/matrix2-session.ts", "utf8");
const activityServiceSource = readFileSync("src/server/services/speaker-activity.ts", "utf8");
const activityRouteSource = readFileSync(
  "app/api/events/[eventId]/speakers/[speakerId]/activity/route.ts",
  "utf8",
);
const activitySectionSource = readFileSync(
  "app/(shell)/events/[eventId]/speakers/_components/speaker-activity-section.tsx",
  "utf8",
);

test("every important planner speaker action writes an audit entry", () => {
  const expectations: Array<{ source: string; marker: string; label: string }> = [
    { source: speakersServiceSource, marker: "Speaker created:", label: "speaker created" },
    { source: speakersServiceSource, marker: "Speaker updated:", label: "speaker updated" },
    { source: speakersServiceSource, marker: "Speaker deleted:", label: "speaker deleted" },
    { source: speakersServiceSource, marker: "Speakers imported from CSV", label: "csv import" },
    { source: submissionsServiceSource, marker: "Speaker portal submission approved", label: "submission approved" },
    { source: submissionsServiceSource, marker: "Speaker portal submission rejected", label: "submission rejected" },
    { source: filesServiceSource, marker: "Speaker file uploaded", label: "file uploaded" },
    { source: filesServiceSource, marker: "Speaker file marked", label: "file reviewed" },
    { source: documentsServiceSource, marker: "Speaker document assigned:", label: "document assigned" },
    { source: documentsServiceSource, marker: "Speaker document sent to Docs Hub:", label: "docs hub link" },
    { source: commsServiceSource, marker: "Message sent to speaker", label: "message sent" },
    { source: commsServiceSource, marker: "Internal note added for speaker", label: "note added" },
    { source: tokensServiceSource, marker: "Portal link generated for", label: "portal link generated" },
    { source: tokensServiceSource, marker: "Speaker portal link revoked", label: "portal link revoked" },
    { source: onsiteServiceSource, marker: "Speaker onsite instructions updated", label: "onsite updated" },
    { source: remindersServiceSource, marker: "Speaker reminders triggered", label: "reminders triggered" },
    { source: previewServiceSource, marker: "Speaker portal preview opened for", label: "preview opened" },
    { source: matrix2SessionSource, marker: "Speaker assigned to session", label: "session assigned" },
    { source: matrix2SessionSource, marker: "Speaker unassigned from session", label: "session unassigned" },
  ];

  for (const { source, marker, label } of expectations) {
    assert.equal(source.includes(marker), true, `missing audit entry for: ${label}`);
    assert.equal(source.includes("logSpeakerActivity"), true, `${label} service must use the central audit helper`);
  }
});

test("audit writes are centralized in one helper that records event, actor, and action", () => {
  const helperSource = commsServiceSource.slice(
    commsServiceSource.indexOf("export async function logSpeakerActivity"),
    commsServiceSource.indexOf("export type SpeakerReminderResult"),
  );
  assert.equal(helperSource.includes("eventId"), true);
  assert.equal(helperSource.includes("actorUserId"), true);
  // Canonical audit taxonomy (module SPEAKERS) instead of the legacy coarse enum.
  assert.equal(helperSource.includes('module: "SPEAKERS"'), true);
  assert.equal(helperSource.includes("recordEventActivity"), true);
  assert.equal(helperSource.includes("message"), true);
  // Audit failures now surface (no swallow) rather than being logged and dropped.
  assert.equal(helperSource.includes("console.error"), false);
});

test("audit messages never include secrets, tokens, or OTPs", () => {
  for (const source of [
    speakersServiceSource,
    submissionsServiceSource,
    filesServiceSource,
    documentsServiceSource,
    commsServiceSource,
    tokensServiceSource,
    onsiteServiceSource,
    remindersServiceSource,
    previewServiceSource,
    matrix2SessionSource,
  ]) {
    const auditCalls = source.match(/logSpeakerActivity\([^;]*\)/g) ?? [];
    for (const call of auditCalls) {
      for (const term of ["tokenHash", "rawToken", "objectKey", "otp", "password", "secret"]) {
        assert.equal(
          call.toLowerCase().includes(term.toLowerCase()),
          false,
          `audit call must not log ${term}: ${call.slice(0, 80)}`,
        );
      }
    }
  }
});

test("speaker timeline is derived read-only from canonical records", () => {
  assert.equal(activityServiceSource.includes('await assertEventAccessForUser(eventId, user, "read")'), true);
  assert.equal(activityServiceSource.includes("id: speakerId, eventId"), true);
  for (const term of [".create(", ".update(", ".upsert(", ".delete("]) {
    assert.equal(activityServiceSource.includes(term), false, `timeline must not call ${term}`);
  }
  // Timeline summarizes actions but never exposes bodies/content of notes,
  // messages, or emails.
  for (const select of ["body: true", "subject: true", "toEmail: true", "objectKey: true", "reviewFeedback: true"]) {
    assert.equal(activityServiceSource.includes(select), false, `timeline must not select ${select}`);
  }
  assert.equal(activityServiceSource.includes('actorType: "SPEAKER"'), true);
  assert.equal(activityServiceSource.includes('actorType: "PLANNER"'), true);
});

test("timeline route authenticates and the full profile page renders the timeline", () => {
  assert.equal(activityRouteSource.includes("resolveRequestUser(request)"), true);
  assert.equal(activityRouteSource.includes("getSpeakerActivityTimeline(eventId, speakerId, authResult.user)"), true);
  assert.equal(activitySectionSource.includes("Activity Timeline"), true);
  assert.equal(activitySectionSource.includes("/activity"), true);
});

test("matrix assignment audit is additive and optional — Matrix behavior unchanged without an actor", () => {
  const addSource = matrix2SessionSource.slice(
    matrix2SessionSource.indexOf("export async function addMatrix2SessionSpeakerAssignment"),
  );
  assert.equal(addSource.includes("actorUserId?: string"), true);
  assert.equal(addSource.includes("if (actorUserId)"), true);
});
