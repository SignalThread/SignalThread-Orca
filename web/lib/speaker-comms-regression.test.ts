import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const commsServiceSource = readFileSync("src/server/services/speaker-comms.ts", "utf8");
const tokenServiceSource = readFileSync("src/server/services/speaker-portal-tokens.ts", "utf8");
const reminderRouteSource = readFileSync(
  "app/api/events/[eventId]/speakers/[speakerId]/reminder/route.ts",
  "utf8",
);
const detailPageSource = readFileSync(
  "app/(shell)/events/[eventId]/speakers/_components/speaker-detail-page.tsx",
  "utf8",
);
const portalAccessSource = readFileSync(
  "app/(shell)/events/[eventId]/speakers/_components/speaker-portal-access-card.tsx",
  "utf8",
);
const prismaSchemaSource = readFileSync("prisma/schema.prisma", "utf8");

test("reminder marking requires write access, event-scoped speaker, and a prior portal link", () => {
  const reminderSource = commsServiceSource.slice(
    commsServiceSource.indexOf("export async function markSpeakerReminderSent"),
  );
  assert.equal(reminderSource.includes('await assertEventAccessForUser(eventId, user, "write")'), true);
  assert.equal(reminderSource.includes("id: speakerId, eventId"), true);
  assert.equal(reminderSource.includes('new SpeakerCommsError("Speaker not found", 404)'), true);
  assert.equal(reminderSource.includes("Generate a portal link before sending reminders"), true);
  assert.equal(reminderSource.includes("reminderSentAt: now"), true);
});

test("no email system is invented — comms is copy-link and reminder-state only", () => {
  for (const term of ["nodemailer", "sendgrid", "resend", "postmark", "smtp", "sendEmail"]) {
    assert.equal(commsServiceSource.toLowerCase().includes(term), false, `comms must not include ${term}`);
  }
});

test("speaker actions write event activity log entries", () => {
  // Migrated to the canonical event-activity service (module SPEAKERS); the writer
  // no longer writes EventActivity directly or swallows failures.
  assert.equal(commsServiceSource.includes('module: "SPEAKERS"'), true);
  assert.equal(commsServiceSource.includes("recordEventActivity"), true);
  // Token lifecycle is logged
  assert.equal(tokenServiceSource.includes("Portal link generated for ${speaker.name}"), true);
  assert.equal(tokenServiceSource.includes('action: "GENERATED"'), true);
  assert.equal(tokenServiceSource.includes("entityLabel: speaker.name"), true);
  assert.equal(tokenServiceSource.includes('logSpeakerActivity(eventId, user.id, "Speaker portal link revoked")'), true);
  // Audit failures now surface (no swallow) so a mutation is never silently unrecorded.
  assert.equal(commsServiceSource.includes("Failed to record speaker activity"), false);
});

test("schema additions are additive: reminderSentAt and SPEAKER_UPDATED", () => {
  assert.equal(prismaSchemaSource.includes("reminderSentAt      DateTime?"), true);
  assert.equal(prismaSchemaSource.includes("SPEAKER_UPDATED"), true);
});

test("reminder route is authenticated POST", () => {
  assert.equal(reminderRouteSource.includes("resolveRequestUser(request)"), true);
  assert.equal(reminderRouteSource.includes("markSpeakerReminderSent(eventId, speakerId, authResult.user)"), true);
  assert.equal(reminderRouteSource.includes("export const POST"), true);
  assert.equal(reminderRouteSource.includes("export const GET"), false);
});

test("full profile page surfaces reminder action and last-sent timestamp without exposing tokens", () => {
  assert.equal(detailPageSource.includes("handleMarkReminderSent"), true);
  assert.equal(portalAccessSource.includes("Mark Reminder Sent"), true);
  assert.equal(portalAccessSource.includes("Reminder last sent"), true);
  assert.equal(detailPageSource.includes("/reminder`"), true);
  assert.equal(detailPageSource.includes("tokenHash"), false);
});

// --- Prompt 17: speaker-facing messages + internal planner notes ---

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const messagesRouteSource = readFileSync(
  "app/api/events/[eventId]/speakers/[speakerId]/messages/route.ts",
  "utf8",
);
const notesRouteSource = readFileSync(
  "app/api/events/[eventId]/speakers/[speakerId]/notes/route.ts",
  "utf8",
);
const portalMessagesRouteSource = readFileSync(
  "app/api/public/speaker-portal/[token]/messages/route.ts",
  "utf8",
);
const portalPageSource = readFileSync("app/speaker-portal/[token]/page.tsx", "utf8");
const portalServiceSource = readFileSync("src/server/services/speaker-portal.ts", "utf8");
const plannerCommsSource = readFileSync(
  "app/(shell)/events/[eventId]/speakers/_components/speaker-comms-section.tsx",
  "utf8",
);
const portalMessagesComponentSource = readFileSync(
  "app/speaker-portal/[token]/_components/speaker-portal-messages.tsx",
  "utf8",
);
const messagesMigrationSource = readFileSync(
  "prisma/migrations/20260611150000_add_speaker_messages_notes/migration.sql",
  "utf8",
);

function collectFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectFiles(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

test("message and note models are normalized, event/speaker scoped, and separate", () => {
  const messageModel = prismaSchemaSource.slice(
    prismaSchemaSource.indexOf("model SpeakerMessage {"),
    prismaSchemaSource.indexOf("model SpeakerInternalNote {"),
  );
  const noteModel = prismaSchemaSource.slice(
    prismaSchemaSource.indexOf("model SpeakerInternalNote {"),
    prismaSchemaSource.indexOf("model SpeakerDocumentRequest {"),
  );
  for (const model of [messageModel, noteModel]) {
    assert.equal(model.includes("eventId       String"), true);
    assert.equal(model.includes("speakerId     String"), true);
    assert.equal(model.includes("Json"), false, "no JSON blobs");
  }
  assert.equal(messageModel.includes("senderType    SpeakerMessageSender"), true);
  assert.equal(noteModel.includes("authorUserId  String       @db.Uuid"), true);
  assert.equal(messagesMigrationSource.includes("DROP"), false, "migration must stay additive");
});

test("planner message/note routes authenticate and services enforce scope + audit", () => {
  for (const source of [messagesRouteSource, notesRouteSource]) {
    assert.equal(source.includes("resolveRequestUser(request)"), true);
  }

  const createMessageSource = commsServiceSource.slice(
    commsServiceSource.indexOf("export async function createSpeakerMessage"),
    commsServiceSource.indexOf("export async function listPortalSpeakerMessages"),
  );
  assert.equal(createMessageSource.includes('await assertEventAccessForUser(eventId, user, "write")'), true);
  assert.equal(createMessageSource.includes("await assertSpeakerInEvent(eventId, speakerId)"), true);
  assert.equal(createMessageSource.includes('senderType: "PLANNER"'), true);
  assert.equal(createMessageSource.includes("logSpeakerActivity("), true);

  const createNoteSource = commsServiceSource.slice(
    commsServiceSource.indexOf("export async function createSpeakerInternalNote"),
  );
  assert.equal(createNoteSource.includes('await assertEventAccessForUser(eventId, user, "write")'), true);
  assert.equal(createNoteSource.includes("authorUserId: user.id"), true);
  assert.equal(createNoteSource.includes("logSpeakerActivity("), true);
});

test("message/note attachments are validated against event and speaker scope", () => {
  const attachSource = commsServiceSource.slice(
    commsServiceSource.indexOf("async function normalizeAttachments"),
    commsServiceSource.indexOf("const messageSelect"),
  );
  assert.equal(attachSource.includes("id: input.sessionId.trim(), eventId"), true);
  assert.equal(attachSource.includes("id: input.speakerFileId.trim(), eventId, speakerId"), true);
});

test("portal message access is token-scoped and speaker sender carries no user id", () => {
  assert.equal(portalMessagesRouteSource.includes("resolveRequestUser"), false);
  assert.equal(portalMessagesRouteSource.includes("assertEventAccessForUser"), false);

  const portalListSource = commsServiceSource.slice(
    commsServiceSource.indexOf("export async function listPortalSpeakerMessages"),
    commsServiceSource.indexOf("export async function createPortalSpeakerMessage"),
  );
  assert.equal(portalListSource.includes("await resolveSpeakerPortalToken(rawToken)"), true);
  assert.equal(portalListSource.includes("eventId: resolved.eventId, speakerId: resolved.speakerId"), true);

  const portalCreateSource = commsServiceSource.slice(
    commsServiceSource.indexOf("export async function createPortalSpeakerMessage"),
    commsServiceSource.indexOf("const noteSelect"),
  );
  assert.equal(portalCreateSource.includes('senderType: "SPEAKER"'), true);
  assert.equal(portalCreateSource.includes("senderUserId: null"), true);
});

test("portal message payloads never expose planner identity", () => {
  const portalRecordSource = commsServiceSource.slice(
    commsServiceSource.indexOf("function toPortalMessageRecord"),
    commsServiceSource.indexOf("export async function listSpeakerMessages"),
  );
  assert.equal(portalRecordSource.includes("senderName"), false, "planner names are internal");
  assert.equal(portalRecordSource.includes("senderUser"), false, "planner user data is internal");
});

test("internal notes have no portal-facing read path anywhere", () => {
  // No public portal route may reference internal notes at all.
  for (const routePath of collectFiles("app/api/public/speaker-portal")) {
    const source = readFileSync(routePath, "utf8");
    assert.equal(
      source.toLowerCase().includes("internalnote"),
      false,
      `${routePath} must never touch internal notes`,
    );
  }
  // The portal view service must not select internal notes either.
  assert.equal(portalServiceSource.toLowerCase().includes("internalnote"), false);
  // Portal page and portal components never render internal notes.
  assert.equal(portalPageSource.toLowerCase().includes("internalnote"), false);
  for (const componentPath of collectFiles("app/speaker-portal/[token]/_components")) {
    const source = readFileSync(componentPath, "utf8");
    assert.equal(source.toLowerCase().includes("internalnote"), false, `${componentPath} must not render notes`);
    assert.equal(source.includes("/notes"), false, `${componentPath} must not call the notes API`);
  }
});

test("planner UI labels visibility clearly; portal UI offers the speaker thread", () => {
  assert.equal(plannerCommsSource.includes("Visible to speaker"), true);
  assert.equal(plannerCommsSource.includes("Internal only — never shown to speaker"), true);
  assert.equal(plannerCommsSource.includes("/messages"), true);
  assert.equal(plannerCommsSource.includes("/notes"), true);
  assert.equal(portalMessagesComponentSource.includes("/messages"), true);
  assert.equal(portalMessagesComponentSource.includes("Event team"), true);
});
