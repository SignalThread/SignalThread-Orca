/** Whether the chosen file can be parsed as source data for the import wizard. */
export function isSpreadsheetReadableForMapping(file: File): boolean {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv")) return true;
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) return true;
  const t = (file.type || "").toLowerCase();
  return (
    t === "text/csv" ||
    t === "application/csv" ||
    t === "text/plain" ||
    t === "application/vnd.ms-excel" ||
    t === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
}

export const isCsvReadableForMapping = isSpreadsheetReadableForMapping;
