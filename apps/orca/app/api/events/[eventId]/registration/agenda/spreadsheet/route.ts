import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { assertEventAccessForUser, EventAccessError } from "@/lib/event-access";
import { importRegistrationAgendaSpreadsheet, RegistrationAgendaError, validateRegistrationAgendaDraft } from "@/lib/registration-agenda";
import { resolveRequestUser } from "@/lib/request-user";

const MAX_BYTES = 5 * 1024 * 1024;
const TARGETS = ["title", "description", "date", "startTime", "endTime", "location", "sessionType", "officialStatus"] as const;
const ALIASES: Record<(typeof TARGETS)[number], string[]> = {
  title: ["title", "session title", "session", "name", "agenda item"],
  description: ["description", "summary", "details"],
  date: ["date", "day", "session date"],
  startTime: ["start time", "start", "begins", "begin time"],
  endTime: ["end time", "end", "ends", "finish time"],
  location: ["location", "room", "venue", "space"],
  sessionType: ["session type", "type", "format"],
  officialStatus: ["official status", "status", "agenda status"],
};

function key(value: string): string { return value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " "); }

function detectedMapping(headers: string[]): Record<string, string> {
  const normalized = new Map(headers.map((header) => [key(header), header]));
  return Object.fromEntries(TARGETS.flatMap((target) => {
    const header = ALIASES[target].map((alias) => normalized.get(alias)).find(Boolean);
    return header ? [[target, header]] : [];
  }));
}

function mappedRows(rows: Record<string, unknown>[], mapping: Record<string, string>) {
  return rows.map((row) => Object.fromEntries(TARGETS.map((target) => [target, mapping[target] ? row[mapping[target]!] : undefined])));
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const auth = await resolveRequestUser(request);
  if ("error" in auth) return NextResponse.json({ error: auth.error.reason }, { status: auth.error.status });
  try {
    await assertEventAccessForUser(eventId, auth.user, "write");
    const form = await request.formData();
    const file = form.get("file");
    const action = form.get("action") === "import" ? "import" : "preview";
    if (!(file instanceof File)) return NextResponse.json({ error: "Spreadsheet file is required" }, { status: 400 });
    if (file.size <= 0 || file.size > MAX_BYTES) return NextResponse.json({ error: "Spreadsheet must be between 1 byte and 5 MB" }, { status: 400 });
    if (!/\.(csv|xlsx|xls)$/i.test(file.name)) return NextResponse.json({ error: "Upload a CSV, XLSX, or XLS spreadsheet" }, { status: 400 });
    let workbook: XLSX.WorkBook;
    try { workbook = XLSX.read(await file.arrayBuffer(), { type: "array" }); }
    catch { return NextResponse.json({ error: "The spreadsheet could not be parsed" }, { status: 400 }); }
    const firstSheet = workbook.SheetNames[0];
    if (!firstSheet) return NextResponse.json({ error: "The spreadsheet has no worksheets" }, { status: 400 });
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[firstSheet]!, { defval: "", raw: false });
    if (rows.length === 0) return NextResponse.json({ error: "The spreadsheet has no data rows" }, { status: 400 });
    if (rows.length > 1000) return NextResponse.json({ error: "Spreadsheet imports are limited to 1,000 rows" }, { status: 400 });
    const headers = Object.keys(rows[0] ?? {});
    const requestedMapping = form.get("mapping");
    let mapping = detectedMapping(headers);
    if (typeof requestedMapping === "string" && requestedMapping.trim()) {
      try { mapping = JSON.parse(requestedMapping) as Record<string, string>; }
      catch { return NextResponse.json({ error: "Column mapping must be valid JSON" }, { status: 400 }); }
    }
    const normalizedRows = mappedRows(rows, mapping);
    const previewRows = normalizedRows.map((row, index) => ({ row: index + 2, values: row, errors: validateRegistrationAgendaDraft(row).errors }));
    if (action === "preview") return NextResponse.json({ headers, mapping, rows: previewRows, validCount: previewRows.filter((row) => row.errors.length === 0).length, invalidCount: previewRows.filter((row) => row.errors.length > 0).length });
    const result = await importRegistrationAgendaSpreadsheet({ eventId, actorUserId: auth.user.id, fileName: file.name, mimeType: file.type || null, sizeBytes: file.size, mapping, rows: normalizedRows });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof EventAccessError || error instanceof RegistrationAgendaError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Registration agenda spreadsheet import failed", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
