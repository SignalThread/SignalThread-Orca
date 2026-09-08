/**
 * A scope-ENFORCING in-memory Supabase double.
 *
 * ── Why this exists, and how it differs from `tests/helpers/fake-supabase.ts` ──
 *
 * Prompt 1 identified the repo's existing fake as a source of false-green tests: a
 * double that ignores `.eq("company_id", …)` returns cross-tenant rows to a passing
 * test, so the test proves nothing about scoping. Roughly a third of the isolation
 * "coverage" in this repo is of that shape, and three such tests are currently *failing*
 * for reasons unrelated to the invariant they claim.
 *
 * This double inverts that. It applies every predicate faithfully against an in-memory
 * table, and applies nothing on its own. So:
 *
 *   - a route that scopes correctly finds only its own tenant's rows
 *   - a route that FORGETS `.eq("company_id", …)` genuinely sees the other tenant's row,
 *     and the test goes red
 *
 * That converts "does the source text contain .eq(company_id)?" into "does this handler
 * actually refuse to return another tenant's data?" — the difference between a source
 * grep and a behavioral assertion.
 *
 * It is not a database, and it is not a substitute for the RLS tests in plan §50. RLS is
 * a second, independent enforcement layer and can only be proven against real Postgres.
 * Those tests live in `tests/db/` and are reported `not-run` until a test project exists.
 * This double proves the *application* layer re-applies scope, which plan §50 requires
 * separately: "server code re-applying scope before service-role mutation".
 */

export type Row = Record<string, unknown>;

type Filter =
  | { op: "eq"; column: string; value: unknown }
  | { op: "neq"; column: string; value: unknown }
  | { op: "in"; column: string; value: unknown[] }
  | { op: "is"; column: string; value: null }
  | { op: "not"; column: string; value: unknown }
  | { op: "lte" | "gte" | "lt" | "gt"; column: string; value: unknown };

export type RecordedQuery = {
  table: string;
  action: "select" | "insert" | "update" | "delete";
  filters: Filter[];
  /** Column names the query filtered on, for assertions about scoping predicates. */
  filteredColumns: string[];
  selectedColumns: string | null;
  payload?: Row | Row[];
  rowsReturned: number;
};

export type ScopedSupabaseOptions = {
  /** Seed data, keyed by table name. Rows are deep-copied so tests cannot alias them. */
  tables?: Record<string, Row[]>;
  /** Force an error from a specific table+action, for failure-path tests. */
  failOn?: { table: string; action: RecordedQuery["action"]; message: string; code?: string };
};

export type ScopedSupabase = {
  from(table: string): QueryBuilder;
  /** Every query issued, in order. */
  queries: RecordedQuery[];
  /** Current contents of a table — the DB end state plan §27 insists on asserting. */
  rows(table: string): Row[];
  /** Queries issued against a table, optionally filtered by action. */
  queriesFor(table: string, action?: RecordedQuery["action"]): RecordedQuery[];
  reset(): void;
};

const clone = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));

function matches(row: Row, filters: Filter[]): boolean {
  return filters.every((f) => {
    const actual = row[f.column];
    switch (f.op) {
      case "eq": return actual === f.value;
      case "neq": return actual !== f.value;
      case "in": return (f.value as unknown[]).includes(actual);
      case "is": return actual === null || actual === undefined;
      case "not": return actual !== f.value;
      case "lte": return (actual as number) <= (f.value as number);
      case "gte": return (actual as number) >= (f.value as number);
      case "lt": return (actual as number) < (f.value as number);
      case "gt": return (actual as number) > (f.value as number);
    }
  });
}

/** Mimic PostgREST column projection so an over-broad select is visible to tests. */
function project(row: Row, columns: string | null): Row {
  if (!columns || columns.trim() === "*") return clone(row);
  const wanted = columns.split(",").map((c) => c.trim().split(":").pop()!.trim()).filter(Boolean);
  const out: Row = {};
  for (const col of wanted) if (col in row) out[col] = clone(row[col]);
  return out;
}

type Result = { data: unknown; error: { message: string; code?: string } | null };

class QueryBuilder implements PromiseLike<Result> {
  private filters: Filter[] = [];
  private action: RecordedQuery["action"] = "select";
  private columns: string | null = null;
  private payload: Row | Row[] | undefined;
  private limitN: number | null = null;
  private orderBy: { column: string; ascending: boolean } | null = null;
  private singleMode: "none" | "maybe" | "single" = "none";

  constructor(
    private readonly store: Map<string, Row[]>,
    private readonly table: string,
    private readonly recorded: RecordedQuery[],
    private readonly failOn: ScopedSupabaseOptions["failOn"]
  ) {}

  select(columns?: string) {
    if (this.action === "select") this.action = "select";
    this.columns = columns ?? "*";
    return this;
  }
  insert(payload: Row | Row[]) { this.action = "insert"; this.payload = clone(payload); return this; }
  update(patch: Row) { this.action = "update"; this.payload = clone(patch); return this; }
  delete() { this.action = "delete"; return this; }
  upsert(payload: Row | Row[]) { this.action = "insert"; this.payload = clone(payload); return this; }

  eq(column: string, value: unknown) { this.filters.push({ op: "eq", column, value }); return this; }
  neq(column: string, value: unknown) { this.filters.push({ op: "neq", column, value }); return this; }
  in(column: string, value: unknown[]) { this.filters.push({ op: "in", column, value }); return this; }
  is(column: string, value: null) { this.filters.push({ op: "is", column, value }); return this; }
  not(column: string, _op: string, value: unknown) { this.filters.push({ op: "not", column, value }); return this; }
  lte(column: string, value: unknown) { this.filters.push({ op: "lte", column, value }); return this; }
  gte(column: string, value: unknown) { this.filters.push({ op: "gte", column, value }); return this; }
  lt(column: string, value: unknown) { this.filters.push({ op: "lt", column, value }); return this; }
  gt(column: string, value: unknown) { this.filters.push({ op: "gt", column, value }); return this; }

  order(column: string, opts?: { ascending?: boolean }) {
    this.orderBy = { column, ascending: opts?.ascending ?? true };
    return this;
  }
  limit(n: number) { this.limitN = n; return this; }
  range(from: number, to: number) { this.limitN = to - from + 1; return this; }

  maybeSingle() { this.singleMode = "maybe"; return this; }
  single() { this.singleMode = "single"; return this; }

  private table_(): Row[] {
    if (!this.store.has(this.table)) this.store.set(this.table, []);
    return this.store.get(this.table)!;
  }

  private execute(): Result {
    if (this.failOn && this.failOn.table === this.table && this.failOn.action === this.action) {
      this.record(0);
      return { data: null, error: { message: this.failOn.message, code: this.failOn.code } };
    }

    const rows = this.table_();
    let affected: Row[];

    switch (this.action) {
      case "insert": {
        const incoming = Array.isArray(this.payload) ? this.payload : [this.payload as Row];
        for (const r of incoming) rows.push(clone(r));
        affected = incoming.map((r) => clone(r));
        break;
      }
      case "update": {
        // No implicit scoping. An unfiltered update hits every row, exactly as it would
        // in Postgres — which is what makes a missing predicate visible.
        affected = [];
        for (const row of rows) {
          if (!matches(row, this.filters)) continue;
          Object.assign(row, clone(this.payload as Row));
          affected.push(clone(row));
        }
        break;
      }
      case "delete": {
        affected = rows.filter((r) => matches(r, this.filters)).map((r) => clone(r));
        const keep = rows.filter((r) => !matches(r, this.filters));
        rows.length = 0;
        rows.push(...keep);
        break;
      }
      default: {
        affected = rows.filter((r) => matches(r, this.filters)).map((r) => clone(r));
        if (this.orderBy) {
          const { column, ascending } = this.orderBy;
          affected.sort((a, b) => {
            const av = a[column] as never, bv = b[column] as never;
            if (av === bv) return 0;
            return (av < bv ? -1 : 1) * (ascending ? 1 : -1);
          });
        }
        if (this.limitN !== null) affected = affected.slice(0, this.limitN);
      }
    }

    const projected = this.columns ? affected.map((r) => project(r, this.columns)) : affected;
    this.record(projected.length);

    // A write with no `.select()` returns no rows, matching PostgREST.
    if (this.action !== "select" && !this.columns) {
      return { data: null, error: null };
    }

    if (this.singleMode === "single") {
      if (projected.length !== 1) {
        return {
          data: null,
          error: {
            message: projected.length === 0
              ? "JSON object requested, multiple (or no) rows returned"
              : `Results contain ${projected.length} rows, application/vnd.pgrst.object+json requires 1 row`,
            code: "PGRST116",
          },
        };
      }
      return { data: projected[0], error: null };
    }
    if (this.singleMode === "maybe") {
      return { data: projected[0] ?? null, error: null };
    }
    return { data: projected, error: null };
  }

  private record(rowsReturned: number) {
    this.recorded.push({
      table: this.table,
      action: this.action,
      filters: [...this.filters],
      filteredColumns: this.filters.map((f) => f.column),
      selectedColumns: this.columns,
      payload: this.payload,
      rowsReturned,
    });
  }

  then<TResult1 = Result, TResult2 = never>(
    onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }
}

export function createScopedSupabase(options: ScopedSupabaseOptions = {}): ScopedSupabase {
  const store = new Map<string, Row[]>();
  for (const [table, rows] of Object.entries(options.tables ?? {})) {
    store.set(table, clone(rows));
  }
  const queries: RecordedQuery[] = [];

  return {
    from(table: string) {
      return new QueryBuilder(store, table, queries, options.failOn);
    },
    queries,
    rows: (table) => clone(store.get(table) ?? []),
    queriesFor: (table, action) =>
      queries.filter((q) => q.table === table && (action ? q.action === action : true)),
    reset() {
      store.clear();
      queries.length = 0;
    },
  };
}

// ── assertion helpers ──────────────────────────────────────────────────────────────

/**
 * Assert every query against a table filtered on a scoping column.
 *
 * This is the "server code re-applies scope before every service-role mutation"
 * requirement of plan §50, made checkable. Service-role clients bypass RLS entirely, so
 * a missing predicate here is a cross-tenant read or write with nothing behind it.
 */
export function assertEveryQueryScoped(
  supabase: ScopedSupabase,
  table: string,
  scopeColumn: string
): void {
  const offenders = supabase
    .queriesFor(table)
    .filter((q) => !q.filteredColumns.includes(scopeColumn));
  if (offenders.length === 0) return;
  throw new Error(
    `${offenders.length} query/queries against "${table}" did not filter on "${scopeColumn}". ` +
      `The service-role client bypasses RLS, so an unscoped query is a cross-tenant read or write.\n` +
      offenders.map((q) => `  ${q.action} filtered on [${q.filteredColumns.join(", ") || "nothing"}]`).join("\n")
  );
}
