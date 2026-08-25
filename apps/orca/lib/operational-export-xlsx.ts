import * as XLSX from "xlsx";
import type { OperationalExportProjection } from "@/lib/operational-export";

export function serializeOperationalExportWorkbook(projection: OperationalExportProjection): Uint8Array {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["Recipient", projection.metadata.recipient],
    ["Projection version", projection.metadata.projectionVersion],
    ["Data as of", projection.metadata.dataAsOf],
    ["Source version", projection.metadata.sourceVersion],
    ["Rows", projection.rowCount],
    ["Filters", JSON.stringify(projection.metadata.filters)],
  ]), "About");
  const handoff = XLSX.utils.aoa_to_sheet(projection.rows);
  handoff["!autofilter"] = { ref: handoff["!ref"] ?? "A1:A1" };
  XLSX.utils.book_append_sheet(workbook, handoff, "Handoff");
  return Uint8Array.from(XLSX.write(workbook, { bookType: "xlsx", type: "buffer", compression: true }) as Buffer);
}
