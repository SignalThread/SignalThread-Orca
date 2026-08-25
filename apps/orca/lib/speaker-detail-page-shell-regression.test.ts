import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const detailRouteSource = readFileSync("app/(shell)/events/[eventId]/speakers/[speakerId]/page.tsx", "utf8");
const detailShellSource = readFileSync(
  "app/(shell)/events/[eventId]/speakers/_components/speaker-detail-page.tsx",
  "utf8",
);
const detailSharedSource = readFileSync(
  "app/(shell)/events/[eventId]/speakers/_components/speaker-detail-shared.tsx",
  "utf8",
);
const detailHeaderSource = readFileSync(
  "app/(shell)/events/[eventId]/speakers/_components/speaker-detail-header.tsx",
  "utf8",
);
const detailSubnavSource = readFileSync(
  "app/(shell)/events/[eventId]/speakers/_components/speaker-detail-subnav.tsx",
  "utf8",
);
const detailOverviewSource = readFileSync(
  "app/(shell)/events/[eventId]/speakers/_components/speaker-overview-section.tsx",
  "utf8",
);
const managementSectionsSource = readFileSync(
  "app/(shell)/events/[eventId]/speakers/_components/speaker-management-sections.tsx",
  "utf8",
);
const profileSectionSource = readFileSync(
  "app/(shell)/events/[eventId]/speakers/_components/speaker-profile-section.tsx",
  "utf8",
);
const sessionsSectionSource = readFileSync(
  "app/(shell)/events/[eventId]/speakers/_components/speaker-sessions-section.tsx",
  "utf8",
);
const filesSectionSource = readFileSync(
  "app/(shell)/events/[eventId]/speakers/_components/speaker-files-section.tsx",
  "utf8",
);
const communicationsSectionSource = readFileSync(
  "app/(shell)/events/[eventId]/speakers/_components/speaker-communications-section.tsx",
  "utf8",
);
const submissionsSectionSource = readFileSync(
  "app/(shell)/events/[eventId]/speakers/_components/speaker-submissions-section.tsx",
  "utf8",
);
const conflictsSectionSource = readFileSync(
  "app/(shell)/events/[eventId]/speakers/_components/speaker-conflicts-section.tsx",
  "utf8",
);
const notesSectionSource = readFileSync(
  "app/(shell)/events/[eventId]/speakers/_components/speaker-notes-section.tsx",
  "utf8",
);
const onsitePanelSource = readFileSync(
  "app/(shell)/events/[eventId]/speakers/_components/speaker-onsite-panel.tsx",
  "utf8",
);
const directorySource = readFileSync(
  "app/(shell)/events/[eventId]/speakers/_components/speaker-directory.tsx",
  "utf8",
);
const combinedDetailSource = [
  detailShellSource,
  detailSharedSource,
  detailHeaderSource,
  detailSubnavSource,
  detailOverviewSource,
  managementSectionsSource,
  profileSectionSource,
  sessionsSectionSource,
  filesSectionSource,
  communicationsSectionSource,
  submissionsSectionSource,
  conflictsSectionSource,
  notesSectionSource,
  onsitePanelSource,
].join("\n");

test("speaker detail page is event-scoped and loads through existing speaker APIs", () => {
  assert.equal(detailRouteSource.includes("params: Promise<{ eventId: string; speakerId: string }>"), true);
  assert.equal(detailRouteSource.includes("<SpeakerDetailPageShell eventId={eventId} speakerId={speakerId} />"), true);

  assert.equal(detailShellSource.includes("fetch(`/api/events/${eventId}/speakers/${speakerId}`)"), true);
  assert.equal(detailShellSource.includes("fetchSpeakerOverviewJson(`/api/events/${eventId}/speaker-readiness`"), true);
  assert.equal(detailShellSource.includes("fetchSpeakerOverviewJson(`/api/events/${eventId}/speaker-conflicts`"), true);
  assert.equal(combinedDetailSource.includes("fetchSpeakerOverviewJson(`/api/events/${eventId}/speakers/${speakerId}/files`"), true);
  assert.equal(combinedDetailSource.includes("fetchSpeakerOverviewJson(`/api/events/${eventId}/speakers/${speakerId}/messages`"), true);
  assert.equal(combinedDetailSource.includes("fetchSpeakerOverviewJson(`/api/events/${eventId}/speakers/${speakerId}/activity`"), true);
});

test("speaker detail overview stages summary requests after the speaker shell loads", () => {
  const speakerFetchIndex = detailShellSource.indexOf("fetch(`/api/events/${eventId}/speakers/${speakerId}`)");
  const primaryStatusIndex = detailShellSource.indexOf("primarySummaryStatus");
  const secondaryStatusIndex = detailShellSource.indexOf("secondarySummaryStatus");
  const idleCallbackIndex = detailShellSource.indexOf("requestIdleCallback");
  const primaryReadinessIndex = detailShellSource.indexOf("fetchSpeakerOverviewJson(`/api/events/${eventId}/speaker-readiness`");
  const secondaryFilesIndex = detailShellSource.indexOf("fetchSpeakerOverviewJson(`/api/events/${eventId}/speakers/${speakerId}/files`");
  const secondaryMatrixIndex = detailShellSource.indexOf("speaker-detail-page-secondary");

  assert.notEqual(speakerFetchIndex, -1, "missing initial speaker fetch");
  assert.notEqual(primaryStatusIndex, -1, "missing primary summary loading state");
  assert.notEqual(secondaryStatusIndex, -1, "missing secondary summary loading state");
  assert.notEqual(idleCallbackIndex, -1, "secondary summaries should be deferred until idle time");
  assert.ok(primaryReadinessIndex > speakerFetchIndex, "primary summaries should be staged after speaker loading");
  assert.ok(secondaryFilesIndex > idleCallbackIndex, "files summary should be lazy-loaded after idle scheduling");
  assert.ok(secondaryMatrixIndex > idleCallbackIndex, "matrix snapshot should be lazy-loaded after idle scheduling");

  for (const source of [
    "shouldLoadFiles = activeSection !== \"files\"",
    "shouldLoadMessages = activeSection !== \"communications\"",
    "shouldLoadActivity = activeSection !== \"activity\"",
    "Loading assigned sessions",
    "Loading files",
    "Loading messages",
    "Loading activity",
  ]) {
    assert.equal(combinedDetailSource.includes(source), true, `missing staged loading marker: ${source}`);
  }
});

test("speaker detail summary failures remain visible and retryable instead of becoming empty success", () => {
  assert.match(detailShellSource, /response\.ok/);
  assert.match(detailShellSource, /fetchSpeakerOverviewJson/);
  assert.match(detailShellSource, /primarySummaryStatus.*error/);
  assert.match(detailShellSource, /secondarySummaryStatus.*error/);
  assert.match(detailOverviewSource, /role="alert"/);
  assert.match(detailOverviewSource, /Retry/);
});

test("speaker detail shell exposes the requested overview sections as the canonical management page", () => {
  for (const label of [
    "Overview",
    "Profile",
    "Sessions",
    "Files",
    "Documents",
    "Communications",
    "Submissions",
    "Conflicts",
    "Activity",
    "Onsite",
    "Notes",
  ]) {
    assert.equal(combinedDetailSource.includes(label), true, `missing detail nav label: ${label}`);
  }

  for (const section of [
    "Profile Completeness",
    "Portal Status",
    "Pending Submissions",
    "Speaker Portal Link",
    "Assigned Sessions",
    "Onsite Information",
    "Recent Activity",
  ]) {
    assert.equal(combinedDetailSource.includes(section), true, `missing overview section: ${section}`);
  }

  assert.equal(detailShellSource.includes("<SpeakerProfileDrawer"), false);
  assert.equal(combinedDetailSource.includes("onEditProfile={() => selectSection(\"profile\")}"), true);
  assert.equal(combinedDetailSource.includes("Edit Profile"), true);
});

test("speaker detail page owns full management sections with hash-driven navigation", () => {
  for (const section of [
    "profile",
    "sessions",
    "files",
    "documents",
    "communications",
    "submissions",
    "conflicts",
    "activity",
    "onsite",
    "notes",
  ]) {
    assert.equal(combinedDetailSource.includes(`"${section}"`), true, `missing section key: ${section}`);
  }

  assert.equal(detailShellSource.includes("sectionFromHash()"), true);
  assert.equal(detailShellSource.includes("window.history.replaceState"), true);
  assert.equal(detailShellSource.includes("SpeakerManagementSection"), true);
  assert.equal(detailShellSource.includes("dynamic("), true);
  assert.equal(combinedDetailSource.includes("SpeakerProfileSection"), true);
  assert.equal(combinedDetailSource.includes("SpeakerSessionsSection"), true);
  assert.equal(combinedDetailSource.includes("SpeakerFilesSection"), true);
  assert.equal(combinedDetailSource.includes("SpeakerDocumentsSection"), true);
  assert.equal(combinedDetailSource.includes("SpeakerCommunicationsSection"), true);
  assert.equal(combinedDetailSource.includes("SpeakerSubmissionsSection"), true);
  assert.equal(combinedDetailSource.includes("SpeakerConflictsSection"), true);
  assert.equal(combinedDetailSource.includes("SpeakerOnsitePanel"), true);
  assert.equal(combinedDetailSource.includes("SpeakerNotesSection"), true);
});

test("speaker detail sections reuse existing speaker APIs without mixing internal notes into comms", () => {
  assert.equal(combinedDetailSource.includes("fetch(`/api/events/${eventId}/speakers/${speaker.id}`"), true);
  assert.equal(combinedDetailSource.includes("fetch(`/api/events/${eventId}/speakers/${speakerId}/files`)"), true);
  assert.equal(combinedDetailSource.includes("fetch(`/api/events/${eventId}/speakers/${speakerId}/messages`)"), true);
  assert.equal(combinedDetailSource.includes("fetch(`/api/events/${eventId}/speakers/${speakerId}/emails`)"), true);
  assert.equal(combinedDetailSource.includes("fetch(`/api/events/${eventId}/speakers/${speaker.id}/notes`)"), true);
  assert.equal(combinedDetailSource.includes("fetch(`/api/events/${eventId}/speakers/${speaker.id}/submission`)"), true);
  assert.equal(combinedDetailSource.includes("fetch(`/api/events/${eventId}/speaker-onsite`)"), true);
  assert.equal(combinedDetailSource.includes("speaker-submissions/${pendingSubmission.id}/${action}"), true);
  assert.equal(combinedDetailSource.includes("Speaker-visible messages"), true);
  assert.equal(combinedDetailSource.includes("Internal only"), true);
  assert.equal(combinedDetailSource.includes("shown to all speakers"), true);
});

test("speaker directory row actions navigate to the canonical detail page without the legacy drawer", () => {
  assert.equal(directorySource.includes("useRouter"), true);
  assert.equal(directorySource.includes("router.push(`/events/${eventId}/speakers/${speaker.id}`)"), true);
  assert.equal(directorySource.includes("role=\"link\""), true);
  assert.equal(directorySource.includes("handleSpeakerRowKeyDown"), true);
  assert.equal(directorySource.includes("Open speaker"), true);
  assert.equal(directorySource.includes("Quick edit"), false);
  assert.equal(directorySource.includes("openProfileDrawer"), false);
  assert.equal(directorySource.includes("<SpeakerProfileDrawer"), false);
});
