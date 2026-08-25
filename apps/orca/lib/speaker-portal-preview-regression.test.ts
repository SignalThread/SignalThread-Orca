import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const previewServiceSource = readFileSync("src/server/services/speaker-portal-preview.ts", "utf8");
const previewPageSource = readFileSync(
  "app/(shell)/events/[eventId]/speakers/[speakerId]/preview/page.tsx",
  "utf8",
);
const portalServiceSource = readFileSync("src/server/services/speaker-portal.ts", "utf8");
const overviewSource = readFileSync(
  "app/(shell)/events/[eventId]/speakers/_components/speaker-overview-section.tsx",
  "utf8",
);
const portalAccessSource = readFileSync(
  "app/(shell)/events/[eventId]/speakers/_components/speaker-portal-access-card.tsx",
  "utf8",
);

test("preview is planner-authenticated and event/speaker scoped server-side", () => {
  assert.equal(previewServiceSource.includes('await assertEventAccessForUser(eventId, user, "read")'), true);
  assert.equal(previewServiceSource.includes("getSpeakerPortalViewForAdminPreview(eventId, speakerId)"), true);
  assert.equal(previewPageSource.includes("ensureProvisionedUserAndContext()"), true);
  assert.equal(previewPageSource.includes('context.status !== "OK"'), true, "unauthorized planners must be blocked");
});

test("preview never reuses or mints speaker portal tokens", () => {
  for (const term of ["resolveSpeakerPortalToken", "generateSpeakerPortalToken", "tokenHash", "rawToken"]) {
    assert.equal(previewServiceSource.includes(term), false, `preview service must not use ${term}`);
    assert.equal(previewPageSource.includes(term), false, `preview page must not use ${term}`);
  }
  // The admin preview path in the portal service skips token resolution by design.
  const adminPathSource = portalServiceSource.slice(
    portalServiceSource.indexOf("export async function getSpeakerPortalViewForAdminPreview"),
    portalServiceSource.indexOf("export async function submitSpeakerPortalProfile"),
  );
  assert.equal(adminPathSource.includes("resolveSpeakerPortalToken"), false);
});

test("preview is structurally read-only — no client code, forms, or mutations", () => {
  assert.equal(previewPageSource.includes('"use client"'), false, "preview page must be server-rendered");
  for (const term of ["<form", "onClick", "onChange", "fetch(", "useState", "method:"]) {
    assert.equal(previewPageSource.includes(term), false, `preview page must not contain ${term}`);
  }
  // Service performs reads only.
  for (const term of [".create(", ".createMany(", ".update(", ".updateMany(", ".upsert(", ".delete(", ".deleteMany("]) {
    assert.equal(previewServiceSource.includes(term), false, `preview service must not call ${term}`);
  }
});

test("preview mode is clearly labeled and audited", () => {
  assert.equal(previewPageSource.includes("Read-only portal preview"), true);
  assert.equal(previewPageSource.includes("No actions can be taken in preview mode."), true);
  assert.equal(
    previewServiceSource.includes("logSpeakerActivity(eventId, user.id, `Speaker portal preview opened for"),
    true,
    "opening a preview must create an audit entry",
  );
});

test("preview shows speaker-eye data without internal-only information", () => {
  for (const source of [previewServiceSource, previewPageSource]) {
    assert.equal(source.toLowerCase().includes("internalnote"), false, "internal notes never appear in preview");
    assert.equal(source.includes("objectKey"), false, "storage keys never appear in preview");
  }
  // Planner identities are stripped from the message thread, matching the portal.
  assert.equal(previewServiceSource.includes("senderName"), false);
});

test("planners reach preview from the full speaker profile page", () => {
  assert.equal(overviewSource.includes("<SpeakerPortalAccessCard"), true);
  assert.equal(portalAccessSource.includes("Preview Portal"), true);
  assert.equal(portalAccessSource.includes("/preview`"), true);
});
