import { NextResponse } from "next/server";
import { resolveApiSession } from "@/lib/auth/resolveApiSession";
import { getBatchByIdForCompany } from "@/lib/server/import-wizard/import-batch-service";
import {
  getFieldMappingStateForBatch,
  upsertFieldMappingStateForBatch,
  type FieldMappingPersistPayload,
} from "@/lib/server/import-wizard/field-mapping-state";
import { MAX_CUSTOM_FIELD_DEFINITIONS } from "@/lib/import-wizard/custom-field-mapping";

type RouteCtx = { params: Promise<{ batchId: string }> };

function mapFieldMappingPersistError(err: unknown): { status: number; body: { error: string; code: string } } {
  const msg = err instanceof Error ? err.message : String(err);
  const supabaseCode =
    typeof err === "object" && err !== null && "supabaseCode" in err
      ? String((err as { supabaseCode?: string }).supabaseCode ?? "")
      : "";
  if (msg === "batch_not_found" || msg === "batch_not_draft") {
    return { status: 409, body: { error: "Batch is not editable.", code: "batch_not_editable" } };
  }
  if (
    supabaseCode === "42501" ||
    /permission denied|row-level security|RLS|violates row-level security/i.test(msg)
  ) {
    return {
      status: 403,
      body: { error: "Not allowed to save field mapping for this batch.", code: "permission_denied" },
    };
  }
  return { status: 500, body: { error: "Could not save field mapping.", code: "persist_failed" } };
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function isSelections(v: unknown): v is Record<string, string> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  return Object.values(v).every((x) => typeof x === "string");
}

function isPreviewRows(v: unknown): v is FieldMappingPersistPayload["preview_rows"] {
  if (!Array.isArray(v)) return false;
  for (const row of v) {
    if (typeof row !== "object" || row === null) return false;
    const r = row as Record<string, unknown>;
    if (typeof r.csvColumn !== "string" || !Array.isArray(r.cells)) return false;
    if (!r.cells.every((c) => typeof c === "string")) return false;
  }
  return true;
}

const MAX_STAGED_ROWS = 100_000;

function isStagedRows(v: unknown): v is string[][] {
  if (!Array.isArray(v)) return false;
  if (v.length > MAX_STAGED_ROWS) return false;
  for (const row of v) {
    if (!Array.isArray(row)) return false;
    for (const c of row) {
      if (typeof c !== "string") return false;
    }
  }
  return true;
}

function isCustomFieldDefinitions(v: unknown): v is FieldMappingPersistPayload["custom_field_definitions"] {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const keys = Object.keys(v);
  if (keys.length > MAX_CUSTOM_FIELD_DEFINITIONS) return false;
  for (const k of keys) {
    if (!/^[a-z0-9_]{1,64}$/i.test(k)) return false;
    const row = (v as Record<string, unknown>)[k];
    if (typeof row !== "object" || row === null) return false;
    if (typeof (row as { label?: unknown }).label !== "string") return false;
  }
  return true;
}

export async function GET(request: Request, ctx: RouteCtx) {
  try {
    const session = await resolveApiSession(request);
    if (String(session.role ?? "").toLowerCase() !== "exhibitor_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const companyId = String(session.companyId ?? "").trim();
    if (!companyId) {
      return NextResponse.json({ error: "Missing exhibitor scope." }, { status: 400 });
    }

    const { batchId } = await ctx.params;
    const id = String(batchId ?? "").trim();
    if (!id) {
      return NextResponse.json({ error: "Missing batch id." }, { status: 400 });
    }

    const batch = await getBatchByIdForCompany(id, companyId);
    if (!batch) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    const state = await getFieldMappingStateForBatch(id);
    return NextResponse.json(state ?? null);
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request, ctx: RouteCtx) {
  try {
    const session = await resolveApiSession(request);
    if (String(session.role ?? "").toLowerCase() !== "exhibitor_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const companyId = String(session.companyId ?? "").trim();
    if (!companyId) {
      return NextResponse.json({ error: "Missing exhibitor scope." }, { status: 400 });
    }

    const { batchId } = await ctx.params;
    const id = String(batchId ?? "").trim();
    if (!id) {
      return NextResponse.json({ error: "Missing batch id." }, { status: 400 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const csv_headers = body.csv_headers;
    const preview_rows = body.preview_rows;
    const selections = body.selections;
    const staged_rows = body.staged_rows;
    const custom_field_definitions = body.custom_field_definitions;
    const source_filename = body.source_filename;

    if (!isStringArray(csv_headers)) {
      return NextResponse.json({ error: "Invalid csv_headers." }, { status: 400 });
    }
    if (!isPreviewRows(preview_rows)) {
      return NextResponse.json({ error: "Invalid preview_rows." }, { status: 400 });
    }
    if (!isSelections(selections)) {
      return NextResponse.json({ error: "Invalid selections." }, { status: 400 });
    }
    if (custom_field_definitions != null && !isCustomFieldDefinitions(custom_field_definitions)) {
      return NextResponse.json({ error: "Invalid custom_field_definitions." }, { status: 400 });
    }
    if (!isStagedRows(staged_rows)) {
      return NextResponse.json({ error: "Invalid staged_rows." }, { status: 400 });
    }

    if (csv_headers.length > 500 || preview_rows.length > 500) {
      return NextResponse.json({ error: "Payload too large." }, { status: 400 });
    }

    if (source_filename != null && typeof source_filename !== "string") {
      return NextResponse.json({ error: "Invalid source_filename." }, { status: 400 });
    }

    try {
      await upsertFieldMappingStateForBatch(
        id,
        companyId,
        {
          csv_headers,
          preview_rows,
          selections,
          staged_rows,
          custom_field_definitions: custom_field_definitions ?? {},
        },
        {
          sourceFilename: typeof source_filename === "string" ? source_filename : undefined,
        }
      );
    } catch (e) {
      const mapped = mapFieldMappingPersistError(e);
      return NextResponse.json(mapped.body, { status: mapped.status });
    }

    const batch = await getBatchByIdForCompany(id, companyId);
    return NextResponse.json({
      ok: true,
      data_revision: batch?.dataRevision ?? 0,
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    return NextResponse.json({ error: "Unexpected error.", code: "unexpected" }, { status: 500 });
  }
}
