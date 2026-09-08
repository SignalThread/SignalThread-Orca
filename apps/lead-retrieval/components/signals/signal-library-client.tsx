"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CATEGORY_VISUALS, CategoryBadge, CategoryIcon } from "@/components/signals/category-badge";
import { PageHeader, PageShell } from "@/components/layout/page-header";
import { requestSaveSignal } from "@/components/signals/signal-client-api";
import { SIGNAL_CATEGORIES, SignalMutationPayload, SignalRecord } from "@/components/signals/signal-types";
import { UnderstandingCategories } from "@/components/signals/understanding-categories";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isAiSummarySignalName } from "@/lib/campaigns/ai-summary-signal";
import { normalizeSignalScope, signalScopeLabel } from "@/lib/signals/signal-scope";

type SignalLibraryClientProps = {
  role: string;
  userId: string;
  /** e.g. `/exhibitor/signals` or `/admin/signals` — create/edit routes are under this path */
  libraryBasePath: string;
  eventId?: string | null;
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString();
}

function scopeBadge(signal: SignalRecord) {
  const scope = normalizeSignalScope(signal.signal_scope, signal.event_id ? "event" : "company");
  const styles = {
    default: "border-slate-200 bg-slate-50 text-slate-600",
    company: "border-sky-200 bg-sky-50 text-sky-700",
    event: "border-violet-200 bg-violet-50 text-violet-700",
    private: "border-amber-200 bg-amber-50 text-amber-700"
  }[scope];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold leading-5 ${styles}`}
    >
      {signalScopeLabel(scope)}
    </span>
  );
}

function statusBadge(signal: SignalRecord) {
  return signal.is_active ? (
    <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-700">Active</span>
  ) : (
    <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-600">Disabled</span>
  );
}

function systemDefaultBadge() {
  return (
    <span
      className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600"
      title="Built-in starting Campaign Agent for campaigns"
    >
      Default
    </span>
  );
}

function isSystemDefaultSignal(signal: Pick<SignalRecord, "signal_scope" | "event_id">) {
  return normalizeSignalScope(signal.signal_scope, signal.event_id ? "event" : "company") === "default";
}

function isDefaultDerivedSignal(
  signal: Pick<SignalRecord, "signal_scope" | "event_id" | "source_signal_id">
) {
  return isSystemDefaultSignal(signal) || Boolean(signal.source_signal_id);
}

const VIEW_STORAGE_KEY = "leadintel.signal-library.view";
const CATEGORY_HELP_STORAGE_KEY = "leadintel.signal-library.category-help-expanded";

function canEditSignal(signal: SignalRecord, role: string | null | undefined, userId: string) {
  return Boolean(
    signal &&
      userId &&
      !signal.is_readonly &&
      normalizeSignalScope(signal.signal_scope, signal.event_id ? "event" : "company") !== "default" &&
      resolveCanManageSignals(role ?? undefined, userId)
  );
}

function resolveCanManageSignals(role: string | undefined, userId: string) {
  if (!userId) return false;
  const normalized = String(role ?? "").trim().toLowerCase();
  return (
    normalized === "platform_admin" ||
    normalized === "organizer_admin" ||
    normalized === "event_organizer" ||
    normalized === "exhibitor_admin"
  );
}

function appendEventId(path: string, eventId?: string | null) {
  const id = eventId?.trim();
  if (!id) return path;
  return `${path}${path.includes("?") ? "&" : "?"}eventId=${encodeURIComponent(id)}`;
}

export function SignalLibraryClient({ role, userId, libraryBasePath, eventId }: SignalLibraryClientProps) {
  const router = useRouter();
  const [userRole, setUserRole] = useState<string | null>(role ?? null);
  const [loadingPermissions, setLoadingPermissions] = useState(true);
  const [signals, setSignals] = useState<SignalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "disabled">("all");
  const [categoryFilter, setCategoryFilter] = useState<"all" | (typeof SIGNAL_CATEGORIES)[number]>("all");
  const [view, setView] = useState<"card" | "table">("table");
  const [categoryHelpExpanded, setCategoryHelpExpanded] = useState(true);
  const [busySignalId, setBusySignalId] = useState<string | null>(null);
  const canManageSignals = resolveCanManageSignals(userRole ?? role, userId);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      const user = { role: userRole ?? role ?? null };
      console.log("Signal role check:", user.role);
      console.log("SIGNAL_LIBRARY_MANAGE_STATE", {
        role,
        userRole,
        userId,
        canManageSignals,
        loading,
        loadingPermissions
      });
    }
  }, [canManageSignals, loading, loadingPermissions, role, userRole, userId]);

  useEffect(() => {
    let active = true;

    async function resolveUserRole() {
      setLoadingPermissions(true);
      try {
        const supabase = createSupabaseBrowserClient();
        const {
          data: { user }
        } = await supabase.auth.getUser();

        if (!active) return;

        if (!user) {
          setUserRole(role ?? null);
          return;
        }

        const { data } = await supabase
          .from("users")
          .select("role")
          .eq("id", user.id)
          .maybeSingle<{ role: string | null }>();

        if (!active) return;

        setUserRole(data?.role ?? role ?? null);
      } catch {
        if (!active) return;
        setUserRole(role ?? null);
      } finally {
        if (active) {
          setLoadingPermissions(false);
        }
      }
    }

    void resolveUserRole();

    return () => {
      active = false;
    };
  }, [role]);

  const filteredSignals = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return signals.filter((signal) => {
      if (statusFilter === "active" && !signal.is_active) return false;
      if (statusFilter === "disabled" && signal.is_active) return false;
      if (categoryFilter !== "all" && signal.category !== categoryFilter) return false;
      if (
        normalizedSearch &&
        !`${signal.name} ${signal.category} ${signal.default_prompt} ${signal.admin_override_prompt ?? ""}`
          .toLowerCase()
          .includes(normalizedSearch)
      ) {
        return false;
      }
      return true;
    });
  }, [categoryFilter, search, signals, statusFilter]);

  /** Conversation Brief / system voice summary signal always first; remaining order unchanged. */
  const signalsOrderedForLibrary = useMemo(() => {
    const system = filteredSignals.filter((s) => isAiSummarySignalName(s.name));
    const rest = filteredSignals.filter((s) => !isAiSummarySignalName(s.name));
    return [...system, ...rest];
  }, [filteredSignals]);

  async function loadSignals() {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams();
      if (eventId?.trim()) query.set("eventId", eventId.trim());
      const endpoint = query.toString() ? `/api/signals?${query.toString()}` : "/api/signals";
      const response = await fetch(endpoint, { cache: "no-store" });
      const payload = (await response.json()) as { signals?: SignalRecord[]; error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to load Campaign Agents");
      }
      setSignals(payload.signals ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load Campaign Agents");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSignals();
  }, [eventId]);

  useEffect(() => {
    try {
      const persisted = window.localStorage.getItem(VIEW_STORAGE_KEY);
      if (persisted === "card" || persisted === "table") {
        setView(persisted);
      }
    } catch {
      // Ignore localStorage errors.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, view);
    } catch {
      // Ignore localStorage errors.
    }
  }, [view]);

  useEffect(() => {
    try {
      const persisted = window.localStorage.getItem(CATEGORY_HELP_STORAGE_KEY);
      if (persisted === "true") setCategoryHelpExpanded(true);
      if (persisted === "false") setCategoryHelpExpanded(false);
    } catch {
      // Ignore localStorage errors.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(CATEGORY_HELP_STORAGE_KEY, String(categoryHelpExpanded));
    } catch {
      // Ignore localStorage errors.
    }
  }, [categoryHelpExpanded]);

  async function saveSignal(payload: SignalMutationPayload, signalId?: string) {
    const saved = await requestSaveSignal(payload, signalId, { eventId });
    await loadSignals();
    return saved;
  }

  async function duplicateSignal(signal: SignalRecord) {
    if (normalizeSignalScope(signal.signal_scope, signal.event_id ? "event" : "company") === "default") {
      return;
    }
    setBusySignalId(signal.id);
    setError(null);
    try {
      await saveSignal({
        name: `${signal.name} Copy`,
        category: signal.category,
        default_prompt: signal.default_prompt,
        admin_override_prompt: signal.admin_override_prompt,
        visibility: signal.visibility,
        signal_scope: signal.signal_scope,
        role_scope: signal.role_scope,
        template_scope: signal.template_scope,
        is_active: signal.is_active,
        available_in_pattern_mode: signal.available_in_pattern_mode
      });
    } catch (duplicateError) {
      setError(duplicateError instanceof Error ? duplicateError.message : "Failed to duplicate Campaign Agent");
    } finally {
      setBusySignalId(null);
    }
  }

  async function deleteSignal(signal: SignalRecord) {
    if (normalizeSignalScope(signal.signal_scope, signal.event_id ? "event" : "company") === "default") {
      setError("Default starter templates cannot be deleted.");
      return;
    }
    setBusySignalId(signal.id);
    setError(null);
    try {
      const response = await fetch(appendEventId(`/api/signals/${encodeURIComponent(signal.id)}`, eventId), {
        method: "DELETE"
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to delete Campaign Agent");
      }
      await loadSignals();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete Campaign Agent");
    } finally {
      setBusySignalId(null);
    }
  }

  function goToEdit(signal: SignalRecord) {
    router.push(appendEventId(`${libraryBasePath}/${encodeURIComponent(signal.id)}/edit`, eventId));
  }

  return (
    <PageShell>
      <PageHeader
        title="Campaign Agents"
        subtitle="Manage reusable email-writing agents that help shape campaign drafts, follow-up messaging, and audience-specific outreach."
      />

      <UnderstandingCategories
        expanded={categoryHelpExpanded}
        onToggle={() => setCategoryHelpExpanded((current) => !current)}
      />

      <div className="rounded-2xl border bg-white p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_170px_190px_auto]">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search Campaign Agents..."
            className="w-full rounded-xl border px-4 py-3"
          />
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as "all" | "active" | "disabled")}
            className="rounded-xl border px-4 py-3"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="disabled">Disabled</option>
          </select>
          <select
            value={categoryFilter}
            onChange={(event) =>
              setCategoryFilter(event.target.value as "all" | (typeof SIGNAL_CATEGORIES)[number])
            }
            className="rounded-xl border px-4 py-3"
          >
            <option value="all">All Categories</option>
            {SIGNAL_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
          <div className="flex items-center justify-end gap-2">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setView("card")}
                className={`rounded-xl border px-3 py-2 text-sm font-semibold ${view === "card" ? "border-accent bg-violet-50 text-accent" : "text-slate-600"}`}
              >
                Card View
              </button>
              <button
                type="button"
                onClick={() => setView("table")}
                className={`rounded-xl border px-3 py-2 text-sm font-semibold ${view === "table" ? "border-accent bg-violet-50 text-accent" : "text-slate-600"}`}
              >
                Table View
              </button>
            </div>
            <Link
              href={appendEventId(`${libraryBasePath}/new`, eventId)}
              aria-disabled={!canManageSignals || loadingPermissions}
              className={`inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:from-indigo-600 hover:to-violet-700 ${
                !canManageSignals || loadingPermissions ? "pointer-events-none opacity-60" : ""
              }`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              Create Campaign Agent
            </Link>
          </div>
        </div>
      </div>

      {loadingPermissions ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          Loading permissions...
        </div>
      ) : null}

      {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}

      {loading ? (
        <div className="rounded-xl border bg-white p-5 text-sm text-slate-600">Loading Campaign Agents...</div>
      ) : view === "card" ? (
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {signalsOrderedForLibrary.map((signal) => {
            const editable = canEditSignal(signal, userRole ?? role, userId);
            const isDefaultDerived = isDefaultDerivedSignal(signal);
            const visual = CATEGORY_VISUALS[signal.category];
            return (
            <article key={signal.id} className="rounded-2xl border bg-white">
              <div className="space-y-3 p-5">
                <div className="flex items-start justify-between gap-3">
                  <CategoryIcon category={signal.category} />
                  {statusBadge(signal)}
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900">{signal.name}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    {isDefaultDerived ? systemDefaultBadge() : null}
                    <CategoryBadge category={signal.category} compact />
                    {scopeBadge(signal)}
                    {signal.is_readonly ? (
                      <span className="rounded bg-slate-100 px-2 py-1 font-semibold text-slate-600">Read-only</span>
                    ) : null}
                    {signal.ai_generated ? (
                      <span className="rounded bg-violet-100 px-2 py-1 font-semibold text-violet-700">AI Generated</span>
                    ) : null}
                    {signal.override_active ? (
                      <span className="rounded bg-amber-100 px-2 py-1 font-semibold text-amber-700">Override Active</span>
                    ) : null}
                  </div>
                </div>
                <div className="space-y-1 text-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Default Prompt</p>
                  <p className="line-clamp-3 text-slate-700">{signal.default_prompt}</p>
                </div>
                <div className={`rounded-xl border p-3 text-sm text-slate-700 ${visual.cardWrap}`}>{signal.effective_prompt.slice(0, 140)}</div>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>{formatDate(signal.updated_at)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!editable}
                    onClick={() => goToEdit(signal)}
                    className="flex-1 rounded-xl border bg-slate-100 px-3 py-2 text-sm font-semibold"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={busySignalId === signal.id || !editable}
                    onClick={() => void duplicateSignal(signal)}
                    className="rounded-xl border px-3 py-2 text-sm"
                  >
                    Duplicate
                  </button>
                  {isDefaultDerived ? (
                    <span
                      className="inline-flex min-w-[5.5rem] items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500"
                      aria-label="Built-in default Campaign Agent — cannot be deleted"
                    >
                      Default
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={busySignalId === signal.id || !editable}
                      onClick={() => void deleteSignal(signal)}
                      className="rounded-xl border border-rose-200 px-3 py-2 text-sm text-rose-600"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </article>
            );
          })}
        </div>
      ) : (
        <div className="w-full overflow-hidden rounded-2xl border bg-white">
          <table className="w-full table-fixed text-left">
            <thead className="bg-slate-50 text-sm uppercase tracking-wide text-slate-500">
              <tr>
                <th className="w-[34%] px-3 py-3 sm:px-4">Agent Name</th>
                <th className="w-[25%] px-3 py-3 sm:px-4">Category</th>
                <th className="w-[16%] px-3 py-3 sm:px-4">Status</th>
                <th className="hidden w-[12%] px-3 py-3 md:table-cell sm:px-4">Scope</th>
                <th className="hidden w-[13%] px-3 py-3 xl:table-cell sm:px-4">Last Updated</th>
                <th className="w-[28%] px-3 py-3 text-right sm:px-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {signalsOrderedForLibrary.map((signal) => {
                const editable = canEditSignal(signal, userRole ?? role, userId);
                const isDefaultDerived = isDefaultDerivedSignal(signal);
                const canManageSignalActions = canManageSignals;
                const isActionLoading = loading || loadingPermissions || busySignalId === signal.id;
                return (
                <tr
                  key={signal.id}
                  onClick={() => {
                    if (canManageSignalActions && editable) {
                      goToEdit(signal);
                    }
                  }}
                  className={`border-t ${editable ? "cursor-pointer hover:bg-slate-50" : ""}`}
                >
                  <td className="px-3 py-3 sm:px-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-semibold text-slate-900" title={signal.name}>
                        {signal.name}
                      </p>
                      {isDefaultDerived ? systemDefaultBadge() : null}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-slate-700 sm:px-4">
                    <CategoryBadge category={signal.category} />
                  </td>
                  <td className="px-3 py-3 sm:px-4">{statusBadge(signal)}</td>
                  <td className="hidden px-3 py-3 md:table-cell sm:px-4">{scopeBadge(signal)}</td>
                  <td className="hidden px-3 py-3 text-slate-700 xl:table-cell sm:px-4">{formatDate(signal.updated_at)}</td>
                  <td className="px-3 py-3 sm:px-4">
                    <div className="flex flex-wrap items-center justify-end gap-2" onClick={(event) => event.stopPropagation()}>
                      <button
                        type="button"
                        disabled={isActionLoading || !canManageSignalActions}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (!canManageSignalActions) return;
                          if (process.env.NODE_ENV !== "production") {
                            console.log("SIGNAL_TABLE_EDIT_CLICK", { signalId: signal.id });
                          }
                          goToEdit(signal);
                        }}
                        className="pointer-events-auto rounded border px-2 py-1 text-xs"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={isActionLoading || !canManageSignalActions}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (!canManageSignalActions) return;
                          if (process.env.NODE_ENV !== "production") {
                            console.log("SIGNAL_TABLE_DUPLICATE_CLICK", { signalId: signal.id });
                          }
                          void duplicateSignal(signal);
                        }}
                        className="pointer-events-auto rounded border px-2 py-1 text-xs"
                      >
                        Duplicate
                      </button>
                      {isDefaultDerived ? (
                        <span
                          className="pointer-events-none inline-flex rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500"
                          aria-label="Built-in default Campaign Agent — cannot be deleted"
                        >
                          Default
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={isActionLoading || !canManageSignalActions}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (!canManageSignalActions) return;
                            if (process.env.NODE_ENV !== "production") {
                              console.log("SIGNAL_TABLE_DELETE_CLICK", { signalId: signal.id });
                            }
                            void deleteSignal(signal);
                          }}
                          className="pointer-events-auto rounded border border-rose-200 px-2 py-1 text-xs text-rose-600"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

    </PageShell>
  );
}
