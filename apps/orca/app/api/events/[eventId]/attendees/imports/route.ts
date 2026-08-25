import { NextRequest, NextResponse } from "next/server";
import { withApiRequestLogging } from "@/lib/observability/api-route";
import { exceedsImportRowLimit, importRowLimitError } from "@/lib/import";
import { parseAttendeeImportRow, type AttendeeImportDraftRow } from "@/lib/event-attendee-import";
import { processAttendeeCsvImport, type AttendeeImportRowInput } from "@/src/server/services/event-attendee";
import { readJsonBody, resolveAttendeeUser, toAttendeeErrorResponse } from "../_lib/route-helpers";

export const runtime = "nodejs";

const FIELDS = [
  "firstName", "lastName", "fullName", "email", "phone", "company", "title",
  "registrationStatus", "registrationType", "badgeType", "ticketType",
  "externalRegistrationId", "externalPersonId", "provider",
] as const;

function coerceDraft(value: unknown): AttendeeImportDraftRow {
  const v = (value ?? {}) as Record<string, unknown>;
  const row = {} as AttendeeImportDraftRow;
  for (const field of FIELDS) row[field] = typeof v[field] === "string" ? (v[field] as string) : "";
  return row;
}

async function postHandler(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const auth = await resolveAttendeeUser(request);
  if ("response" in auth) return auth.response;
  const parsed = await readJsonBody(request);
  if ("response" in parsed) return parsed.response;
  const body = parsed.body;

  const sourceLabel = typeof body.sourceLabel === "string" ? body.sourceLabel : "";
  if (!sourceLabel.trim()) {
    return NextResponse.json({ error: "sourceLabel is required", code: "BAD_REQUEST" }, { status: 400 });
  }
  const rawRows = Array.isArray(body.rows) ? body.rows : [];
  if (exceedsImportRowLimit(rawRows.length)) {
    return NextResponse.json(importRowLimitError(rawRows.length), { status: 413 });
  }
  const rowNumbers = Array.isArray(body.rowNumbers) ? (body.rowNumbers as unknown[]) : [];

  // Parse + re-validate every row server-side (UI mapping is advisory).
  const rows: AttendeeImportRowInput[] = rawRows.map((raw, i) => {
    const draft = coerceDraft(raw);
    const rowNumber = typeof rowNumbers[i] === "number" ? (rowNumbers[i] as number) : i + 2;
    const rawName = draft.fullName.trim() || [draft.firstName, draft.lastName].filter(Boolean).join(" ").trim() || null;
    return {
      rowNumber,
      rawName,
      rawEmail: draft.email.trim() || null,
      rawCompany: draft.company.trim() || null,
      parse: parseAttendeeImportRow(draft),
    };
  });

  try {
    const result = await processAttendeeCsvImport({ eventId, user: auth.user, sourceLabel, rows });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return toAttendeeErrorResponse(error, "POST /api/events/:eventId/attendees/imports");
  }
}

export const POST = withApiRequestLogging("POST /api/events/:eventId/attendees/imports", postHandler);
