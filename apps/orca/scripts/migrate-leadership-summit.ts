#!/usr/bin/env tsx
/**
 * One-time migration: Orca Leadership Summit (old Orca) -> Acme Annual 2026 (new Orca).
 *
 * This is a cross-database copy of a single event's operational data. It is NOT a
 * general event copier and must not be reused as one: the identity mapping below is
 * specific to this migration and was established by a separate read-only audit.
 *
 * Safety model
 * ------------
 *   - DRY RUN IS THE DEFAULT. Without `--apply` the destination connection never
 *     issues a statement outside a read-only transaction.
 *   - Both databases are identified positively by project ref before anything runs.
 *     A mismatch is fatal, not a warning.
 *   - The source connection is held read-only for the whole run.
 *   - `--apply` wraps every insert in ONE transaction. Any failure rolls back the
 *     entire migration; there is no partial state to clean up.
 *
 * What is deliberately NOT copied (decisions locked by the audit):
 *   - Event            the destination Event shell is canonical and already exists
 *   - Organization     ditto
 *   - User             identities are Platform-minted; see USER_MAP
 *   - Membership       destination access state already exists
 *   - EventMember      ditto - Ali and Sarah are already EVENT_ADMIN
 *   - SecurityComplianceRecord   no destination table (1 source row, reported)
 *   - EventImportIntent / EventImportResult   org-scoped, seeded, both FAILED
 *   - CopilotAuditLog, dashboard layout/view/preference tables   per-user UI state
 *
 * Usage:
 *   SOURCE_DATABASE_URL=... npx tsx scripts/migrate-leadership-summit.ts            # dry run
 *   SOURCE_DATABASE_URL=... npx tsx scripts/migrate-leadership-summit.ts --apply    # commit
 */

import { Client } from "pg";

// ---------------------------------------------------------------------------
// Locked constants. Every one of these was verified against the live databases.
// ---------------------------------------------------------------------------

const SOURCE_PROJECT_REF = "qgqqizrpdkpjohvpkdgu";
const DEST_PROJECT_REF = "qgxvtgnzptepimuawnku";

const SOURCE_EVENT_ID = "717ca942-5701-4bfb-82e7-afddf41f19a7";
const SOURCE_ORG_ID = "dd0023ec-5204-4471-815f-750a110a95fa";
const DEST_EVENT_ID = "ae9942ba-5759-486b-b591-f1b5ed223370";
const DEST_ORG_ID = "7437a82f-bdc9-425d-9f1c-5525930b43bd";

const ALI_DEST_USER = "aa8a4f3f-23c1-4beb-9d35-d8c30a71dad8";
const SARAH_DEST_USER = "e79340c1-a647-4a11-a1ac-6fb758b6fadb";

/**
 * Old Orca user id -> destination user id, or null to drop the attribution.
 *
 * Both Sarah rows collapse onto one canonical identity: the audit established that
 * sarah@siteandstay.com and sarah@signalthread.ai are the same person, and her
 * canonical Platform identity is sarah@signalthread.ai.
 *
 * The two seeded users are never recreated. `null` means "set this column NULL",
 * which is only legal where the column is nullable - enforced at runtime below.
 */
const USER_MAP: Record<string, string | null> = {
  "f7da5954-f1c5-4b53-b780-c6f500d57e97": ALI_DEST_USER, // kamyab.ali@gmail.com
  "4149da9b-504b-4d80-be3e-678590e41902": SARAH_DEST_USER, // sarah@siteandstay.com
  "cf7de3b9-7a30-4342-8fb7-f9f95b655ed1": SARAH_DEST_USER, // sarah@signalthread.ai
  "737febe3-eec2-4fed-ae0b-66110d1cb735": null, // demo@planneros.com   (seeded)
  "1bcf5714-015f-463c-b5a1-ce8750de488e": null, // john.smith@planneros.com (seeded)
};

/**
 * Column-specific overrides that beat USER_MAP.
 *
 * The 9 timeline items owned by the seeded john.smith are live planning work, not
 * historical attribution, so ownership transfers to Ali rather than being dropped.
 */
const USER_MAP_OVERRIDES: Record<string, Record<string, string | null>> = {
  "TimelineItem.ownerUserId": { "1bcf5714-015f-463c-b5a1-ce8750de488e": ALI_DEST_USER },
};

/**
 * Row-level ownership recovery.
 *
 * The audit found these 9 timeline items owned by the seeded john.smith@planneros.com
 * and the decision was to transfer them to Ali. Between the audit and this migration
 * the seeded users were deleted from the source database, and because
 * TimelineItem.ownerUserId is ON DELETE SET NULL the ownership was erased: the rows
 * survive but now read NULL, which is indistinguishable from the 92 timeline items in
 * this event that were never owned by anyone.
 *
 * The user-id mapping above therefore can no longer see them. These ids preserve the
 * decision. The rule is deliberately narrow and self-invalidating: it applies only to
 * these exact ids, and only while the row's owner is still NULL, so it cannot
 * overwrite an owner that someone sets later.
 */
const TIMELINE_OWNERSHIP_RECOVERY = {
  target: ALI_DEST_USER,
  ids: new Set([
    "2b367b01-3bd1-4fc6-bfb4-b0a708b8986e", // AI concierge testing
    "33c68caf-3c61-4d23-86eb-3a3cf5b33cc4", // Launch registration
    "38fac522-b9a0-47a0-b333-46f3c61d18bc", // Build attendee website
    "621a6ddd-18f4-4af0-8918-7443f0692ef8", // Configure mobile app
    "7ae91b24-f5cb-4db9-bb9d-e4ec7cf84f6c", // Approve keynote agenda
    "9b50f73a-14cf-4b74-afb9-b0097a781c95", // Approve keynote agenda
    "bbefa77c-2282-4c0d-9e64-0ecbc4550034", // Upload hotel contracts
    "dccfa59c-10a7-4c10-aef0-cc56bb51a506", // Emergency planning
    "fa93b629-ff93-4a75-b906-5b301fc14c65", // AI concierge / hotel contracts set
  ]),
};

/** Never copied, for the reasons given in the header. */
const EXCLUDED_TABLES = new Set([
  "User",
  "Organization",
  "Event",
  "Membership",
  "EventMember",
  "SecurityComplianceRecord",
  "EventImportIntent",
  "EventImportResult",
  "CopilotAuditLog",
  "EventDashboardLayoutMigration",
  "EventDashboardView",
  "EventDashboardViewPreference",
  "UserDashboardLayout",
  "_prisma_migrations",
]);

/**
 * Org-scoped lookup tables that carry no eventId but are referenced by rows in
 * scope. Only the referenced subset travels, and its orgId is remapped.
 */
const REFERENCED_LOOKUPS: Record<string, string> = {
  DocumentTag: `t."id" in (
     select dtod."tagId" from "DocumentTagOnDocument" dtod
     join "Document" d on d."id" = dtod."documentId"
     where d."eventId" = '${SOURCE_EVENT_ID}')`,
  Client: `t."id" in (
     select e."clientId" from "Event" e
     where e."id" = '${SOURCE_EVENT_ID}' and e."clientId" is not null)`,
};

/**
 * Disambiguates which parent owns a child when several FKs lead back to the event.
 * Picking the wrong one silently changes what "in scope" means, so these are explicit.
 */
const SCOPE_PARENT_PREFERENCE: Record<string, string> = {
  SessionFnbAssignmentSafetyResolution: "sessionId",
  SessionFnbCatalogAssignmentTax: "assignmentId",
  SeatingAssignment: "tableId",
  BudgetSubmissionLineItem: "submissionId",
  EventAttendeeSessionEnrollment: "attendeeId",
  SupplyDependency: "allocationId",
  SessionRequirementSelection: "sessionId",
  DocumentTagOnDocument: "documentId",
  EventRegistrationRecord: "attendeeId",
  SpeakerDocumentRequest: "speakerId",
  MarketingEmailEvent: "emailSendId",
  SeatingAttendee: "eventAttendeeId",
};

const R2_KEY_COLUMNS = new Set(["objectKey", "storageKey"]);

// ---------------------------------------------------------------------------
// Schema introspection
// ---------------------------------------------------------------------------

type Column = {
  name: string;
  dataType: string;
  udtName: string;
  nullable: boolean;
};

type ForeignKey = {
  table: string;
  column: string;
  refTable: string;
  nullable: boolean;
};

type Schema = {
  tables: string[];
  columns: Map<string, Column[]>;
  primaryKey: Map<string, string[]>;
  foreignKeys: ForeignKey[];
  uniques: Map<string, string[][]>;
};

async function introspect(client: Client): Promise<Schema> {
  const tables = (
    await client.query<{ table_name: string }>(
      `select table_name from information_schema.tables
        where table_schema = 'public' and table_type = 'BASE TABLE'
        order by table_name`,
    )
  ).rows.map((r) => r.table_name);

  const columns = new Map<string, Column[]>();
  for (const row of (
    await client.query<{
      table_name: string;
      column_name: string;
      data_type: string;
      udt_name: string;
      is_nullable: string;
    }>(
      `select table_name, column_name, data_type, udt_name, is_nullable
         from information_schema.columns
        where table_schema = 'public'
        order by table_name, ordinal_position`,
    )
  ).rows) {
    const list = columns.get(row.table_name) ?? [];
    list.push({
      name: row.column_name,
      dataType: row.data_type,
      udtName: row.udt_name,
      nullable: row.is_nullable === "YES",
    });
    columns.set(row.table_name, list);
  }

  const primaryKey = new Map<string, string[]>();
  const uniques = new Map<string, string[][]>();
  for (const row of (
    await client.query<{ table_name: string; kind: string; cols: string[] }>(
      `select c.relname as table_name,
              case when i.indisprimary then 'p' else 'u' end as kind,
              array_agg(a.attname::text order by array_position(i.indkey::int[], a.attnum::int)) as cols
         from pg_index i
         join pg_class c on c.oid = i.indrelid
         join pg_namespace n on n.oid = c.relnamespace
         join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
        where n.nspname = 'public' and (i.indisprimary or i.indisunique)
        group by c.relname, i.indexrelid, i.indisprimary`,
    )
  ).rows) {
    if (row.kind === "p") {
      primaryKey.set(row.table_name, row.cols);
    } else {
      const list = uniques.get(row.table_name) ?? [];
      list.push(row.cols);
      uniques.set(row.table_name, list);
    }
  }

  const foreignKeys = (
    await client.query<{
      table_name: string;
      column_name: string;
      ref_table: string;
      is_nullable: string;
    }>(
      `select tc.table_name, kcu.column_name,
              ccu.table_name as ref_table, col.is_nullable
         from information_schema.table_constraints tc
         join information_schema.key_column_usage kcu
           on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
         join information_schema.constraint_column_usage ccu
           on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
         join information_schema.columns col
           on col.table_name = tc.table_name and col.column_name = kcu.column_name
          and col.table_schema = tc.table_schema
        where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'`,
    )
  ).rows.map((r) => ({
    table: r.table_name,
    column: r.column_name,
    refTable: r.ref_table,
    nullable: r.is_nullable === "YES",
  }));

  return { tables, columns, primaryKey, foreignKeys, uniques };
}

// ---------------------------------------------------------------------------
// Scope resolution: how each table reaches the source event
// ---------------------------------------------------------------------------

type ScopeInfo = { predicate: string; route: string };

function buildScopes(schema: Schema): Map<string, ScopeInfo> {
  const has = (table: string, column: string) =>
    (schema.columns.get(table) ?? []).some((c) => c.name === column);

  const scopes = new Map<string, ScopeInfo>();
  const parents = new Map<string, { column: string; parent: string }>();

  for (const table of schema.tables) {
    if (EXCLUDED_TABLES.has(table)) continue;
    if (has(table, "eventId")) {
      scopes.set(table, { predicate: "", route: "eventId" });
    }
  }

  // Fixpoint: a table is in scope once any FK reaches a table already in scope.
  let changed = true;
  while (changed) {
    changed = false;
    for (const table of schema.tables) {
      if (EXCLUDED_TABLES.has(table) || scopes.has(table)) continue;
      const candidates = schema.foreignKeys.filter(
        (fk) => fk.table === table && fk.refTable !== table && scopes.has(fk.refTable),
      );
      if (candidates.length === 0) continue;
      const preferred = SCOPE_PARENT_PREFERENCE[table];
      const pick =
        candidates.find((c) => c.column === preferred) ??
        candidates.find((c) => !c.nullable) ??
        candidates[0]!;
      parents.set(table, { column: pick.column, parent: pick.refTable });
      scopes.set(table, { predicate: "", route: `${pick.column} -> ${pick.refTable}` });
      changed = true;
    }
  }

  const predicateFor = (table: string, alias: string, depth: number): string => {
    if (has(table, "eventId")) return `${alias}."eventId" = '${SOURCE_EVENT_ID}'`;
    const link = parents.get(table)!;
    const parentAlias = `p${depth}`;
    return `exists (select 1 from "${link.parent}" ${parentAlias} where ${parentAlias}."id" = ${alias}."${link.column}" and ${predicateFor(link.parent, parentAlias, depth + 1)})`;
  };

  for (const [table, info] of scopes) {
    info.predicate = predicateFor(table, "t", 0);
  }
  for (const [table, predicate] of Object.entries(REFERENCED_LOOKUPS)) {
    if (schema.tables.includes(table)) {
      scopes.set(table, { predicate, route: "referenced lookup" });
    }
  }
  return scopes;
}

/** Insert order: parents before children. Self-references are deferred, not blocking. */
function topologicalOrder(schema: Schema, tables: string[]): string[] {
  const inScope = new Set(tables);
  const deps = new Map<string, Set<string>>();
  for (const t of tables) deps.set(t, new Set());
  for (const fk of schema.foreignKeys) {
    if (!inScope.has(fk.table) || !inScope.has(fk.refTable)) continue;
    if (fk.table === fk.refTable) continue; // self-FK: same-table ordering, handled by sort below
    deps.get(fk.table)!.add(fk.refTable);
  }
  const ordered: string[] = [];
  const placed = new Set<string>();
  while (ordered.length < tables.length) {
    const ready = tables
      .filter((t) => !placed.has(t))
      .filter((t) => [...deps.get(t)!].every((d) => placed.has(d)));
    if (ready.length === 0) {
      // Cycle: emit the rest in a stable order. Deferred FK checks handle it inside
      // the transaction, and any genuine violation surfaces there rather than here.
      for (const t of tables) if (!placed.has(t)) ordered.push(t), placed.add(t);
      break;
    }
    ready.sort();
    for (const t of ready) ordered.push(t), placed.add(t);
  }
  return ordered;
}

// ---------------------------------------------------------------------------
// Row transformation
// ---------------------------------------------------------------------------

const isUserColumn = (name: string) => name === "userId" || /UserId$/.test(name);

type TableReport = {
  table: string;
  sourceRows: number;
  inserts: number;
  transforms: number;
  skips: number;
  eventRemaps: number;
  orgRemaps: number;
  userRemaps: number;
  nullSubstitutions: number;
  ownershipRecoveries: number;
  droppedColumns: string[];
  r2Rekeys: number;
  pkCollisions: string[];
  uniqueCollisions: string[];
  fkIssues: string[];
  deferredSelfRefs: number;
};

/**
 * A self-referencing foreign key value held back for a second pass.
 *
 * Why this exists: a table whose rows point at other rows in the SAME table cannot be
 * inserted in one pass in an arbitrary order, because a child may land before its
 * parent. Table-level topological ordering cannot help - the dependency is inside a
 * single table.
 *
 * `set constraints all deferred` does NOT solve it either: Prisma emits these
 * constraints as NOT DEFERRABLE, so the statement is silently a no-op for them and the
 * violation still fires on the offending INSERT. That is exactly how the first apply
 * attempt failed on TimelineItem_parentId_fkey.
 *
 * So each self-referencing value is nulled on insert, remembered here, and written back
 * by an UPDATE after every row of that table exists. The FK is fully enforced on both
 * the insert and the update; nothing is weakened or deferred.
 */
type DeferredSelfRef = {
  table: string;
  column: string;
  /** Primary key of the row to update, as column -> value. */
  key: Record<string, unknown>;
  /** The original, unmodified parent id from the source row. */
  value: unknown;
};

function transformRow(
  table: string,
  row: Record<string, unknown>,
  destColumns: Map<string, Column>,
  report: TableReport,
  unknownUsers: Set<string>,
): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  let touched = false;

  for (const [key, value] of Object.entries(row)) {
    const destColumn = destColumns.get(key);
    if (!destColumn) {
      if (!report.droppedColumns.includes(key)) report.droppedColumns.push(key);
      touched = true;
      continue;
    }

    if (key === "eventId" && value === SOURCE_EVENT_ID) {
      out[key] = DEST_EVENT_ID;
      report.eventRemaps += 1;
      touched = true;
      continue;
    }
    if (key === "orgId" && value === SOURCE_ORG_ID) {
      out[key] = DEST_ORG_ID;
      report.orgRemaps += 1;
      touched = true;
      continue;
    }
    if (isUserColumn(key) && typeof value === "string") {
      const override = USER_MAP_OVERRIDES[`${table}.${key}`];
      const mapped =
        override && value in override ? override[value] : value in USER_MAP ? USER_MAP[value] : undefined;
      if (mapped === undefined) {
        unknownUsers.add(`${table}.${key} -> ${value}`);
        out[key] = value;
        continue;
      }
      if (mapped === null) {
        if (!destColumn.nullable) {
          report.fkIssues.push(
            `${key} is NOT NULL but source value ${value} maps to NULL (seeded identity)`,
          );
          return null;
        }
        out[key] = null;
        report.nullSubstitutions += 1;
      } else {
        out[key] = mapped;
        report.userRemaps += 1;
      }
      touched = true;
      continue;
    }
    if (R2_KEY_COLUMNS.has(key) && typeof value === "string" && value.includes(SOURCE_EVENT_ID)) {
      out[key] = value.split(`events/${SOURCE_EVENT_ID}/`).join(`events/${DEST_EVENT_ID}/`);
      report.r2Rekeys += 1;
      touched = true;
      continue;
    }
    out[key] = value;
  }

  // Row-level recovery runs after the column pass: it acts on a value that is already
  // NULL, which the user-column branch above deliberately never touches.
  if (
    table === "TimelineItem" &&
    typeof out.id === "string" &&
    TIMELINE_OWNERSHIP_RECOVERY.ids.has(out.id) &&
    (out.ownerUserId === null || out.ownerUserId === undefined)
  ) {
    out.ownerUserId = TIMELINE_OWNERSHIP_RECOVERY.target;
    report.ownershipRecoveries += 1;
    touched = true;
  }

  if (touched) report.transforms += 1;
  return out;
}

// ---------------------------------------------------------------------------
// Value binding: explicit casts so enums, arrays and json round-trip exactly
// ---------------------------------------------------------------------------

function castFor(column: Column): string {
  if (column.dataType === "ARRAY") return `${column.udtName.replace(/^_/, "")}[]`;
  if (column.dataType === "USER-DEFINED") return `"public"."${column.udtName}"`;
  if (column.udtName === "json" || column.udtName === "jsonb") return column.udtName;
  return column.udtName;
}

function bindValue(column: Column, value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if ((column.udtName === "json" || column.udtName === "jsonb") && typeof value === "object") {
    return JSON.stringify(value);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function assertProjectRef(url: string, expectedRef: string, label: string): void {
  if (!url.includes(expectedRef)) {
    throw new Error(
      `STOP: ${label} does not point at project ${expectedRef}. Refusing to run.`,
    );
  }
  console.info(`  ${label.padEnd(11)} verified: ${expectedRef}`);
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");

  const sourceUrl = process.env.SOURCE_DATABASE_URL?.trim();
  const destUrl = process.env.DATABASE_URL?.trim();
  if (!sourceUrl) throw new Error("SOURCE_DATABASE_URL is required (old Orca).");
  if (!destUrl) throw new Error("DATABASE_URL is required (new Orca).");

  console.info("=".repeat(78));
  console.info("  Orca Leadership Summit  ->  Acme Annual 2026");
  console.info(`  MODE: ${apply ? "APPLY (writes, single transaction)" : "DRY RUN (no writes)"}`);
  console.info("=".repeat(78));
  assertProjectRef(sourceUrl, SOURCE_PROJECT_REF, "source");
  assertProjectRef(destUrl, DEST_PROJECT_REF, "destination");

  const source = new Client({ connectionString: sourceUrl });
  const dest = new Client({ connectionString: destUrl });
  await source.connect();
  await dest.connect();

  try {
    // The source is never written, under any flag.
    await source.query("set session characteristics as transaction read only");

    const sourceSchema = await introspect(source);
    const destSchema = await introspect(dest);
    const scopes = buildScopes(sourceSchema);

    // ---- destination safety check -------------------------------------------------
    console.info("\n--- DESTINATION SAFETY CHECK ---");
    const checks: [string, boolean, string][] = [];
    const one = async (sql: string, params: unknown[] = []) =>
      (await dest.query(sql, params)).rows[0] as Record<string, unknown> | undefined;

    const destEvent = await one(`select "id","name","orgId","createdByUserId" from "Event" where "id" = $1`, [DEST_EVENT_ID]);
    const destOrg = await one(`select "id","name" from "Organization" where "id" = $1`, [DEST_ORG_ID]);
    const ali = await one(`select "id","email","platformUserId" from "User" where "id" = $1`, [ALI_DEST_USER]);
    const sarah = await one(`select "id","email","platformUserId" from "User" where "id" = $1`, [SARAH_DEST_USER]);
    const aliMember = await one(`select "eventRole" from "EventMember" where "eventId" = $1 and "userId" = $2`, [DEST_EVENT_ID, ALI_DEST_USER]);
    const sarahMember = await one(`select "eventRole" from "EventMember" where "eventId" = $1 and "userId" = $2`, [DEST_EVENT_ID, SARAH_DEST_USER]);

    checks.push(["destination Event exists", !!destEvent, destEvent ? `${destEvent.name}` : "MISSING"]);
    checks.push(["destination Organization exists", !!destOrg, destOrg ? `${destOrg.name}` : "MISSING"]);
    checks.push(["Ali exists", !!ali, ali ? `${ali.email}` : "MISSING"]);
    checks.push(["Sarah exists", !!sarah, sarah ? `${sarah.email}` : "MISSING"]);
    checks.push(["Ali EventMember = EVENT_ADMIN", aliMember?.eventRole === "EVENT_ADMIN", String(aliMember?.eventRole)]);
    checks.push(["Sarah EventMember = EVENT_ADMIN", sarahMember?.eventRole === "EVENT_ADMIN", String(sarahMember?.eventRole)]);

    const copyTables = [...scopes.keys()]
      .filter((t) => destSchema.tables.includes(t))
      .filter((t) => !EXCLUDED_TABLES.has(t));

    let occupied = 0;
    for (const table of copyTables) {
      if (!(destSchema.columns.get(table) ?? []).some((c) => c.name === "eventId")) continue;
      const n = Number(
        (await dest.query(`select count(*)::int as n from "${table}" where "eventId" = $1`, [DEST_EVENT_ID])).rows[0].n,
      );
      if (n > 0) occupied += n;
    }
    checks.push(["operational destination tables empty", occupied === 0, `${occupied} row(s) already on destination event`]);

    for (const [label, ok, detail] of checks) {
      console.info(`  ${ok ? "PASS" : "FAIL"}  ${label.padEnd(38)} ${detail}`);
    }
    const safetyFailed = checks.filter(([, ok]) => !ok);

    // ---- per-table planning --------------------------------------------------------
    const order = topologicalOrder(sourceSchema, copyTables);
    const reports: TableReport[] = [];
    const unknownUsers = new Set<string>();
    const plan: { table: string; columns: Column[]; rows: Record<string, unknown>[] }[] = [];
    const deferredSelfRefs: DeferredSelfRef[] = [];

    for (const table of order) {
      const scope = scopes.get(table)!;
      const destColumns = new Map((destSchema.columns.get(table) ?? []).map((c) => [c.name, c]));
      const report: TableReport = {
        table,
        sourceRows: 0,
        inserts: 0,
        transforms: 0,
        skips: 0,
        eventRemaps: 0,
        orgRemaps: 0,
        userRemaps: 0,
        nullSubstitutions: 0,
        ownershipRecoveries: 0,
        droppedColumns: [],
        r2Rekeys: 0,
        pkCollisions: [],
        uniqueCollisions: [],
        fkIssues: [],
        deferredSelfRefs: 0,
      };

      const rows = (await source.query(`select t.* from "${table}" t where ${scope.predicate}`)).rows as Record<string, unknown>[];
      report.sourceRows = rows.length;
      if (rows.length === 0) {
        reports.push(report);
        continue;
      }

      const transformed: Record<string, unknown>[] = [];
      for (const row of rows) {
        const out = transformRow(table, row, destColumns, report, unknownUsers);
        if (out === null) {
          report.skips += 1;
          continue;
        }
        transformed.push(out);
      }

      // PK collisions against the destination.
      const pk = destSchema.primaryKey.get(table) ?? [];

      // ---- self-referencing FKs: hold the value back for a second pass -------------
      // Ids are never remapped, so the source value is also the destination value.
      const selfRefColumns = sourceSchema.foreignKeys
        .filter((fk) => fk.table === table && fk.refTable === table)
        .map((fk) => fk.column)
        .filter((column) => destColumns.has(column));

      if (selfRefColumns.length > 0 && transformed.length > 0) {
        const migratedIds = new Set(transformed.map((r) => r.id));
        for (const column of selfRefColumns) {
          for (const row of transformed) {
            const value = row[column];
            if (value === null || value === undefined) continue;

            // The second pass can only succeed if the parent is itself migrated.
            // A parent outside scope would make the restoring UPDATE fail, so it is a
            // blocker surfaced here rather than a crash mid-apply.
            if (!migratedIds.has(value)) {
              report.fkIssues.push(
                `${column}=${String(value)} on row ${String(row.id)} points at a ${table} row outside the migration scope`,
              );
              continue;
            }
            if (pk.length === 0) {
              report.fkIssues.push(`${table} has no primary key; cannot restore ${column} in a second pass`);
              continue;
            }
            deferredSelfRefs.push({
              table,
              column,
              key: Object.fromEntries(pk.map((c) => [c, row[c]])),
              value,
            });
            report.deferredSelfRefs += 1;
            row[column] = null; // inserted as NULL, restored after the table is complete
          }
        }
      }
      if (pk.length > 0 && transformed.length > 0) {
        const values = transformed.map((r) => pk.map((c) => r[c]));
        const conditions = values
          .map((_, i) => `(${pk.map((_, j) => `$${i * pk.length + j + 1}`).join(",")})`)
          .join(",");
        const existing = await dest.query(
          `select ${pk.map((c) => `"${c}"`).join(",")} from "${table}" where (${pk.map((c) => `"${c}"`).join(",")}) in (${conditions})`,
          values.flat(),
        );
        for (const hit of existing.rows) report.pkCollisions.push(JSON.stringify(hit));
      }

      // Unique-constraint collisions against the destination.
      for (const cols of destSchema.uniques.get(table) ?? []) {
        if (pk.length && cols.join(",") === pk.join(",")) continue;
        const usable = transformed.filter((r) => cols.every((c) => r[c] !== null && r[c] !== undefined));
        if (usable.length === 0) continue;
        const values = usable.map((r) => cols.map((c) => r[c]));
        const conditions = values
          .map((_, i) => `(${cols.map((_, j) => `$${i * cols.length + j + 1}`).join(",")})`)
          .join(",");
        const existing = await dest.query(
          `select ${cols.map((c) => `"${c}"`).join(",")} from "${table}" where (${cols.map((c) => `"${c}"`).join(",")}) in (${conditions})`,
          values.flat(),
        );
        for (const hit of existing.rows) report.uniqueCollisions.push(`${cols.join("+")}: ${JSON.stringify(hit)}`);
      }

      report.inserts = transformed.length;
      reports.push(report);
      plan.push({ table, columns: destSchema.columns.get(table) ?? [], rows: transformed });
    }

    // ---- report --------------------------------------------------------------------
    console.info("\n--- PER-TABLE PLAN ---");
    const header = [
      "TABLE".padEnd(38),
      "SRC".padStart(5),
      "INS".padStart(5),
      "XFM".padStart(5),
      "SKIP".padStart(5),
      "EVT".padStart(5),
      "ORG".padStart(4),
      "USR".padStart(5),
      "NULL".padStart(5),
      "RCVR".padStart(5),
      "R2".padStart(3),
      "PK!".padStart(4),
      "UQ!".padStart(4),
      "FK!".padStart(4),
    ].join(" ");
    console.info("  " + header);
    console.info("  " + "-".repeat(header.length));
    for (const r of reports.filter((r) => r.sourceRows > 0)) {
      console.info(
        "  " +
          [
            r.table.padEnd(38),
            String(r.sourceRows).padStart(5),
            String(r.inserts).padStart(5),
            String(r.transforms).padStart(5),
            String(r.skips).padStart(5),
            String(r.eventRemaps).padStart(5),
            String(r.orgRemaps).padStart(4),
            String(r.userRemaps).padStart(5),
            String(r.nullSubstitutions).padStart(5),
            String(r.ownershipRecoveries).padStart(5),
            String(r.r2Rekeys).padStart(3),
            String(r.pkCollisions.length).padStart(4),
            String(r.uniqueCollisions.length).padStart(4),
            String(r.fkIssues.length).padStart(4),
          ].join(" "),
      );
      if (r.droppedColumns.length > 0) {
        console.info(`      dropped column(s): ${r.droppedColumns.join(", ")}`);
      }
      for (const issue of r.fkIssues) console.info(`      FK ISSUE: ${issue}`);
      for (const c of r.pkCollisions) console.info(`      PK COLLISION: ${c}`);
      for (const c of r.uniqueCollisions) console.info(`      UNIQUE COLLISION: ${c}`);
    }

    const populated = reports.filter((r) => r.sourceRows > 0);
    const totals = populated.reduce(
      (acc, r) => ({
        source: acc.source + r.sourceRows,
        inserts: acc.inserts + r.inserts,
        transforms: acc.transforms + r.transforms,
        skips: acc.skips + r.skips,
        userRemaps: acc.userRemaps + r.userRemaps,
        nulls: acc.nulls + r.nullSubstitutions,
        recoveries: acc.recoveries + r.ownershipRecoveries,
        eventRemaps: acc.eventRemaps + r.eventRemaps,
        orgRemaps: acc.orgRemaps + r.orgRemaps,
        r2: acc.r2 + r.r2Rekeys,
        pk: acc.pk + r.pkCollisions.length,
        uq: acc.uq + r.uniqueCollisions.length,
        fk: acc.fk + r.fkIssues.length,
      }),
      { source: 0, inserts: 0, transforms: 0, skips: 0, userRemaps: 0, nulls: 0, recoveries: 0, eventRemaps: 0, orgRemaps: 0, r2: 0, pk: 0, uq: 0, fk: 0 },
    );

    console.info("\n--- TOTALS ---");
    console.info(`  populated source tables : ${populated.length}`);
    console.info(`  TOTAL SOURCE ROWS       : ${totals.source}`);
    console.info(`  EXPECTED INSERTED       : ${totals.inserts}`);
    console.info(`  EXPECTED TRANSFORMED    : ${totals.transforms}`);
    console.info(`  EXPECTED SKIPPED        : ${totals.skips}`);
    console.info(`  event id remaps         : ${totals.eventRemaps}`);
    console.info(`  org id remaps           : ${totals.orgRemaps}`);
    console.info(`  user id remaps          : ${totals.userRemaps}`);
    console.info(`  null substitutions      : ${totals.nulls}`);
  console.info(`  ownership recoveries    : ${totals.recoveries}  (john.smith timeline items -> Ali)`);
    console.info(`  R2 key rewrites         : ${totals.r2}`);
    console.info(`  PK / UNIQUE / FK issues : ${totals.pk} / ${totals.uq} / ${totals.fk}`);

    if (unknownUsers.size > 0) {
      console.info("\n  UNMAPPED USER REFERENCES (blocking):");
      for (const u of unknownUsers) console.info(`    ${u}`);
    }

    console.info("\n--- SELF-REFERENCING FK SECOND PASS ---");
    if (deferredSelfRefs.length === 0) {
      console.info("  none: no in-scope row carries a self-referencing foreign key value.");
    } else {
      const byColumn = new Map<string, DeferredSelfRef[]>();
      for (const d of deferredSelfRefs) {
        const k = `${d.table}.${d.column}`;
        byColumn.set(k, [...(byColumn.get(k) ?? []), d]);
      }
      for (const [key, list] of byColumn) {
        const table = list[0]!.table;
        const planned = plan.find((p) => p.table === table);
        const migratedIds = new Set((planned?.rows ?? []).map((r) => r.id));
        const distinctParents = new Set(list.map((d) => d.value));
        const resolvable = list.filter((d) => migratedIds.has(d.value)).length;
        const sourceNonNull = Number(
          (
            await source.query(
              `select count(*)::int as n from "${table}" t where ${scopes.get(table)!.predicate} and t."${list[0]!.column}" is not null`,
            )
          ).rows[0].n,
        );
        console.info(`  ${key}`);
        console.info(`    source rows with a non-null value : ${sourceNonNull}`);
        console.info(`    values held back for pass 2       : ${list.length}`);
        console.info(`    distinct parents referenced       : ${distinctParents.size}`);
        console.info(`    parents inside migration scope    : ${resolvable} / ${list.length}`);
        console.info(`    every relationship accounted for  : ${sourceNonNull === list.length && resolvable === list.length ? "YES" : "NO"}`);
        if (sourceNonNull !== list.length) {
          console.info(`    MISMATCH: ${sourceNonNull - list.length} source relationship(s) were not captured`);
        }
      }
      console.info("  Pass 1 inserts these columns as NULL; pass 2 restores the exact source");
      console.info("  values by primary key, inside the same transaction. The FK stays enforced.");
    }

    const selfRefMismatch = await (async () => {
      for (const table of new Set(deferredSelfRefs.map((d) => d.table))) {
        for (const column of new Set(deferredSelfRefs.filter((d) => d.table === table).map((d) => d.column))) {
          const captured = deferredSelfRefs.filter((d) => d.table === table && d.column === column).length;
          const inSource = Number(
            (
              await source.query(
                `select count(*)::int as n from "${table}" t where ${scopes.get(table)!.predicate} and t."${column}" is not null`,
              )
            ).rows[0].n,
          );
          if (captured !== inSource) return `${table}.${column}: captured ${captured} of ${inSource}`;
        }
      }
      return null;
    })();


    const blockers: string[] = [];
    if (safetyFailed.length > 0) blockers.push(`${safetyFailed.length} destination safety check(s) failed`);
    if (totals.pk > 0) blockers.push(`${totals.pk} primary key collision(s)`);
    if (totals.uq > 0) blockers.push(`${totals.uq} unique constraint collision(s)`);
    if (totals.fk > 0) blockers.push(`${totals.fk} foreign key issue(s)`);
    if (unknownUsers.size > 0) blockers.push(`${unknownUsers.size} unmapped user reference(s)`);
    if (selfRefMismatch) blockers.push(`self-referencing FK capture incomplete (${selfRefMismatch})`);

    // ---- second-pass validation ----------------------------------------------------
    console.info("\n--- VERDICT ---");
    if (blockers.length === 0) {
      console.info("  READY FOR APPLY");
    } else {
      console.info("  NOT READY");
      for (const b of blockers) console.info(`    - ${b}`);
    }

    if (!apply) {
      console.info("\n  Dry run complete. Nothing was written. Re-run with --apply to commit.");
      return;
    }
    if (blockers.length > 0) {
      throw new Error("Refusing to apply: the dry run reported blockers.");
    }

    // ---- apply ---------------------------------------------------------------------
    console.info("\n--- APPLYING (single transaction) ---");
    await dest.query("begin");
    try {
      // Deliberately NOT issuing `set constraints all deferred`. Prisma emits these
      // foreign keys as NOT DEFERRABLE, so that statement is a silent no-op and gives a
      // false sense that ordering is handled. Ordering is handled explicitly instead:
      // topological order across tables, and the two-pass restore below within a table.
      let inserted = 0;
      for (const { table, columns, rows } of plan) {
        if (rows.length === 0) continue;
        const columnMap = new Map(columns.map((c) => [c.name, c]));
        const names = columns.filter((c) => rows[0]![c.name] !== undefined).map((c) => c.name);
        for (const row of rows) {
          const params = names.map((n) => bindValue(columnMap.get(n)!, row[n]));
          const placeholders = names.map((n, i) => `$${i + 1}::${castFor(columnMap.get(n)!)}`);
          await dest.query(
            `insert into "${table}" (${names.map((n) => `"${n}"`).join(",")}) values (${placeholders.join(",")})`,
            params,
          );
          inserted += 1;
        }
        console.info(`  inserted ${String(rows.length).padStart(5)}  ${table}`);
      }

      // ---- pass 2: restore self-referencing values --------------------------------
      // Every row of every table now exists, so each parent is present and the FK
      // check on these updates is satisfied. Still inside the same transaction: a
      // failure here rolls back the inserts above along with everything else.
      if (deferredSelfRefs.length > 0) {
        let restored = 0;
        for (const deferred of deferredSelfRefs) {
          const columnMap = new Map((destSchema.columns.get(deferred.table) ?? []).map((c) => [c.name, c]));
          const keyNames = Object.keys(deferred.key);
          const setCast = castFor(columnMap.get(deferred.column)!);
          const whereClause = keyNames
            .map((n, i) => `"${n}" = $${i + 2}::${castFor(columnMap.get(n)!)}`)
            .join(" and ");
          const result = await dest.query(
            `update "${deferred.table}" set "${deferred.column}" = $1::${setCast} where ${whereClause}`,
            [deferred.value, ...keyNames.map((n) => deferred.key[n])],
          );
          if (result.rowCount !== 1) {
            throw new Error(
              `second pass expected to update exactly 1 row of ${deferred.table} (${deferred.column}), updated ${result.rowCount}`,
            );
          }
          restored += 1;
        }
        console.info(`  restored ${String(restored).padStart(5)}  self-referencing value(s) in pass 2`);

        // Prove pass 2 actually landed before committing.
        for (const table of new Set(deferredSelfRefs.map((d) => d.table))) {
          for (const column of new Set(
            deferredSelfRefs.filter((d) => d.table === table).map((d) => d.column),
          )) {
            const expected = deferredSelfRefs.filter((d) => d.table === table && d.column === column).length;
            const actual = Number(
              (
                await dest.query(
                  `select count(*)::int as n from "${table}" where "eventId" = $1 and "${column}" is not null`,
                  [DEST_EVENT_ID],
                )
              ).rows[0].n,
            );
            if (actual !== expected) {
              throw new Error(
                `post-restore check failed: ${table}.${column} has ${actual} non-null value(s), expected ${expected}`,
              );
            }
            console.info(`  verified ${String(actual).padStart(5)}  ${table}.${column} restored`);
          }
        }
      }

      await dest.query("commit");
      console.info(`\n  COMMITTED: ${inserted} row(s) across ${plan.filter((p) => p.rows.length > 0).length} table(s).`);
    } catch (error) {
      await dest.query("rollback");
      console.error("\n  ROLLED BACK. No rows were written.");
      throw error;
    }
  } finally {
    await source.end();
    await dest.end();
  }
}

main().catch((error: unknown) => {
  console.error(`\nmigration failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
