import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  APPROVED_EVENT_STARTER_SIGNAL_NAMES,
  SIGNAL_SELECT_COLUMNS,
  buildEventScopedSignalCopyRows,
  type EventScopedSignalExistingRow,
  type EventScopedSignalSourceRow
} from "@/lib/signals/event-scoped-signal-copies";
import type { Database } from "@/types/database";
import { isEventArchivedForSignalMutations } from "@/lib/signals/signal-scope";

type SignalRow = Database["public"]["Tables"]["signals"]["Row"];

export type SignalEventContext = {
  eventId: string;
  companyId: string;
  status: string | null;
  endDate: string | null;
  containerKind: string | null;
  archived: boolean;
};

export type EventScopedSignalReconcileResult = {
  eventId: string;
  existingCount: number;
  insertedCount: number;
  totalCount: number;
};

export async function loadEventScopedSignalRows(eventId: string): Promise<SignalRow[]> {
  const supabase = createAdminClient();
  const { data, error } = await (supabase as any)
    .from("signals")
    .select(SIGNAL_SELECT_COLUMNS)
    .eq("event_id", eventId)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(error.message ?? "Failed loading event-scoped signals.");
  }

  return (data ?? []) as SignalRow[];
}

export async function loadSignalEventContext(eventId: string): Promise<SignalEventContext> {
  const supabase = createAdminClient();
  const { data, error } = await (supabase as any)
    .from("events")
    .select("id, company_id, status, end_date, container_kind")
    .eq("id", eventId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? "Failed loading event signal context.");
  }
  const row = data as
    | { id: string; company_id: string | null; status: string | null; end_date: string | null; container_kind: string | null }
    | null;
  if (!row?.id || !row.company_id) {
    throw new Error("Event signal context is missing a company owner.");
  }

  return {
    eventId: row.id,
    companyId: row.company_id,
    status: row.status ?? null,
    endDate: row.end_date ?? null,
    containerKind: row.container_kind ?? null,
    archived: isEventArchivedForSignalMutations({
      status: row.status,
      endDate: row.end_date,
      containerKind: row.container_kind
    })
  };
}

export async function loadSignalRowsForEventContext(input: {
  eventId: string;
  companyId: string;
  userId: string;
}): Promise<SignalRow[]> {
  const supabase = createAdminClient();
  const { data, error } = await (supabase as any)
    .from("signals")
    .select(SIGNAL_SELECT_COLUMNS)
    .or(`company_id.eq.${input.companyId},event_id.eq.${input.eventId}`)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(error.message ?? "Failed loading scoped signals.");
  }

  return ((data ?? []) as SignalRow[]).filter((row) => {
    if (row.signal_scope === "company") {
      return row.company_id === input.companyId && !row.event_id;
    }
    if (row.signal_scope === "event") {
      return row.company_id === input.companyId && row.event_id === input.eventId;
    }
    if (row.signal_scope === "private") {
      return (
        row.company_id === input.companyId &&
        row.event_id === input.eventId &&
        row.owner_user_id === input.userId
      );
    }
    return !row.signal_scope && row.event_id === input.eventId;
  });
}

export async function loadApprovedGlobalStarterSignalRows(): Promise<SignalRow[]> {
  const supabase = createAdminClient();
  const { data, error } = await (supabase as any)
    .from("signals")
    .select(SIGNAL_SELECT_COLUMNS)
    .is("event_id", null)
    .eq("signal_scope", "default")
    .in("name", [...APPROVED_EVENT_STARTER_SIGNAL_NAMES])
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(error.message ?? "Failed loading global starter signals.");
  }

  return (data ?? []) as SignalRow[];
}

export async function ensureEventScopedStarterSignals(input: {
  eventId: string;
  createdBy?: string | null;
}): Promise<EventScopedSignalReconcileResult> {
  const eventId = input.eventId.trim();
  if (!eventId) {
    throw new Error("eventId is required to reconcile event-scoped signals.");
  }

  const context = await loadSignalEventContext(eventId);
  const existing = await loadEventScopedSignalRows(eventId);
  const sources = await loadApprovedGlobalStarterSignalRows();
  const insertRows = buildEventScopedSignalCopyRows({
    eventId,
    companyId: context.companyId,
    sourceRows: sources as EventScopedSignalSourceRow[],
    existingRows: existing as EventScopedSignalExistingRow[],
    createdBy: input.createdBy ?? null
  });

  if (insertRows.length > 0) {
    const supabase = createAdminClient();
    const { error } = await (supabase as any)
      .from("signals")
      .insert(insertRows as never);

    if (error) {
      throw new Error(error.message ?? "Failed creating event-scoped signal copies.");
    }
  }

  return {
    eventId,
    existingCount: existing.length,
    insertedCount: insertRows.length,
    totalCount: existing.length + insertRows.length
  };
}

export async function loadEventSignalCopyForSource(input: {
  eventId: string;
  sourceSignalId: string;
}): Promise<SignalRow | null> {
  const supabase = createAdminClient();
  const { data, error } = await (supabase as any)
    .from("signals")
    .select(SIGNAL_SELECT_COLUMNS)
    .eq("event_id", input.eventId)
    .eq("source_signal_id", input.sourceSignalId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? "Failed loading event-scoped signal copy.");
  }

  return (data as SignalRow | null) ?? null;
}
