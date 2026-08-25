export type RoomSetCanvasTableLabelInput = Readonly<{
  tableName: string;
  tableSortOrder?: number | null;
}>;

function tableNumberFromName(tableName: string): number | null {
  const matches = [...tableName.matchAll(/\b(?:table|t)\s*#?\s*(\d+)\b/gi)];
  const lastMatch = matches.at(-1);
  if (!lastMatch) return null;

  const parsed = Number(lastMatch[1]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function formatRoomSetCanvasTableLabel(input: RoomSetCanvasTableLabelInput): string {
  const parsedTableNumber = tableNumberFromName(input.tableName);
  if (parsedTableNumber != null) return `T${parsedTableNumber}`;

  const sortOrder = Number(input.tableSortOrder);
  if (Number.isInteger(sortOrder) && sortOrder > 0) return `T${sortOrder}`;

  return "Table";
}
