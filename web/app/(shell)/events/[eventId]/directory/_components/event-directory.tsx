"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle, Mail, Megaphone, Plus, RefreshCw, Upload, Users, X } from "lucide-react";
import {
  DIRECTORY_ROLE_OPTIONS,
  ROLE_LABELS,
  SOURCE_TYPE_LABELS,
  roleChipClasses,
  STATUS_LABELS,
  statusChipClasses,
  type DirectoryRole,
  type DirectoryStatus,
  uniqueDisplayRoles,
} from "./directory-constants";
import { PersonFormDrawer, type DirectoryPersonRecord } from "./person-form-drawer";
import { PersonDetailDrawer } from "./person-detail-drawer";
import { DirectoryImportModal } from "./directory-import-modal";

type ListItem = {
  id: string;
  displayName: string;
  email: string | null;
  company: string | null;
  title: string | null;
  roles: DirectoryRole[];
  sourceLabels: string[];
  usedInLabels: string[];
  status: DirectoryStatus;
  updatedAt: string;
};

type Summary = {
  total: number;
  contacts: number;
  attendees: number;
  speakers: number;
  sponsorsExhibitors: number;
  vipPress: number;
  needsReview: number;
};

type DirectoryEmailResult = {
  attempted: number;
  sent: number;
  failed: number;
  skippedNoProvider: number;
  skippedNoEmail: number;
  skippedRecipients: Array<{ personId: string; displayName: string; email: string | null; reason: string }>;
};

type DirectoryAudienceResult = {
  audience: {
    id: string;
    name: string;
    recipientCount: number;
  };
  selectionMode: "manual" | "filtered";
  selectedCount: number;
  imported: number;
  duplicates: number;
  skippedNoEmail: number;
  skippedRecipients: Array<{ personId: string; displayName: string; email: string | null; reason: string }>;
};

type SummaryCardFilter =
  | "all"
  | "contacts"
  | "attendees"
  | "speakers"
  | "sponsorsExhibitors"
  | "vipPress"
  | "needsReview";

type DrawerState =
  | { kind: "none" }
  | { kind: "add" }
  | { kind: "edit"; person: DirectoryPersonRecord }
  | { kind: "detail"; personId: string }
  | { kind: "delete"; person: ListItem };

const SOURCE_TYPES = [
  "MANUAL",
  "CSV_IMPORT",
  "REGISTRATION_INTEGRATION",
  "SPEAKER_INTAKE",
  "SPEAKER_MODULE",
  "SEATING_MODULE",
  "STAFFING_MODULE",
  "EXHIBITOR_PORTAL",
  "SPONSOR_IMPORT",
];
const STATUSES: DirectoryStatus[] = ["ACTIVE", "NEEDS_REVIEW", "DUPLICATE_REVIEW", "REMOVED"];

export function EventDirectory({ eventId }: { eventId: string }) {
  const [people, setPeople] = useState<ListItem[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loadedEventId, setLoadedEventId] = useState<string | null>(null);
  const activeDirectoryRequest = useRef<AbortController | null>(null);
  const directoryRequestSequence = useRef(0);
  const [isAggregating, setIsAggregating] = useState(false);
  const [aggregationMessage, setAggregationMessage] = useState<string | null>(null);
  const [aggregationFailed, setAggregationFailed] = useState(false);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [sourceTypeFilter, setSourceTypeFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [summaryFilter, setSummaryFilter] = useState<SummaryCardFilter>("all");

  const [drawer, setDrawer] = useState<DrawerState>({ kind: "none" });
  const [deleteResult, setDeleteResult] = useState<string | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [selectedPersonIds, setSelectedPersonIds] = useState<Set<string>>(new Set());
  const [audienceSelectionMode, setAudienceSelectionMode] = useState<"manual" | "filtered">("manual");
  const [isAudienceOpen, setIsAudienceOpen] = useState(false);
  const [audienceName, setAudienceName] = useState("");
  const [isCreatingAudience, setIsCreatingAudience] = useState(false);
  const [audienceError, setAudienceError] = useState<string | null>(null);
  const [audienceResult, setAudienceResult] = useState<DirectoryAudienceResult | null>(null);
  const [isEmailOpen, setIsEmailOpen] = useState(false);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [isEmailSending, setIsEmailSending] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailResult, setEmailResult] = useState<DirectoryEmailResult | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const loadDirectory = useCallback(async () => {
    const requestId = ++directoryRequestSequence.current;
    activeDirectoryRequest.current?.abort();
    const controller = new AbortController();
    activeDirectoryRequest.current = controller;
    setIsLoading(true);
    setErrorMessage(null);
    setLoadedEventId(null);
    setPeople([]);
    setSummary(null);
    try {
      const nextPeople: ListItem[] = [];
      const seenCursors = new Set<string>();
      let nextCursor: string | null = null;
      let nextSummary: Summary | null = null;
      do {
        const params = new URLSearchParams({ limit: "200" });
        if (debouncedSearch) params.set("search", debouncedSearch);
        if (roleFilter) params.set("role", roleFilter);
        if (sourceTypeFilter) params.set("sourceType", sourceTypeFilter);
        if (statusFilter) params.set("status", statusFilter);
        if (nextCursor) params.set("cursor", nextCursor);
        const res = await fetch(`/api/events/${eventId}/directory?${params.toString()}`, {
          credentials: "include",
          signal: controller.signal,
        });
        const payload = await res.json().catch(() => null);
        if (!res.ok) throw new Error(payload?.error ?? "Failed to load directory");
        if (!payload || !Array.isArray(payload.people) || !payload.summary) {
          throw new Error("Directory returned an invalid response");
        }
        nextPeople.push(...(payload.people as ListItem[]));
        nextSummary = payload.summary as Summary;
        nextCursor = typeof payload.nextCursor === "string" ? payload.nextCursor : null;
        if (nextCursor && seenCursors.has(nextCursor)) throw new Error("Directory pagination did not advance");
        if (nextCursor) seenCursors.add(nextCursor);
      } while (nextCursor);

      if (requestId !== directoryRequestSequence.current || controller.signal.aborted) return;
      setPeople(nextPeople);
      setSummary(nextSummary);
      setLoadedEventId(eventId);
    } catch (e) {
      if (controller.signal.aborted || requestId !== directoryRequestSequence.current) return;
      setErrorMessage(e instanceof Error ? e.message : "Failed to load directory");
      setPeople([]);
      setSummary(null);
      setLoadedEventId(null);
    } finally {
      if (requestId === directoryRequestSequence.current) {
        setIsLoading(false);
        if (activeDirectoryRequest.current === controller) activeDirectoryRequest.current = null;
      }
    }
  }, [eventId, debouncedSearch, roleFilter, sourceTypeFilter, statusFilter]);

  useEffect(() => {
    void loadDirectory();
    return () => activeDirectoryRequest.current?.abort();
  }, [loadDirectory]);

  async function aggregateModulePeople() {
    if (isAggregating) return;
    setIsAggregating(true);
    setAggregationMessage(null);
    setAggregationFailed(false);
    try {
      const response = await fetch(`/api/events/${eventId}/directory`, {
        method: "POST",
        credentials: "include",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error ?? "Failed to sync module people");
      const created = Number(payload?.total?.created ?? 0);
      const skipped = Number(payload?.total?.skipped ?? 0);
      const needsReview = Number(payload?.total?.needsReview ?? 0);
      const followUp = [
        needsReview > 0 ? `${needsReview} possible ${needsReview === 1 ? "match needs" : "matches need"} review` : null,
        skipped > 0 ? `${skipped} unsafe ${skipped === 1 ? "record was" : "records were"} skipped` : null,
      ].filter(Boolean).join("; ");
      setAggregationMessage(
        `${created} module ${created === 1 ? "person was" : "people were"} added.${followUp ? ` ${followUp}.` : " Directory is up to date."}`,
      );
      await loadDirectory();
    } catch (error) {
      setAggregationFailed(true);
      setAggregationMessage(error instanceof Error ? error.message : "Failed to sync module people");
    } finally {
      setIsAggregating(false);
    }
  }

  useEffect(() => {
    setSelectedPersonIds((current) => {
      const loadedIds = new Set(people.map((person) => person.id));
      const next = new Set([...current].filter((id) => loadedIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [people]);

  const filteredPeople = useMemo(
    () =>
      people.filter((person) => {
        switch (summaryFilter) {
          case "all":
            return true;
          case "contacts":
            return person.roles.some((role) => role === "PROSPECT" || role === "MARKETING_CONTACT");
          case "attendees":
            return person.roles.some((role) => role === "ATTENDEE" || role === "REGISTRANT");
          case "speakers":
            return person.roles.includes("SPEAKER");
          case "sponsorsExhibitors":
            return person.roles.some((role) => role === "SPONSOR_CONTACT" || role === "EXHIBITOR_CONTACT");
          case "vipPress":
            return person.roles.some((role) => role === "VIP" || role === "PRESS");
          case "needsReview":
            return person.status === "NEEDS_REVIEW" || person.status === "DUPLICATE_REVIEW";
          default:
            return true;
        }
      }),
    [people, summaryFilter],
  );

  const hasFilters = Boolean(debouncedSearch || roleFilter || sourceTypeFilter || statusFilter || summaryFilter !== "all");

  const selectedPeople = useMemo(
    () => people.filter((person) => selectedPersonIds.has(person.id)),
    [people, selectedPersonIds],
  );
  const selectedWithEmail = useMemo(
    () => selectedPeople.filter((person) => Boolean(person.email?.trim() && person.email.includes("@"))),
    [selectedPeople],
  );
  const selectedMissingEmail = useMemo(
    () => selectedPeople.filter((person) => !person.email?.trim() || !person.email.includes("@")),
    [selectedPeople],
  );
  const selectedAudienceCount = audienceSelectionMode === "filtered" ? filteredPeople.length : selectedPersonIds.size;
  const allVisibleSelected = filteredPeople.length > 0 && filteredPeople.every((person) => selectedPersonIds.has(person.id));
  const someVisibleSelected = filteredPeople.some((person) => selectedPersonIds.has(person.id));

  function togglePersonSelection(personId: string) {
    setAudienceSelectionMode("manual");
    setSelectedPersonIds((current) => {
      const next = new Set(current);
      if (next.has(personId)) next.delete(personId);
      else next.add(personId);
      return next;
    });
    setEmailResult(null);
    setEmailError(null);
  }

  function toggleVisibleSelection() {
    setAudienceSelectionMode("manual");
    setSelectedPersonIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        for (const person of filteredPeople) next.delete(person.id);
      } else {
        for (const person of filteredPeople) next.add(person.id);
      }
      return next;
    });
    setEmailResult(null);
    setEmailError(null);
  }

  function selectAllMatchingFilters() {
    setSelectedPersonIds(new Set(filteredPeople.map((person) => person.id)));
    setAudienceSelectionMode("filtered");
    setEmailResult(null);
    setEmailError(null);
  }

  function clearSelection() {
    setSelectedPersonIds(new Set());
    setAudienceSelectionMode("manual");
    setAudienceResult(null);
    setAudienceError(null);
  }

  function openEmailComposer() {
    setEmailSubject("");
    setEmailBody("");
    setEmailError(null);
    setEmailResult(null);
    setIsEmailOpen(true);
  }

  function openCreateAudienceModal() {
    setAudienceName("");
    setAudienceError(null);
    setAudienceResult(null);
    setIsAudienceOpen(true);
  }

  async function createDirectoryAudience() {
    if (isCreatingAudience) return;
    if (!audienceName.trim()) {
      setAudienceError("Audience name is required.");
      return;
    }
    setIsCreatingAudience(true);
    setAudienceError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/marketing/audiences/from-directory`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: audienceName.trim(),
          selectionMode: audienceSelectionMode === "filtered" ? "filtered" : "manual",
          personIds: [...selectedPersonIds],
          filters: {
            search: debouncedSearch || null,
            role: roleFilter || null,
            sourceType: sourceTypeFilter || null,
            status: statusFilter || null,
            summaryFilter,
          },
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? "Failed to create audience");
      setAudienceResult(payload as DirectoryAudienceResult);
      await loadDirectory();
    } catch (e) {
      setAudienceError(e instanceof Error ? e.message : "Failed to create audience");
    } finally {
      setIsCreatingAudience(false);
    }
  }

  async function sendDirectoryEmail() {
    setIsEmailSending(true);
    setEmailError(null);
    setEmailResult(null);
    try {
      const res = await fetch(`/api/events/${eventId}/directory/email`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personIds: [...selectedPersonIds],
          subject: emailSubject,
          body: emailBody,
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? "Failed to send directory email");
      setEmailResult(payload as DirectoryEmailResult);
      await loadDirectory();
    } catch (e) {
      setEmailError(e instanceof Error ? e.message : "Failed to send directory email");
    } finally {
      setIsEmailSending(false);
    }
  }

  async function confirmDelete(person: ListItem) {
    try {
      const res = await fetch(`/api/events/${eventId}/directory/people/${person.id}`, { method: "DELETE", credentials: "include" });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? "Failed to delete person");
      setDeleteResult(
        payload.status === "hard_deleted"
          ? `${person.displayName} was deleted.`
          : `${person.displayName} was removed (kept because of linked records or history).`,
      );
      setDrawer({ kind: "none" });
      await loadDirectory();
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "Failed to delete person");
      setDrawer({ kind: "none" });
    }
  }

  const cards = useMemo(
    () => [
      { key: "all" as const, label: "Total people", value: summary?.total ?? 0, ariaLabel: "Show all people" },
      { key: "contacts" as const, label: "Contacts", value: summary?.contacts ?? 0, ariaLabel: "Filter to contacts" },
      { key: "attendees" as const, label: "Attendees / Registrants", value: summary?.attendees ?? 0, ariaLabel: "Filter to attendees and registrants" },
      { key: "speakers" as const, label: "Speakers", value: summary?.speakers ?? 0, ariaLabel: "Filter to speakers" },
      { key: "sponsorsExhibitors" as const, label: "Sponsors / Exhibitors", value: summary?.sponsorsExhibitors ?? 0, ariaLabel: "Filter to sponsors and exhibitors" },
      { key: "vipPress" as const, label: "VIP / Press", value: summary?.vipPress ?? 0, ariaLabel: "Filter to VIP and press" },
      { key: "needsReview" as const, label: "Needs review", value: summary?.needsReview ?? 0, alert: true, ariaLabel: "Filter to people needing review" },
    ],
    [summary],
  );

  return (
    <div className="px-4 py-5">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold text-slate-900">Directory</h1>
          <p className="text-[13px] text-slate-500">The canonical people &amp; contact layer for this event. One person, many roles.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void aggregateModulePeople()}
            disabled={isAggregating}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isAggregating ? "animate-spin" : ""}`} aria-hidden />
            {isAggregating ? "Syncing…" : "Sync module people"}
          </button>
          <button
            type="button"
            onClick={() => setIsImportOpen(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Upload className="h-3.5 w-3.5" aria-hidden />
            Import people
          </button>
          <button
            type="button"
            onClick={() => setDrawer({ kind: "add" })}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#28439A] px-3 text-[13px] font-semibold text-white hover:bg-[#243d8e]"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add person
          </button>
        </div>
      </header>

      {deleteResult ? (
        <p className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] text-slate-600">{deleteResult}</p>
      ) : null}
      {aggregationMessage ? (
        <p
          className={`mb-3 rounded-lg border px-3 py-2 text-[13px] ${aggregationFailed ? "border-rose-200 bg-rose-50 text-rose-700" : "border-slate-200 bg-slate-50 text-slate-600"}`}
          role={aggregationFailed ? "alert" : "status"}
        >
          {aggregationMessage}
        </p>
      ) : null}
      {errorMessage ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700" role="alert">
          <span>{errorMessage}</span>
          <button type="button" onClick={() => void loadDirectory()} className="rounded-md border border-rose-300 bg-white px-2 py-1 text-[12px] font-semibold hover:bg-rose-100">
            Try again
          </button>
        </div>
      ) : null}

      <section className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7" aria-label="Directory summary">
        {cards.map((card) => {
          const isActive = summaryFilter === card.key;
          return (
          <button
            key={card.key}
            type="button"
            onClick={() => setSummaryFilter(card.key)}
            aria-pressed={isActive}
            aria-label={card.ariaLabel}
            className={[
              "rounded-xl border bg-white p-3 text-left transition focus:outline-none focus:ring-2 focus:ring-[#28439A]/35",
              isActive
                ? card.alert && card.value > 0
                  ? "border-amber-300 bg-amber-50/50 shadow-sm"
                  : "border-[#28439A] bg-[#28439A]/[0.04] shadow-sm"
                : card.alert && card.value > 0
                  ? "border-amber-200 hover:border-amber-300 hover:bg-amber-50/40"
                  : "border-slate-200 hover:border-slate-300 hover:bg-slate-50/80",
              "cursor-pointer",
            ].join(" ")}
          >
            <p className="text-[11px] font-medium text-slate-500">{card.label}</p>
            <p className={`mt-0.5 text-[20px] font-semibold ${card.alert && card.value > 0 ? "text-amber-700" : "text-slate-900"}`}>{card.value}</p>
          </button>
        )})}
      </section>

      <section className="mb-3 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, email, or company"
          aria-label="Search directory"
          className="h-9 min-w-[12rem] flex-1 rounded-lg border border-slate-200 px-2.5 text-[13px] outline-none focus:border-slate-300 sm:max-w-xs"
        />
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} aria-label="Filter by role" className="h-9 rounded-lg border border-slate-200 px-2 text-[13px] text-slate-600">
          <option value="">All roles</option>
          {DIRECTORY_ROLE_OPTIONS.map((role) => (
            <option key={role.value} value={role.value}>{role.label}</option>
          ))}
        </select>
        <select value={sourceTypeFilter} onChange={(e) => setSourceTypeFilter(e.target.value)} aria-label="Filter by source" className="h-9 rounded-lg border border-slate-200 px-2 text-[13px] text-slate-600">
          <option value="">All sources</option>
          {SOURCE_TYPES.map((s) => (
            <option key={s} value={s}>{SOURCE_TYPE_LABELS[s] ?? s.replace(/_/g, " ").toLowerCase()}</option>
          ))}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status" className="h-9 rounded-lg border border-slate-200 px-2 text-[13px] text-slate-600">
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
        {hasFilters ? (
          <button type="button" onClick={() => { setSearch(""); setRoleFilter(""); setSourceTypeFilter(""); setStatusFilter(""); setSummaryFilter("all"); }} className="h-9 rounded-lg border border-slate-200 px-2.5 text-[12px] font-medium text-slate-500 hover:bg-slate-50">
            Clear
          </button>
        ) : null}
      </section>

      {selectedPersonIds.size > 0 ? (
        <section className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
          <div className="text-[13px] text-slate-600">
            <span className="font-semibold text-slate-900">{selectedAudienceCount}</span>{" "}
            {audienceSelectionMode === "filtered" ? "matching filters selected" : "selected"}
            <span className="ml-2 text-slate-400">
              {audienceSelectionMode === "filtered"
                ? "Audience will use the current filters"
                : `${selectedWithEmail.length} with email${
                    selectedMissingEmail.length > 0 ? ` · ${selectedMissingEmail.length} missing/invalid email` : ""
                  }`}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {audienceSelectionMode !== "filtered" && filteredPeople.length > 0 ? (
              <button
                type="button"
                onClick={selectAllMatchingFilters}
                className="h-9 rounded-lg border border-slate-200 px-3 text-[12px] font-semibold text-slate-600 hover:bg-slate-50"
              >
                Select all matching filters
              </button>
            ) : null}
            <button
              type="button"
              onClick={openCreateAudienceModal}
              disabled={selectedAudienceCount === 0}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#28439A] px-3 text-[13px] font-semibold text-white hover:bg-[#243d8e] disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <Users className="h-3.5 w-3.5" aria-hidden />
              Create Audience
            </button>
            <button
              type="button"
              onClick={openEmailComposer}
              disabled={audienceSelectionMode === "filtered"}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#28439A] px-3 text-[13px] font-semibold text-white hover:bg-[#243d8e] disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <Mail className="h-3.5 w-3.5" aria-hidden />
              Email selected
            </button>
            <button
              type="button"
              onClick={clearSelection}
              className="h-9 rounded-lg border border-slate-200 px-3 text-[12px] font-semibold text-slate-500 hover:bg-slate-50"
            >
              Clear selection
            </button>
          </div>
        </section>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[940px] border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
              <th className="w-10 px-3 py-2 font-semibold">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  aria-label={allVisibleSelected ? "Clear page selection" : "Select page"}
                  aria-checked={someVisibleSelected && !allVisibleSelected ? "mixed" : allVisibleSelected}
                  onChange={toggleVisibleSelection}
                  className="h-4 w-4 rounded border-slate-300"
                />
              </th>
              <th className="px-3 py-2 font-semibold">Name</th>
              <th className="px-3 py-2 font-semibold">Email</th>
              <th className="px-3 py-2 font-semibold">Company</th>
              <th className="px-3 py-2 font-semibold">Roles</th>
              <th className="px-3 py-2 font-semibold">Source</th>
              <th className="px-3 py-2 font-semibold">Used in</th>
              <th className="px-3 py-2 font-semibold">Status</th>
              <th className="px-3 py-2 font-semibold">Updated</th>
              <th className="px-3 py-2 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={10} className="px-3 py-8 text-center text-[13px] text-slate-500">Loading directory…</td></tr>
            ) : errorMessage || loadedEventId !== eventId ? (
              <tr><td colSpan={10} className="px-3 py-8 text-center text-[13px] text-slate-500">Directory data is unavailable.</td></tr>
            ) : filteredPeople.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-10 text-center text-[13px] text-slate-500">
                  {hasFilters ? "No people match these filters." : "No people yet. Add a person or import a list to build your event directory."}
                </td>
              </tr>
            ) : (
              filteredPeople.map((person) => (
                <tr key={person.id} className="border-b border-slate-100 text-[13px] hover:bg-slate-50/60">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selectedPersonIds.has(person.id)}
                      aria-label={`Select ${person.displayName}`}
                      onChange={() => togglePersonSelection(person.id)}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <button type="button" onClick={() => setDrawer({ kind: "detail", personId: person.id })} className="font-medium text-slate-800 hover:underline">
                      {person.displayName}
                    </button>
                    {person.title ? <p className="text-[11px] text-slate-400">{person.title}</p> : null}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{person.email ?? "—"}</td>
                  <td className="px-3 py-2 text-slate-600">{person.company ?? "—"}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {person.roles.length === 0 ? <span className="text-[11px] text-slate-400">—</span> : null}
                      {uniqueDisplayRoles(person.roles).map((role) => (
                        <span key={role} className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${roleChipClasses(role)}`}>
                          {ROLE_LABELS[role]}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-[11px] text-slate-500">{person.sourceLabels.join(", ") || "—"}</td>
                  <td className="px-3 py-2 text-[11px] text-slate-500">{person.usedInLabels.join(", ") || "—"}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${statusChipClasses(person.status)}`}>
                      {STATUS_LABELS[person.status]}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-[11px] text-slate-400">{new Date(person.updatedAt).toLocaleDateString()}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2 text-[12px]">
                      <button type="button" onClick={() => setDrawer({ kind: "detail", personId: person.id })} className="font-medium text-slate-500 hover:text-slate-800">View</button>
                      <button type="button" onClick={() => setDrawer({ kind: "delete", person })} className="font-medium text-rose-500 hover:text-rose-700">Delete</button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {drawer.kind === "add" ? (
        <PersonFormDrawer
          eventId={eventId}
          mode="add"
          onClose={() => setDrawer({ kind: "none" })}
          onSaved={() => { setDrawer({ kind: "none" }); void loadDirectory(); }}
          onOpenExisting={(personId) => setDrawer({ kind: "detail", personId })}
        />
      ) : null}

      {drawer.kind === "edit" ? (
        <PersonFormDrawer
          eventId={eventId}
          mode="edit"
          person={drawer.person}
          onClose={() => setDrawer({ kind: "none" })}
          onSaved={() => { setDrawer({ kind: "none" }); void loadDirectory(); }}
          onOpenExisting={(personId) => setDrawer({ kind: "detail", personId })}
        />
      ) : null}

      {drawer.kind === "detail" ? (
        <PersonDetailDrawer
          eventId={eventId}
          personId={drawer.personId}
          onClose={() => setDrawer({ kind: "none" })}
          onEdit={async () => {
            const res = await fetch(`/api/events/${eventId}/directory/people/${drawer.personId}`, { credentials: "include" });
            const payload = await res.json().catch(() => null);
            if (res.ok && payload?.person) setDrawer({ kind: "edit", person: payload.person as DirectoryPersonRecord });
          }}
        />
      ) : null}

      {isImportOpen ? (
        <DirectoryImportModal
          eventId={eventId}
          onClose={() => setIsImportOpen(false)}
          onImported={() => void loadDirectory()}
        />
      ) : null}

      {isAudienceOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div className="flex items-start gap-3">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#28439A]/20 bg-[#28439A]/10 text-[#28439A]">
                  <Users className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <h3 className="text-[16px] font-semibold text-slate-900">
                    {audienceResult ? "Audience created" : "Create Marketing Audience"}
                  </h3>
                  <p className="mt-0.5 text-[13px] text-slate-500">
                    {audienceSelectionMode === "filtered"
                      ? `${selectedAudienceCount} people from all people matching the current filters.`
                      : `${selectedAudienceCount} manually selected people.`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAudienceOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close audience creator"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            {audienceResult ? (
              <div className="space-y-4 px-5 py-5">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                  <div className="flex items-start gap-2">
                    <CheckCircle className="mt-0.5 h-4 w-4 text-emerald-700" aria-hidden />
                    <div>
                      <p className="text-[13px] font-semibold text-emerald-900">{audienceResult.audience.name}</p>
                      <p className="mt-0.5 text-[12px] text-emerald-700">
                        Created with {audienceResult.imported} marketing recipient{audienceResult.imported === 1 ? "" : "s"}
                        {audienceResult.skippedNoEmail > 0 ? ` · ${audienceResult.skippedNoEmail} skipped without valid email` : ""}
                        {audienceResult.duplicates > 0 ? ` · ${audienceResult.duplicates} duplicate email${audienceResult.duplicates === 1 ? "" : "s"} skipped` : ""}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <a
                    href={`/events/${eventId}/marketing?audienceId=${audienceResult.audience.id}`}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <Users className="h-3.5 w-3.5" aria-hidden />
                    View Audience
                  </a>
                  <a
                    href={`/events/${eventId}/marketing?createCampaignFromAudience=${audienceResult.audience.id}`}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#28439A] px-3 text-[13px] font-semibold text-white hover:bg-[#243d8e]"
                  >
                    <Megaphone className="h-3.5 w-3.5" aria-hidden />
                    Create Campaign
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAudienceOpen(false);
                      clearSelection();
                    }}
                    className="h-9 rounded-lg border border-slate-200 px-3 text-[13px] font-semibold text-slate-500 hover:bg-slate-50"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-4 px-5 py-4">
                  <label className="block">
                    <span className="mb-1 block text-[13px] font-semibold text-slate-700">Audience Name</span>
                    <input
                      value={audienceName}
                      onChange={(event) => setAudienceName(event.target.value)}
                      maxLength={120}
                      className="h-10 w-full rounded-lg border border-slate-200 px-3 text-[13px] outline-none focus:border-[#28439A]"
                    />
                  </label>
                  <section className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Source</p>
                    <p className="mt-1 text-[13px] text-slate-700">
                      {audienceSelectionMode === "filtered"
                        ? "All people matching the current Event Directory filters"
                        : "Manually selected Event Directory people"}
                    </p>
                    <p className="mt-0.5 text-[12px] text-slate-500">
                      {selectedAudienceCount} selected for this audience. People without valid email addresses will be skipped.
                    </p>
                  </section>
                  {audienceError ? (
                    <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700" role="alert">
                      {audienceError}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4">
                  <button
                    type="button"
                    onClick={() => setIsAudienceOpen(false)}
                    className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void createDirectoryAudience()}
                    disabled={isCreatingAudience || !audienceName.trim() || selectedAudienceCount === 0}
                    className="h-9 rounded-lg bg-[#28439A] px-3 text-[13px] font-semibold text-white hover:bg-[#243d8e] disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {isCreatingAudience ? "Creating..." : "Create Audience"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      {isEmailOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div>
                <h3 className="text-[16px] font-semibold text-slate-900">Email directory people</h3>
                <p className="mt-0.5 text-[13px] text-slate-500">
                  {selectedWithEmail.length} valid recipient{selectedWithEmail.length === 1 ? "" : "s"}
                  {selectedMissingEmail.length > 0 ? ` · ${selectedMissingEmail.length} skipped without valid email` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsEmailOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close email composer"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <section className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Recipients</p>
                <div className="mt-2 flex max-h-24 flex-wrap gap-1 overflow-y-auto">
                  {selectedWithEmail.map((person) => (
                    <span key={person.id} className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700">
                      {person.displayName} · {person.email}
                    </span>
                  ))}
                  {selectedWithEmail.length === 0 ? (
                    <span className="text-[12px] text-rose-600">No selected people have a valid email address.</span>
                  ) : null}
                </div>
              </section>

              {selectedMissingEmail.length > 0 ? (
                <section className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                  <p className="text-[12px] font-semibold text-amber-800">Skipped recipients</p>
                  <p className="mt-0.5 text-[12px] text-amber-700">These people are selected but will not be sent because their email is missing or invalid.</p>
                  <ul className="mt-2 max-h-24 space-y-1 overflow-y-auto text-[12px] text-amber-800">
                    {selectedMissingEmail.map((person) => (
                      <li key={person.id}>{person.displayName}{person.email ? ` · ${person.email}` : ""}</li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <label className="block">
                <span className="mb-1 block text-[13px] font-semibold text-slate-700">Subject</span>
                <input
                  value={emailSubject}
                  onChange={(event) => setEmailSubject(event.target.value)}
                  maxLength={200}
                  className="h-10 w-full rounded-lg border border-slate-200 px-3 text-[13px] outline-none focus:border-[#28439A]"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[13px] font-semibold text-slate-700">Body</span>
                <textarea
                  value={emailBody}
                  onChange={(event) => setEmailBody(event.target.value)}
                  rows={8}
                  className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-[#28439A]"
                />
              </label>

              {emailError ? (
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700" role="alert">
                  {emailError}
                </p>
              ) : null}
              {emailResult ? (
                <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] text-slate-600">
                  Email processed: {emailResult.sent} sent, {emailResult.failed} failed,
                  {" "}{emailResult.skippedNoProvider} not delivered because no provider is configured,
                  {" "}{emailResult.skippedNoEmail} skipped without valid email.
                </p>
              ) : null}
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4">
              <p className="text-[12px] text-slate-500">Server confirms delivery, failure, or no-provider status per recipient.</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsEmailOpen(false)}
                  className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void sendDirectoryEmail()}
                  disabled={isEmailSending || selectedWithEmail.length === 0 || !emailSubject.trim() || !emailBody.trim()}
                  className="h-9 rounded-lg bg-[#28439A] px-3 text-[13px] font-semibold text-white hover:bg-[#243d8e] disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {isEmailSending ? "Sending..." : "Send email"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {drawer.kind === "delete" ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-[16px] font-semibold text-slate-900">Delete person?</h3>
            <p className="mt-1 text-[13px] text-slate-600">
              Remove <span className="font-medium">{drawer.person.displayName}</span> from the directory. If they are linked to
              Speaker, Seating, or Staff records, or appear in import history, they will be kept as removed rather than deleted.
            </p>
            <p className="mt-2 text-[12px] text-slate-400">This does not delete anyone in an external registration platform.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setDrawer({ kind: "none" })} className="h-9 rounded-lg border border-slate-200 px-3 text-[13px] font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
              <button type="button" onClick={() => void confirmDelete(drawer.person)} className="h-9 rounded-lg bg-rose-600 px-3 text-[13px] font-semibold text-white hover:bg-rose-700">Delete person</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
