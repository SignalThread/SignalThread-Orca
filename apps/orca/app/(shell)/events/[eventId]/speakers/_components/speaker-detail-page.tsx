"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import type { Matrix2Snapshot } from "@/app/(shell)/matrix-2/_components/types";
import type { SpeakerReadinessOverview } from "@/src/server/services/speaker-readiness";
import {
  computeCompleteness,
  computeCompletenessDetails,
} from "./speaker-completeness";
import {
  copyTextToClipboard,
  type SpeakerRecord,
} from "./speaker-profile-shared";
import { SpeakerDetailHeader } from "./speaker-detail-header";
import { SpeakerDetailSubnav } from "./speaker-detail-subnav";
import { SpeakerOverviewSection } from "./speaker-overview-section";
import {
  asActivity,
  asFiles,
  asMessages,
  asPendingSubmission,
  asPortalStatus,
  EMPTY_OVERVIEW,
  type AssignedSessionSummary,
  type OverviewData,
  type SpeakerDetailSection,
  SUBNAV_ITEMS,
  toErrorMessage,
} from "./speaker-detail-shared";

type SpeakerDetailPageShellProps = {
  eventId: string;
  speakerId: string;
};

const SpeakerManagementSection = dynamic(
  () => import("./speaker-management-sections").then((module) => module.SpeakerManagementSection),
  {
    loading: () => (
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 text-[13px] text-slate-600 shadow-[0_12px_30px_rgba(15,23,42,0.045)]">
        Loading speaker section...
      </div>
    ),
  },
);

function assignedSessionsFromSnapshot(snapshot: Matrix2Snapshot, speakerId: string): AssignedSessionSummary[] {
  return snapshot.sessions
    .filter((session) => session.speakerAssignments.some((assignment) => assignment.speakerId === speakerId))
    .sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`))
    .map((session) => {
      const assignment = session.speakerAssignments.find((entry) => entry.speakerId === speakerId);
      return {
        id: session.id,
        title: session.title,
        date: session.date,
        startTime: session.startTime,
        endTime: session.endTime,
        roomName: session.roomName,
        sessionType: session.sessionType,
        status: session.status,
        role: assignment?.title ? "Speaker" : "Assigned speaker",
      };
    });
}

function isSpeakerDetailSection(value: string): value is SpeakerDetailSection {
  return SUBNAV_ITEMS.some((item) => item.key === value);
}

function sectionFromHash(): SpeakerDetailSection {
  if (typeof window === "undefined") return "overview";
  const hash = window.location.hash.replace(/^#/, "");
  return isSpeakerDetailSection(hash) ? hash : "overview";
}

async function fetchSpeakerOverviewJson(url: string, fallback: string): Promise<unknown> {
  const response = await fetch(url);
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(toErrorMessage(payload, fallback));
  }
  return payload;
}

export function SpeakerDetailPageShell({ eventId, speakerId }: SpeakerDetailPageShellProps) {
  const [speaker, setSpeaker] = useState<SpeakerRecord | null>(null);
  const [overview, setOverview] = useState<OverviewData>(EMPTY_OVERVIEW);
  const [activeSection, setActiveSection] = useState<SpeakerDetailSection>("overview");
  const [primarySummaryStatus, setPrimarySummaryStatus] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [secondarySummaryStatus, setSecondarySummaryStatus] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [primarySummaryError, setPrimarySummaryError] = useState<string | null>(null);
  const [secondarySummaryError, setSecondarySummaryError] = useState<string | null>(null);
  const [primarySummaryRetryKey, setPrimarySummaryRetryKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [portalGrantUrl, setPortalGrantUrl] = useState<string | null>(null);
  const [portalError, setPortalError] = useState<string | null>(null);
  const [portalNotice, setPortalNotice] = useState<string | null>(null);
  const [isPortalWorking, setIsPortalWorking] = useState(false);
  const [reminderSentAt, setReminderSentAt] = useState<string | null>(null);
  const loadedSpeakerId = speaker?.id ?? null;

  useEffect(() => {
    setActiveSection(sectionFromHash());
    function handleHashChange() {
      setActiveSection(sectionFromHash());
    }

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    let isActive = true;

    async function loadSpeaker() {
      setIsLoading(true);
      setErrorMessage(null);
      setPrimarySummaryStatus("idle");
      setSecondarySummaryStatus("idle");
      setPrimarySummaryError(null);
      setSecondarySummaryError(null);
      setPrimarySummaryRetryKey(0);
      setOverview(EMPTY_OVERVIEW);

      try {
        const response = await fetch(`/api/events/${eventId}/speakers/${speakerId}`);
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(toErrorMessage(payload, "Failed to load speaker"));
        }

        if (isActive) {
          const nextSpeaker = payload as SpeakerRecord;
          setSpeaker(nextSpeaker);
          setReminderSentAt(nextSpeaker.reminderSentAt ?? null);
          setPortalGrantUrl(null);
          setPortalError(null);
          setPortalNotice(null);
        }
      } catch (error) {
        if (isActive) {
          setErrorMessage(error instanceof Error ? error.message : "Failed to load speaker");
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadSpeaker();

    return () => {
      isActive = false;
    };
  }, [eventId, speakerId]);

  useEffect(() => {
    if (!loadedSpeakerId) return;
    let isActive = true;

    async function loadPrimaryOverview() {
      setPrimarySummaryStatus("loading");
      setPrimarySummaryError(null);
      setOverview(EMPTY_OVERVIEW);

      const [readinessResult, conflictsResult, portalResult, submissionResult] = await Promise.allSettled([
        fetchSpeakerOverviewJson(`/api/events/${eventId}/speaker-readiness`, "Failed to load speaker readiness"),
        fetchSpeakerOverviewJson(`/api/events/${eventId}/speaker-conflicts`, "Failed to load speaker conflicts"),
        fetchSpeakerOverviewJson(`/api/events/${eventId}/speakers/${speakerId}/portal-link`, "Failed to load speaker portal status"),
        fetchSpeakerOverviewJson(`/api/events/${eventId}/speakers/${speakerId}/submission`, "Failed to load speaker submission"),
      ]);

      if (!isActive) return;

      setOverview((current) => {
        const nextOverview: OverviewData = { ...current };

        if (readinessResult.status === "fulfilled") {
          const readiness = readinessResult.value as SpeakerReadinessOverview;
          nextOverview.readinessFlags = readiness.speakers?.find((entry) => entry.speakerId === speakerId)?.flags ?? [];
        }

        if (conflictsResult.status === "fulfilled") {
          const conflictsPayload = conflictsResult.value as { conflicts?: OverviewData["conflicts"] };
          nextOverview.conflicts = (Array.isArray(conflictsPayload.conflicts) ? conflictsPayload.conflicts : []).filter(
            (conflict: { speakerId?: string }) => conflict.speakerId === speakerId,
          );
        }

        if (portalResult.status === "fulfilled") {
          nextOverview.portalStatus = asPortalStatus(portalResult.value);
        }

        if (submissionResult.status === "fulfilled") {
          nextOverview.pendingSubmission = asPendingSubmission(submissionResult.value);
        }

        return nextOverview;
      });
      const failed = [readinessResult, conflictsResult, portalResult, submissionResult].find((result) => result.status === "rejected");
      if (failed?.status === "rejected") {
        setPrimarySummaryError(failed.reason instanceof Error ? failed.reason.message : "Some speaker summary data could not be loaded.");
        setPrimarySummaryStatus("error");
      } else {
        setPrimarySummaryStatus("loaded");
      }
    }

    void loadPrimaryOverview();

    return () => {
      isActive = false;
    };
  }, [eventId, speakerId, loadedSpeakerId, primarySummaryRetryKey]);

  useEffect(() => {
    if (!loadedSpeakerId || secondarySummaryStatus !== "idle") return;
    let isActive = true;

    const runWhenIdle = window.requestIdleCallback ?? ((callback: IdleRequestCallback) => window.setTimeout(() => callback({ didTimeout: false, timeRemaining: () => 0 }), 180));
    const cancelIdle = window.cancelIdleCallback ?? window.clearTimeout;

    const idleId = runWhenIdle(() => {
      async function loadSecondaryOverview() {
        setSecondarySummaryStatus("loading");
        setSecondarySummaryError(null);

        const shouldLoadFiles = activeSection !== "files";
        const shouldLoadMessages = activeSection !== "communications";
        const shouldLoadActivity = activeSection !== "activity";

        const [filesResult, messagesResult, activityResult, matrixResult] = await Promise.allSettled([
          shouldLoadFiles
            ? fetchSpeakerOverviewJson(`/api/events/${eventId}/speakers/${speakerId}/files`, "Failed to load speaker files")
            : Promise.resolve(null),
          shouldLoadMessages
            ? fetchSpeakerOverviewJson(`/api/events/${eventId}/speakers/${speakerId}/messages`, "Failed to load speaker messages")
            : Promise.resolve(null),
          shouldLoadActivity
            ? fetchSpeakerOverviewJson(`/api/events/${eventId}/speakers/${speakerId}/activity`, "Failed to load speaker activity")
            : Promise.resolve(null),
          fetchSpeakerOverviewJson(`/api/events/${eventId}/matrix-2?source=speaker-detail-page-secondary`, "Failed to load speaker session assignments"),
        ]);

        if (!isActive) return;

        setOverview((current) => {
          const nextOverview: OverviewData = { ...current };

          if (shouldLoadFiles && filesResult.status === "fulfilled") {
            nextOverview.files = asFiles(filesResult.value);
          }

          if (shouldLoadMessages && messagesResult.status === "fulfilled") {
            nextOverview.messages = asMessages(messagesResult.value);
          }

          if (shouldLoadActivity && activityResult.status === "fulfilled") {
            nextOverview.activity = asActivity(activityResult.value);
          }

          if (matrixResult.status === "fulfilled") {
            const matrixSnapshot = matrixResult.value as Matrix2Snapshot;
            if (Array.isArray(matrixSnapshot.sessions)) {
              nextOverview.assignedSessions = assignedSessionsFromSnapshot(matrixSnapshot, speakerId);
            }
          }

          return nextOverview;
        });
        const failed = [filesResult, messagesResult, activityResult, matrixResult].find((result) => result.status === "rejected");
        if (failed?.status === "rejected") {
          setSecondarySummaryError(failed.reason instanceof Error ? failed.reason.message : "Some speaker summary data could not be loaded.");
          setSecondarySummaryStatus("error");
        } else {
          setSecondarySummaryStatus("loaded");
        }
      }

      void loadSecondaryOverview();
    }, { timeout: 1200 });

    return () => {
      isActive = false;
      cancelIdle(idleId);
    };
  }, [eventId, speakerId, loadedSpeakerId, activeSection, secondarySummaryStatus]);

  const completeness = useMemo(() => (speaker ? computeCompleteness(speaker) : "Incomplete"), [speaker]);
  const completenessDetails = useMemo(
    () => (speaker ? computeCompletenessDetails(speaker) : { completeness: "Incomplete" as const, missingItems: ["Profile"] }),
    [speaker],
  );
  const completedFields = Math.max(0, 4 - completenessDetails.missingItems.length);
  const completenessPercent = Math.round((completedFields / 4) * 100);
  const primarySummariesLoading = primarySummaryStatus === "idle" || primarySummaryStatus === "loading";
  const secondarySummariesLoading = secondarySummaryStatus === "idle" || secondarySummaryStatus === "loading";

  async function handleGeneratePortalLink() {
    if (!speaker) return;
    setIsPortalWorking(true);
    setPortalError(null);
    setPortalNotice(null);

    try {
      const response = await fetch(`/api/events/${eventId}/speakers/${speakerId}/portal-link`, {
        method: "POST",
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(toErrorMessage(payload, "Failed to generate portal link"));
      }

      setPortalGrantUrl(String(payload.portalUrl ?? ""));
      setOverview((current) => ({
        ...current,
        portalStatus: {
          tokenId: String(payload.tokenId ?? ""),
          createdAt: new Date().toISOString(),
          expiresAt: String(payload.expiresAt ?? ""),
          submittedAt: null,
          revokedAt: null,
          isExpired: false,
          isActive: true,
        },
      }));
      setPortalNotice("Portal link generated. Copy it now because it is only shown once.");
    } catch (error) {
      setPortalError(error instanceof Error ? error.message : "Failed to generate portal link");
    } finally {
      setIsPortalWorking(false);
    }
  }

  async function handleCopyPortalLink() {
    if (!portalGrantUrl) return;

    try {
      await copyTextToClipboard(portalGrantUrl);
      setPortalNotice("Portal link copied.");
      setPortalError(null);
    } catch {
      setPortalError("Copy failed. Select the link text manually.");
    }
  }

  async function handleRevokePortalLink() {
    setIsPortalWorking(true);
    setPortalError(null);
    setPortalNotice(null);

    try {
      const response = await fetch(`/api/events/${eventId}/speakers/${speakerId}/portal-link`, {
        method: "DELETE",
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(toErrorMessage(payload, "Failed to revoke portal link"));
      }

      setPortalGrantUrl(null);
      setOverview((current) => ({
        ...current,
        portalStatus: current.portalStatus
          ? { ...current.portalStatus, revokedAt: new Date().toISOString(), isActive: false }
          : current.portalStatus,
      }));
      setPortalNotice("Portal link revoked.");
    } catch (error) {
      setPortalError(error instanceof Error ? error.message : "Failed to revoke portal link");
    } finally {
      setIsPortalWorking(false);
    }
  }

  async function handleMarkReminderSent() {
    setIsPortalWorking(true);
    setPortalError(null);
    setNotice(null);
    setPortalNotice(null);

    try {
      const response = await fetch(`/api/events/${eventId}/speakers/${speakerId}/reminder`, {
        method: "POST",
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(toErrorMessage(payload, "Failed to record reminder"));
      }

      const nextReminderSentAt = String(payload.reminderSentAt ?? new Date().toISOString());
      setReminderSentAt(nextReminderSentAt);
      setSpeaker((current) => (current ? { ...current, reminderSentAt: nextReminderSentAt } : current));
      setPortalNotice("Reminder recorded.");
    } catch (error) {
      setPortalError(error instanceof Error ? error.message : "Failed to record reminder");
    } finally {
      setIsPortalWorking(false);
    }
  }

  function selectSection(section: SpeakerDetailSection) {
    setActiveSection(section);
    const nextUrl = section === "overview" ? window.location.pathname : `${window.location.pathname}#${section}`;
    window.history.replaceState(null, "", nextUrl);
  }

  function handleSpeakerUpdated(nextSpeaker: SpeakerRecord) {
    setSpeaker(nextSpeaker);
    setReminderSentAt(nextSpeaker.reminderSentAt ?? null);
    setNotice("Speaker updated.");
  }

  function handleSubmissionResolved(nextSpeaker?: SpeakerRecord) {
    if (nextSpeaker) {
      setSpeaker(nextSpeaker);
    }
    setOverview((current) => ({ ...current, pendingSubmission: null }));
  }

  if (isLoading) {
    return (
      <section className="h-full min-h-0 overflow-y-auto overflow-x-hidden bg-[#F6F8FC] p-6">
        <div className="mx-auto max-w-[1380px] rounded-2xl border border-slate-200/80 bg-white p-6 text-[13px] text-slate-600 shadow-[0_12px_30px_rgba(15,23,42,0.045)]">
          Loading speaker profile...
        </div>
      </section>
    );
  }

  if (errorMessage || !speaker) {
    return (
      <section className="h-full min-h-0 overflow-y-auto overflow-x-hidden bg-[#F6F8FC] p-6">
        <div className="mx-auto max-w-[900px] rounded-2xl border border-rose-200 bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.045)]">
          <h1 className="text-[18px] font-semibold text-slate-950">Speaker unavailable</h1>
          <p className="mt-2 text-[14px] text-slate-600">{errorMessage ?? "The speaker could not be loaded."}</p>
          <Link
            href={`/events/${eventId}/speakers`}
            className="mt-5 inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 px-3 text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Speakers
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="h-full min-h-0 overflow-y-auto overflow-x-hidden bg-[#F6F8FC] px-4 py-4 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1380px] space-y-4 pb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href={`/events/${eventId}/speakers`}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700 shadow-[0_8px_18px_rgba(15,23,42,0.045)] transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-violet-100"
          >
            <ArrowLeft className="h-4 w-4" />
            Speakers
          </Link>
          {notice ? <p className="text-[13px] font-medium text-emerald-700">{notice}</p> : null}
        </div>

        <SpeakerDetailHeader eventId={eventId} speaker={speaker} onEditProfile={() => selectSection("profile")} />

        <div className="grid gap-4 lg:grid-cols-[210px_minmax(0,1fr)] xl:grid-cols-[228px_minmax(0,1fr)]">
          <SpeakerDetailSubnav activeSection={activeSection} overview={overview} onSelectSection={selectSection} />

          <main className="min-w-0 space-y-4">
            {activeSection === "overview" ? (
              <SpeakerOverviewSection
                eventId={eventId}
                speakerId={speakerId}
                speaker={speaker}
                overview={overview}
                completeness={completeness}
                completenessPercent={completenessPercent}
                completedFields={completedFields}
                missingItems={completenessDetails.missingItems}
                primarySummariesLoading={primarySummariesLoading}
                secondarySummariesLoading={secondarySummariesLoading}
                primarySummaryError={primarySummaryError}
                secondarySummaryError={secondarySummaryError}
                onRetryPrimarySummaries={() => setPrimarySummaryRetryKey((current) => current + 1)}
                onRetrySecondarySummaries={() => {
                  setSecondarySummaryError(null);
                  setSecondarySummaryStatus("idle");
                }}
                onOpenSection={selectSection}
                portalGrantUrl={portalGrantUrl}
                portalError={portalError}
                portalNotice={portalNotice}
                isPortalWorking={isPortalWorking}
                reminderSentAt={reminderSentAt}
                onGeneratePortalLink={handleGeneratePortalLink}
                onCopyPortalLink={handleCopyPortalLink}
                onMarkReminderSent={handleMarkReminderSent}
                onRevokePortalLink={handleRevokePortalLink}
              />
            ) : (
              <SpeakerManagementSection
                section={activeSection}
                speaker={speaker}
                eventId={eventId}
                overview={overview}
                onOpenSection={selectSection}
                onSpeakerUpdated={handleSpeakerUpdated}
                onSubmissionResolved={handleSubmissionResolved}
              />
            )}
          </main>
        </div>
      </div>
    </section>
  );
}
