"use client";

import {
  ArrowDown,
  ArrowUp,
  Copy,
  Eye,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Send,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type ShowFlowItem = {
  id: string;
  cueType: string;
  timingMode: "ABSOLUTE" | "OFFSET";
  startTime: string | null;
  offsetMin: number | null;
  durationMin: number | null;
  label: string;
  action: string | null;
  owner: string | null;
  ownerPersonId: string | null;
  ownerPerson: { name: string; role: string } | null;
  department: string | null;
  speakerId: string | null;
  speaker: { name: string } | null;
  talentName: string | null;
  avNotes: string | null;
  audioNotes: string | null;
  lightingNotes: string | null;
  internalNotes: string | null;
  publicDescription: string | null;
  visibility: "INTERNAL" | "PUBLIC";
  effectiveStartTime: string | null;
  effectiveEndTime: string | null;
};

type ShowFlowConflict = {
  code: string;
  severity: "BLOCKING" | "WARNING";
  message: string;
  itemIds: string[];
  otherSessionId?: string;
};

type WorkspacePayload = {
  revision: number;
  status: "DRAFT" | "APPROVED";
  approvedAt: string | null;
  lastUpdatedAt: string | null;
  people: Array<{ id: string; name: string; role: string }>;
  speakers: SpeakerOption[];
  copySources: Array<{ id: string; title: string; date: string; cueCount: number }>;
  permissions?: { canEdit: boolean };
  session: {
    title: string;
    date: string;
    startTime: string | null;
    endTime: string | null;
    roomName: string | null;
    expectedAttendance: number | null;
    expectedAttendanceSource: "PLANNER_ESTIMATE" | "REGISTRATION_RSVP" | "IMPORTED" | null;
    publicDescription: string | null;
  };
  items: ShowFlowItem[];
  conflicts: ShowFlowConflict[];
  publication: {
    version: number | null;
    publishedAt: string | null;
    hasUnpublishedChanges: boolean;
  };
};

type SpeakerOption = { id: string; name: string };
type PublicCue = {
  id: string;
  startTime: string | null;
  endTime: string | null;
  durationMin: number | null;
  cue: string;
  description: string | null;
  talent: string | null;
};
type PreviewPayload = {
  preview: {
    title: string;
    date: string;
    startTime: string | null;
    endTime: string | null;
    roomName: string | null;
    description: string | null;
    cues: PublicCue[];
  };
  revision: number;
};

function temporaryId() {
  return `new-${crypto.randomUUID()}`;
}

function emptyCue(after?: ShowFlowItem): ShowFlowItem {
  return {
    id: temporaryId(),
    cueType: "CUSTOM",
    timingMode: after?.timingMode ?? "OFFSET",
    startTime: after?.effectiveEndTime ?? null,
    offsetMin: after?.offsetMin !== null && typeof after?.offsetMin !== "undefined"
      ? after.offsetMin + (after.durationMin ?? 0)
      : 0,
    durationMin: 5,
    label: "",
    action: null,
    owner: null,
    ownerPersonId: null,
    ownerPerson: null,
    department: null,
    speakerId: null,
    speaker: null,
    talentName: null,
    avNotes: null,
    audioNotes: null,
    lightingNotes: null,
    internalNotes: null,
    publicDescription: null,
    visibility: "INTERNAL",
    effectiveStartTime: null,
    effectiveEndTime: null,
  };
}

function messageFrom(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string") return payload.error;
  return fallback;
}

const inputClass = "h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-[13px] text-slate-900 outline-none focus:border-[#28439A]/50 focus:ring-2 focus:ring-[#28439A]/10";
const areaClass = "min-h-20 w-full resize-y rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[13px] text-slate-900 outline-none focus:border-[#28439A]/50 focus:ring-2 focus:ring-[#28439A]/10";
const CUE_TYPES = [
  ["PRE_FUNCTION", "Pre-function / room prep"], ["DOORS_OPEN", "Doors open"],
  ["GUEST_ARRIVAL", "Guest arrival"], ["CONTENT_PRESENTATION", "Content / presentation"],
  ["SPEAKER_HANDOFF", "Speaker handoff"], ["AV_TECHNICAL", "AV / technical"],
  ["FNB_SERVICE", "F&B service"], ["BREAK", "Break"],
  ["AUDIENCE_INTERACTION", "Audience interaction"], ["SAFETY_ANNOUNCEMENT", "Safety / announcement"],
  ["TRANSITION_TURNOVER", "Transition / turnover"], ["CLOSE_STRIKE", "Close / strike"], ["CUSTOM", "Custom"],
] as const;

export function SessionShowFlowWorkspace({
  eventId,
  sessionId,
  onSummaryChange,
}: {
  eventId: string;
  sessionId: string;
  onSummaryChange?: (summary: { count: number; blocking: number; warnings: number; unpublished: boolean; loaded: boolean }) => void;
}) {
  const [workspace, setWorkspace] = useState<WorkspacePayload | null>(null);
  const [items, setItems] = useState<ShowFlowItem[]>([]);
  const [publicDescription, setPublicDescription] = useState("");
  const [speakers, setSpeakers] = useState<SpeakerOption[]>([]);
  const [preview, setPreview] = useState<PreviewPayload["preview"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<"save" | "approval" | "template" | "copy" | "export" | "preview" | "publish" | null>(null);
  const [template, setTemplate] = useState("GENERAL_SESSION");
  const [copySourceId, setCopySourceId] = useState("");
  const [exportFormat, setExportFormat] = useState("pdf");
  const [exportVariant, setExportVariant] = useState("internal");
  const [exportRole, setExportRole] = useState("av");
  const [exportScope, setExportScope] = useState<"session" | "selected">("session");
  const [selectedCueIds, setSelectedCueIds] = useState<string[]>([]);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [selectingCues, setSelectingCues] = useState(false);
  const [editingCueId, setEditingCueId] = useState<string | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [approvalEditOpen, setApprovalEditOpen] = useState(false);
  const editTriggerRef = useRef<HTMLButtonElement | null>(null);
  const drawerCloseRef = useRef<HTMLButtonElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const localEditVersionRef = useRef(0);
  const autoLoadedSessionRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    const editVersionAtStart = localEditVersionRef.current;
    setLoading(true);
    setError(null);
    try {
      const workspaceResponse = await fetch(`/api/events/${eventId}/sessions/${sessionId}/show-flow?mode=workspace`);
      const workspacePayload = await workspaceResponse.json();
      if (!workspaceResponse.ok) throw new Error(messageFrom(workspacePayload, "Unable to load show flow"));
      const nextWorkspace = workspacePayload as WorkspacePayload;
      if (localEditVersionRef.current !== editVersionAtStart) return;
      setWorkspace(nextWorkspace);
      setItems(nextWorkspace.items);
      setPublicDescription(nextWorkspace.session.publicDescription ?? "");
      setSpeakers(nextWorkspace.speakers);
      setPreview(null);
      setMode("view");
      setSelectingCues(false);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load show flow");
    } finally {
      setLoading(false);
    }
  }, [eventId, sessionId]);

  useEffect(() => {
    const sessionKey = `${eventId}:${sessionId}`;
    if (autoLoadedSessionRef.current === sessionKey) return;
    autoLoadedSessionRef.current = sessionKey;
    void load();
  }, [eventId, load, sessionId]);

  useEffect(() => {
    onSummaryChange?.({
      count: workspace?.items.length ?? 0,
      blocking: workspace?.conflicts.filter((entry) => entry.severity === "BLOCKING").length ?? 0,
      warnings: workspace?.conflicts.filter((entry) => entry.severity === "WARNING").length ?? 0,
      unpublished: workspace?.publication.hasUnpublishedChanges ?? false,
      loaded: Boolean(workspace),
    });
  }, [onSummaryChange, workspace]);

  const canEdit = workspace?.permissions?.canEdit ?? true;
  const dirty = useMemo(() => {
    if (!workspace) return false;
    return JSON.stringify(items) !== JSON.stringify(workspace.items)
      || publicDescription !== (workspace.session.publicDescription ?? "");
  }, [items, publicDescription, workspace]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function updateItem(id: string, patch: Partial<ShowFlowItem>) {
    localEditVersionRef.current += 1;
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
    setNotice(null);
  }

  function enterEditMode() {
    if (!workspace || !canEdit) return;
    if (workspace.status === "APPROVED") {
      setApprovalEditOpen(true);
      return;
    }
    setMode("edit");
    setSelectingCues(false);
    setNotice(null);
  }

  function cancelEditing() {
    if (!workspace) return;
    if (dirty && !window.confirm("Discard your unsaved Show Flow changes?")) return;
    localEditVersionRef.current += 1;
    setItems(workspace.items);
    setPublicDescription(workspace.session.publicDescription ?? "");
    setError(null);
    setMode("view");
  }

  function closeCueEditor() {
    if (!workspace || !editingCueId) return;
    const persisted = workspace.items.find((item) => item.id === editingCueId);
    const current = items.find((item) => item.id === editingCueId);
    if (JSON.stringify(persisted) !== JSON.stringify(current) && !window.confirm("Discard unsaved changes to this cue?")) return;
    if (persisted) setItems((all) => all.map((item) => item.id === editingCueId ? persisted : item));
    else setItems((all) => all.filter((item) => item.id !== editingCueId));
    setEditingCueId(null);
    requestAnimationFrame(() => editTriggerRef.current?.focus());
  }

  useEffect(() => {
    if (!editingCueId) return;
    drawerCloseRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeCueEditor();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  // closeCueEditor intentionally reads the latest cue state for Escape dismissal.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingCueId]);

  function insertAfter(index: number) {
    localEditVersionRef.current += 1;
    setItems((current) => {
      const next = [...current];
      next.splice(index + 1, 0, emptyCue(current[index]));
      return next;
    });
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    localEditVersionRef.current += 1;
    setItems((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function duplicate(index: number) {
    localEditVersionRef.current += 1;
    setItems((current) => {
      const source = current[index];
      const copy = { ...source, id: temporaryId(), label: `${source.label} copy` };
      const next = [...current];
      next.splice(index + 1, 0, copy);
      return next;
    });
  }

  function remove(index: number) {
    const cue = items[index];
    const meaningful = Boolean(cue.label.trim() || cue.owner || cue.ownerPersonId || cue.internalNotes || cue.action);
    if (meaningful && !window.confirm(`Delete cue “${cue.label || `#${index + 1}`}”?`)) return;
    localEditVersionRef.current += 1;
    setItems((current) => current.filter((candidate) => candidate.id !== cue.id));
  }

  async function save(closeDrawer = false) {
    if (!workspace || !canEdit) return;
    const editVersionAtSave = localEditVersionRef.current;
    setWorking("save");
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/events/${eventId}/sessions/${sessionId}/show-flow`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items,
          expectedRevision: workspace.revision,
          publicDescription,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(messageFrom(payload, "Unable to save show flow"));
      const nextWorkspace = payload as WorkspacePayload;
      setWorkspace(nextWorkspace);
      if (localEditVersionRef.current === editVersionAtSave) {
        setItems(nextWorkspace.items);
        setPublicDescription(nextWorkspace.session.publicDescription ?? "");
        setSelectedCueIds([]);
      }
      setPreview(null);
      setNotice(localEditVersionRef.current === editVersionAtSave ? "Show flow saved." : "Earlier changes saved. Save again to include newer edits.");
      if (localEditVersionRef.current === editVersionAtSave && closeDrawer) {
        setEditingCueId(null);
        requestAnimationFrame(() => editTriggerRef.current?.focus());
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save show flow");
    } finally {
      setWorking(null);
    }
  }

  async function loadPreview() {
    if (!workspace) return;
    setWorking("preview");
    setError(null);
    try {
      const response = await fetch(`/api/events/${eventId}/sessions/${sessionId}/show-flow/publication`);
      const payload = await response.json();
      if (!response.ok) throw new Error(messageFrom(payload, "Unable to preview attendee agenda"));
      setPreview((payload as PreviewPayload).preview);
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : "Unable to preview attendee agenda");
    } finally {
      setWorking(null);
    }
  }

  async function updateApproval(status: "DRAFT" | "APPROVED") {
    if (!workspace || !canEdit || dirty) return false;
    setWorking("approval");
    setError(null);
    try {
      const response = await fetch(`/api/events/${eventId}/sessions/${sessionId}/show-flow`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, expectedRevision: workspace.revision }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(messageFrom(payload, "Unable to update approval"));
      const nextWorkspace = payload as WorkspacePayload;
      setWorkspace(nextWorkspace);
      setItems(nextWorkspace.items);
      setNotice(status === "APPROVED" ? "Show Flow approved." : "Show Flow returned to draft.");
      if (status === "APPROVED") setMode("view");
      return true;
    } catch (approvalError) {
      setError(approvalError instanceof Error ? approvalError.message : "Unable to update approval");
      return false;
    } finally {
      setWorking(null);
    }
  }

  async function runStarter(action: "apply-template" | "copy-session") {
    if (!workspace || !canEdit || dirty) return;
    const source = workspace.copySources.find((entry) => entry.id === copySourceId);
    const description = action === "apply-template"
      ? `${CUE_TYPES.length > 0 ? "Replace this flow" : "Apply template"} with the ${template.replaceAll("_", " ").toLowerCase()} starter cues?`
      : `Replace this flow with ${source?.cueCount ?? 0} cues from ${source?.title ?? "the selected session"}?`;
    if (!window.confirm(description)) return;
    setWorking(action === "apply-template" ? "template" : "copy");
    setError(null);
    try {
      const response = await fetch(`/api/events/${eventId}/sessions/${sessionId}/show-flow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, template, sourceSessionId: copySourceId, expectedRevision: workspace.revision }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(messageFrom(payload, "Unable to build Show Flow"));
      const nextWorkspace = payload as WorkspacePayload;
      setWorkspace(nextWorkspace);
      setItems(nextWorkspace.items);
      setNotice(action === "apply-template" ? "Starter template applied." : `Copied from ${source?.title ?? "session"}.`);
    } catch (starterError) {
      setError(starterError instanceof Error ? starterError.message : "Unable to build Show Flow");
    } finally {
      setWorking(null);
    }
  }

  async function exportFlow() {
    setWorking("export");
    setError(null);
    try {
      const query = new URLSearchParams({
        format: exportFormat,
        variant: exportVariant,
        ...(exportVariant === "role" ? { role: exportRole } : {}),
        ...(exportScope === "selected" ? { cueIds: selectedCueIds.join(",") } : {}),
      });
      const response = await fetch(`/api/events/${eventId}/sessions/${sessionId}/show-flow/export?${query}`);
      if (!response.ok) throw new Error(messageFrom(await response.json(), "Unable to export Show Flow"));
      const disposition = response.headers.get("content-disposition") ?? "";
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? `show-flow.${exportFormat}`;
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click();
      URL.revokeObjectURL(url);
      setNotice(`${exportFormat.toUpperCase()} export downloaded.`);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Unable to export Show Flow");
    } finally {
      setWorking(null);
    }
  }

  async function publish() {
    if (!workspace || !canEdit || dirty) return;
    setWorking("publish");
    setError(null);
    try {
      const response = await fetch(`/api/events/${eventId}/sessions/${sessionId}/show-flow/publication`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedRevision: workspace.revision }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(messageFrom(payload, "Unable to publish attendee agenda"));
      setNotice(`Attendee agenda version ${payload.version} published.`);
      await load();
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : "Unable to publish attendee agenda");
    } finally {
      setWorking(null);
    }
  }

  if (loading) {
    return <div className="flex min-h-48 items-center justify-center rounded-xl border border-slate-200 bg-white"><Loader2 className="h-5 w-5 animate-spin text-slate-400" aria-label="Loading show flow" /></div>;
  }

  if (!workspace) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-[13px] text-rose-700">
        <p>{error ?? "Unable to load show flow."}</p>
        <button type="button" onClick={() => void load()} className="mt-3 inline-flex items-center gap-1 font-semibold underline"><RefreshCw className="h-3.5 w-3.5" />Retry</button>
      </div>
    );
  }

  const blockers = workspace.conflicts.filter((entry) => entry.severity === "BLOCKING");
  const warnings = workspace.conflicts.filter((entry) => entry.severity === "WARNING");
  const editingCue = items.find((item) => item.id === editingCueId) ?? null;

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Run of Show · Session workspace · Show Flow</p>
            <h2 className="mt-1 text-[19px] font-semibold text-slate-950">{workspace.session.title}</h2>
            <p className="mt-1 text-[12px] text-slate-500">
              {workspace.session.date} · {workspace.session.startTime ?? "—"}–{workspace.session.endTime ?? "—"}{workspace.session.roomName ? ` · ${workspace.session.roomName}` : ""} · version {workspace.revision}
            </p>
            {workspace.session.expectedAttendance !== null ? <p className="mt-1 text-[11px] text-slate-500">{workspace.session.expectedAttendance} expected · {workspace.session.expectedAttendanceSource === "PLANNER_ESTIMATE" ? "Planner estimate" : workspace.session.expectedAttendanceSource === "IMPORTED" ? "Imported" : workspace.session.expectedAttendanceSource === "REGISTRATION_RSVP" ? "Registration RSVP" : "Provenance not set"}</p> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {mode === "view" ? (
              canEdit ? <button type="button" onClick={enterEditMode} className="inline-flex h-9 items-center rounded-lg bg-[#28439A] px-3 text-[12px] font-semibold text-white">Edit show flow</button> : null
            ) : (
              <>
                <button type="button" onClick={cancelEditing} disabled={Boolean(working)} className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700 disabled:opacity-50">Cancel</button>
                <button type="button" onClick={() => { const cue = emptyCue(items.at(-1)); localEditVersionRef.current += 1; setItems((current) => [...current, cue]); setEditingCueId(cue.id); }} disabled={!canEdit} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700 disabled:opacity-50"><Plus className="h-3.5 w-3.5" />Add cue</button>
                <button type="button" onClick={() => setManageOpen(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700"><Settings2 className="h-3.5 w-3.5" />Manage flow</button>
                <button type="button" onClick={() => void save()} disabled={!canEdit || !dirty || Boolean(working)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#28439A] px-3 text-[12px] font-semibold text-white disabled:opacity-50">{working === "save" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}{dirty ? "Save changes" : "Saved"}</button>
              </>
            )}
          </div>
        </div>

        {!canEdit ? <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-600">You have view-only access to this show flow.</p> : null}
        {notice ? <p role="status" className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-700">{notice}</p> : null}
        {error ? <div role="alert" className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700"><span>{error}</span><button type="button" onClick={() => void (dirty ? save() : load())} className="shrink-0 font-semibold underline">{dirty ? "Retry save" : "Reload"}</button></div> : null}

        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="Show Flow readiness summary">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"><p className="text-[10px] font-bold uppercase text-slate-500">Cues</p><p className="mt-1 text-[16px] font-semibold">{items.length}</p></div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"><p className="text-[10px] font-bold uppercase text-slate-500">Unassigned</p><p className="mt-1 text-[16px] font-semibold">{items.filter((item) => !item.ownerPersonId && !item.owner?.trim()).length}</p></div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"><p className="text-[10px] font-bold uppercase text-slate-500">Timing issues</p><p className="mt-1 text-[16px] font-semibold">{workspace.conflicts.length}</p></div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"><p className="text-[10px] font-bold uppercase text-slate-500">Status</p><p className="mt-1 text-[14px] font-semibold">{workspace.status === "APPROVED" ? "Approved" : "Draft · changes pending approval"}</p></div>
        </div>

        {false ? <div className="mt-4 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 lg:grid-cols-2">
          <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-44 flex-1 text-[11px] font-semibold text-slate-600">Starter template<select value={template} onChange={(event) => setTemplate(event.target.value)} disabled={!canEdit || dirty} className={`${inputClass} mt-1`}><option value="GENERAL_SESSION">General Session · 4 cues</option><option value="BREAKOUT">Breakout · 4 cues</option><option value="MEAL">Meal · 4 cues</option><option value="RECEPTION">Reception · 4 cues</option></select></label>
            <button type="button" onClick={() => void runStarter("apply-template")} disabled={!canEdit || dirty || Boolean(working)} className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-[12px] font-semibold text-slate-700 disabled:opacity-50">{working === "template" ? "Applying…" : "Apply template"}</button>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-44 flex-1 text-[11px] font-semibold text-slate-600">Copy from session<select value={copySourceId} onChange={(event) => setCopySourceId(event.target.value)} disabled={!canEdit || dirty} className={`${inputClass} mt-1`}><option value="">Choose eligible session</option>{workspace!.copySources.map((source) => <option key={source.id} value={source.id}>{source.date} · {source.title} · {source.cueCount} cues</option>)}</select></label>
            <button type="button" onClick={() => void runStarter("copy-session")} disabled={!canEdit || dirty || !copySourceId || Boolean(working)} className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-[12px] font-semibold text-slate-700 disabled:opacity-50">{working === "copy" ? "Copying…" : "Copy cues"}</button>
          </div>
        </div> : null}

        {workspace.items.length > 0 ? (
          <div className="mt-4" aria-label="Show Flow timeline">
            <div className="flex h-8 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
              {workspace.items.map((item) => <div key={item.id} title={`${item.effectiveStartTime ?? "Unscheduled"} · ${item.label}`} className="min-w-3 border-r border-white bg-[#28439A]/75" style={{ flex: Math.max(1, item.durationMin ?? 1) }} />)}
            </div>
            <div className="mt-1 flex justify-between text-[10px] font-semibold text-slate-500"><span>Pre-function</span><span>Live session</span><span>Turnover</span></div>
          </div>
        ) : null}

        {false ? <label className="mt-4 block">
          <span className="text-[12px] font-semibold text-slate-700">Attendee-facing session description</span>
          <textarea value={publicDescription} onChange={(event) => { localEditVersionRef.current += 1; setPublicDescription(event.target.value); }} disabled={!canEdit} placeholder="Approved public summary; internal notes are never copied here." className={`${areaClass} mt-1`} />
        </label> : publicDescription ? <div className="mt-4 rounded-lg bg-slate-50 px-3 py-2"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Attendee description</p><p className="mt-1 text-[12px] text-slate-700">{publicDescription}</p></div> : null}
      </section>

      {mode === "edit" && workspace.conflicts.length > 0 ? (
        <section aria-label="Show flow conflicts" className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h3 className="text-[14px] font-semibold text-amber-950">{blockers.length} blocking · {warnings.length} warning</h3>
          <ul className="mt-2 space-y-1.5">
            {workspace.conflicts.map((conflict, index) => (
              <li key={`${conflict.code}-${index}`} className="flex gap-2 text-[12px] text-amber-900">
                <span className="rounded-full border border-amber-300 bg-white px-1.5 py-0.5 text-[10px] font-bold">{conflict.code}</span>
                <span>{conflict.message}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {true ? (
        items.length === 0 ? (
          <section className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center" aria-label="Empty Show Flow">
            <h3 className="text-[15px] font-semibold text-slate-900">No Show Flow cues yet</h3>
            <p className="mt-1 text-[12px] text-slate-500">Create a starter run sheet or begin with a blank cue when you are ready.</p>
            {canEdit ? mode === "edit" ? <div className="mt-4 flex justify-center gap-2"><button type="button" onClick={() => setManageOpen(true)} className="h-9 rounded-lg border border-slate-200 px-3 text-[12px] font-semibold text-slate-700">Use starter template</button><button type="button" onClick={() => { const cue = emptyCue(); localEditVersionRef.current += 1; setItems([cue]); setEditingCueId(cue.id); }} className="h-9 rounded-lg bg-[#28439A] px-3 text-[12px] font-semibold text-white">Start blank</button></div> : <button type="button" onClick={enterEditMode} className="mt-4 inline-flex h-9 items-center rounded-lg bg-[#28439A] px-3 text-[12px] font-semibold text-white">Build show flow</button> : null}
          </section>
        ) : (
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" aria-label="View Show Flow">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div><h3 className="text-[15px] font-semibold text-slate-950">{mode === "edit" ? "Editing Show Flow" : "View Show Flow"}</h3><p className="mt-0.5 text-[11px] text-slate-500">Chronological onsite run sheet</p></div>
              <button type="button" onClick={() => { setSelectingCues((current) => !current); setSelectedCueIds([]); }} className="text-[11px] font-semibold text-[#28439A]">{selectingCues ? "Done selecting" : "Select cues"}</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] table-fixed text-left">
                <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-500"><tr>{selectingCues ? <th className="w-10 px-3 py-2"><span className="sr-only">Select</span></th> : null}<th className="w-28 px-3 py-2">Time</th><th className="w-20 px-3 py-2">Duration</th><th className="w-[26%] px-3 py-2">Cue / segment</th><th className="w-[20%] px-3 py-2">Owner / role</th><th className="px-3 py-2">Operational instructions</th>{mode === "edit" ? <th className="w-32 px-3 py-2"><span className="sr-only">Cue actions</span></th> : null}</tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item, index) => {
                    const cueConflicts = workspace.conflicts.filter((conflict) => conflict.itemIds.includes(item.id));
                    const instructions = [item.action, item.avNotes, item.audioNotes, item.lightingNotes, item.internalNotes].filter(Boolean);
                    return <tr key={item.id} className="align-top hover:bg-slate-50/70">
                      {selectingCues ? <td className="px-3 py-3"><input type="checkbox" checked={selectedCueIds.includes(item.id)} onChange={(event) => setSelectedCueIds((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} aria-label={`Select cue ${index + 1} for export`} className="h-4 w-4 rounded border-slate-300" /></td> : null}
                      <td className="px-3 py-3 text-[12px] font-semibold tabular-nums text-slate-900">{item.effectiveStartTime ?? "Unscheduled"}{item.effectiveEndTime ? <span className="block text-[10px] font-medium text-slate-500">to {item.effectiveEndTime}</span> : null}</td>
                      <td className="px-3 py-3 text-[12px] tabular-nums text-slate-700">{item.durationMin ? `${item.durationMin} min` : "—"}</td>
                      <td className="px-3 py-3"><p className="text-[13px] font-semibold text-slate-950">{item.label || `Cue ${index + 1}`}</p>{item.talentName || item.speaker?.name ? <p className="mt-1 text-[11px] text-slate-500">{item.speaker?.name ?? item.talentName}</p> : null}</td>
                      <td className="px-3 py-3"><p className="text-[12px] font-semibold text-slate-800">{item.ownerPerson?.name ?? item.owner ?? "Unassigned"}</p>{item.ownerPerson?.role ? <p className="mt-1 text-[10px] text-slate-500">{item.ownerPerson.role}</p> : null}</td>
                      <td className="px-3 py-3"><div className="space-y-1 text-[12px] leading-5 text-slate-700">{instructions.length ? instructions.map((instruction, instructionIndex) => <p key={instructionIndex}>{instruction}</p>) : <span className="text-slate-400">—</span>}</div>{cueConflicts.length ? <div className="mt-2 space-y-1">{cueConflicts.map((conflict, conflictIndex) => <p key={`${conflict.code}-${conflictIndex}`} title={conflict.message} className="line-clamp-1 text-[10px] font-semibold text-amber-800"><span className={`mr-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${conflict.severity === "BLOCKING" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-800"}`}>{conflict.severity === "BLOCKING" ? "Timing issue" : "Warning"}</span>{conflict.message}</p>)}</div> : null}</td>
                      {mode === "edit" ? <td className="px-2 py-2"><div className="flex items-center justify-end gap-0.5"><button ref={editingCueId === item.id ? editTriggerRef : undefined} type="button" onClick={(event) => { editTriggerRef.current = event.currentTarget; setEditingCueId(item.id); }} className="rounded-md px-2 py-1 text-[11px] font-semibold text-[#28439A]" aria-label={`Edit cue ${index + 1}`}>Edit</button><button type="button" aria-label={`Move cue ${index + 1} up`} onClick={() => move(index, -1)} disabled={index === 0} className="rounded p-1 text-slate-500 disabled:opacity-25"><ArrowUp className="h-3.5 w-3.5" /></button><button type="button" aria-label={`Move cue ${index + 1} down`} onClick={() => move(index, 1)} disabled={index === items.length - 1} className="rounded p-1 text-slate-500 disabled:opacity-25"><ArrowDown className="h-3.5 w-3.5" /></button><button type="button" aria-label={`Duplicate cue ${index + 1}`} onClick={() => duplicate(index)} className="rounded p-1 text-slate-500"><Copy className="h-3.5 w-3.5" /></button><button type="button" aria-label={`Delete cue ${index + 1}`} onClick={() => remove(index)} className="rounded p-1 text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button></div></td> : null}
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )
      ) : items.length === 0 ? (
        <section className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center">
          <h3 className="text-[15px] font-semibold text-slate-900">No cues yet</h3>
          <p className="mt-1 text-[12px] text-slate-500">Build the internal run, then explicitly approve public cues for attendee publication.</p>
          <button type="button" onClick={() => { localEditVersionRef.current += 1; setItems([emptyCue()]); }} disabled={!canEdit} className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#28439A] px-3 text-[12px] font-semibold text-white disabled:opacity-50"><Plus className="h-3.5 w-3.5" />Start blank</button>
        </section>
      ) : (
        <ol className="space-y-3">
          {items.map((item, index) => (
            <li key={item.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-slate-100 px-2 text-[11px] font-bold text-slate-600">{index + 1}</span>
                  <span className="text-[12px] font-semibold text-slate-500">{item.effectiveStartTime ?? "Unscheduled"}{item.effectiveEndTime ? `–${item.effectiveEndTime}` : ""}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" aria-label={`Move cue ${index + 1} up`} title="Move up" onClick={() => move(index, -1)} disabled={!canEdit || index === 0} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                  <button type="button" aria-label={`Move cue ${index + 1} down`} title="Move down" onClick={() => move(index, 1)} disabled={!canEdit || index === items.length - 1} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
                  <button type="button" aria-label={`Duplicate cue ${index + 1}`} title="Duplicate" onClick={() => duplicate(index)} disabled={!canEdit} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30"><Copy className="h-4 w-4" /></button>
                  <button type="button" aria-label={`Insert cue after ${index + 1}`} title="Insert after" onClick={() => insertAfter(index)} disabled={!canEdit} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30"><Plus className="h-4 w-4" /></button>
                  <button type="button" aria-label={`Delete cue ${index + 1}`} title="Delete" onClick={() => remove(index)} disabled={!canEdit} className="rounded-md p-1.5 text-rose-600 hover:bg-rose-50 disabled:opacity-30"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <label className="text-[11px] font-semibold text-slate-600">Timing
                  <select value={item.timingMode} onChange={(event) => updateItem(item.id, { timingMode: event.target.value as "ABSOLUTE" | "OFFSET", startTime: event.target.value === "OFFSET" ? null : item.startTime, offsetMin: event.target.value === "ABSOLUTE" ? null : item.offsetMin ?? 0 })} disabled={!canEdit} className={`${inputClass} mt-1`}><option value="OFFSET">Session offset</option><option value="ABSOLUTE">Absolute time</option></select>
                </label>
                {item.timingMode === "ABSOLUTE" ? (
                  <label className="text-[11px] font-semibold text-slate-600">Start time<input type="time" value={item.startTime ?? ""} onChange={(event) => updateItem(item.id, { startTime: event.target.value || null })} disabled={!canEdit} className={`${inputClass} mt-1`} /></label>
                ) : (
                  <label className="text-[11px] font-semibold text-slate-600">Offset minutes<input type="number" min={0} step={1} value={item.offsetMin ?? ""} onChange={(event) => updateItem(item.id, { offsetMin: event.target.value === "" ? null : Number(event.target.value) })} disabled={!canEdit} className={`${inputClass} mt-1`} /></label>
                )}
                <label className="text-[11px] font-semibold text-slate-600">Duration minutes<input type="number" min={1} step={1} value={item.durationMin ?? ""} onChange={(event) => updateItem(item.id, { durationMin: event.target.value === "" ? null : Number(event.target.value) })} disabled={!canEdit} className={`${inputClass} mt-1`} /></label>
                <label className="text-[11px] font-semibold text-slate-600">Visibility<select value={item.visibility} onChange={(event) => updateItem(item.id, { visibility: event.target.value as "INTERNAL" | "PUBLIC" })} disabled={!canEdit} className={`${inputClass} mt-1`}><option value="INTERNAL">Internal only</option><option value="PUBLIC">Approved public</option></select></label>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <label className="text-[11px] font-semibold text-slate-600">Cue type<select value={item.cueType} onChange={(event) => updateItem(item.id, { cueType: event.target.value })} disabled={!canEdit} className={`${inputClass} mt-1`}>{CUE_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label className="text-[11px] font-semibold text-slate-600">Cue / segment<input value={item.label} onChange={(event) => updateItem(item.id, { label: event.target.value })} disabled={!canEdit} placeholder="Walk-on, video roll, remarks…" className={`${inputClass} mt-1`} /></label>
                <label className="text-[11px] font-semibold text-slate-600">Action<input value={item.action ?? ""} onChange={(event) => updateItem(item.id, { action: event.target.value || null })} disabled={!canEdit} placeholder="Operational action or call" className={`${inputClass} mt-1`} /></label>
                <label className="text-[11px] font-semibold text-slate-600">Directory owner<select value={item.ownerPersonId ?? ""} onChange={(event) => updateItem(item.id, { ownerPersonId: event.target.value || null, ownerPerson: null })} disabled={!canEdit} className={`${inputClass} mt-1`}><option value="">No named owner</option>{workspace!.people.map((person) => <option key={person.id} value={person.id}>{person.name} · {person.role}</option>)}</select></label>
                <label className="text-[11px] font-semibold text-slate-600">Unfilled owner role<input value={item.owner ?? ""} onChange={(event) => updateItem(item.id, { owner: event.target.value || null })} disabled={!canEdit || Boolean(item.ownerPersonId)} placeholder="Show caller, AV lead…" className={`${inputClass} mt-1`} /></label>
                <label className="text-[11px] font-semibold text-slate-600">Department<input value={item.department ?? ""} onChange={(event) => updateItem(item.id, { department: event.target.value || null })} disabled={!canEdit} className={`${inputClass} mt-1`} /></label>
                <label className="text-[11px] font-semibold text-slate-600">Speaker<select value={item.speakerId ?? ""} onChange={(event) => updateItem(item.id, { speakerId: event.target.value || null })} disabled={!canEdit} className={`${inputClass} mt-1`}><option value="">No directory speaker</option>{speakers.map((speaker) => <option key={speaker.id} value={speaker.id}>{speaker.name}</option>)}</select></label>
                <label className="text-[11px] font-semibold text-slate-600">Talent / role<input value={item.talentName ?? ""} onChange={(event) => updateItem(item.id, { talentName: event.target.value || null })} disabled={!canEdit} placeholder="Host, band, walk-on…" className={`${inputClass} mt-1`} /></label>
              </div>

              <details className="mt-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                <summary className="cursor-pointer text-[12px] font-semibold text-slate-700">Production and audience notes</summary>
                <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <label className="text-[11px] font-semibold text-slate-600">AV notes<textarea value={item.avNotes ?? ""} onChange={(event) => updateItem(item.id, { avNotes: event.target.value || null })} disabled={!canEdit} className={`${areaClass} mt-1`} /></label>
                  <label className="text-[11px] font-semibold text-slate-600">Audio notes<textarea value={item.audioNotes ?? ""} onChange={(event) => updateItem(item.id, { audioNotes: event.target.value || null })} disabled={!canEdit} className={`${areaClass} mt-1`} /></label>
                  <label className="text-[11px] font-semibold text-slate-600">Lighting notes<textarea value={item.lightingNotes ?? ""} onChange={(event) => updateItem(item.id, { lightingNotes: event.target.value || null })} disabled={!canEdit} className={`${areaClass} mt-1`} /></label>
                  <label className="text-[11px] font-semibold text-slate-600">Internal notes<textarea value={item.internalNotes ?? ""} onChange={(event) => updateItem(item.id, { internalNotes: event.target.value || null })} disabled={!canEdit} className={`${areaClass} mt-1`} /></label>
                  <label className="text-[11px] font-semibold text-slate-600 md:col-span-2">Public cue description<textarea value={item.publicDescription ?? ""} onChange={(event) => updateItem(item.id, { publicDescription: event.target.value || null })} disabled={!canEdit || item.visibility !== "PUBLIC"} placeholder={item.visibility === "PUBLIC" ? "Approved attendee-facing copy" : "Set visibility to Approved public first"} className={`${areaClass} mt-1`} /></label>
                </div>
              </details>
            </li>
          ))}
        </ol>
      )}

      {editingCue ? <div className="fixed inset-0 z-[80] flex justify-end bg-slate-950/30 backdrop-blur-[2px]" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeCueEditor(); }}>
        <aside role="dialog" aria-modal="true" aria-labelledby="show-flow-cue-editor-title" className="flex h-full w-full max-w-xl flex-col bg-white shadow-2xl">
          <header className="flex items-start justify-between border-b border-slate-200 px-5 py-4"><div><p className="text-[10px] font-bold uppercase tracking-wide text-[#28439A]">Show Flow cue</p><h3 id="show-flow-cue-editor-title" className="mt-1 text-[18px] font-semibold text-slate-950">{editingCue.label || "New cue"}</h3></div><button ref={drawerCloseRef} type="button" onClick={closeCueEditor} aria-label="Close cue editor" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button></header>
          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-[11px] font-semibold text-slate-600">Timing<select value={editingCue.timingMode} onChange={(event) => updateItem(editingCue.id, { timingMode: event.target.value as "ABSOLUTE" | "OFFSET", startTime: event.target.value === "OFFSET" ? null : editingCue.startTime, offsetMin: event.target.value === "ABSOLUTE" ? null : editingCue.offsetMin ?? 0 })} className={`${inputClass} mt-1`}><option value="OFFSET">Session offset</option><option value="ABSOLUTE">Absolute time</option></select></label>
              {editingCue.timingMode === "ABSOLUTE" ? <label className="text-[11px] font-semibold text-slate-600">Start time<input type="time" value={editingCue.startTime ?? ""} onChange={(event) => updateItem(editingCue.id, { startTime: event.target.value || null })} className={`${inputClass} mt-1`} /></label> : <label className="text-[11px] font-semibold text-slate-600">Offset minutes<input type="number" min={0} value={editingCue.offsetMin ?? ""} onChange={(event) => updateItem(editingCue.id, { offsetMin: event.target.value === "" ? null : Number(event.target.value) })} className={`${inputClass} mt-1`} /></label>}
              <label className="text-[11px] font-semibold text-slate-600">Duration minutes<input type="number" min={1} value={editingCue.durationMin ?? ""} onChange={(event) => updateItem(editingCue.id, { durationMin: event.target.value === "" ? null : Number(event.target.value) })} className={`${inputClass} mt-1`} /></label>
              <label className="text-[11px] font-semibold text-slate-600">Visibility<select value={editingCue.visibility} onChange={(event) => updateItem(editingCue.id, { visibility: event.target.value as "INTERNAL" | "PUBLIC" })} className={`${inputClass} mt-1`}><option value="INTERNAL">Internal only</option><option value="PUBLIC">Approved public</option></select></label>
              <label className="text-[11px] font-semibold text-slate-600">Cue type<select value={editingCue.cueType} onChange={(event) => updateItem(editingCue.id, { cueType: event.target.value })} className={`${inputClass} mt-1`}>{CUE_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="text-[11px] font-semibold text-slate-600">Cue / segment<input value={editingCue.label} onChange={(event) => updateItem(editingCue.id, { label: event.target.value })} className={`${inputClass} mt-1`} /></label>
              <label className="text-[11px] font-semibold text-slate-600 sm:col-span-2">Action<input value={editingCue.action ?? ""} onChange={(event) => updateItem(editingCue.id, { action: event.target.value || null })} className={`${inputClass} mt-1`} /></label>
              <label className="text-[11px] font-semibold text-slate-600">Directory owner<select value={editingCue.ownerPersonId ?? ""} onChange={(event) => updateItem(editingCue.id, { ownerPersonId: event.target.value || null, ownerPerson: null })} className={`${inputClass} mt-1`}><option value="">No named owner</option>{workspace.people.map((person) => <option key={person.id} value={person.id}>{person.name} · {person.role}</option>)}</select></label>
              <label className="text-[11px] font-semibold text-slate-600">Unfilled owner role<input value={editingCue.owner ?? ""} disabled={Boolean(editingCue.ownerPersonId)} onChange={(event) => updateItem(editingCue.id, { owner: event.target.value || null })} className={`${inputClass} mt-1`} /></label>
              <label className="text-[11px] font-semibold text-slate-600">Department<input value={editingCue.department ?? ""} onChange={(event) => updateItem(editingCue.id, { department: event.target.value || null })} className={`${inputClass} mt-1`} /></label>
              <label className="text-[11px] font-semibold text-slate-600">Speaker<select value={editingCue.speakerId ?? ""} onChange={(event) => updateItem(editingCue.id, { speakerId: event.target.value || null })} className={`${inputClass} mt-1`}><option value="">No directory speaker</option>{speakers.map((speaker) => <option key={speaker.id} value={speaker.id}>{speaker.name}</option>)}</select></label>
              <label className="text-[11px] font-semibold text-slate-600 sm:col-span-2">Talent / role<input value={editingCue.talentName ?? ""} onChange={(event) => updateItem(editingCue.id, { talentName: event.target.value || null })} className={`${inputClass} mt-1`} /></label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2"><label className="text-[11px] font-semibold text-slate-600">AV notes<textarea value={editingCue.avNotes ?? ""} onChange={(event) => updateItem(editingCue.id, { avNotes: event.target.value || null })} className={`${areaClass} mt-1`} /></label><label className="text-[11px] font-semibold text-slate-600">Audio notes<textarea value={editingCue.audioNotes ?? ""} onChange={(event) => updateItem(editingCue.id, { audioNotes: event.target.value || null })} className={`${areaClass} mt-1`} /></label><label className="text-[11px] font-semibold text-slate-600">Lighting notes<textarea value={editingCue.lightingNotes ?? ""} onChange={(event) => updateItem(editingCue.id, { lightingNotes: event.target.value || null })} className={`${areaClass} mt-1`} /></label><label className="text-[11px] font-semibold text-slate-600">Internal notes<textarea value={editingCue.internalNotes ?? ""} onChange={(event) => updateItem(editingCue.id, { internalNotes: event.target.value || null })} className={`${areaClass} mt-1`} /></label><label className="text-[11px] font-semibold text-slate-600 sm:col-span-2">Public cue description<textarea value={editingCue.publicDescription ?? ""} disabled={editingCue.visibility !== "PUBLIC"} onChange={(event) => updateItem(editingCue.id, { publicDescription: event.target.value || null })} className={`${areaClass} mt-1`} /></label></div>
          </div>
          <footer className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4"><button type="button" onClick={closeCueEditor} className="h-9 rounded-lg border border-slate-200 px-3 text-[12px] font-semibold text-slate-700">Cancel</button><button type="button" onClick={() => void save(true)} disabled={!dirty || Boolean(working)} className="h-9 rounded-lg bg-[#28439A] px-3 text-[12px] font-semibold text-white disabled:opacity-50">{working === "save" ? "Saving…" : "Save cue"}</button></footer>
        </aside>
      </div> : null}

      {manageOpen ? <div className="fixed inset-0 z-[80] flex justify-end bg-slate-950/30 backdrop-blur-[2px]" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !dirty) setManageOpen(false); }}><aside role="dialog" aria-modal="true" aria-labelledby="manage-show-flow-title" className="h-full w-full max-w-md overflow-y-auto bg-white p-5 shadow-2xl"><div className="flex items-center justify-between"><h3 id="manage-show-flow-title" className="text-[18px] font-semibold text-slate-950">Manage flow</h3><button type="button" onClick={() => { if (!dirty || window.confirm("Discard unsaved flow details?")) setManageOpen(false); }} aria-label="Close Manage flow" className="rounded-lg p-2 text-slate-500"><X className="h-4 w-4" /></button></div><p className="mt-1 text-[12px] text-slate-500">Apply a starter, copy another session, or update attendee-facing details.</p><div className="mt-5 space-y-4"><div className="rounded-xl border border-slate-200 p-3"><label className="text-[11px] font-semibold text-slate-600">Starter template<select value={template} onChange={(event) => setTemplate(event.target.value)} disabled={dirty} className={`${inputClass} mt-1`}><option value="GENERAL_SESSION">General Session · 4 cues</option><option value="BREAKOUT">Breakout · 4 cues</option><option value="MEAL">Meal · 4 cues</option><option value="RECEPTION">Reception · 4 cues</option></select></label><button type="button" onClick={() => void runStarter("apply-template")} disabled={dirty || Boolean(working)} className="mt-2 h-9 w-full rounded-lg border border-slate-300 text-[12px] font-semibold">Apply template</button></div><div className="rounded-xl border border-slate-200 p-3"><label className="text-[11px] font-semibold text-slate-600">Copy from session<select value={copySourceId} onChange={(event) => setCopySourceId(event.target.value)} disabled={dirty} className={`${inputClass} mt-1`}><option value="">Choose eligible session</option>{workspace.copySources.map((source) => <option key={source.id} value={source.id}>{source.date} · {source.title} · {source.cueCount} cues</option>)}</select></label><button type="button" onClick={() => void runStarter("copy-session")} disabled={dirty || !copySourceId || Boolean(working)} className="mt-2 h-9 w-full rounded-lg border border-slate-300 text-[12px] font-semibold">Copy cues</button></div><label className="block text-[11px] font-semibold text-slate-600">Attendee-facing session description<textarea value={publicDescription} onChange={(event) => { localEditVersionRef.current += 1; setPublicDescription(event.target.value); }} className={`${areaClass} mt-1`} /></label><button type="button" onClick={() => void save(false)} disabled={!dirty || Boolean(working)} className="h-9 w-full rounded-lg bg-[#28439A] text-[12px] font-semibold text-white disabled:opacity-50">Save flow details</button></div></aside></div> : null}

      {approvalEditOpen ? <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/40 p-4" role="presentation"><section role="dialog" aria-modal="true" aria-labelledby="edit-approved-flow-title" className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"><h3 id="edit-approved-flow-title" className="text-[17px] font-semibold text-slate-950">Return this Show Flow to Draft?</h3><p className="mt-2 text-[13px] leading-5 text-slate-600">Editing requires Draft status. The approved version remains in activity history, and the run sheet will stay visible while you edit.</p><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setApprovalEditOpen(false)} className="h-9 rounded-lg border border-slate-200 px-3 text-[12px] font-semibold text-slate-700">Keep approved</button><button type="button" onClick={async () => { if (await updateApproval("DRAFT")) { setApprovalEditOpen(false); setMode("edit"); } }} disabled={Boolean(working)} className="h-9 rounded-lg bg-[#28439A] px-3 text-[12px] font-semibold text-white">Return to Draft and edit</button></div></section></div> : null}

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" aria-label="Export Show Flow">
        <div className="flex flex-wrap items-end gap-3">
          <div className="mr-auto"><h3 className="text-[15px] font-semibold text-slate-950">Export</h3><p className="mt-1 text-[12px] text-slate-500">Generate a stored-data run sheet with version and Draft status.</p></div>
          <label className="text-[11px] font-semibold text-slate-600">Audience<select value={exportVariant} onChange={(event) => setExportVariant(event.target.value)} className={`${inputClass} mt-1 w-44`}><option value="internal">Internal show caller</option><option value="client">Client-facing run sheet</option><option value="role">Role sheet</option></select></label>
          {exportVariant === "role" ? <label className="text-[11px] font-semibold text-slate-600">Role<select value={exportRole} onChange={(event) => setExportRole(event.target.value)} className={`${inputClass} mt-1 w-36`}><option value="av">AV</option><option value="venue">Venue</option><option value="registration">Registration</option><option value="speaker">Speaker-facing</option></select></label> : null}
          <label className="text-[11px] font-semibold text-slate-600">Cues<select value={exportScope} onChange={(event) => { const scope = event.target.value as "session" | "selected"; setExportScope(scope); if (scope === "selected") setSelectingCues(true); }} className={`${inputClass} mt-1 w-36`}><option value="session">Entire session</option><option value="selected">Selected cues</option></select></label>
          <label className="text-[11px] font-semibold text-slate-600">Format<select value={exportFormat} onChange={(event) => setExportFormat(event.target.value)} className={`${inputClass} mt-1 w-28`}><option value="pdf">PDF</option><option value="xlsx">XLSX</option><option value="csv">CSV</option><option value="docx">DOCX</option></select></label>
          <button type="button" onClick={() => void exportFlow()} disabled={dirty || Boolean(working) || (exportScope === "selected" && selectedCueIds.length === 0)} className="h-9 rounded-lg bg-[#28439A] px-3 text-[12px] font-semibold text-white disabled:opacity-50">{working === "export" ? "Generating…" : "Download export"}</button>
        </div>
      </section>

      {mode === "edit" ? <><section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" aria-label="Show Flow approval">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-[15px] font-semibold text-slate-950">Operational approval</h3>
            <p className="mt-1 text-[12px] text-slate-500">{workspace.status === "APPROVED" ? `Approved${workspace.approvedAt ? ` ${new Date(workspace.approvedAt).toLocaleString()}` : ""}` : "Draft — approval requires populated, valid cue timing."}</p>
          </div>
          <button type="button" onClick={() => void updateApproval(workspace.status === "APPROVED" ? "DRAFT" : "APPROVED")} disabled={!canEdit || dirty || blockers.length > 0 || items.length === 0 || Boolean(working)} className="inline-flex h-9 items-center rounded-lg bg-emerald-700 px-3 text-[12px] font-semibold text-white disabled:opacity-50">{working === "approval" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}{workspace.status === "APPROVED" ? "Return to draft" : "Approve Show Flow"}</button>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-[15px] font-semibold text-slate-950">Attendee agenda publication</h3>
            <p className="mt-1 text-[12px] text-slate-500">
              {workspace.publication.version
                ? `Version ${workspace.publication.version} published${workspace.publication.hasUnpublishedChanges ? " · unpublished changes" : ""}`
                : "Not published"}
            </p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => void loadPreview()} disabled={dirty || Boolean(working)} title={dirty ? "Save changes before previewing" : undefined} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-[12px] font-semibold text-slate-700 disabled:opacity-50">{working === "preview" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}Preview public</button>
            <button type="button" onClick={() => void publish()} disabled={!canEdit || dirty || blockers.length > 0 || Boolean(working)} title={dirty ? "Save changes before publishing" : blockers.length ? "Resolve blocking conflicts before publishing" : undefined} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-700 px-3 text-[12px] font-semibold text-white disabled:opacity-50">{working === "publish" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}Publish</button>
          </div>
        </div>

        {preview ? (
          <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50/50 p-4" aria-label="Public agenda preview">
            <p className="text-[11px] font-bold uppercase tracking-wide text-indigo-700">Safe public preview</p>
            <h4 className="mt-1 text-[17px] font-semibold text-slate-950">{preview.title}</h4>
            <p className="mt-1 text-[12px] text-slate-600">{preview.date} · {preview.startTime ?? "—"}–{preview.endTime ?? "—"}{preview.roomName ? ` · ${preview.roomName}` : ""}</p>
            {preview.description ? <p className="mt-2 text-[13px] text-slate-700">{preview.description}</p> : null}
            {preview.cues.length > 0 ? (
              <ol className="mt-3 space-y-2">
                {preview.cues.map((cue) => (
                  <li key={cue.id} className="rounded-lg border border-indigo-100 bg-white p-3">
                    <p className="text-[12px] font-semibold text-slate-900">{cue.startTime ?? "—"} · {cue.cue}</p>
                    {cue.description ? <p className="mt-1 text-[12px] text-slate-600">{cue.description}</p> : null}
                    {cue.talent ? <p className="mt-1 text-[11px] text-slate-500">{cue.talent}</p> : null}
                  </li>
                ))}
              </ol>
            ) : <p className="mt-3 text-[12px] text-slate-500">No cues are approved for public visibility.</p>}
          </div>
        ) : null}
      </section></> : null}
    </div>
  );
}
