import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SessionUser } from "@/lib/auth/session";
import { Database } from "@/types/database";
import {
  SignalCategory,
  SignalMutationPayload,
  SignalRecord,
  SignalVisibility
} from "@/components/signals/signal-types";
import { assertEventIdAccessibleForUser } from "@/lib/server/company-event-access";
import {
  ensureEventScopedStarterSignals,
  loadSignalEventContext,
  loadSignalRowsForEventContext
} from "@/lib/server/signals/event-scoped-signal-copies";
import { SIGNAL_SELECT_COLUMNS } from "@/lib/signals/event-scoped-signal-copies";
import { buildSignalInsertPatch } from "@/lib/signals/signal-mutation-patches";
import { normalizeSignalScope, type SignalScope } from "@/lib/signals/signal-scope";
import {
  filterWorkflowSelectableSignalRowsForEvent,
  findIneligibleWorkflowSignalIdsForEvent
} from "@/lib/signals/workflow-selectable-signal-rows";

type SignalRow = Database["public"]["Tables"]["signals"]["Row"];
type DbSignalVisibility = SignalRow["visibility"];

type SignalQueryOptions = {
  search?: string;
  status?: "all" | "active" | "disabled";
  category?: "all" | SignalCategory;
  template?: string | null;
  patternModeOnly?: boolean;
  activeOnly?: boolean;
  includeDefaults?: boolean;
  eventId?: string | null;
};

function normalizeSignalCategory(value: string | null | undefined): SignalCategory {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (normalized === "ai-powered" || normalized === "ai powered" || normalized === "ai") {
    return "AI-Powered";
  }
  if (normalized === "contextual") {
    return "Contextual";
  }
  if (
    normalized === "call-to-action" ||
    normalized === "call to action" ||
    normalized === "cta"
  ) {
    return "Call-to-Action";
  }
  if (normalized === "custom") {
    return "Custom";
  }

  return "Custom";
}

function normalizeSignalVisibility(value: string | null | undefined): SignalVisibility {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "role") return "role";
  if (normalized === "template") return "template";
  return "global";
}

function toSignalRecord(row: SignalRow, options?: { eventArchived?: boolean }): SignalRecord {
  const effectivePrompt = row.admin_override_prompt?.trim() ? row.admin_override_prompt : row.default_prompt;
  const category = normalizeSignalCategory(row.category);
  const visibility = normalizeSignalVisibility(row.visibility);
  const signalScope = normalizeSignalScope(row.signal_scope, row.event_id ? "event" : "company");
  return {
    ...row,
    category,
    visibility,
    signal_scope: signalScope,
    company_id: row.company_id ?? null,
    owner_user_id: row.owner_user_id ?? null,
    created_by: row.created_by ?? "",
    effective_prompt: effectivePrompt,
    ai_generated: category === "AI-Powered",
    override_active: Boolean(row.admin_override_prompt?.trim()),
    is_readonly: Boolean(options?.eventArchived && (signalScope === "event" || signalScope === "private"))
  };
}

function applySignalFilters(rows: SignalRow[], options: SignalQueryOptions) {
  const search = options.search?.trim().toLowerCase();
  return rows.filter((row) => {
    if ((options.status === "active" || options.activeOnly) && !row.is_active) return false;
    if (options.status === "disabled" && row.is_active) return false;
    if (options.category && options.category !== "all" && normalizeSignalCategory(row.category) !== options.category) {
      return false;
    }
    if (options.patternModeOnly && !row.available_in_pattern_mode) return false;
    if (search) {
      const haystack = `${row.name} ${row.default_prompt} ${row.admin_override_prompt ?? ""}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
}

async function getEventScopedSignalRowsForUser(
  sessionUser: SessionUser,
  eventId: string,
  options: SignalQueryOptions
) {
  await assertEventIdAccessibleForUser(sessionUser.id, eventId);
  const context = await loadSignalEventContext(eventId);
  await ensureEventScopedStarterSignals({
    eventId,
    createdBy: sessionUser.id
  });

  const eventRows = await loadSignalRowsForEventContext({
    eventId,
    companyId: context.companyId,
    userId: sessionUser.id
  });
  const rows = filterWorkflowSelectableSignalRowsForEvent(eventRows, {
    companyId: context.companyId,
    eventId,
    userId: sessionUser.id,
    includeInactive: true
  });

  return applySignalFilters(rows, options).map((row) => ({ row, eventArchived: context.archived }));
}

export async function getManagedCompanyIds(sessionUser: SessionUser) {
  if (sessionUser.role !== "organizer_admin" && sessionUser.role !== "platform_admin") {
    return sessionUser.company_id ? [sessionUser.company_id] : [];
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = (await supabase
    .from("companies")
    .select("id")
    .eq("organizer_id", sessionUser.id)) as {
    data: { id: string }[] | null;
    error: { message: string; code?: string } | null;
  };

  if (error) {
    throw new Error(`${error.message} (${error.code ?? "no_code"})`);
  }

  return (data ?? []).map((company) => company.id);
}

export async function getSignalRowsForUser(
  sessionUser: SessionUser,
  options: SignalQueryOptions = {}
) {
  const eventId = options.eventId?.trim();
  if (eventId) {
    return getEventScopedSignalRowsForUser(sessionUser, eventId, options);
  }

  const supabase = createAdminClient();

  function baseQuery() {
    return supabase
      .from("signals")
      .select(SIGNAL_SELECT_COLUMNS)
      .order("updated_at", { ascending: false });
  }

  function applyQueryFilters(query: any) {
    let nextQuery = query;

    if (options.status === "active" || options.activeOnly) {
      nextQuery = nextQuery.eq("is_active", true);
    } else if (options.status === "disabled") {
      nextQuery = nextQuery.eq("is_active", false);
    }

    if (options.category && options.category !== "all") {
      nextQuery = nextQuery.eq("category", options.category);
    }

    if (options.patternModeOnly) {
      nextQuery = nextQuery.eq("available_in_pattern_mode", true);
    }

    const search = options.search?.trim();
    if (search) {
      const escaped = search.replace(/,/g, " ");
      nextQuery = nextQuery.or(
        `name.ilike.%${escaped}%,default_prompt.ilike.%${escaped}%,admin_override_prompt.ilike.%${escaped}%`
      );
    }

    return nextQuery;
  }

  if (sessionUser.role === "platform_admin") {
    const { data, error } = (await applyQueryFilters(baseQuery().eq("signal_scope", "default"))) as {
      data: SignalRow[] | null;
      error: { message: string; code?: string } | null;
    };

    if (error) {
      throw new Error(`${error.message} (${error.code ?? "no_code"})`);
    }

    return data ?? [];
  }

  if (!sessionUser.company_id) {
    return [];
  }

  const companyQuery = applyQueryFilters(
    baseQuery()
      .eq("signal_scope", "company")
      .eq("company_id", sessionUser.company_id)
      .is("event_id", null)
  );

  if (!options.includeDefaults) {
    const { data, error } = (await companyQuery) as {
      data: SignalRow[] | null;
      error: { message: string; code?: string } | null;
    };

    if (error) {
      throw new Error(`${error.message} (${error.code ?? "no_code"})`);
    }

    return data ?? [];
  }

  const defaultQuery = applyQueryFilters(
    baseQuery()
      .is("event_id", null)
      .eq("signal_scope", "default")
  );

  const [companyResponse, defaultResponse] = (await Promise.all([companyQuery, defaultQuery])) as Array<{
    data: SignalRow[] | null;
    error: { message: string; code?: string } | null;
  }>;

  if (companyResponse.error) {
    throw new Error(`${companyResponse.error.message} (${companyResponse.error.code ?? "no_code"})`);
  }
  if (defaultResponse.error) {
    throw new Error(`${defaultResponse.error.message} (${defaultResponse.error.code ?? "no_code"})`);
  }

  const byId = new Map<string, SignalRow>();
  for (const row of [...(defaultResponse.data ?? []), ...(companyResponse.data ?? [])]) {
    byId.set(row.id, row);
  }

  return [...byId.values()].sort((a, b) => String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? "")));
}

export async function getSignalsForUser(
  sessionUser: SessionUser,
  options: SignalQueryOptions = {}
) {
  const rows = await getSignalRowsForUser(sessionUser, options);
  return rows.map((item) => {
    if ("row" in item) {
      return toSignalRecord(item.row, { eventArchived: item.eventArchived });
    }
    return toSignalRecord(item);
  });
}

export async function getWorkflowSelectableSignalsForEvent(
  sessionUser: SessionUser,
  options: { eventId: string }
) {
  const eventId = String(options.eventId ?? "").trim();
  if (!eventId) {
    throw new Error("eventId is required for workflow-selectable Campaign Agents.");
  }

  await assertEventIdAccessibleForUser(sessionUser.id, eventId);
  const context = await loadSignalEventContext(eventId);
  await ensureEventScopedStarterSignals({
    eventId,
    createdBy: sessionUser.id
  });

  const rows = await loadSignalRowsForEventContext({
    eventId,
    companyId: context.companyId,
    userId: sessionUser.id
  });

  return filterWorkflowSelectableSignalRowsForEvent(rows, {
    companyId: context.companyId,
    eventId,
    userId: sessionUser.id
  })
    .map((row) => toSignalRecord(row, { eventArchived: context.archived }));
}

export async function validateWorkflowSignalIdsForEvent(
  sessionUser: SessionUser,
  options: { eventId: string; signalIds: readonly string[] }
): Promise<{ ok: true } | { ok: false; missingSignalIds: string[] }> {
  const eventId = String(options.eventId ?? "").trim();
  const signalIds = [...new Set(options.signalIds.map((id) => String(id ?? "").trim()).filter(Boolean))];
  if (signalIds.length === 0) return { ok: true };
  if (!eventId) return { ok: false, missingSignalIds: signalIds };

  await assertEventIdAccessibleForUser(sessionUser.id, eventId);
  const context = await loadSignalEventContext(eventId);
  const supabase = createAdminClient();
  const { data, error } = (await supabase
    .from("signals")
    .select(SIGNAL_SELECT_COLUMNS)
    .in("id", signalIds)) as {
    data: SignalRow[] | null;
    error: { message: string; code?: string } | null;
  };

  if (error) {
    throw new Error(`${error.message} (${error.code ?? "no_code"})`);
  }

  const ineligible = findIneligibleWorkflowSignalIdsForEvent(data ?? [], signalIds, {
    companyId: context.companyId,
    eventId,
    userId: sessionUser.id
  });
  return ineligible.length === 0 ? { ok: true } : { ok: false, missingSignalIds: ineligible };
}

export function validateSignalCreation(sessionUser: SessionUser, payload: SignalMutationPayload) {
  // TODO: reintroduce RBAC validation for signal creation.
  void sessionUser;
  void payload;
}

export async function canManageSignal(
  sessionUser: SessionUser,
  signal: Pick<SignalRow, "created_by" | "visibility">
) {
  // TODO: reintroduce RBAC authorization checks for signal updates/deletes.
  void sessionUser;
  void signal;
  return true;
}

export function sanitizeSignalMutationPayload(
  payload: Partial<SignalMutationPayload>,
  role: SessionUser["role"]
) {
  const nextPayload: Partial<SignalMutationPayload> = {};
  if (payload.name !== undefined) nextPayload.name = payload.name.trim();
  if (payload.category !== undefined) nextPayload.category = payload.category;
  if (payload.default_prompt !== undefined) nextPayload.default_prompt = payload.default_prompt;
  if (payload.admin_override_prompt !== undefined) nextPayload.admin_override_prompt = payload.admin_override_prompt;
  if (payload.visibility !== undefined) {
    nextPayload.visibility = payload.visibility;
  }
  if (payload.signal_scope !== undefined) {
    nextPayload.signal_scope = normalizeSignalScope(payload.signal_scope);
  }
  if (payload.role_scope !== undefined) {
    nextPayload.role_scope = payload.role_scope;
  }
  if (payload.template_scope !== undefined) nextPayload.template_scope = payload.template_scope;
  if (payload.is_active !== undefined) nextPayload.is_active = payload.is_active;
  if (payload.available_in_pattern_mode !== undefined) {
    nextPayload.available_in_pattern_mode = payload.available_in_pattern_mode;
  }
  if (payload.tones !== undefined) {
    nextPayload.tones = payload.tones;
  }

  return nextPayload;
}

export function applySignalBusinessRules(
  sessionUser: SessionUser,
  payload: Partial<SignalMutationPayload>,
  existing?: Pick<SignalRow, "visibility">
) {
  // TODO: reintroduce RBAC business rules for signal mutations.
  void sessionUser;
  void payload;
  void existing;
}

export function toSignalInsertPatch(
  payload: SignalMutationPayload,
  createdBy: string,
  options?: { eventId?: string | null; companyId?: string | null; ownerUserId?: string | null }
): Database["public"]["Tables"]["signals"]["Insert"] {
  return buildSignalInsertPatch(payload, createdBy, options);
}

export function toSignalUpdatePatch(
  payload: Partial<SignalMutationPayload>
): Database["public"]["Tables"]["signals"]["Update"] {
  const patch: Database["public"]["Tables"]["signals"]["Update"] = {};
  if (payload.name !== undefined) patch.name = payload.name.trim();
  if (payload.category !== undefined) patch.category = payload.category;
  if (payload.default_prompt !== undefined) patch.default_prompt = payload.default_prompt;
  if (payload.admin_override_prompt !== undefined) patch.admin_override_prompt = payload.admin_override_prompt ?? null;
  if (payload.visibility !== undefined) patch.visibility = payload.visibility as DbSignalVisibility;
  if (payload.signal_scope !== undefined) {
    patch.signal_scope = normalizeSignalScope(payload.signal_scope) as SignalScope;
  }
  if (payload.role_scope !== undefined) patch.role_scope = payload.role_scope ?? null;
  if (payload.template_scope !== undefined) patch.template_scope = payload.template_scope ?? null;
  if (payload.is_active !== undefined) patch.is_active = payload.is_active;
  if (payload.available_in_pattern_mode !== undefined) {
    patch.available_in_pattern_mode = payload.available_in_pattern_mode;
  }
  if (payload.tones !== undefined) {
    patch.tones = payload.tones.length > 0 ? payload.tones : ["Professional"];
  }
  patch.updated_at = new Date().toISOString();
  return patch;
}

export function mapSignalRow(row: SignalRow, options?: { eventArchived?: boolean }) {
  return toSignalRecord(row, options);
}
