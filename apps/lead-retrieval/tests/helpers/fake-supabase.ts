/**
 * Minimal in-memory supabase shim for workflow-runner tests. Mirrors the call surface
 * the runner / approval core / draft persistence helpers actually use:
 *
 *   from(table).select(cols).eq().[eq()|lt()|lte()|in()].maybeSingle()
 *   from(table).select(cols).eq().[eq()|lt()|lte()|in()]              (awaited, returns rows)
 *   from(table).update(patch).eq().[eq()]                              (awaited)
 *   from(table).delete().eq().[eq()]                                    (awaited)
 *   from(table).insert(payload).select(cols)                          (awaited, returns rows)
 *   from(table).insert(payload)                                        (awaited)
 *
 * Order/limit are accepted and applied for tests that verify bounded scans.
 *
 * The exposed object intentionally matches `ReturnType<typeof createAdminClient>`
 * strictly enough that callers can cast through `unknown` and reuse it from production
 * helpers.
 */

export type FakeRow = Record<string, unknown>;
type Filter = {
  kind: "eq" | "neq" | "lt" | "lte" | "gt" | "gte" | "in" | "is" | "not";
  col: string;
  val: unknown;
  op?: string;
};

export type FakeSupabaseCall = {
  table: string;
  op: string;
  select?: string;
  patch?: FakeRow;
  filters: Filter[];
  range?: { from: number; to: number };
};

export type FakeSupabaseError = { message: string; code?: string };
export type FakeSupabaseOptions = {
  /** One-shot insert errors by table. Each insert consumes one error from the table queue. */
  insertErrors?: Record<string, FakeSupabaseError[]>;
};

export const KNOWN_WORKFLOW_TABLE_COLUMNS: Record<string, readonly string[]> = {
  workflow_templates: [
    "id",
    "company_id",
    "name",
    "description",
    "trigger_event",
    "scope",
    "event_id",
    "is_enabled",
    "version",
    "created_by",
    "created_at",
    "updated_at",
    "trigger_conditions_jsonb"
  ],
  workflow_steps: [
    "id",
    "template_id",
    "step_index",
    "step_type",
    "step_key",
    "params_jsonb",
    "requires_approval",
    "created_at",
    "updated_at"
  ],
  workflow_runs: [
    "id",
    "company_id",
    "template_id",
    "template_version",
    "lead_id",
    "event_id",
    "trigger_event",
    "trigger_payload_jsonb",
    "trigger_fingerprint",
    "status",
    "current_step_index",
    "started_at",
    "completed_at",
    "created_at",
    "updated_at"
  ],
  workflow_step_runs: [
    "id",
    "run_id",
    "step_id",
    "step_index",
    "step_key",
    "status",
    "attempt_count",
    "attempt_id",
    "scheduled_at",
    "started_at",
    "completed_at",
    "input_jsonb",
    "output_jsonb",
    "error_text",
    "error_code",
    "waiting_reason",
    "required_conversation_version",
    "current_transcript_version",
    "current_insights_version",
    "wait_started_at",
    "wait_expires_at",
    "created_at",
    "updated_at"
  ],
  lead_conversation_readiness: [
    "lead_id",
    "latest_conversation_version",
    "latest_audio_finalized_at",
    "transcript_status",
    "transcript_version",
    "transcript_ready_at",
    "insights_status",
    "insights_version",
    "insights_ready_at",
    "created_at",
    "updated_at"
  ],
  lead_conversations: [
    "id",
    "lead_id",
    "storage_path",
    "content_type",
    "conversation_version",
    "transcription_status",
    "transcription_error",
    "transcribed_at",
    "transcript",
    "synthesis_status",
    "synthesis_error",
    "synthesized_at",
    "summary",
    "created_at"
  ],
  workflow_trigger_decisions: [
    "id",
    "company_id",
    "lead_id",
    "event_id",
    "template_id",
    "trigger_event",
    "source",
    "status",
    "reason",
    "trigger_fingerprint",
    "details_jsonb",
    "created_at"
  ],
  generated_drafts: [
    "id",
    "company_id",
    "lead_id",
    "event_id",
    "run_id",
    "step_run_id",
    "kind",
    "content_jsonb",
    "approval_status",
    "reviewed_by",
    "reviewed_at",
    "promoted_to_id",
    "created_at",
    "updated_at"
  ]
};

function schemaError(table: string, col: string): FakeSupabaseError {
  return {
    message: `Could not find the '${col}' column of '${table}' in the schema cache`,
    code: "PGRST204"
  };
}

function validateKnownColumn(table: string, col: string): FakeSupabaseError | null {
  const known = KNOWN_WORKFLOW_TABLE_COLUMNS[table];
  if (!known) return null;
  return known.includes(col) ? null : schemaError(table, col);
}

function topLevelSelectParts(cols: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;

  for (const ch of cols) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }

  if (current.trim()) parts.push(current.trim());
  return parts;
}

function validateSelectColumns(table: string, cols: string): FakeSupabaseError | null {
  const known = KNOWN_WORKFLOW_TABLE_COLUMNS[table];
  if (!known) return null;
  for (const part of topLevelSelectParts(cols)) {
    if (!part || part === "*" || part.includes("(")) continue;
    const directCol = part.split(":").pop()?.trim();
    if (!directCol || directCol === "*") continue;
    const err = validateKnownColumn(table, directCol);
    if (err) return err;
  }
  return null;
}

function validateRowColumns(table: string, row: FakeRow): FakeSupabaseError | null {
  for (const col of Object.keys(row)) {
    const err = validateKnownColumn(table, col);
    if (err) return err;
  }
  return null;
}

function validateRowsColumns(table: string, rows: FakeRow | FakeRow[]): FakeSupabaseError | null {
  const rowsToValidate = Array.isArray(rows) ? rows : [rows];
  for (const row of rowsToValidate) {
    const err = validateRowColumns(table, row);
    if (err) return err;
  }
  return null;
}

function isActiveWorkflowRun(row: FakeRow) {
  const status = String(row.status ?? "");
  return status !== "failed" && status !== "cancelled";
}

function workflowRunDuplicateError(rows: FakeRow[], row: FakeRow): FakeSupabaseError | null {
  if (!isActiveWorkflowRun(row)) return null;
  const fingerprint = String(row.trigger_fingerprint ?? "default");
  const duplicate = rows.some((existing) => {
    if (!isActiveWorkflowRun(existing)) return false;
    return (
      existing.template_id === row.template_id &&
      existing.lead_id === row.lead_id &&
      existing.trigger_event === row.trigger_event &&
      String(existing.trigger_fingerprint ?? "default") === fingerprint
    );
  });
  return duplicate ? { message: "duplicate active workflow run", code: "23505" } : null;
}

function applyFilter(rows: FakeRow[], filter: Filter): FakeRow[] {
  return rows.filter((row) => {
    const value = row[filter.col];
    if (filter.kind === "eq") return value === filter.val;
    if (filter.kind === "neq") return value !== filter.val;
    if (filter.kind === "lt") return typeof value === "number" && value < (filter.val as number);
    if (filter.kind === "gt") {
      if (typeof value === "number") return value > (filter.val as number);
      return String(value) > String(filter.val);
    }
    if (filter.kind === "lte") {
      if (typeof value === "number") return value <= (filter.val as number);
      return String(value) <= String(filter.val);
    }
    if (filter.kind === "gte") {
      if (typeof value === "number") return value >= (filter.val as number);
      return String(value) >= String(filter.val);
    }
    if (filter.kind === "in") return (filter.val as unknown[]).includes(value);
    if (filter.kind === "is") {
      if (filter.val === null) return value === null || value === undefined;
      return value === filter.val;
    }
    if (filter.kind === "not") {
      if (filter.op === "is" && filter.val === null) return value !== null && value !== undefined;
      return value !== filter.val;
    }
    return true;
  });
}

function applyOrderAndLimit(
  rows: FakeRow[],
  orderBy: { col: string; ascending: boolean } | null,
  limitCount: number | null,
  rangeBounds: { from: number; to: number } | null = null
): FakeRow[] {
  let next = [...rows];
  if (orderBy) {
    next = next.sort((a, b) => {
      const av = a[orderBy.col];
      const bv = b[orderBy.col];
      const cmp = String(av ?? "").localeCompare(String(bv ?? ""));
      return orderBy.ascending ? cmp : -cmp;
    });
  }
  if (limitCount !== null) {
    next = next.slice(0, limitCount);
  }
  if (rangeBounds !== null) {
    next = next.slice(rangeBounds.from, rangeBounds.to + 1);
  }
  return next;
}

export function createFakeSupabase(initial: Record<string, FakeRow[]>, options: FakeSupabaseOptions = {}) {
  const tables: Record<string, FakeRow[]> = {};
  for (const [name, rows] of Object.entries(initial)) {
    tables[name] = rows.map((r) => ({ ...r }));
  }
  const calls: FakeSupabaseCall[] = [];
  const insertErrors: Record<string, FakeSupabaseError[]> = {};
  for (const [table, errors] of Object.entries(options.insertErrors ?? {})) {
    insertErrors[table] = [...errors];
  }

  function takeInsertError(tableName: string): FakeSupabaseError | null {
    const queue = insertErrors[tableName];
    if (!queue || queue.length === 0) return null;
    return queue.shift() ?? null;
  }

  function builder(tableName: string) {
    const filters: Filter[] = [];
    let updatePatch: FakeRow | null = null;
    let insertPayload: FakeRow | FakeRow[] | null = null;
    let mode: "select" | "update" | "insert" | "delete" | "upsert" | null = null;
    let upsertPayload: FakeRow | FakeRow[] | null = null;
    let upsertConflictColumn: string | null = null;
    let selectCols: string | null = null;
    let selectColsForInsertReturn: string | null = null;
    let orderBy: { col: string; ascending: boolean } | null = null;
    let limitCount: number | null = null;
    let rangeBounds: { from: number; to: number } | null = null;
    let pendingSchemaError: FakeSupabaseError | null = null;

    const obj: Record<string, unknown> = {};

    obj.select = (cols: string) => {
      selectCols = cols;
      pendingSchemaError = pendingSchemaError ?? validateSelectColumns(tableName, cols);
      if (mode === "insert") {
        selectColsForInsertReturn = cols;
        return obj;
      }
      // A `.select()` chained onto update/upsert/delete is a returning clause,
      // not a mode change — it must not turn a write into a read.
      if (mode !== null) return obj;
      mode = "select";
      return obj;
    };
    obj.update = (patch: FakeRow) => {
      mode = "update";
      updatePatch = patch;
      pendingSchemaError = pendingSchemaError ?? validateRowColumns(tableName, patch);
      return obj;
    };
    obj.insert = (payload: FakeRow | FakeRow[]) => {
      mode = "insert";
      insertPayload = payload;
      pendingSchemaError = pendingSchemaError ?? validateRowsColumns(tableName, payload);
      return obj;
    };
    obj.delete = () => {
      mode = "delete";
      return obj;
    };
    obj.eq = (col: string, val: unknown) => {
      filters.push({ kind: "eq", col, val });
      pendingSchemaError = pendingSchemaError ?? validateKnownColumn(tableName, col);
      return obj;
    };
    obj.neq = (col: string, val: unknown) => {
      filters.push({ kind: "neq", col, val });
      pendingSchemaError = pendingSchemaError ?? validateKnownColumn(tableName, col);
      return obj;
    };
    obj.lt = (col: string, val: unknown) => {
      filters.push({ kind: "lt", col, val });
      pendingSchemaError = pendingSchemaError ?? validateKnownColumn(tableName, col);
      return obj;
    };
    obj.lte = (col: string, val: unknown) => {
      filters.push({ kind: "lte", col, val });
      pendingSchemaError = pendingSchemaError ?? validateKnownColumn(tableName, col);
      return obj;
    };
    obj.gt = (col: string, val: unknown) => {
      filters.push({ kind: "gt", col, val });
      pendingSchemaError = pendingSchemaError ?? validateKnownColumn(tableName, col);
      return obj;
    };
    obj.gte = (col: string, val: unknown) => {
      filters.push({ kind: "gte", col, val });
      pendingSchemaError = pendingSchemaError ?? validateKnownColumn(tableName, col);
      return obj;
    };
    obj.in = (col: string, val: unknown[]) => {
      filters.push({ kind: "in", col, val });
      pendingSchemaError = pendingSchemaError ?? validateKnownColumn(tableName, col);
      return obj;
    };
    obj.is = (col: string, val: unknown) => {
      filters.push({ kind: "is", col, val });
      pendingSchemaError = pendingSchemaError ?? validateKnownColumn(tableName, col);
      return obj;
    };
    obj.not = (col: string, op: string, val: unknown) => {
      filters.push({ kind: "not", col, op, val });
      pendingSchemaError = pendingSchemaError ?? validateKnownColumn(tableName, col);
      return obj;
    };
    obj.order = (col: string, opts?: { ascending?: boolean }) => {
      orderBy = { col, ascending: opts?.ascending !== false };
      pendingSchemaError = pendingSchemaError ?? validateKnownColumn(tableName, col);
      return obj;
    };
    obj.limit = (n: number) => {
      limitCount = Math.max(0, Math.floor(Number(n)));
      return obj;
    };
    obj.range = (from: number, to: number) => {
      rangeBounds = {
        from: Math.max(0, Math.floor(Number(from))),
        to: Math.max(0, Math.floor(Number(to)))
      };
      return obj;
    };

    obj.upsert = (payload: FakeRow | FakeRow[], options?: { onConflict?: string }) => {
      mode = "upsert";
      upsertPayload = payload;
      upsertConflictColumn = options?.onConflict ?? null;
      return obj;
    };

    /**
     * Merge-on-conflict against `onConflict` (or `id`/`connection_id` when the
     * caller relies on the primary key), otherwise insert.
     */
    function applyUpsert(): FakeRow[] {
      const rowsToUpsert = Array.isArray(upsertPayload) ? upsertPayload : [upsertPayload as FakeRow];
      const stored: FakeRow[] = [];
      tables[tableName] = tables[tableName] ?? [];
      for (const row of rowsToUpsert) {
        const conflictColumns =
          upsertConflictColumn?.split(",").map((column) => column.trim()).filter(Boolean) ??
          (row.id !== undefined ? ["id"] : row.connection_id !== undefined ? ["connection_id"] : []);
        const existingIndex = conflictColumns.length > 0
          ? tables[tableName].findIndex((candidate) =>
              conflictColumns.every((column) => candidate[column] === row[column])
            )
          : -1;
        if (existingIndex >= 0) {
          tables[tableName][existingIndex] = { ...tables[tableName][existingIndex], ...row };
          stored.push(tables[tableName][existingIndex]);
        } else {
          const stamped = { id: row.id ?? `fake-${tableName}-${tables[tableName].length}`, ...row };
          tables[tableName].push(stamped);
          stored.push(stamped);
        }
      }
      calls.push({
        table: tableName,
        op: "upsert",
        select: selectCols ?? undefined,
        patch: { ...(stored[0] ?? {}) },
        filters: [],
        range: rangeBounds ?? undefined
      });
      return stored;
    }

    obj.single = async () => {
      const result = await (obj.maybeSingle as () => Promise<{
        data: FakeRow | null;
        error: FakeSupabaseError | null;
      }>)();
      if (!result.error && !result.data) {
        return { data: null, error: { message: "no rows returned", code: "PGRST116" } };
      }
      return result;
    };

    obj.maybeSingle = async () => {
      if (pendingSchemaError) {
        calls.push({
          table: tableName,
          op: `${mode ?? "select"}+maybeSingle`,
          select: selectCols ?? undefined,
          filters: [...filters],
          range: rangeBounds ?? undefined
        });
        return { data: null, error: pendingSchemaError };
      }

      if (mode === "insert" && insertPayload) {
        const insertError = takeInsertError(tableName);
        if (insertError) {
          calls.push({
            table: tableName,
            op: "insert+maybeSingle",
            select: selectCols ?? undefined,
            filters: [],
            range: rangeBounds ?? undefined
          });
          return { data: null, error: insertError };
        }
        const rowsToInsert = Array.isArray(insertPayload) ? insertPayload : [insertPayload];
        if (tableName === "workflow_runs") {
          for (const row of rowsToInsert) {
            const duplicateError = workflowRunDuplicateError(tables[tableName] ?? [], row);
            if (duplicateError) {
              calls.push({
                table: tableName,
                op: "insert+maybeSingle",
                select: selectCols ?? undefined,
                patch: row,
                filters: [],
                range: rangeBounds ?? undefined
              });
              return { data: null, error: duplicateError };
            }
          }
        }
        const stamped = rowsToInsert.map((row) => ({
          id: row.id ?? `fake-${tableName}-${tables[tableName]?.length ?? 0}-${Math.random().toString(36).slice(2, 8)}`,
          ...row
        }));
        tables[tableName] = tables[tableName] ?? [];
        tables[tableName].push(...stamped);
        calls.push({
          table: tableName,
          op: "insert+maybeSingle",
          select: selectCols ?? undefined,
          patch: stamped[0],
          filters: [],
          range: rangeBounds ?? undefined
        });
        return { data: stamped[0] ?? null, error: null };
      }

      if (mode === "upsert" && upsertPayload) {
        const stored = applyUpsert();
        return { data: stored[0] ?? null, error: null };
      }

      let rows = tables[tableName] ?? [];
      for (const f of filters) rows = applyFilter(rows, f);
      rows = applyOrderAndLimit(rows, orderBy, limitCount, rangeBounds);
      if (mode === "update" && updatePatch) {
        const patched: FakeRow[] = [];
        for (let i = 0; i < tables[tableName].length; i += 1) {
          if (rows.includes(tables[tableName][i])) {
            tables[tableName][i] = { ...tables[tableName][i], ...updatePatch };
            patched.push(tables[tableName][i]);
          }
        }
        calls.push({
          table: tableName,
          op: "update+maybeSingle",
          select: selectCols ?? undefined,
          patch: { ...updatePatch },
          filters: [...filters],
          range: rangeBounds ?? undefined
        });
        return { data: patched[0] ?? null, error: null };
      }
      calls.push({
        table: tableName,
        op: `${mode ?? "select"}+maybeSingle`,
        select: selectCols ?? undefined,
        filters: [...filters],
        range: rangeBounds ?? undefined
      });
      return { data: rows[0] ?? null, error: null };
    };

    obj.then = async (onFulfilled: (v: { data: unknown; error: FakeSupabaseError | null }) => unknown) => {
      if (pendingSchemaError) {
        calls.push({
          table: tableName,
          op: mode ?? "select",
          select: selectCols ?? undefined,
          filters: [...filters],
          range: rangeBounds ?? undefined
        });
        return onFulfilled({ data: null, error: pendingSchemaError });
      }

      let rows = tables[tableName] ?? [];
      for (const f of filters) rows = applyFilter(rows, f);
      rows = applyOrderAndLimit(rows, orderBy, limitCount, rangeBounds);

      if (mode === "select") {
        calls.push({
          table: tableName,
          op: "select",
          select: selectCols ?? undefined,
          filters: [...filters],
          range: rangeBounds ?? undefined
        });
        return onFulfilled({ data: rows, error: null });
      }

      if (mode === "upsert" && upsertPayload) {
        const stored = applyUpsert();
        return onFulfilled({ data: selectCols !== null ? stored : null, error: null });
      }

      if (mode === "update" && updatePatch) {
        for (let i = 0; i < tables[tableName].length; i += 1) {
          if (rows.includes(tables[tableName][i])) {
            tables[tableName][i] = { ...tables[tableName][i], ...updatePatch };
          }
        }
        calls.push({
          table: tableName,
          op: "update",
          select: selectCols ?? undefined,
          patch: { ...updatePatch },
          filters: [...filters],
          range: rangeBounds ?? undefined
        });
        return onFulfilled({ data: null, error: null });
      }

      if (mode === "delete") {
        const before = tables[tableName] ?? [];
        tables[tableName] = before.filter((row) => !rows.includes(row));
        calls.push({
          table: tableName,
          op: "delete",
          select: selectCols ?? undefined,
          filters: [...filters],
          range: rangeBounds ?? undefined
        });
        return onFulfilled({ data: null, error: null });
      }

      if (mode === "insert" && insertPayload) {
        const insertError = takeInsertError(tableName);
        if (insertError) {
          calls.push({
            table: tableName,
            op: "insert",
            select: selectCols ?? undefined,
            filters: [],
            range: rangeBounds ?? undefined
          });
          return onFulfilled({ data: null, error: insertError });
        }
        const rowsToInsert = Array.isArray(insertPayload) ? insertPayload : [insertPayload];
        if (tableName === "workflow_runs") {
          for (const row of rowsToInsert) {
            const duplicateError = workflowRunDuplicateError(tables[tableName] ?? [], row);
            if (duplicateError) {
              calls.push({
                table: tableName,
                op: "insert",
                select: selectCols ?? undefined,
                patch: row,
                filters: [],
                range: rangeBounds ?? undefined
              });
              return onFulfilled({ data: null, error: duplicateError });
            }
          }
        }
        const stamped = rowsToInsert.map((row) => ({
          id: row.id ?? `fake-${tableName}-${tables[tableName]?.length ?? 0}-${Math.random().toString(36).slice(2, 8)}`,
          ...row
        }));
        tables[tableName] = tables[tableName] ?? [];
        tables[tableName].push(...stamped);
        calls.push({
          table: tableName,
          op: "insert",
          select: selectCols ?? undefined,
          patch: stamped[0],
          filters: [],
          range: rangeBounds ?? undefined
        });
        // If a .select() followed .insert(), return the inserted rows.
        if (selectColsForInsertReturn !== null) {
          return onFulfilled({ data: stamped, error: null });
        }
        return onFulfilled({ data: null, error: null });
      }

      return onFulfilled({ data: null, error: null });
    };

    return obj;
  }

  return {
    from: builder,
    _tables: tables,
    _calls: calls
  };
}

export function asAdminClient<T>(fake: ReturnType<typeof createFakeSupabase>): T {
  return fake as unknown as T;
}
