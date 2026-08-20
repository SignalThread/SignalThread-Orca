import * as XLSX from "xlsx";

export type ShowFlowExportFormat = "pdf" | "xlsx" | "csv" | "docx";
export type ShowFlowExportVariant = "internal" | "client" | "role";
export type ShowFlowExportRole = "av" | "venue" | "registration" | "speaker";

export type ShowFlowExportCue = {
  id: string;
  cueType: string;
  effectiveStartTime: string | null;
  effectiveEndTime: string | null;
  durationMin: number | null;
  label: string;
  owner: string | null;
  ownerPerson: { name: string; role: string } | null;
  department: string | null;
  action: string | null;
  internalNotes: string | null;
  avNotes: string | null;
};

export type ShowFlowExportDocument = {
  filenameStem: string;
  title: string;
  metadata: string[];
  headers: string[];
  rows: string[][];
  draft: boolean;
};

function roleMatches(cue: ShowFlowExportCue, role: ShowFlowExportRole): boolean {
  const text = [cue.owner, cue.ownerPerson?.name, cue.ownerPerson?.role, cue.department].filter(Boolean).join(" ").toLowerCase();
  if (role === "av") return cue.cueType === "AV_TECHNICAL" || /\b(av|audio|video|technical|production)\b/.test(text);
  if (role === "venue") return ["PRE_FUNCTION", "TRANSITION_TURNOVER", "CLOSE_STRIKE", "SAFETY_ANNOUNCEMENT"].includes(cue.cueType) || /\b(venue|room|banquet)\b/.test(text);
  if (role === "registration") return ["DOORS_OPEN", "GUEST_ARRIVAL"].includes(cue.cueType) || /\b(registration|front of house)\b/.test(text);
  return ["SPEAKER_HANDOFF", "CONTENT_PRESENTATION"].includes(cue.cueType) || /\b(speaker|talent)\b/.test(text);
}

export function buildShowFlowExportDocument(input: {
  eventName: string;
  sessionTitle: string;
  sessionDate: string;
  roomName: string | null;
  timezone: string;
  generatedAt: string;
  version: number;
  status: "DRAFT" | "APPROVED";
  variant: ShowFlowExportVariant;
  role?: ShowFlowExportRole;
  selectedCueIds?: string[];
  cues: ShowFlowExportCue[];
}): ShowFlowExportDocument {
  const selected = input.selectedCueIds?.length ? new Set(input.selectedCueIds) : null;
  const cues = input.cues.filter((cue) => (!selected || selected.has(cue.id)) && (input.variant !== "role" || roleMatches(cue, input.role ?? "av")));
  const internal = input.variant === "internal";
  const headers = ["Sequence", "Start", "End", "Duration", "Cue type", "Cue", "Owner", "Action", ...(internal ? ["Internal instructions", "AV notes"] : [])];
  const rows = cues.map((cue, index) => [
    String(index + 1), cue.effectiveStartTime ?? "", cue.effectiveEndTime ?? "", cue.durationMin == null ? "" : String(cue.durationMin),
    cue.cueType.replaceAll("_", " "), cue.label, cue.ownerPerson?.name ?? cue.owner ?? "", cue.action ?? "",
    ...(internal ? [cue.internalNotes ?? "", cue.avNotes ?? ""] : []),
  ]);
  const variantLabel = input.variant === "client" ? "Client-facing run sheet" : input.variant === "role" ? `${input.role ?? "av"} role sheet` : "Internal show caller";
  return {
    filenameStem: `${input.sessionTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "session"}-show-flow-v${input.version}`,
    title: `${input.sessionTitle} — ${variantLabel}`,
    metadata: [
      `Event: ${input.eventName}`, `Session date: ${input.sessionDate}`, `Room: ${input.roomName ?? "Not set"}`,
      `Timezone: ${input.timezone}`, `Generated: ${input.generatedAt}`, `Version: ${input.version}`, `Status: ${input.status}`,
    ],
    headers,
    rows,
    draft: input.status !== "APPROVED",
  };
}

function csvCell(value: string): string {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function serializeShowFlowCsv(document: ShowFlowExportDocument): Uint8Array {
  const rows = [[document.title], ...document.metadata.map((line) => [line]), [], document.headers, ...document.rows];
  return Buffer.from(rows.map((row) => row.map(csvCell).join(",")).join("\r\n"), "utf8");
}

export function serializeShowFlowXlsx(document: ShowFlowExportDocument): Uint8Array {
  const worksheet = XLSX.utils.aoa_to_sheet([[document.draft ? "DRAFT" : "APPROVED"], [document.title], ...document.metadata.map((line) => [line]), [], document.headers, ...document.rows]);
  worksheet["!cols"] = document.headers.map((header) => ({ wch: Math.max(12, Math.min(44, header.length + 8)) }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Show Flow");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

function escapeXml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipStore(files: Array<{ name: string; data: Uint8Array }>): Uint8Array {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name);
    const data = Buffer.from(file.data);
    const crc = crc32(data);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); localHeader.writeUInt16LE(20, 4); localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(data.length, 18); localHeader.writeUInt32LE(data.length, 22); localHeader.writeUInt16LE(name.length, 26);
    local.push(localHeader, name, data);
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0); centralHeader.writeUInt16LE(20, 4); centralHeader.writeUInt16LE(20, 6); centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(data.length, 20); centralHeader.writeUInt32LE(data.length, 24); centralHeader.writeUInt16LE(name.length, 28); centralHeader.writeUInt32LE(offset, 42);
    central.push(centralHeader, name);
    offset += localHeader.length + name.length + data.length;
  }
  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(centralSize, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, ...central, end]);
}

export function serializeShowFlowDocx(document: ShowFlowExportDocument): Uint8Array {
  const paragraphs = [document.draft ? "DRAFT" : "APPROVED", document.title, ...document.metadata, "", document.headers.join(" | "), ...document.rows.map((row) => row.join(" | "))];
  const body = paragraphs.map((line) => `<w:p><w:r><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>`).join("");
  const files = [
    { name: "[Content_Types].xml", data: Buffer.from('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>') },
    { name: "_rels/.rels", data: Buffer.from('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>') },
    { name: "word/document.xml", data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr/></w:body></w:document>`) },
  ];
  return zipStore(files);
}

function pdfEscape(value: string): string { return value.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)"); }
export function serializeShowFlowPdf(document: ShowFlowExportDocument): Uint8Array {
  const lines = [document.draft ? "DRAFT — INTERNAL" : "APPROVED", document.title, ...document.metadata, "", document.headers.join(" | "), ...document.rows.map((row) => row.join(" | "))];
  const pages: string[][] = [];
  for (let index = 0; index < lines.length; index += 48) pages.push(lines.slice(index, index + 48));
  if (pages.length === 0) pages.push([]);
  const pageObjectIds = pages.map((_, index) => 4 + index * 2);
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  pages.forEach((pageLines, index) => {
    const pageId = pageObjectIds[index]!;
    const streamId = pageId + 1;
    const stream = `BT /F1 9 Tf 40 760 Td 12 TL ${pageLines.map((line, lineIndex) => `${lineIndex ? "T* " : ""}(${pdfEscape(line.slice(0, 120))}) Tj`).join(" ")} ET`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${streamId} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
  });
  let pdf = "%PDF-1.4\n"; const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf); pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "binary");
}
