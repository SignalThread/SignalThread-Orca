import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadWorkflowTemplatesForList } from "../lib/exhibitor/workflows/load-workflow-templates";

type FakeSupabase = Parameters<typeof loadWorkflowTemplatesForList>[0];

/**
 * The loader uses a small, well-defined call surface:
 *   - workflow_templates: select.eq("company_id", ...).[or(...)?].order(...).order(...)
 *   - workflow_steps:     select.in("template_id", ids).order("step_index", asc)
 *   - workflow_runs:      select.in("template_id", ids).order("created_at", desc).limit(1000)
 *
 * The fake below implements exactly that surface and records the `.or()` filter so we
 * can assert event-pin behavior.
 */

type Row = Record<string, unknown>;

type CapturedWorkflowListQueries = {
  orClauses: string[];
  selects: string[];
};

function buildFake(tables: Record<string, Row[]>, captured: CapturedWorkflowListQueries) {
  return {
    from(table: string) {
      let rows = (tables[table] ?? []).slice();
      const obj: Record<string, unknown> = {};

      obj.select = (cols: string) => {
        captured.selects.push(`${table}:${cols}`);
        return obj;
      };
      obj.eq = (col: string, val: unknown) => {
        rows = rows.filter((r) => r[col] === val);
        return obj;
      };
      obj.is = (col: string, val: unknown) => {
        rows = rows.filter((r) => {
          if (val === null) return r[col] === null || r[col] === undefined;
          return r[col] === val;
        });
        return obj;
      };
      obj.or = (clause: string) => {
        captured.orClauses.push(clause);
        // Parse the form "event_id.is.null,event_id.eq.<id>" used by the loader.
        const parts = clause.split(",");
        const allowedEqIds = new Set<string>();
        let allowNull = false;
        for (const part of parts) {
          if (/event_id\.is\.null/.test(part)) allowNull = true;
          const eqMatch = part.match(/event_id\.eq\.([^,\s]+)/);
          if (eqMatch) allowedEqIds.add(eqMatch[1]);
        }
        rows = rows.filter((r) => {
          if (r.event_id == null && allowNull) return true;
          if (typeof r.event_id === "string" && allowedEqIds.has(r.event_id)) return true;
          return false;
        });
        return obj;
      };
      obj.in = (col: string, vals: unknown[]) => {
        rows = rows.filter((r) => (vals as unknown[]).includes(r[col]));
        return obj;
      };
      obj.order = (col: string, opts: { ascending: boolean }) => {
        rows = rows.slice().sort((a, b) => {
          const av = String(a[col] ?? "");
          const bv = String(b[col] ?? "");
          if (av === bv) return 0;
          return opts.ascending ? (av < bv ? -1 : 1) : av > bv ? -1 : 1;
        });
        return obj;
      };
      obj.limit = (n: number) => {
        rows = rows.slice(0, n);
        return obj;
      };
      // Resolves the chain when awaited.
      obj.then = (onFulfilled: (v: { data: unknown; error: null }) => unknown) =>
        Promise.resolve(onFulfilled({ data: rows, error: null }));
      return obj;
    }
  } as unknown as FakeSupabase;
}

const COMPANY_A = "co-a";
const COMPANY_B = "co-b";
const EVENT_1 = "ev-1";
const EVENT_2 = "ev-2";

function seed() {
  return {
    workflow_templates: [
      {
        id: "tpl-a-1",
        company_id: COMPANY_A,
        name: "Newest unpinned",
        description: null,
        trigger_event: "lead_captured",
        scope: "any",
        event_id: null,
        is_enabled: true,
        version: 1,
        created_at: "2026-05-01T00:00:00.000Z",
        updated_at: "2026-05-12T10:00:00.000Z"
      },
      {
        id: "tpl-a-2",
        company_id: COMPANY_A,
        name: "Pinned to ev-1",
        description: "drafty",
        trigger_event: "lead_captured",
        scope: "event",
        event_id: EVENT_1,
        is_enabled: false,
        version: 1,
        created_at: "2026-04-01T00:00:00.000Z",
        updated_at: "2026-04-10T00:00:00.000Z"
      },
      {
        id: "tpl-a-3",
        company_id: COMPANY_A,
        name: "Pinned to ev-2",
        description: null,
        trigger_event: "lead_captured",
        scope: "event",
        event_id: EVENT_2,
        is_enabled: true,
        version: 1,
        created_at: "2026-03-01T00:00:00.000Z",
        updated_at: "2026-03-10T00:00:00.000Z"
      },
      {
        // Different company — must never leak through.
        id: "tpl-b-1",
        company_id: COMPANY_B,
        name: "Other company",
        description: null,
        trigger_event: "lead_captured",
        scope: "any",
        event_id: null,
        is_enabled: true,
        version: 1,
        created_at: "2026-05-01T00:00:00.000Z",
        updated_at: "2026-05-13T00:00:00.000Z"
      }
    ],
    workflow_steps: [
      { template_id: "tpl-a-1", step_index: 0, step_type: "enrich_lead", step_key: "enrich", requires_approval: false },
      { template_id: "tpl-a-1", step_index: 1, step_type: "compose_campaign_draft", step_key: "compose", requires_approval: true },
      { template_id: "tpl-a-2", step_index: 0, step_type: "enrich_lead", step_key: "enrich", requires_approval: false }
      // tpl-a-3 intentionally has no steps to verify the empty-steps fallback.
    ],
    workflow_runs: [
      { template_id: "tpl-a-1", created_at: "2026-05-13T01:00:00.000Z" },
      { template_id: "tpl-a-1", created_at: "2026-05-10T01:00:00.000Z" },
      { template_id: "tpl-a-2", created_at: "2026-05-09T01:00:00.000Z" }
      // tpl-a-3 has no runs → last_run_at should be null.
    ]
  };
}

describe("loadWorkflowTemplatesForList — company scoping", () => {
  it("returns only templates for the requested company_id (never leaks across companies)", async () => {
    const captured = { orClauses: [] as string[], selects: [] as string[] };
    const supabase = buildFake(seed(), captured);
    const rows = await loadWorkflowTemplatesForList(supabase, {
      companyId: COMPANY_A,
      activeEventId: null
    });
    assert.equal(
      rows.every((r) => r.id.startsWith("tpl-a-")),
      true,
      "no template from company B should appear"
    );
    assert.equal(rows.length, 3);
    assert.equal(captured.orClauses.length, 0, "no event-pin filter when activeEventId is null");
  });

  it("returns an empty list when companyId is blank/whitespace (defense-in-depth)", async () => {
    const supabase = buildFake(seed(), { orClauses: [], selects: [] });
    const empty = await loadWorkflowTemplatesForList(supabase, {
      companyId: "   ",
      activeEventId: null
    });
    assert.deepEqual(empty, []);
  });
});

describe("loadWorkflowTemplatesForList — event pin filter", () => {
  it("when activeEventId is set, returns unpinned templates AND templates pinned to that event", async () => {
    const captured = { orClauses: [] as string[], selects: [] as string[] };
    const supabase = buildFake(seed(), captured);
    const rows = await loadWorkflowTemplatesForList(supabase, {
      companyId: COMPANY_A,
      activeEventId: EVENT_1
    });
    const ids = rows.map((r) => r.id).sort();
    assert.deepEqual(ids, ["tpl-a-1", "tpl-a-2"]);
    assert.equal(captured.orClauses.length, 1);
    assert.match(captured.orClauses[0], /event_id\.is\.null/);
    assert.match(captured.orClauses[0], new RegExp(`event_id\\.eq\\.${EVENT_1}`));
  });

  it("excludes templates pinned to a different event", async () => {
    const supabase = buildFake(seed(), { orClauses: [], selects: [] });
    const rows = await loadWorkflowTemplatesForList(supabase, {
      companyId: COMPANY_A,
      activeEventId: EVENT_2
    });
    const ids = rows.map((r) => r.id).sort();
    assert.deepEqual(ids, ["tpl-a-1", "tpl-a-3"]);
  });

  it("does not request archived_at, so missing archive columns cannot blank the saved workflow list", async () => {
    const captured = { orClauses: [] as string[], selects: [] as string[] };
    const supabase = buildFake(seed(), captured);
    const rows = await loadWorkflowTemplatesForList(supabase, {
      companyId: COMPANY_A,
      activeEventId: EVENT_1
    });
    assert.deepEqual(rows.map((r) => r.id).sort(), ["tpl-a-1", "tpl-a-2"]);
    const templateSelect = captured.selects.find((entry) => entry.startsWith("workflow_templates:"));
    assert.ok(templateSelect, "workflow_templates should be queried");
    assert.doesNotMatch(templateSelect, /archived_at/);
  });
});

describe("loadWorkflowTemplatesForList — ordering & joins", () => {
  it("orders by updated_at desc then created_at desc", async () => {
    const supabase = buildFake(seed(), { orClauses: [], selects: [] });
    const rows = await loadWorkflowTemplatesForList(supabase, {
      companyId: COMPANY_A,
      activeEventId: null
    });
    assert.deepEqual(
      rows.map((r) => r.id),
      ["tpl-a-1", "tpl-a-2", "tpl-a-3"]
    );
  });

  it("attaches steps ordered by step_index ascending; missing steps yields an empty array", async () => {
    const supabase = buildFake(seed(), { orClauses: [], selects: [] });
    const rows = await loadWorkflowTemplatesForList(supabase, {
      companyId: COMPANY_A,
      activeEventId: null
    });
    const a1 = rows.find((r) => r.id === "tpl-a-1")!;
    assert.deepEqual(
      a1.steps.map((s) => [s.step_index, s.step_type]),
      [
        [0, "enrich_lead"],
        [1, "compose_campaign_draft"]
      ]
    );
    assert.equal(a1.steps.some((s) => s.requires_approval), true);

    const a3 = rows.find((r) => r.id === "tpl-a-3")!;
    assert.deepEqual(a3.steps, []);
  });

  it("attaches last_run_at as the most recent run for each template; null when no runs exist", async () => {
    const supabase = buildFake(seed(), { orClauses: [], selects: [] });
    const rows = await loadWorkflowTemplatesForList(supabase, {
      companyId: COMPANY_A,
      activeEventId: null
    });
    const a1 = rows.find((r) => r.id === "tpl-a-1")!;
    assert.equal(a1.last_run_at, "2026-05-13T01:00:00.000Z");
    const a2 = rows.find((r) => r.id === "tpl-a-2")!;
    assert.equal(a2.last_run_at, "2026-05-09T01:00:00.000Z");
    const a3 = rows.find((r) => r.id === "tpl-a-3")!;
    assert.equal(a3.last_run_at, null);
  });

  it("uses failed workflow runs for last_run_at so CRM failures do not appear as Never", async () => {
    const data = seed() as Record<string, Row[]>;
    data.workflow_runs.push({
      template_id: "tpl-a-3",
      created_at: "2026-05-14T01:00:00.000Z",
      status: "failed"
    });
    const supabase = buildFake(data, { orClauses: [], selects: [] });
    const rows = await loadWorkflowTemplatesForList(supabase, {
      companyId: COMPANY_A,
      activeEventId: null
    });

    const a3 = rows.find((r) => r.id === "tpl-a-3")!;
    assert.equal(a3.last_run_at, "2026-05-14T01:00:00.000Z");
  });
});
