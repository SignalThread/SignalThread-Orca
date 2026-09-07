import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { requireEventRouteAccess } from "../../_lib/event-route-auth";
import { getEventSupplyRegister } from "@/lib/supplies";

type ExportRequirement = Awaited<
  ReturnType<typeof getEventSupplyRegister>
>["requirements"][number];
const cell = (value: unknown) => String(value ?? "");
const owner = (item: ExportRequirement) =>
  item.responsibleUser?.name?.trim() || item.responsibleUser?.email || "";
const fmt = (value: Date | null, timezone: string) =>
  value
    ? new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        dateStyle: "medium",
        timeStyle: "short",
      }).format(value)
    : "";
function rows(
  register: Awaited<ReturnType<typeof getEventSupplyRegister>>,
): Array<Record<string, string | number>> {
  return register.requirements.map((item) => ({
    Session: item.session.sessionName ?? "",
    "Session date": item.session.dayDate.toISOString().slice(0, 10),
    "Session start": item.session.startTime
      ? item.session.startTime.toISOString().slice(11, 16)
      : "",
    "Session end": item.session.endTime
      ? item.session.endTime.toISOString().slice(11, 16)
      : "",
    Room: item.session.room?.name ?? item.session.roomName ?? "",
    Supply: item.name,
    Quantity: item.quantity ?? "",
    Unit: item.unit,
    Responsible: owner(item),
    "Provided by": item.source ?? "",
    "Need by": fmt(item.setupDeadline, register.event.timezone),
    Status: item.fulfillment,
    Notes: item.notes ?? "",
    Placement: item.placement ?? "",
    "Blocker / dependency": item.dependencies
      .filter((dependency) => dependency.blocking && !dependency.resolvedAt)
      .map((dependency) => dependency.label)
      .join("; "),
  }));
}
function pdfEscape(value: string) {
  return value.replace(/[\\()]/g, "\\$&").replace(/[^\x20-\x7E]/g, "?");
}
function pdfBytes(
  title: string,
  scope: string,
  data: Record<string, string | number>[],
) {
  const header =
    "Session | Supply | Qty | Responsible | Provided by | Need by | Status | Notes";
  const rowLines = data.flatMap((row) => {
    const text = `${row.Session} | ${row.Supply} | ${row.Quantity} ${row.Unit} | ${row.Responsible} | ${row["Provided by"]} | ${row["Need by"]} | ${row.Status} | ${row.Notes}`;
    return text.match(/.{1,105}(?:\s|$)|.{1,105}/g) ?? [text];
  });
  const pages: string[][] = [];
  let remaining = rowLines;
  pages.push([title, scope, "", header, ...remaining.slice(0, 38)]);
  remaining = remaining.slice(38);
  while (remaining.length) {
    pages.push([title, "", header, ...remaining.slice(0, 39)]);
    remaining = remaining.slice(39);
  }
  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pages.map((_, index) => `${3 + index * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`,
  ];
  pages.forEach((page, index) => {
    const pageId = 3 + index * 2;
    const contentId = pageId + 1;
    const content = `BT /F1 8 Tf 42 770 Td ${page.map((line, lineIndex) => `${lineIndex ? "0 -17 Td " : ""}(${pdfEscape(line)}) Tj`).join("\n")} ET`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> /Contents ${contentId} 0 R >>`,
      `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    );
  });
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join(
      "",
    )}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  const auth = await requireEventRouteAccess(request, eventId, "read");
  if ("response" in auth) return auth.response;
  const format = request.nextUrl.searchParams.get("format") ?? "xlsx";
  if (!["xlsx", "pdf", "csv"].includes(format))
    return NextResponse.json(
      { error: "Format must be xlsx, pdf, or csv" },
      { status: 400 },
    );
  const register = await getEventSupplyRegister(eventId);
  const data = rows(register);
  const scope =
    request.nextUrl.searchParams.get("scope") === "filtered"
      ? `Filtered event register: ${request.nextUrl.searchParams.get("filters") ?? ""}`
      : "Full event register";
  if (format === "xlsx") {
    const workbook = XLSX.utils.book_new();
    const about = XLSX.utils.aoa_to_sheet([
      ["Event", register.event.name],
      ["Exported", new Date().toISOString()],
      ["Scope", scope],
    ]);
    const sheet = XLSX.utils.json_to_sheet(data);
    sheet["!autofilter"] = { ref: sheet["!ref"] ?? "A1:A1" };
    sheet["!freeze"] = { xSplit: 0, ySplit: 1 };
    sheet["!cols"] = Object.keys(data[0] ?? {}).map((key) => ({
      wch:
        key === "Notes"
          ? 48
          : key.includes("Session") || key === "Provided by"
            ? 24
            : 16,
    }));
    XLSX.utils.book_append_sheet(workbook, about, "About");
    XLSX.utils.book_append_sheet(workbook, sheet, "All session supplies");
    return new NextResponse(
      Uint8Array.from(
        XLSX.write(workbook, {
          type: "buffer",
          bookType: "xlsx",
          compression: true,
        }) as Buffer,
      ),
      {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition":
            "attachment; filename=all-session-supplies.xlsx",
        },
      },
    );
  }
  if (format === "pdf")
    return new NextResponse(
      pdfBytes(
        `${register.event.name} — All session supplies`,
        `${scope} · Exported ${new Date().toISOString()}`,
        data,
      ),
      {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": "inline; filename=all-session-supplies.pdf",
        },
      },
    );
  const headers = Object.keys(data[0] ?? {});
  const csv = [
    headers,
    ...data.map((row) =>
      headers.map((key) =>
        cell(row[key]).includes(",")
          ? `"${cell(row[key]).replaceAll('"', '""')}"`
          : cell(row[key]),
      ),
    ),
  ]
    .map((row) => row.join(","))
    .join("\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=all-session-supplies.csv",
    },
  });
}
