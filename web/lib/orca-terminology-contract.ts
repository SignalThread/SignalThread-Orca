export const ORCA_CANONICAL_TERMS = { agenda: "Agenda", runOfShow: "Run of Show", matrix: "Matrix", showFlow: "Show Flow" } as const;
export type OrcaTerminology = { -readonly [K in keyof typeof ORCA_CANONICAL_TERMS]: string };
export const ORCA_APPROVED_EVENT_TERMS = ["Agenda", "Run of Show", "Matrix", "Show Flow"] as const;
export type OrcaApprovedEventTerm = (typeof ORCA_APPROVED_EVENT_TERMS)[number];
export type OrcaEventTerminologyOverrides = { [K in keyof OrcaTerminology]: OrcaApprovedEventTerm | null };
export type EventTerminologyEnvelope = Readonly<{
  terms: OrcaTerminology;
  overrides: OrcaEventTerminologyOverrides;
  organizationTerms: OrcaTerminology;
  updatedAt: string;
}>;

const TERM_KEYS = Object.keys(ORCA_CANONICAL_TERMS) as Array<keyof OrcaTerminology>;

export function normalizeOrcaTerminology(input: Partial<Record<keyof OrcaTerminology, unknown>>): OrcaTerminology {
  const output = {} as OrcaTerminology;
  for (const key of TERM_KEYS) {
    const value = input[key];
    if (value != null && typeof value !== "string") throw new Error(`${key} must be text`);
    const normalized = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
    if (normalized.length > 60) throw new Error(`${key} must be 60 characters or fewer`);
    if (/[\u0000-\u001f\u007f]/.test(normalized)) throw new Error(`${key} contains unsupported control characters`);
    output[key] = normalized || ORCA_CANONICAL_TERMS[key];
  }
  return output;
}

export function normalizeEventTerminologyOverrides(
  input: Partial<Record<keyof OrcaTerminology, unknown>>,
): OrcaEventTerminologyOverrides {
  const output = {} as OrcaEventTerminologyOverrides;
  for (const key of TERM_KEYS) {
    const value = input[key];
    if (value == null || value === "") {
      output[key] = null;
      continue;
    }
    if (typeof value !== "string") throw new Error(`${key} must be text or null`);
    const normalized = value.trim().replace(/\s+/g, " ");
    if (!(ORCA_APPROVED_EVENT_TERMS as readonly string[]).includes(normalized)) {
      throw new Error(`${key} must be an approved display term`);
    }
    output[key] = normalized as OrcaApprovedEventTerm;
  }
  return output;
}

/** Replace display copy only. Stable identifiers, routes, fields, and analytics keys never pass through this helper. */
export function applyOrcaTerminologyToText(text: string, terms: OrcaTerminology): string {
  const replacements: Record<string, string> = {
    "Run of Show": terms.runOfShow,
    "Show Flow": terms.showFlow,
    Agenda: terms.agenda,
    Matrix: terms.matrix,
  };
  return text.replace(/Run of Show|Show Flow|Agenda|Matrix/g, (match) => replacements[match] ?? match);
}
