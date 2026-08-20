export type SessionRequirementCatalogType =
  | "AV"
  | "FNB"
  | "STAFFING"
  | "SUPPLIES"
  | "SIGNAGE"
  | "SETUP"
  | "STATUS"
  | "OTHER";

export type SessionRequirementCatalogDefaultItem = {
  key: string;
  label: string;
  hasQuantity: boolean;
};

export type SessionRequirementCatalogDefaultSection = {
  type: Exclude<SessionRequirementCatalogType, "OTHER">;
  key: string;
  label: string;
  icon: string;
  items: SessionRequirementCatalogDefaultItem[];
};

export const SESSION_REQUIREMENT_DEFAULT_TEMPLATE_NAME = "Session Requirements";

export const SESSION_REQUIREMENT_PLATFORM_DEFAULT_CATALOGS: SessionRequirementCatalogDefaultSection[] = [
  {
    type: "AV",
    key: "av-requirements",
    label: "AV Requirements",
    icon: "monitor",
    items: [
      { key: "projector", label: "Projector", hasQuantity: false },
      { key: "confidence-monitor", label: "Confidence Monitor", hasQuantity: false },
      { key: "wireless-mic", label: "Wireless Mic", hasQuantity: true },
      { key: "lavalier-mic", label: "Lavalier Mic", hasQuantity: true },
      { key: "podium", label: "Podium", hasQuantity: false },
      { key: "stage-lighting", label: "Stage Lighting", hasQuantity: false },
      { key: "recording", label: "Recording", hasQuantity: false },
      { key: "livestream", label: "Livestream", hasQuantity: false },
      { key: "screen", label: "Screen", hasQuantity: false },
      { key: "podium-mic", label: "Podium Mic", hasQuantity: false },
      { key: "handheld-mic", label: "Handheld Mic", hasQuantity: true },
    ],
  },
  {
    type: "FNB",
    key: "food-beverage",
    label: "Food & Beverage",
    icon: "utensils",
    items: [
      { key: "coffee-service", label: "Coffee Service", hasQuantity: false },
      { key: "water-service", label: "Water Service", hasQuantity: false },
      { key: "breakfast", label: "Breakfast", hasQuantity: false },
      { key: "lunch", label: "Lunch", hasQuantity: false },
      { key: "reception", label: "Reception", hasQuantity: false },
    ],
  },
  {
    type: "STAFFING",
    key: "staffing",
    label: "Staffing",
    icon: "users",
    items: [
      { key: "moderator", label: "Moderator", hasQuantity: true },
      { key: "session-host", label: "Session Host", hasQuantity: true },
      { key: "av-tech", label: "AV Tech", hasQuantity: true },
      { key: "room-monitor", label: "Room Monitor", hasQuantity: true },
    ],
  },
  {
    type: "SUPPLIES",
    key: "supplies",
    label: "Supplies",
    icon: "package",
    items: [
      { key: "notepads", label: "Notepads", hasQuantity: true },
      { key: "pens", label: "Pens", hasQuantity: true },
      { key: "flip-charts", label: "Flip charts", hasQuantity: true },
      { key: "easels", label: "Easels", hasQuantity: true },
      { key: "name-tents", label: "Name tents", hasQuantity: true },
      { key: "workshop-material-kits", label: "Workshop material kits", hasQuantity: true },
    ],
  },
  {
    type: "SIGNAGE",
    key: "signage",
    label: "Signage",
    icon: "signpost",
    items: [
      { key: "room-identification", label: "Room identification", hasQuantity: true },
      { key: "directional-signage", label: "Directional signage", hasQuantity: true },
      { key: "registration-signage", label: "Registration signage", hasQuantity: true },
      { key: "agenda-signage", label: "Agenda signage", hasQuantity: true },
      { key: "sponsor-signage", label: "Sponsor signage", hasQuantity: true },
      { key: "reserved-seating-signage", label: "Reserved seating signage", hasQuantity: true },
    ],
  },
  {
    type: "SETUP",
    key: "room-setup",
    label: "Room Setup",
    icon: "layout",
    items: [
      { key: "theater", label: "Theater", hasQuantity: false },
      { key: "classroom", label: "Classroom", hasQuantity: false },
      { key: "rounds", label: "Rounds", hasQuantity: false },
      { key: "boardroom", label: "Boardroom", hasQuantity: false },
    ],
  },
  {
    type: "STATUS",
    key: "status",
    label: "Status",
    icon: "alert-triangle",
    items: [
      { key: "draft", label: "Draft", hasQuantity: false },
      { key: "confirmed", label: "Confirmed", hasQuantity: false },
      { key: "needs-review", label: "Needs Review", hasQuantity: false },
      { key: "complete", label: "Complete", hasQuantity: false },
    ],
  },
];

function hasAnyMatch(value: string, candidates: string[]): boolean {
  return candidates.some((candidate) => value.includes(candidate));
}

const STAFFING_NEED_TERMS = [
  "staff",
  "crew",
  "manager",
  "coordinator",
  "usher",
  "moderator",
  "host",
  "monitor",
  "tech",
  "technician",
  "operator",
  "runner",
  "lead",
  "security",
  "registration",
  "check in",
  "check-in",
];

const FNB_PACKAGE_TERMS = [
  "f&b",
  "fnb",
  "food",
  "beverage",
  "catering",
  "meal",
  "menu",
  "breakfast",
  "lunch",
  "dinner",
  "reception",
  "coffee",
  "mimosa",
  "bar",
  "package",
];

export function isStaffingNeedRequirementItem(input: {
  key?: string | null;
  label?: string | null;
}): boolean {
  const key = (input.key ?? "").trim().toLowerCase();
  const label = (input.label ?? "").trim().toLowerCase();
  const combined = `${key} ${label}`.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!combined) return false;

  const hasStaffingSignal = hasAnyMatch(combined, STAFFING_NEED_TERMS);
  const hasFnbPackageSignal = hasAnyMatch(combined, FNB_PACKAGE_TERMS);
  return hasStaffingSignal || !hasFnbPackageSignal;
}

export function inferSessionRequirementCatalogType(input: {
  key?: string | null;
  label?: string | null;
}): SessionRequirementCatalogType {
  const key = (input.key ?? "").trim().toLowerCase();
  const label = (input.label ?? "").trim().toLowerCase();
  const combined = `${key} ${label}`.trim();

  if (!combined) return "OTHER";

  if (hasAnyMatch(combined, ["status", "state"])) return "STATUS";
  if (hasAnyMatch(combined, ["setup", "layout"])) return "SETUP";
  if (hasAnyMatch(combined, ["supply", "supplies", "material kit", "notepad", "flip chart", "easel", "name tent"])) return "SUPPLIES";
  if (hasAnyMatch(combined, ["signage", "signpost", "directional sign", "room identification", "wayfinding"])) return "SIGNAGE";
  if (hasAnyMatch(combined, ["av", "audio", "video", "mic", "monitor", "projector"])) return "AV";
  if (hasAnyMatch(combined, ["f&b", "fnb", "food", "beverage", "meal", "catering"])) return "FNB";
  if (hasAnyMatch(combined, ["staff", "crew", "staffing"])) return "STAFFING";
  return "OTHER";
}

export function isSingleSelectCatalogType(type: SessionRequirementCatalogType): boolean {
  return type === "SETUP" || type === "STATUS";
}

export function budgetCategoryForSessionRequirementCatalogType(type: SessionRequirementCatalogType): string | null {
  switch (type) {
    case "AV":
      return "AV";
    case "FNB":
      return "F&B";
    case "STAFFING":
      return "Staffing";
    case "SUPPLIES":
      return "Supplies";
    case "SIGNAGE":
      return "Signage";
    case "SETUP":
      return "Rooms";
    case "OTHER":
      return "Production";
    case "STATUS":
      return null;
  }
}
