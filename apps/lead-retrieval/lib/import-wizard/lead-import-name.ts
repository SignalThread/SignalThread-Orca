/**
 * The lead schema has one canonical name field (`leads.full_name`). Importers may
 * map name components separately, but every downstream consumer resolves them
 * through this function before validation, enrichment, or materialization.
 */
export function normalizeImportedLeadNameValue(value: string | null | undefined): string {
  return String(value ?? "").trim().replace(/\s+/gu, " ");
}

export function composeImportedLeadName(firstName: string, lastName: string): string {
  return [normalizeImportedLeadNameValue(firstName), normalizeImportedLeadNameValue(lastName)]
    .filter(Boolean)
    .join(" ");
}

function mappedValue(row: string[], selections: Record<string, string>, key: string): string {
  let fallback = "";
  for (let index = 0; index < row.length; index += 1) {
    if (selections[String(index)] !== key) continue;
    const value = String(row[index] ?? "");
    if (value.trim()) return value;
    fallback = value;
  }
  return fallback;
}

export function resolveImportedLeadName(row: string[], selections: Record<string, string>): string {
  const fullName = normalizeImportedLeadNameValue(mappedValue(row, selections, "full_name"));
  if (fullName) return fullName;

  return composeImportedLeadName(
    mappedValue(row, selections, "first_name"),
    mappedValue(row, selections, "last_name")
  );
}

/**
 * Identity validation must retain the source mapping's semantics. A lone value
 * from either First Name or Last Name is displayable, but not enough to identify
 * a person by name + company. A Full Name value must contain at least two
 * whitespace-separated components; this prevents a surname mapped as Full Name
 * from bypassing readiness.
 */
export function hasUsableImportedPersonName(row: string[], selections: Record<string, string>): boolean {
  const firstName = normalizeImportedLeadNameValue(mappedValue(row, selections, "first_name"));
  const lastName = normalizeImportedLeadNameValue(mappedValue(row, selections, "last_name"));
  if (firstName && lastName) return true;

  const fullName = normalizeImportedLeadNameValue(mappedValue(row, selections, "full_name"));
  return fullName.split(" ").filter(Boolean).length >= 2;
}
