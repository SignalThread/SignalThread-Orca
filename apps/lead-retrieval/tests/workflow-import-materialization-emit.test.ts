import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { describe, it } from "node:test";

const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve("server-only");
(require.cache as Record<string, NodeJS.Module | undefined>)[serverOnlyPath] = {
  id: serverOnlyPath,
  path: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  children: [],
  paths: [],
  exports: {},
  isPreloading: false,
  require,
  parent: null,
} as unknown as NodeJS.Module;

async function loadMaterializer() {
  return import("@/lib/server/import-wizard/publish-leads-materialization");
}

class FakeSupabaseQuery {
  constructor(
    private readonly table: string,
    private readonly insertedLeadRows: Array<Record<string, unknown>>
  ) {}

  select(_columns: string) {
    return this;
  }

  eq(_column: string, _value: unknown) {
    return this;
  }

  insert(row: Record<string, unknown>) {
    if (this.table === "leads") {
      this.insertedLeadRows.push(row);
    }
    return this;
  }

  update(_patch: Record<string, unknown>) {
    return this;
  }

  upsert(_row: Record<string, unknown>, _opts?: Record<string, unknown>) {
    return Promise.resolve({ error: null });
  }

  maybeSingle() {
    if (this.table === "import_batches") {
      return Promise.resolve({
        data: { id: "batch-1", company_id: "company-1", status: "published" },
        error: null,
      });
    }
    if (this.table === "leads") {
      return Promise.resolve({ data: { id: "lead-1" }, error: null });
    }
    return Promise.resolve({ data: null, error: null });
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) {
    const value =
      this.table === "import_batch_row_briefings"
        ? { data: [], error: null }
        : { data: null, error: null };
    return Promise.resolve(value).then(onfulfilled, onrejected);
  }
}

function fakeAdminClient(insertedLeadRows: Array<Record<string, unknown>>) {
  return {
    from(table: string) {
      return new FakeSupabaseQuery(table, insertedLeadRows);
    },
  };
}

describe("workflow emission from import/materialized lead creation", () => {
  it("persists only identity-valid names from full-name and component-mapped import batches", async () => {
    const { materializeImportedLeadsFromBatch } = await loadMaterializer();
    const insertedLeadRows: Array<Record<string, unknown>> = [];
    const rows = [
      ["Sarah Meister", "", "", "Acme"],
      ["", "Sarah", "Meister", "Acme"],
      ["", "Sarah", "", "Acme"],
      ["", "", "Meister", "Acme"],
      ["Maria de la Cruz", "", "", "Acme"],
      ["Ana-María van der Meer", "", "", "Acme"],
      ["  李   小龍  ", "", "", "Acme"],
      ["", "  Sarah  ", "  Meister  ", "Acme"],
    ];

    await materializeImportedLeadsFromBatch(
      { batchId: "batch-1", companyId: "company-1", ownerUserId: "user-1", eventId: "event-1" },
      {
        createAdminClientFn: () => fakeAdminClient(insertedLeadRows) as never,
        getFieldMappingStateForBatchWithAdminFn: async () => ({
          csv_headers: ["Full Name", "First Name", "Last Name", "Company"],
          preview_rows: [],
          selections: { "0": "full_name", "1": "first_name", "2": "last_name", "3": "company_text" },
          custom_field_definitions: {},
        }),
        getBatchRowsForBatchWithAdminFn: async () =>
          rows.map((cells, index) => ({
            id: `row-${index + 1}`,
            rowIndex: index,
            cells,
            wizardEnrichmentNormalized: null,
          })),
        attemptLeadCapturedWorkflowEmitFn: async () => ({ status: "queued", runIds: [] }),
      }
    );

    assert.deepEqual(
      insertedLeadRows.map((row) => row.full_name),
      [
        "Sarah Meister",
        "Sarah Meister",
        "Maria de la Cruz",
        "Ana-María van der Meer",
        "李 小龍",
        "Sarah Meister",
      ]
    );
  });

  it("materializes imported leads as unassessed and emits lead_captured with event scope", async () => {
    const { materializeImportedLeadsFromBatch } = await loadMaterializer();
    const insertedLeadRows: Array<Record<string, unknown>> = [];
    const emitted: Array<Record<string, unknown>> = [];

    const result = await materializeImportedLeadsFromBatch(
      {
        batchId: "batch-1",
        companyId: "company-1",
        ownerUserId: "user-1",
        eventId: "event-1",
      },
      {
        createAdminClientFn: () => fakeAdminClient(insertedLeadRows) as never,
        getFieldMappingStateForBatchWithAdminFn: async () => ({
          csv_headers: ["Full name", "Email", "Company"],
          preview_rows: [
            { csvColumn: "Full name", cells: ["Workflow Test"] },
            { csvColumn: "Email", cells: ["workflow@example.com"] },
            { csvColumn: "Company", cells: ["SignalThread"] },
          ],
          selections: { "0": "full_name", "1": "email", "2": "company_text" },
          custom_field_definitions: {},
        }),
        getBatchRowsForBatchWithAdminFn: async () => [
          {
            id: "row-1",
            rowIndex: 0,
            cells: ["Workflow Test", "workflow@example.com", "SignalThread"],
            wizardEnrichmentNormalized: null,
          },
        ],
        attemptLeadCapturedWorkflowEmitFn: async (input) => {
          emitted.push(input);
          return { status: "queued", runIds: ["run-1"] };
        },
      }
    );

    assert.deepEqual(result, { importedCount: 1, leadIds: ["lead-1"] });
    assert.equal(insertedLeadRows.length, 1);
    assert.equal(insertedLeadRows[0]!.event_id, "event-1");
    assert.equal(insertedLeadRows[0]!.temperature, null);
    assert.equal(insertedLeadRows[0]!.rating, 0);
    assert.equal(insertedLeadRows[0]!.status, "new");
    assert.deepEqual(emitted, [
      {
        leadId: "lead-1",
        companyId: "company-1",
        eventId: "event-1",
        source: "csv_publish",
        logContext: "lib/server/import-wizard/publish-leads-materialization:csv_publish"
      }
    ]);
  });

  it("keeps import materialization successful when workflow emit fails", async () => {
    const { materializeImportedLeadsFromBatch } = await loadMaterializer();
    const insertedLeadRows: Array<Record<string, unknown>> = [];

    const result = await materializeImportedLeadsFromBatch(
      {
        batchId: "batch-1",
        companyId: "company-1",
        ownerUserId: "user-1",
        eventId: "event-1",
      },
      {
        createAdminClientFn: () => fakeAdminClient(insertedLeadRows) as never,
        getFieldMappingStateForBatchWithAdminFn: async () => ({
          csv_headers: ["Full name", "Email", "Company"],
          preview_rows: [
            { csvColumn: "Full name", cells: ["Workflow Test"] },
            { csvColumn: "Email", cells: ["workflow@example.com"] },
            { csvColumn: "Company", cells: ["SignalThread"] },
          ],
          selections: { "0": "full_name", "1": "email", "2": "company_text" },
          custom_field_definitions: {},
        }),
        getBatchRowsForBatchWithAdminFn: async () => [
          {
            id: "row-1",
            rowIndex: 0,
            cells: ["Workflow Test", "workflow@example.com", "SignalThread"],
            wizardEnrichmentNormalized: null,
          },
        ],
        attemptLeadCapturedWorkflowEmitFn: async () => {
          throw new Error("workflow emit unavailable");
        },
      }
    );

    assert.deepEqual(result, { importedCount: 1, leadIds: ["lead-1"] });
    assert.equal(insertedLeadRows.length, 1);
  });
});
