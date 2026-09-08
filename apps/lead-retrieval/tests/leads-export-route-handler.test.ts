/**
 * Thin route-level tests for handleLeadsExportGet — auth failure propagation and CSV response headers.
 * Scope rules are covered in leads-export-resolve-scope.test.ts + evaluateLeadsExportScopePure tests.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NextResponse } from "next/server";
import { handleLeadsExportGet } from "../lib/server/leads/leadsExportGetHandler";
import type { ExportScope } from "../lib/server/leads/leadsExportTypes";

const exportUrl = "http://localhost/api/admin/leads/export?companyId=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

describe("handleLeadsExportGet (admin leads export route core)", () => {
  it("returns 401 when resolveApiSession throws a Response (unauthenticated)", async () => {
    const res = await handleLeadsExportGet(new Request(exportUrl), {
      resolveApiSession: async () => {
        throw NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      },
      resolveLeadsExportScope: async () => {
        throw new Error("resolveLeadsExportScope should not run when auth fails");
      },
      runLeadsExportCsv: async () => {
        throw new Error("runLeadsExportCsv should not run when auth fails");
      }
    });
    assert.equal(res.status, 401);
    const body = JSON.parse(await res.text()) as { error: string };
    assert.equal(body.error, "Unauthorized");
  });

  it("returns scope rejection Response unchanged (e.g. 403)", async () => {
    const forbidden = new Response(JSON.stringify({ error: "Selected event is outside organizer scope." }), {
      status: 403,
      headers: { "Content-Type": "application/json" }
    });
    const res = await handleLeadsExportGet(new Request(`${exportUrl}&eventId=bad`), {
      resolveApiSession: async () => ({
        userId: "u",
        companyId: "",
        role: "event_organizer"
      }),
      resolveLeadsExportScope: async () => forbidden,
      runLeadsExportCsv: async () => ({ csv: "", filename: "", error: null })
    });
    assert.equal(res.status, 403);
    const body = JSON.parse(await res.text()) as { error: string };
    assert.match(body.error, /organizer scope/i);
  });

  it("returns CSV with text/csv and Content-Disposition on success", async () => {
    const scope: ExportScope = {
      kind: "platform",
      companyId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      eventId: null
    };
    const res = await handleLeadsExportGet(new Request(exportUrl), {
      resolveApiSession: async () => ({
        userId: "u",
        companyId: "",
        role: "platform_admin"
      }),
      resolveLeadsExportScope: async () => scope,
      runLeadsExportCsv: async () => ({
        csv: "id,full_name\n",
        filename: 'leads-export-company-aaaaaaaa-2026-01-01.csv',
        error: null
      })
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("Content-Type"), "text/csv; charset=utf-8");
    const cd = res.headers.get("Content-Disposition");
    assert.ok(cd);
    assert.match(cd!, /attachment/);
    assert.match(cd!, /leads-export-company-aaaaaaaa/);
    assert.equal(await res.text(), "id,full_name\n");
  });

  it("returns 500 JSON when runLeadsExportCsv reports error", async () => {
    const scope: ExportScope = {
      kind: "platform",
      companyId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      eventId: null
    };
    const res = await handleLeadsExportGet(new Request(exportUrl), {
      resolveApiSession: async () => ({
        userId: "u",
        companyId: "",
        role: "platform_admin"
      }),
      resolveLeadsExportScope: async () => scope,
      runLeadsExportCsv: async () => ({
        csv: "",
        filename: "",
        error: "db down"
      })
    });
    assert.equal(res.status, 500);
    const body = JSON.parse(await res.text()) as { error: string };
    assert.equal(body.error, "db down");
  });
});
