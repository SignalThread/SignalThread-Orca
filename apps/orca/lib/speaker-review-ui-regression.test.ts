import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const detailPageSource = readFileSync(
  "app/(shell)/events/[eventId]/speakers/_components/speaker-detail-page.tsx",
  "utf8",
);
const overviewSource = readFileSync(
  "app/(shell)/events/[eventId]/speakers/_components/speaker-overview-section.tsx",
  "utf8",
);
const profileSectionSource = readFileSync(
  "app/(shell)/events/[eventId]/speakers/_components/speaker-profile-section.tsx",
  "utf8",
);
const submissionsSectionSource = readFileSync(
  "app/(shell)/events/[eventId]/speakers/_components/speaker-submissions-section.tsx",
  "utf8",
);
const portalAccessSource = readFileSync(
  "app/(shell)/events/[eventId]/speakers/_components/speaker-portal-access-card.tsx",
  "utf8",
);
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

test("full profile page shows portal link status, generate, copy, and revoke actions", () => {
  assert.equal(overviewSource.includes("<SpeakerPortalAccessCard"), true);
  assert.equal(portalAccessSource.includes("Generate Portal Link"), true);
  assert.equal(portalAccessSource.includes("Revoke Link"), true);
  assert.equal(detailPageSource.includes("handleCopyPortalLink"), true);
  assert.equal(portalAccessSource.includes("No secure portal link has been generated yet."), true);
  assert.equal(portalAccessSource.includes("Expires"), true);
  assert.equal(portalAccessSource.includes("Revoked"), true);
  assert.equal(portalAccessSource.includes("Submitted"), true);
});

test("full profile page loads portal status and pending submission from admin routes", () => {
  assert.match(detailPageSource, /fetchSpeakerOverviewJson\(`\/api\/events\/\$\{eventId\}\/speakers\/\$\{speakerId\}\/portal-link`/);
  assert.match(detailPageSource, /fetchSpeakerOverviewJson\(`\/api\/events\/\$\{eventId\}\/speakers\/\$\{speakerId\}\/submission`/);
  assert.equal(detailPageSource.includes('method: "POST"'), true);
  assert.equal(detailPageSource.includes('method: "DELETE"'), true);
});

test("pending submission shows indicator and before/after preview", () => {
  assert.equal(submissionsSectionSource.includes("Pending update"), true);
  assert.equal(submissionsSectionSource.includes("SUBMISSION_PREVIEW_FIELDS"), true);
  const previewSource = sourceBetween(submissionsSectionSource, "<thead>", "</table>");
  assert.equal(previewSource.includes("Current"), true);
  assert.equal(previewSource.includes("Submitted"), true);
  assert.equal(submissionsSectionSource.includes("Note:"), true);
});

test("approve and reject call the backend review routes, not client-side mutation", () => {
  const reviewSource = sourceBetween(submissionsSectionSource, "async function handleReview", "const displayedSubmission");
  assert.equal(reviewSource.includes("/speaker-submissions/${pendingSubmission.id}/${action}"), true);
  assert.equal(reviewSource.includes('method: "POST"'), true);
  // After approve, speaker is re-fetched from the server, not assembled client-side
  assert.equal(reviewSource.includes("refreshSpeaker()"), true);

  const refreshSource = sourceBetween(submissionsSectionSource, "async function refreshSpeaker", "async function handleReview");
  assert.equal(refreshSource.includes("await fetch(`/api/events/${eventId}/speakers/${speaker.id}`)"), true);
  assert.equal(reviewSource.includes("onSubmissionResolved(nextSpeaker)"), true);
});

test("raw portal link is shown only immediately after generation and token hash never appears", () => {
  assert.equal(portalAccessSource.includes("Portal link, shown once"), true);
  assert.equal(detailPageSource.includes("tokenHash"), false);
  // Grant URL is cleared when the detail page loads a different speaker.
  const resetSource = sourceBetween(detailPageSource, "setSpeaker(nextSpeaker);", "}");
  assert.equal(resetSource.includes("setPortalGrantUrl(null)"), true);
  // Status payload type carries no raw token or hash
  const statusTypeSource = sourceBetween(portalAccessSource, "type PortalAccessStatus = {", "};");
  assert.equal(statusTypeSource.includes("token"), false || statusTypeSource.includes("tokenId"));
  assert.equal(statusTypeSource.includes("tokenHash"), false);
});

test("directory opens the canonical speaker profile page instead of the legacy drawer", () => {
  assert.equal(directorySource.includes("router.push(`/events/${eventId}/speakers/${speaker.id}`)"), true);
  assert.equal(directorySource.includes("Quick edit"), false);
  assert.equal(directorySource.includes("<SpeakerProfileDrawer"), false);
  assert.equal(detailPageSource.includes("<SpeakerProfileDrawer"), false);
  assert.equal(profileSectionSource.includes("Request Profile Update"), true);
});
