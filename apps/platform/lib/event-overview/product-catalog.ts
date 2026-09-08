/**
 * How each SignalThread product presents inside the connected-event dashboard.
 *
 * This is presentation metadata only. Which products *participate* for an event
 * is decided by the organization's entitlements (registry), and whether one is
 * launchable by the product registry (`product-registry.ts`). Nothing here
 * grants access.
 *
 * Pure and dependency-free so it is directly testable.
 */

export type LifecyclePhase = "before" | "during" | "after";

export type ProductIcon = "grid" | "id-card" | "bed" | "scan" | "waveform" | "cube";

export type ProductDefinition = {
  key: string;
  /** Product name as the dashboard shows it (the registry says "Orca"; the product is OrcaOS). */
  displayName: string;
  /** One-word capability shown above the product name in the lifecycle matrix. */
  capability: string;
  /** What the product knows about the event, once live / while still pending. */
  purpose: { live: string; pending: string };
  /** Short responsibility descriptor for the Go deeper ledger. */
  responsibility: string;
  /** Which lifecycle phases the product's band spans. */
  span: { from: LifecyclePhase; to: LifecyclePhase };
  /** The fact this product contributes to the shared event object. */
  factLabel: string;
  /** The two headline metrics in the Go deeper ledger. */
  metricLabels: [string, string];
  icon: ProductIcon;
  /** Lifecycle order: attendee foundation first, in-show products after. */
  order: number;
};

const CATALOG: Record<string, ProductDefinition> = {
  orca: {
    key: "orca",
    displayName: "OrcaOS",
    capability: "Plan",
    purpose: { live: "Knows what is happening", pending: "Will know what is happening" },
    responsibility: "Plans and operates",
    span: { from: "before", to: "after" },
    factLabel: "Sessions planned",
    metricLabels: ["Roadmap", "Blockers"],
    icon: "grid",
    order: 10,
  },
  registration: {
    key: "registration",
    displayName: "Registration",
    capability: "Register",
    purpose: { live: "Knows who is coming", pending: "Will know who is coming" },
    responsibility: "Attendee identity",
    span: { from: "before", to: "during" },
    factLabel: "Attendees registered",
    metricLabels: ["Registered", "Checked in"],
    icon: "id-card",
    order: 20,
  },
  housing: {
    key: "housing",
    displayName: "Housing",
    capability: "House",
    purpose: { live: "Knows where they stay", pending: "Will know where they stay" },
    responsibility: "Stay logistics",
    span: { from: "before", to: "during" },
    factLabel: "Rooms held",
    metricLabels: ["Rooms held", "Committed"],
    icon: "bed",
    order: 30,
  },
  "lead-retrieval": {
    key: "lead-retrieval",
    displayName: "Lead Retrieval",
    capability: "Engage",
    purpose: { live: "Knows who they engage with", pending: "Will know who they engage with" },
    responsibility: "Exhibitor engagement",
    span: { from: "during", to: "after" },
    factLabel: "Leads captured",
    metricLabels: ["Leads", "Hot"],
    icon: "scan",
    order: 40,
  },
  pulse: {
    key: "pulse",
    displayName: "Pulse",
    capability: "Understand",
    purpose: { live: "Knows what they experience", pending: "Will know what they experience" },
    responsibility: "Attendee intelligence",
    span: { from: "during", to: "after" },
    factLabel: "Responses heard",
    metricLabels: ["Responses", "To review"],
    icon: "waveform",
    order: 50,
  },
};

export const KNOWN_PRODUCT_KEYS: readonly string[] = Object.keys(CATALOG);

/**
 * The definition for a product key. Unknown keys — a product added to the
 * registry before this catalogue learns about it — get a generic definition
 * spanning the whole lifecycle, so it joins the same frame rather than
 * breaking the page.
 */
export function productDefinition(key: string, registryName?: string | null): ProductDefinition {
  const known = CATALOG[key];
  if (known) return known;
  const name = registryName?.trim() || key;
  return {
    key,
    displayName: name,
    capability: "Product",
    purpose: { live: `Contributes to the event`, pending: `Will contribute to the event` },
    responsibility: "Connected product",
    span: { from: "before", to: "after" },
    factLabel: `${name} records`,
    metricLabels: ["Records", "Open items"],
    icon: "cube",
    order: 1000,
  };
}

/** Product keys in lifecycle order, de-duplicated. Unknown keys sort last, alphabetically. */
export function orderProductKeys(keys: readonly string[]): string[] {
  const unique = Array.from(new Set(keys.map((key) => key.trim().toLowerCase()).filter(Boolean)));
  return unique.sort((a, b) => {
    const delta = productDefinition(a).order - productDefinition(b).order;
    return delta !== 0 ? delta : a.localeCompare(b);
  });
}

/** Colour roles for a product, as CSS custom properties defined in globals.css. */
export type ProductAccent = {
  /** Icon, capability eyebrow, provenance dot. */
  text: string;
  /** Icon tile and live band surface. */
  soft: string;
  /** Pending (dashed) band surface. */
  faint: string;
  /** Band border. */
  border: string;
  /** Text inside the band. */
  ink: string;
  /** Dot in the dark event object. */
  dot: string;
};

export function productAccent(key: string): ProductAccent {
  if (!CATALOG[key]) {
    return {
      text: "#475569",
      soft: "#f1f5f9",
      faint: "#f8fafc",
      border: "#cbd5e1",
      ink: "#334155",
      dot: "#94a3b8",
    };
  }
  return {
    text: `var(--product-${key})`,
    soft: `var(--product-${key}-soft)`,
    faint: `var(--product-${key}-faint)`,
    border: `var(--product-${key}-border)`,
    ink: `var(--product-${key}-ink)`,
    dot: `var(--product-${key}-dot)`,
  };
}

export const PHASES: readonly LifecyclePhase[] = ["before", "during", "after"];

/** 1-based grid column span for a product band across the three phase columns. */
export function spanColumns(span: { from: LifecyclePhase; to: LifecyclePhase }): { start: number; end: number } {
  const start = PHASES.indexOf(span.from) + 1;
  const end = PHASES.indexOf(span.to) + 2;
  return { start, end };
}
