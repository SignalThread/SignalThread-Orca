import { createHash } from "node:crypto";
import { ORCA_CANONICAL_TERMS, type OrcaTerminology } from "@/lib/orca-terminology-contract";

export type OperationalExportRecipient = "hotel" | "venue" | "caterer" | "av" | "internal" | "public";
export type OperationalExportFormat = "csv" | "xlsx" | "print" | "json";

export type OperationalExportSession = Readonly<{
  id: string;
  date: string;
  start: string;
  end: string;
  title: string;
  room: string;
  status?: string | null;
  changedAt?: string | null;
  setupType?: string | null;
  attendance?: number | null;
  supplies?: string | null;
  signage?: string | null;
  accessibility?: string | null;
  operationalNotes?: string | null;
  fnbContext?: string | null;
  fnbSelections?: string | null;
  fnbVerifiedNeeds?: string | null;
  fnbModifications?: string | null;
  fnbFinancials?: string | null;
  avSummary?: string | null;
  speakers?: string | null;
  staffing?: string | null;
  approvals?: string | null;
  risks?: string | null;
  unresolved?: string | null;
  internalNotes?: string | null;
  publicDescription?: string | null;
  showFlow: readonly Readonly<{
    label: string;
    start: string;
    owner?: string | null;
    department?: string | null;
    speaker?: string | null;
    avNotes?: string | null;
    notes?: string | null;
    publicDescription?: string | null;
    visibility: "INTERNAL" | "PUBLIC";
  }>[];
}>;

export type OperationalExportMetadata = Readonly<{
  recipient: OperationalExportRecipient;
  dataAsOf: string;
  sourceVersion: string;
  projectionVersion: number;
  filters: Readonly<Record<string, string>>;
}>;

export type OperationalExportProjection = Readonly<{
  filename: string;
  title: string;
  rows: string[][];
  rowCount: number;
  metadata: OperationalExportMetadata;
  checksum: string;
  sensitiveFieldsExcluded: readonly string[];
}>;

function cell(value: string | number | null | undefined): string {
  return value == null ? "" : String(value);
}

function flow(session: OperationalExportSession, audience: "internal" | "public" | "av"): string {
  return session.showFlow
    .filter((item) => audience !== "public" || item.visibility === "PUBLIC")
    .map((item) => audience === "public"
      ? [item.start, item.label, item.publicDescription].filter(Boolean).join(" — ")
      : audience === "av"
        ? [item.start, item.label, item.speaker, item.avNotes].filter(Boolean).join(" — ")
      : [item.start, item.label, item.speaker, item.owner, item.department, item.avNotes, item.notes].filter(Boolean).join(" — "))
    .join(" | ");
}

function projectionRows(recipient: OperationalExportRecipient, sessions: readonly OperationalExportSession[], terms: OrcaTerminology): string[][] {
  const base = ["Date", "Start", "End", "Session", "Room"];
  if (recipient === "public") {
    return [
      [...base, "Description", `Published ${terms.agenda.toLowerCase()}`],
      ...sessions.map((session) => [
        session.date, session.start, session.end, session.title, session.room,
        cell(session.publicDescription), flow(session, "public"),
      ]),
    ];
  }
  if (recipient === "hotel" || recipient === "venue") {
    return [
      [...base, "Room set", "Guarantee", "Supplies", "Signage", "Accessibility", "Approved operational notes"],
      ...sessions.map((session) => [
        session.date, session.start, session.end, session.title, session.room, cell(session.setupType),
        cell(session.attendance), cell(session.supplies), cell(session.signage), cell(session.accessibility),
        cell(session.operationalNotes),
      ]),
    ];
  }
  if (recipient === "caterer") {
    return [
      [...base, "Guarantee", "Service time", "Selections", "Verified aggregate dietary / allergen needs", "Verified modifications", "Permitted financial detail"],
      ...sessions.map((session) => [
        session.date, session.start, session.end, session.title, session.room, cell(session.attendance),
        cell(session.fnbContext), cell(session.fnbSelections), cell(session.fnbVerifiedNeeds),
        cell(session.fnbModifications), cell(session.fnbFinancials),
      ]),
    ];
  }
  if (recipient === "av") {
    return [
      [...base, "Speakers", "AV / production", `${terms.showFlow} cues`, "Signage dependencies"],
      ...sessions.map((session) => [
        session.date, session.start, session.end, session.title, session.room, cell(session.speakers),
        cell(session.avSummary), flow(session, "av"), cell(session.signage),
      ]),
    ];
  }
  return [
    [...base, "Status", "Room set", "Guarantee", "Supplies", "Signage", "Accessibility", "F&B", "AV / production", "Speakers", "Staffing", terms.showFlow, "Approvals", "Risks", "Unresolved", "Internal notes"],
    ...sessions.map((session) => [
      session.date, session.start, session.end, session.title, session.room, cell(session.status),
      cell(session.setupType), cell(session.attendance), cell(session.supplies), cell(session.signage),
      cell(session.accessibility), cell(session.fnbContext), cell(session.avSummary), cell(session.speakers),
      cell(session.staffing), flow(session, "internal"), cell(session.approvals), cell(session.risks),
      cell(session.unresolved), cell(session.internalNotes),
    ]),
  ];
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function deterministicExportHash(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

/** Recipient projections are explicit allowlists. Never spread a database record into an export. */
export function buildOperationalExport(
  recipient: OperationalExportRecipient,
  sessions: readonly OperationalExportSession[],
  options: Partial<OperationalExportMetadata> & { terminology?: OrcaTerminology } = {},
): OperationalExportProjection {
  const terms = options.terminology ?? { ...ORCA_CANONICAL_TERMS };
  const rows = projectionRows(recipient, sessions, terms);
  const sourceVersion = options.sourceVersion ?? deterministicExportHash(sessions);
  const metadata: OperationalExportMetadata = {
    recipient,
    dataAsOf: options.dataAsOf ?? "1970-01-01T00:00:00.000Z",
    sourceVersion,
    projectionVersion: options.projectionVersion ?? 1,
    filters: options.filters ?? {},
  };
  const checksum = deterministicExportHash({ metadata, rows });
  return {
    filename: `${recipient}-handoff-v${metadata.projectionVersion}.csv`,
    title: `${recipient === "av" ? "AV / production" : recipient === "public" ? `Public ${terms.agenda.toLowerCase()}` : recipient[0]!.toUpperCase() + recipient.slice(1)} handoff`,
    rows,
    rowCount: Math.max(0, rows.length - 1),
    metadata,
    checksum,
    sensitiveFieldsExcluded: recipient === "internal" ? [] : [
      "internalNotes", "personLevelDietaryOrMedicalData", "privateContacts", "unapprovedNotes",
      ...(recipient === "caterer" ? [] : ["financials"]),
    ],
  };
}

function safeSpreadsheetCell(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

export function serializeOperationalExportCsv(rows: readonly (readonly string[])[]): string {
  return rows
    .map((row) => row.map((value) => `"${safeSpreadsheetCell(value).replaceAll('"', '""')}"`).join(","))
    .join("\r\n");
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

export function renderOperationalExportHtml(projection: OperationalExportProjection): string {
  const [header = [], ...body] = projection.rows;
  const filterSummary = Object.entries(projection.metadata.filters).map(([key, value]) => `${key}: ${value}`).join(" · ") || "No filters";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(projection.title)}</title><style>@page{size:landscape;margin:12mm}*{box-sizing:border-box}body{font:12px/1.4 system-ui,sans-serif;color:#0f172a;margin:24px}h1{font-size:22px;margin:0 0 4px}.meta{color:#475569;margin:0 0 16px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #cbd5e1;padding:6px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#f1f5f9;position:sticky;top:0}tbody tr:nth-child(even){background:#f8fafc}@media(max-width:700px){body{margin:12px}.scroll{overflow:auto}table{min-width:900px}}@media print{body{margin:0}.screen-only{display:none}th{position:static}}</style></head><body><main><h1>${escapeHtml(projection.title)}</h1><p class="meta">Version ${projection.metadata.projectionVersion} · Data as of ${escapeHtml(projection.metadata.dataAsOf)} · Source ${escapeHtml(projection.metadata.sourceVersion.slice(0, 12))} · ${escapeHtml(filterSummary)}</p><p class="screen-only">Use your browser’s Print command to print or save this handoff as PDF.</p><div class="scroll" role="region" aria-label="Handoff table" tabindex="0"><table><thead><tr>${header.map((value) => `<th scope="col">${escapeHtml(value)}</th>`).join("")}</tr></thead><tbody>${body.map((row) => `<tr>${row.map((value) => `<td>${escapeHtml(value)}</td>`).join("")}</tr>`).join("")}</tbody></table></div></main></body></html>`;
}
