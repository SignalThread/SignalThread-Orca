import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const serviceSource = readFileSync("src/server/services/speaker-reminders.ts", "utf8");
const providerSource = readFileSync("src/server/email/provider.ts", "utf8");
const remindersRouteSource = readFileSync("app/api/events/[eventId]/speaker-reminders/route.ts", "utf8");
const emailsRouteSource = readFileSync(
  "app/api/events/[eventId]/speakers/[speakerId]/emails/route.ts",
  "utf8",
);
const panelSource = readFileSync(
  "app/(shell)/events/[eventId]/speakers/_components/speaker-reminders-panel.tsx",
  "utf8",
);
const historySource = readFileSync(
  "app/(shell)/events/[eventId]/speakers/_components/speaker-email-history-section.tsx",
  "utf8",
);
const prismaSchemaSource = readFileSync("prisma/schema.prisma", "utf8");
const migrationSource = readFileSync(
  "prisma/migrations/20260611160000_add_speaker_email_log/migration.sql",
  "utf8",
);

function sourceBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

test("SpeakerEmailLog records what, when, to whom, and why — additively", () => {
  const modelSource = sourceBetween(prismaSchemaSource, "model SpeakerEmailLog {", "model ");
  for (const field of ["eventId", "speakerId", "toEmail", "subject", "body", "reason", "status", "provider", "createdAt"]) {
    assert.equal(modelSource.includes(field), true, `SpeakerEmailLog must record ${field}`);
  }
  assert.equal(modelSource.includes("Json"), false);
  assert.equal(migrationSource.includes("DROP"), false, "migration must stay additive");
  assert.equal(prismaSchemaSource.includes("SKIPPED_NO_PROVIDER"), true);
});

test("no real email provider exists — stub never sends and reports a clear not-sent status", () => {
  assert.equal(providerSource.includes('"SKIPPED_NO_PROVIDER"'), true);
  for (const term of ["nodemailer", "sendgrid", "resend", "postmark", "smtp", "fetch("]) {
    assert.equal(providerSource.toLowerCase().includes(term), false, `provider stub must not include ${term}`);
  }
  // Swappable interface, not hardcoded sends in the service.
  assert.equal(providerSource.includes("export interface EmailProvider"), true);
  assert.equal(serviceSource.includes("getEmailProvider()"), true);
});

test("no hidden background behavior — reminders are explicit planner actions only", () => {
  for (const term of ["setInterval", "setTimeout", "cron", "queue"]) {
    assert.equal(serviceSource.toLowerCase().includes(term), false, `reminder service must not use ${term}`);
  }
});

test("reminder candidates are derived server-side and exclude complete speakers", () => {
  const computeSource = sourceBetween(serviceSource, "async function computeReminderCandidates", "export async function previewSpeakerReminders");
  assert.equal(computeSource.includes("where: { eventId, status: { not: \"CANCELLED\" } }"), true);
  assert.equal(computeSource.includes("if (reasons.length > 0)"), true, "speakers with nothing missing must be excluded");

  const sendSource = sourceBetween(serviceSource, "export async function sendSpeakerReminders", "export type SpeakerEmailLogRecord");
  assert.equal(
    sendSource.includes("!selectedIds || selectedIds.has(candidate.speakerId)"),
    true,
    "client selections can only narrow the server-derived candidate set",
  );
});

test("send path enforces write access, logs every attempt, and audits the action", () => {
  const sendSource = sourceBetween(serviceSource, "export async function sendSpeakerReminders", "export type SpeakerEmailLogRecord");
  assert.equal(sendSource.includes('await assertEventAccessForUser(eventId, user, "write")'), true);
  assert.equal(sendSource.includes("speakerEmailLog.create"), true);
  assert.equal(sendSource.includes("triggeredByUserId: user.id"), true);
  assert.equal(sendSource.includes("logSpeakerActivity("), true);
  // Failed sends stay visible.
  assert.equal(sendSource.includes('sendResult.status === "FAILED"'), true);
});

test("reminder emails never embed portal tokens, OTPs, or secrets", () => {
  const composeSource = sourceBetween(serviceSource, "function composeReminder", "export async function sendSpeakerReminders");
  for (const term of ["token", "otp", "secret", "http"]) {
    assert.equal(composeSource.toLowerCase().includes(term), false, `reminder body must not contain ${term}`);
  }
});

test("reminder and email-history routes authenticate and scope server-side", () => {
  for (const source of [remindersRouteSource, emailsRouteSource]) {
    assert.equal(source.includes("resolveRequestUser(request)"), true);
    assert.equal(source.includes("authResult.user"), true);
  }

  const listSource = serviceSource.slice(serviceSource.indexOf("export async function listSpeakerEmailLogs"));
  assert.equal(listSource.includes('await assertEventAccessForUser(eventId, user, "read")'), true);
  assert.equal(listSource.includes("id: speakerId, eventId"), true);
  assert.equal(listSource.includes("where: { eventId, speakerId }"), true);
});

test("planner UI previews before sending and surfaces undelivered states", () => {
  assert.equal(panelSource.includes("Nothing is sent without preview + confirm."), true);
  assert.equal(panelSource.includes("speaker-reminders?kind="), true);
  assert.equal(panelSource.includes("no email provider configured"), true);
  assert.equal(historySource.includes("Not sent — no provider"), true);
  assert.equal(historySource.includes("/emails"), true);
});
