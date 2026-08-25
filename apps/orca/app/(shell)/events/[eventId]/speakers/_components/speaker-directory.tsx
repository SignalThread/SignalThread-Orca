"use client";

import { useRouter } from "next/navigation";
import { type ChangeEvent, type FormEvent, type KeyboardEvent, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { SpeakerReadinessOverview } from "@/src/server/services/speaker-readiness";
import type { SpeakerConflict } from "@/lib/speaker-conflicts";
import { AlertTriangle, ChevronDown, Plus, Search, Trash2, Upload } from "lucide-react";
import {
  computeCompleteness,
} from "./speaker-completeness";
import { SpeakerCsvImportModal, type SpeakerCsvImportSummary } from "./speaker-csv-import-modal";
import { SpeakerOnsitePanel } from "./speaker-onsite-panel";
import { SpeakerRemindersPanel } from "./speaker-reminders-panel";
import {
  EMPTY_SPEAKER_FORM,
  payloadFromForm,
  SpeakerFormState,
  SpeakerRecord,
  SpeakerStatus,
  STATUS_OPTIONS,
  statusClasses,
  statusLabel,
} from "./speaker-profile-shared";

type SpeakerDirectoryProps = {
  eventId: string;
};

function toErrorMessage(payload: unknown, fallback: string): string {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "string"
  ) {
    return payload.error;
  }

  if (
    typeof payload === "object" &&
    payload !== null &&
    "message" in payload &&
    typeof payload.message === "string"
  ) {
    return payload.message;
  }

  return fallback;
}

async function fetchSpeakers(eventId: string): Promise<SpeakerRecord[]> {
  const response = await fetch(`/api/events/${eventId}/speakers`);
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(toErrorMessage(payload, "Failed to load speakers"));
  }

  return Array.isArray(payload) ? (payload as SpeakerRecord[]) : [];
}

function importSummaryMessage(summary: SpeakerCsvImportSummary): string {
  return `CSV import complete: ${summary.imported} imported, ${summary.skipped} skipped, ${summary.duplicates} duplicates, ${summary.failed} failed.`;
}

const READINESS_CHIPS = [
  { key: "ALL", label: "All" },
  { key: "missing_profile", label: "Missing profile" },
  { key: "missing_deck", label: "Missing deck" },
  { key: "travel_dietary", label: "Travel / dietary" },
  { key: "requests_pending", label: "Requests pending" },
  { key: "conflicts", label: "Conflicts" },
] as const;

type ReadinessFilterKey = (typeof READINESS_CHIPS)[number]["key"];
type SummaryReadinessFilterKey = "complete" | "needs_action";
type SpeakerReadinessFilterKey = ReadinessFilterKey | SummaryReadinessFilterKey;

const READINESS_FILTER_COPY: Record<SpeakerReadinessFilterKey, { heading: string; description: string }> = {
  ALL: {
    heading: "All speakers",
    description: "Event-scoped speaker profiles with readiness details, request status, and conflict state.",
  },
  complete: {
    heading: "Complete speakers",
    description: "Speakers whose readiness checklist is complete.",
  },
  needs_action: {
    heading: "Speakers needing action",
    description: "Speakers with any remaining readiness follow-up.",
  },
  missing_profile: {
    heading: "Speakers missing profile details",
    description: "Bio, headshot, or title/company details still need follow-up.",
  },
  missing_deck: {
    heading: "Speakers missing decks",
    description: "Presentation files still need to be uploaded or approved.",
  },
  travel_dietary: {
    heading: "Speakers with travel or dietary gaps",
    description: "Travel logistics or dietary details still need to be captured.",
  },
  requests_pending: {
    heading: "Speakers with pending requests",
    description: "Profile requests were sent and are still waiting on speaker action.",
  },
  conflicts: {
    heading: "Speakers with scheduling conflicts",
    description: "Conflicting speaker assignments need planner review.",
  },
};

const FILTER_FLAG_GROUPS: Record<Exclude<ReadinessFilterKey, "ALL" | "conflicts">, string[]> = {
  missing_profile: ["missing_bio", "missing_headshot", "missing_title_company"],
  missing_deck: ["missing_deck"],
  travel_dietary: ["missing_travel_needs", "missing_dietary"],
  requests_pending: ["request_pending"],
};

const FLAG_LABELS: Record<string, string> = {
  missing_bio: "Bio",
  missing_headshot: "Headshot",
  missing_title_company: "Title/company",
  missing_av_needs: "AV needs",
  missing_travel_needs: "Travel needs",
  missing_dietary: "Dietary details",
  missing_deck: "Deck",
  deck_not_approved: "Deck review",
  docs_incomplete: "Required documents",
  request_not_sent: "Request not sent",
  request_pending: "Request pending",
  submitted_pending_review: "Pending review",
  complete: "Complete",
};

function matchesReadinessFilter(
  filter: SpeakerReadinessFilterKey,
  flags: string[],
  hasConflict: boolean,
): boolean {
  if (filter === "ALL") return true;
  if (filter === "complete") return flags.includes("complete");
  if (filter === "needs_action") return !flags.includes("complete");
  if (filter === "conflicts") return hasConflict;
  return FILTER_FLAG_GROUPS[filter].some((flag) => flags.includes(flag));
}

function summarizeMissingItems(flags: string[]): string[] {
  const items: string[] = [];

  if (flags.some((flag) => ["missing_bio", "missing_headshot", "missing_title_company"].includes(flag))) {
    items.push("Profile");
  }

  for (const flag of ["missing_deck", "deck_not_approved", "docs_incomplete", "missing_av_needs", "missing_travel_needs", "missing_dietary"]) {
    if (flags.includes(flag)) {
      items.push(FLAG_LABELS[flag]);
    }
  }

  return items;
}

function requestStatusLabel(flags: string[]): string {
  if (flags.includes("submitted_pending_review")) return "Pending review";
  if (flags.includes("request_pending")) return "Pending speaker response";
  if (flags.includes("request_not_sent")) return "Request not sent";
  return "Up to date";
}

function readinessTileClasses(tone: "complete" | "needs_action" | "requests_pending" | "conflicts", isActive: boolean): string {
  const base = "rounded-xl border px-4 py-3 text-left transition focus:outline-none focus:ring-2 focus:ring-[#28439A]/20";
  if (isActive) {
    return `${base} border-[#28439A] bg-[#28439A] text-white shadow-sm`;
  }

  if (tone === "complete") return `${base} border-slate-200 bg-slate-50 hover:border-slate-300`;
  if (tone === "needs_action") return `${base} border-amber-200 bg-amber-50 hover:border-amber-300`;
  if (tone === "requests_pending") return `${base} border-sky-200 bg-sky-50 hover:border-sky-300`;
  return `${base} border-rose-200 bg-rose-50 hover:border-rose-300`;
}

function readinessTileTextClasses(tone: "complete" | "needs_action" | "requests_pending" | "conflicts", isActive: boolean): { label: string; value: string } {
  if (isActive) {
    return {
      label: "text-white/75",
      value: "text-white",
    };
  }

  if (tone === "needs_action") {
    return {
      label: "text-amber-700",
      value: "text-amber-900",
    };
  }
  if (tone === "requests_pending") {
    return {
      label: "text-sky-700",
      value: "text-sky-900",
    };
  }
  if (tone === "conflicts") {
    return {
      label: "text-rose-700",
      value: "text-rose-900",
    };
  }
  return {
    label: "text-slate-500",
    value: "text-slate-900",
  };
}

function conflictSummaryLabel(conflicts: SpeakerConflict[]): string {
  if (conflicts.length === 0) return "None";
  if (conflicts.length === 1) return "1 conflict";
  return `${conflicts.length} conflicts`;
}

function SpeakerConflictDisclosure({ conflicts }: { conflicts: SpeakerConflict[] }) {
  if (conflicts.length === 0) {
    return <span className="text-[12px] text-slate-500">None</span>;
  }

  return (
    <div
      className="relative"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <details className="group">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-800 transition hover:bg-rose-100 [&::-webkit-details-marker]:hidden">
          <AlertTriangle className="h-3 w-3" />
          {conflictSummaryLabel(conflicts)}
          <ChevronDown className="h-3 w-3 transition group-open:rotate-180" />
        </summary>
        <div className="mt-2 max-w-[280px] rounded-xl border border-rose-100 bg-white p-3 text-[12px] leading-5 text-rose-800 shadow-lg">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-rose-600">Conflict details</p>
          <ul className="space-y-1.5">
            {conflicts.map((conflict) => (
              <li key={`${conflict.speakerId}-${conflict.sessionIds.join("-")}-${conflict.description}`}>
                {conflict.description}
              </li>
            ))}
          </ul>
        </div>
      </details>
    </div>
  );
}

export function SpeakerDirectory({ eventId }: SpeakerDirectoryProps) {
  const router = useRouter();
  const [speakers, setSpeakers] = useState<SpeakerRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<SpeakerStatus | "ALL">("ALL");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState<SpeakerFormState>(EMPTY_SPEAKER_FORM);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isImportingCsv, setIsImportingCsv] = useState(false);
  const [csvImportFile, setCsvImportFile] = useState<File | null>(null);
  const [deletingSpeakerId, setDeletingSpeakerId] = useState<string | null>(null);
  const [readiness, setReadiness] = useState<SpeakerReadinessOverview | null>(null);
  const [readinessFilter, setReadinessFilter] = useState<SpeakerReadinessFilterKey>("ALL");
  const [isSpeakerToolsOpen, setIsSpeakerToolsOpen] = useState(false);
  const csvInputRef = useRef<HTMLInputElement | null>(null);
  const speakerRowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});
  const deferredSearch = useDeferredValue(search);
  const [highlightedSpeakerId, setHighlightedSpeakerId] = useState<string | null>(null);

  const [conflicts, setConflicts] = useState<SpeakerConflict[]>([]);

  const loadReadiness = useCallback(async () => {
    try {
      const [readinessResponse, conflictsResponse] = await Promise.all([
        fetch(`/api/events/${eventId}/speaker-readiness`),
        fetch(`/api/events/${eventId}/speaker-conflicts`),
      ]);
      const readinessPayload = await readinessResponse.json();
      const conflictsPayload = await conflictsResponse.json();
      if (readinessResponse.ok) {
        setReadiness(readinessPayload as SpeakerReadinessOverview);
      }
      if (conflictsResponse.ok && Array.isArray(conflictsPayload?.conflicts)) {
        setConflicts(conflictsPayload.conflicts as SpeakerConflict[]);
      }
    } catch {
      // Readiness chips are an enhancement; the directory still works without them.
    }
  }, [eventId]);

  useEffect(() => {
    void loadReadiness();
  }, [loadReadiness]);

  useEffect(() => {
    let isActive = true;

    async function loadSpeakers() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const nextSpeakers = await fetchSpeakers(eventId);
        if (!isActive) return;
        setSpeakers(nextSpeakers);
      } catch (error) {
        if (!isActive) return;
        setErrorMessage(error instanceof Error ? error.message : "Failed to load speakers");
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadSpeakers();

    return () => {
      isActive = false;
    };
  }, [eventId]);

  const readinessFlagsBySpeakerId = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const entry of readiness?.speakers ?? []) {
      map.set(entry.speakerId, entry.flags);
    }
    return map;
  }, [readiness]);

  const conflictsBySpeakerId = useMemo(() => {
    const map = new Map<string, SpeakerConflict[]>();
    for (const conflict of conflicts) {
      const speakerConflicts = map.get(conflict.speakerId);
      if (speakerConflicts) {
        speakerConflicts.push(conflict);
      } else {
        map.set(conflict.speakerId, [conflict]);
      }
    }
    return map;
  }, [conflicts]);

  const readinessSummary = useMemo(() => {
    const total = readiness?.total ?? 0;
    const complete = readiness?.counts.complete ?? 0;
    const requestsPending = readiness?.counts.request_pending ?? 0;
    return {
      complete,
      needsAction: Math.max(total - complete, 0),
      requestsPending,
      conflicts: conflicts.length,
    };
  }, [conflicts.length, readiness]);

  const filteredSpeakers = useMemo(() => {
    const normalizedSearch = deferredSearch.trim().toLowerCase();

    return speakers.filter((speaker) => {
      if (statusFilter !== "ALL" && speaker.status !== statusFilter) {
        return false;
      }

      if (readinessFilter !== "ALL") {
        const flags = readinessFlagsBySpeakerId.get(speaker.id) ?? [];
        const hasConflict = conflictsBySpeakerId.has(speaker.id);
        if (!matchesReadinessFilter(readinessFilter, flags, hasConflict)) {
          return false;
        }
      }

      if (!normalizedSearch) {
        return true;
      }

      return [
        speaker.name,
        speaker.title ?? "",
        speaker.company ?? "",
        speaker.email ?? "",
      ].some((value) => value.toLowerCase().includes(normalizedSearch));
    });
  }, [conflictsBySpeakerId, deferredSearch, speakers, statusFilter, readinessFilter, readinessFlagsBySpeakerId]);

  const readinessListCopy = READINESS_FILTER_COPY[readinessFilter];

  useEffect(() => {
    if (!highlightedSpeakerId) return;
    const row = speakerRowRefs.current[highlightedSpeakerId];
    if (!row) return;
    row.focus();
    row.scrollIntoView({ block: "nearest", behavior: "smooth" });
    const timeout = window.setTimeout(() => setHighlightedSpeakerId(null), 2400);
    return () => window.clearTimeout(timeout);
  }, [filteredSpeakers, highlightedSpeakerId]);

  function openCreateModal() {
    setCreateForm(EMPTY_SPEAKER_FORM);
    setCreateError(null);
    setIsCreateModalOpen(true);
  }

  function closeCreateModal() {
    setIsCreateModalOpen(false);
    setCreateForm(EMPTY_SPEAKER_FORM);
    setCreateError(null);
  }

  function openSpeakerDetail(speaker: SpeakerRecord) {
    router.push(`/events/${eventId}/speakers/${speaker.id}`);
  }

  function handleSpeakerRowKeyDown(event: KeyboardEvent<HTMLTableRowElement>, speaker: SpeakerRecord) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openSpeakerDetail(speaker);
    }
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!createForm.name.trim()) {
      setCreateError("Name is required.");
      return;
    }

    setIsCreating(true);
    setCreateError(null);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/events/${eventId}/speakers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadFromForm(createForm)),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(toErrorMessage(payload, "Failed to create speaker"));
      }

      setSpeakers((current) => [...current, payload as SpeakerRecord].sort((a, b) => a.name.localeCompare(b.name)));
      void loadReadiness();
      setNotice("Speaker added.");
      closeCreateModal();
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Failed to create speaker");
    } finally {
      setIsCreating(false);
    }
  }

  function openCsvPicker() {
    csvInputRef.current?.click();
  }

  async function handleCsvImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || isImportingCsv) return;

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setErrorMessage("Upload a .csv file.");
      setNotice(null);
      return;
    }

    setCsvImportFile(file);
    setErrorMessage(null);
    setNotice(null);
  }

  async function handleCsvImported(summary: SpeakerCsvImportSummary) {
    setIsImportingCsv(true);
    setErrorMessage(null);

    try {
      const rowErrors = summary.errors
        ?.slice(0, 3)
        .map((entry) => `Row ${entry.row}: ${entry.message}`)
        .join(" ");
      const nextSpeakers = await fetchSpeakers(eventId);

      setSpeakers(nextSpeakers);
      void loadReadiness();
      setNotice(rowErrors ? `${importSummaryMessage(summary)} ${rowErrors}` : importSummaryMessage(summary));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to refresh speakers after import");
    } finally {
      setIsImportingCsv(false);
    }
  }

  async function handleDelete(speaker: SpeakerRecord) {
    if (deletingSpeakerId) return;
    const shouldDelete = window.confirm(`Delete speaker "${speaker.name}"?`);
    if (!shouldDelete) return;

    setDeletingSpeakerId(speaker.id);
    setErrorMessage(null);
    setNotice(null);
    const previous = speakers;
    setSpeakers((current) => current.filter((entry) => entry.id !== speaker.id));

    try {
      const response = await fetch(`/api/events/${eventId}/speakers/${speaker.id}`, {
        method: "DELETE",
      });
      const payload = await response.json();

      if (!response.ok) {
        setSpeakers(previous);
        throw new Error(toErrorMessage(payload, "Failed to delete speaker"));
      }

      void loadReadiness();
      setNotice("Speaker deleted.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to delete speaker");
    } finally {
      setDeletingSpeakerId(null);
    }
  }

  return (
    <section className="h-full min-h-0 space-y-5 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] leading-[26px] font-semibold text-slate-900">Speaker Directory</h1>
          <p className="mt-2 text-[14px] text-slate-600">
            Manage event-level speaker profiles and completeness without touching Matrix assignments.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => {
              void handleCsvImport(event);
            }}
            className="hidden"
          />
          <button
            type="button"
            onClick={openCsvPicker}
            disabled={isImportingCsv}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 px-3 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            <Upload className="h-4 w-4" />
            {isImportingCsv ? "Importing..." : "Upload CSV"}
          </button>
          <a
            href={`/api/events/${eventId}/speakers/export`}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 px-3 text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
          >
            Export Speakers
          </a>
          <a
            href={`/api/events/${eventId}/speakers/export?type=assignments`}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 px-3 text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
          >
            Export Assignments
          </a>
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#28439A] px-3 text-[13px] font-semibold text-white hover:bg-[#243d8e]"
          >
            <Plus className="h-4 w-4" />
            Add Speaker
          </button>
        </div>
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50/70" aria-label="Speaker Tools">
        <button
          type="button"
          aria-expanded={isSpeakerToolsOpen}
          aria-controls="speaker-tools-accordion"
          onClick={() => setIsSpeakerToolsOpen((current) => !current)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-slate-100/70"
        >
          <span className="min-w-0">
            <span className="block text-[14px] font-semibold text-slate-900">Speaker Tools</span>
            <span className="mt-0.5 block text-[12px] leading-5 text-slate-500">
              Reminders and speaker portal instructions
            </span>
          </span>
          <ChevronDown
            className={[
              "h-4 w-4 shrink-0 text-slate-500 transition-transform",
              isSpeakerToolsOpen ? "rotate-180" : "",
            ].join(" ")}
          />
        </button>
        {isSpeakerToolsOpen ? (
          <div id="speaker-tools-accordion" className="space-y-3 border-t border-slate-200 bg-white px-4 py-3">
            <SpeakerRemindersPanel eventId={eventId} variant="inline" />
            <SpeakerOnsitePanel eventId={eventId} variant="inline" />
          </div>
        ) : null}
      </section>

      {readiness ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4" aria-label="Speaker readiness dashboard">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">
                Speaker Readiness · {readiness.total} speakers
              </p>
              <p className="mt-1 text-[13px] text-slate-600">
                Focus the list on the speakers who need action next.
              </p>
            </div>
            {readinessFilter !== "ALL" ? (
              <button
                type="button"
                onClick={() => setReadinessFilter("ALL")}
                className="text-[12px] font-semibold text-[#28439A] hover:underline"
              >
                Clear readiness filter
              </button>
            ) : null}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <button
              type="button"
              aria-pressed={readinessFilter === "complete"}
              onClick={() => setReadinessFilter(readinessFilter === "complete" ? "ALL" : "complete")}
              className={readinessTileClasses("complete", readinessFilter === "complete")}
            >
              <p className={`text-[11px] font-semibold uppercase tracking-wide ${readinessTileTextClasses("complete", readinessFilter === "complete").label}`}>Complete</p>
              <p className={`mt-2 text-[24px] font-semibold ${readinessTileTextClasses("complete", readinessFilter === "complete").value}`}>{readinessSummary.complete}</p>
            </button>
            <button
              type="button"
              aria-pressed={readinessFilter === "needs_action"}
              onClick={() => setReadinessFilter(readinessFilter === "needs_action" ? "ALL" : "needs_action")}
              className={readinessTileClasses("needs_action", readinessFilter === "needs_action")}
            >
              <p className={`text-[11px] font-semibold uppercase tracking-wide ${readinessTileTextClasses("needs_action", readinessFilter === "needs_action").label}`}>Needs action</p>
              <p className={`mt-2 text-[24px] font-semibold ${readinessTileTextClasses("needs_action", readinessFilter === "needs_action").value}`}>{readinessSummary.needsAction}</p>
            </button>
            <button
              type="button"
              aria-pressed={readinessFilter === "requests_pending"}
              onClick={() => setReadinessFilter(readinessFilter === "requests_pending" ? "ALL" : "requests_pending")}
              className={readinessTileClasses("requests_pending", readinessFilter === "requests_pending")}
            >
              <p className={`text-[11px] font-semibold uppercase tracking-wide ${readinessTileTextClasses("requests_pending", readinessFilter === "requests_pending").label}`}>Requests pending</p>
              <p className={`mt-2 text-[24px] font-semibold ${readinessTileTextClasses("requests_pending", readinessFilter === "requests_pending").value}`}>{readinessSummary.requestsPending}</p>
            </button>
            <button
              type="button"
              aria-pressed={readinessFilter === "conflicts"}
              onClick={() => {
                setReadinessFilter(readinessFilter === "conflicts" ? "ALL" : "conflicts");
                if (readinessFilter !== "conflicts") {
                  setHighlightedSpeakerId(conflicts[0]?.speakerId ?? null);
                }
              }}
              className={readinessTileClasses("conflicts", readinessFilter === "conflicts")}
            >
              <p className={`text-[11px] font-semibold uppercase tracking-wide ${readinessTileTextClasses("conflicts", readinessFilter === "conflicts").label}`}>Scheduling conflicts</p>
              <p className={`mt-2 text-[24px] font-semibold ${readinessTileTextClasses("conflicts", readinessFilter === "conflicts").value}`}>{readinessSummary.conflicts}</p>
            </button>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {READINESS_CHIPS.map(({ key, label }) => {
              const count =
                key === "ALL"
                  ? readiness.total
                  : key === "conflicts"
                    ? conflicts.length
                    : readiness.speakers.filter((entry) =>
                        matchesReadinessFilter(key, entry.flags, conflictsBySpeakerId.has(entry.speakerId)),
                      ).length;
              const isActive = readinessFilter === key;

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setReadinessFilter(isActive ? "ALL" : key);
                    if (key === "conflicts" && !isActive) {
                      setHighlightedSpeakerId(conflicts[0]?.speakerId ?? null);
                    }
                  }}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12px] font-semibold transition ${
                    isActive
                      ? "border-[#28439A] bg-[#28439A] text-white"
                      : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300"
                  }`}
                >
                  {label}
                  <span className={`rounded-full px-1.5 text-[11px] ${isActive ? "bg-white/20" : "bg-white"}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, title, company, or email"
            className="h-11 w-full rounded-xl border border-slate-200 bg-white pr-4 pl-10 text-[14px] text-slate-800 outline-none focus:border-slate-300"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as SpeakerStatus | "ALL")}
          className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-[14px] text-slate-800 outline-none focus:border-slate-300"
        >
          <option value="ALL">All statuses</option>
          {STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>
              {statusLabel(status)}
            </option>
          ))}
        </select>
      </div>

      {errorMessage ? <p className="text-[13px] text-rose-600">{errorMessage}</p> : null}
      {notice ? <p className="text-[13px] text-slate-600">{notice}</p> : null}

      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-[18px] font-semibold text-slate-900">{readinessListCopy.heading}</h2>
          <p className="mt-1 text-[13px] text-slate-600">{readinessListCopy.description}</p>
        </div>
        <p className="text-[12px] font-semibold text-slate-500">
          {filteredSpeakers.length} speaker{filteredSpeakers.length === 1 ? "" : "s"}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1080px]">
          <thead>
            <tr className="border-b border-slate-200 text-left">
              <th className="px-4 py-3 text-[10px] uppercase tracking-wide text-slate-500">Speaker</th>
              <th className="px-4 py-3 text-[10px] uppercase tracking-wide text-slate-500">Missing items</th>
              <th className="px-4 py-3 text-[10px] uppercase tracking-wide text-slate-500">Request status</th>
              <th className="px-4 py-3 text-[10px] uppercase tracking-wide text-slate-500">Conflict</th>
              <th className="px-4 py-3 text-[10px] uppercase tracking-wide text-slate-500">Status</th>
              <th className="px-4 py-3 text-[10px] uppercase tracking-wide text-slate-500">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredSpeakers.map((speaker) => {
              const flags = readinessFlagsBySpeakerId.get(speaker.id) ?? [];
              const missingItems = summarizeMissingItems(flags);
              const speakerConflicts = conflictsBySpeakerId.get(speaker.id) ?? [];
              const isHighlighted = highlightedSpeakerId === speaker.id;

              return (
                <tr
                  key={speaker.id}
                  ref={(node) => {
                    speakerRowRefs.current[speaker.id] = node;
                  }}
                  role="link"
                  tabIndex={0}
                  aria-label={`Open ${speaker.name} speaker detail`}
                  className={`cursor-pointer border-b border-slate-100 transition-colors hover:bg-slate-50 focus:bg-slate-50 focus:outline-none last:border-b-0 ${
                    isHighlighted ? "bg-rose-50 ring-1 ring-inset ring-rose-200" : ""
                  }`}
                  onClick={() => openSpeakerDetail(speaker)}
                  onKeyDown={(event) => handleSpeakerRowKeyDown(event, speaker)}
                >
                  <td className="px-4 py-3 align-top">
                    <div>
                      <p className="text-[13px] font-semibold text-slate-900">{speaker.name}</p>
                      <p className="text-[12px] text-slate-500">
                        {speaker.title || "No title"}{speaker.company ? ` · ${speaker.company}` : ""}
                      </p>
                      <p className="text-[12px] text-slate-500">{speaker.email || "No email on file"}</p>
                      {speaker.phone ? <p className="text-[12px] text-slate-400">{speaker.phone}</p> : null}
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    {missingItems.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {missingItems.slice(0, 2).map((item) => (
                          <span
                            key={`${speaker.id}-${item}`}
                            className="inline-flex rounded-full border border-amber-200/80 bg-amber-50/70 px-2 py-0.5 text-[10px] font-semibold text-amber-800"
                          >
                            {item}
                          </span>
                        ))}
                        {missingItems.length > 2 ? (
                          <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                            +{missingItems.length - 2} more
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-[12px] text-slate-500">No missing items</span>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <span className="text-[12px] font-medium text-slate-700">{requestStatusLabel(flags)}</span>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <SpeakerConflictDisclosure conflicts={speakerConflicts} />
                  </td>
                  <td className="px-4 py-3 align-top">
                    <span className={`inline-flex rounded-full border px-3 py-1 text-[12px] font-semibold ${statusClasses(speaker.status)}`}>
                      {statusLabel(speaker.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => openSpeakerDetail(speaker)}
                        className={`inline-flex h-8 items-center whitespace-nowrap rounded-lg px-3 text-[12px] font-semibold ${
                          speakerConflicts.length > 0
                            ? "border border-rose-300 bg-white text-rose-800 hover:bg-rose-50"
                            : "border border-slate-300 text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        Open speaker
                      </button>
                      <button
                        type="button"
                        aria-label={deletingSpeakerId === speaker.id ? `Deleting ${speaker.name}` : `Delete ${speaker.name}`}
                        title={deletingSpeakerId === speaker.id ? "Deleting..." : "Delete speaker"}
                        onClick={() => void handleDelete(speaker)}
                        disabled={deletingSpeakerId === speaker.id}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-60"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}

            {!isLoading && filteredSpeakers.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-[13px] text-slate-500">
                  {speakers.length === 0 ? "No speakers yet. Add your first speaker to start the directory." : "No speakers match the current search/filter."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {isLoading ? <p className="text-[13px] text-slate-500">Loading speakers...</p> : null}

      {isCreateModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h2 className="text-[18px] font-semibold text-slate-900">Add Speaker</h2>
                <p className="mt-1 text-[13px] text-slate-500">
                  Create a speaker profile entry. Full profile editing continues in the speaker drawer.
                </p>
              </div>
              <button
                type="button"
                onClick={closeCreateModal}
                disabled={isCreating}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-semibold text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4 px-6 py-5">
              {createError ? <p className="text-[13px] text-rose-600">{createError}</p> : null}

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-[12px] font-semibold text-slate-700">Name</span>
                  <input
                    value={createForm.name}
                    onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))}
                    className="h-11 w-full rounded-xl border border-slate-200 px-3 text-[14px] text-slate-800 outline-none focus:border-slate-300"
                    required
                  />
                </label>

                <label className="space-y-1.5">
                  <span className="text-[12px] font-semibold text-slate-700">Email</span>
                  <input
                    value={createForm.email}
                    onChange={(event) => setCreateForm((current) => ({ ...current, email: event.target.value }))}
                    type="email"
                    className="h-11 w-full rounded-xl border border-slate-200 px-3 text-[14px] text-slate-800 outline-none focus:border-slate-300"
                  />
                </label>

                <label className="space-y-1.5">
                  <span className="text-[12px] font-semibold text-slate-700">Phone</span>
                  <input
                    value={createForm.phone}
                    onChange={(event) => setCreateForm((current) => ({ ...current, phone: event.target.value }))}
                    className="h-11 w-full rounded-xl border border-slate-200 px-3 text-[14px] text-slate-800 outline-none focus:border-slate-300"
                  />
                </label>

                <label className="space-y-1.5">
                  <span className="text-[12px] font-semibold text-slate-700">Status</span>
                  <select
                    value={createForm.status}
                    onChange={(event) => setCreateForm((current) => ({ ...current, status: event.target.value as SpeakerStatus }))}
                    className="h-11 w-full rounded-xl border border-slate-200 px-3 text-[14px] text-slate-800 outline-none focus:border-slate-300"
                  >
                    {STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {statusLabel(status)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1.5">
                  <span className="text-[12px] font-semibold text-slate-700">Title</span>
                  <input
                    value={createForm.title}
                    onChange={(event) => setCreateForm((current) => ({ ...current, title: event.target.value }))}
                    className="h-11 w-full rounded-xl border border-slate-200 px-3 text-[14px] text-slate-800 outline-none focus:border-slate-300"
                  />
                </label>

                <label className="space-y-1.5">
                  <span className="text-[12px] font-semibold text-slate-700">Company</span>
                  <input
                    value={createForm.company}
                    onChange={(event) => setCreateForm((current) => ({ ...current, company: event.target.value }))}
                    className="h-11 w-full rounded-xl border border-slate-200 px-3 text-[14px] text-slate-800 outline-none focus:border-slate-300"
                  />
                </label>
              </div>

              <label className="block space-y-1.5">
                <span className="text-[12px] font-semibold text-slate-700">Headshot URL</span>
                <input
                  value={createForm.headshotUrl}
                  onChange={(event) => setCreateForm((current) => ({ ...current, headshotUrl: event.target.value }))}
                  className="h-11 w-full rounded-xl border border-slate-200 px-3 text-[14px] text-slate-800 outline-none focus:border-slate-300"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-[12px] font-semibold text-slate-700">Bio</span>
                <textarea
                  value={createForm.bio}
                  onChange={(event) => setCreateForm((current) => ({ ...current, bio: event.target.value }))}
                  rows={4}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[14px] text-slate-800 outline-none focus:border-slate-300"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-[12px] font-semibold text-slate-700">Internal Notes</span>
                <textarea
                  value={createForm.notes}
                  onChange={(event) => setCreateForm((current) => ({ ...current, notes: event.target.value }))}
                  rows={3}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[14px] text-slate-800 outline-none focus:border-slate-300"
                />
              </label>

              <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-4">
                <div className="text-[12px] text-slate-500">
                  Completeness preview: {computeCompleteness(createForm)}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={closeCreateModal}
                    disabled={isCreating}
                    className="inline-flex h-10 items-center rounded-lg border border-slate-300 px-3 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isCreating}
                    className="inline-flex h-10 items-center rounded-lg bg-[#28439A] px-3 text-[13px] font-semibold text-white hover:bg-[#243d8e] disabled:opacity-60"
                  >
                    {isCreating ? "Creating..." : "Create Speaker"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {csvImportFile ? (
        <SpeakerCsvImportModal
          eventId={eventId}
          file={csvImportFile}
          onClose={() => setCsvImportFile(null)}
          onImported={handleCsvImported}
        />
      ) : null}
    </section>
  );
}
