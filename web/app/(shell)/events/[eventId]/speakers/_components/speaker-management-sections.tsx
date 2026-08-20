"use client";

import { SpeakerActivitySection } from "./speaker-activity-section";
import { SpeakerCommunicationsSection } from "./speaker-communications-section";
import { SpeakerConflictsSection } from "./speaker-conflicts-section";
import { SpeakerDocumentsSection } from "./speaker-documents-section";
import { SpeakerFilesSection } from "./speaker-files-section";
import { SpeakerNotesSection } from "./speaker-notes-section";
import { SpeakerOnsitePanel } from "./speaker-onsite-panel";
import { SpeakerProfileSection } from "./speaker-profile-section";
import { SpeakerSessionsSection } from "./speaker-sessions-section";
import { SpeakerSubmissionsSection } from "./speaker-submissions-section";
import type { OverviewData, SpeakerDetailSection } from "./speaker-detail-shared";
import type { SpeakerRecord } from "./speaker-profile-shared";

export function SpeakerManagementSection({
  section,
  speaker,
  eventId,
  overview,
  onOpenSection,
  onSpeakerUpdated,
  onSubmissionResolved,
}: {
  section: Exclude<SpeakerDetailSection, "overview">;
  speaker: SpeakerRecord;
  eventId: string;
  overview: OverviewData;
  onOpenSection: (section: SpeakerDetailSection) => void;
  onSpeakerUpdated: (speaker: SpeakerRecord) => void;
  onSubmissionResolved: (speaker?: SpeakerRecord) => void;
}) {
  if (section === "profile") {
    return <SpeakerProfileSection speaker={speaker} onSpeakerUpdated={onSpeakerUpdated} />;
  }
  if (section === "sessions") {
    return <SpeakerSessionsSection eventId={eventId} sessions={overview.assignedSessions} conflicts={overview.conflicts} />;
  }
  if (section === "files") {
    return <SpeakerFilesSection eventId={eventId} speakerId={speaker.id} />;
  }
  if (section === "documents") {
    return <SpeakerDocumentsSection eventId={eventId} speakerId={speaker.id} />;
  }
  if (section === "communications") {
    return <SpeakerCommunicationsSection eventId={eventId} speakerId={speaker.id} speaker={speaker} />;
  }
  if (section === "submissions") {
    return (
      <SpeakerSubmissionsSection
        eventId={eventId}
        speaker={speaker}
        initialSubmission={overview.pendingSubmission}
        onSubmissionResolved={onSubmissionResolved}
      />
    );
  }
  if (section === "conflicts") {
    return <SpeakerConflictsSection eventId={eventId} conflicts={overview.conflicts} sessions={overview.assignedSessions} />;
  }
  if (section === "activity") {
    return <SpeakerActivitySection eventId={eventId} speakerId={speaker.id} />;
  }
  if (section === "onsite") {
    return <SpeakerOnsitePanel eventId={eventId} />;
  }

  return <SpeakerNotesSection eventId={eventId} speaker={speaker} onOpenProfile={() => onOpenSection("profile")} />;
}
