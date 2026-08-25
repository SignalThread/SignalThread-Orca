export type DirectoryRole =
  | "ATTENDEE"
  | "REGISTRANT"
  | "SPEAKER"
  | "EXHIBITOR_CONTACT"
  | "SPONSOR_CONTACT"
  | "VENDOR"
  | "STAFF"
  | "VIP"
  | "PRESS"
  | "PROSPECT"
  | "MARKETING_CONTACT"
  | "SEATING_GUEST";

export type DirectoryStatus = "ACTIVE" | "NEEDS_REVIEW" | "DUPLICATE_REVIEW" | "REMOVED" | "MERGED";

export type DirectoryRoleOption = {
  value: DirectoryRole;
  label: string;
  semanticKey: "CONTACT" | "ATTENDEE" | "SPEAKER" | "EXHIBITOR" | "SPONSOR" | "VENDOR" | "STAFF" | "GUEST" | "VIP" | "PRESS";
};

export const DIRECTORY_ROLES: DirectoryRole[] = [
  "PROSPECT",
  "ATTENDEE",
  "SPEAKER",
  "EXHIBITOR_CONTACT",
  "SPONSOR_CONTACT",
  "VENDOR",
  "STAFF",
  "SEATING_GUEST",
  "VIP",
  "PRESS",
];

export const DIRECTORY_ROLE_OPTIONS: DirectoryRoleOption[] = [
  { value: "PROSPECT", label: "Contact", semanticKey: "CONTACT" },
  { value: "ATTENDEE", label: "Attendee", semanticKey: "ATTENDEE" },
  { value: "SPEAKER", label: "Speaker", semanticKey: "SPEAKER" },
  { value: "EXHIBITOR_CONTACT", label: "Exhibitor", semanticKey: "EXHIBITOR" },
  { value: "SPONSOR_CONTACT", label: "Sponsor", semanticKey: "SPONSOR" },
  { value: "VENDOR", label: "Vendor", semanticKey: "VENDOR" },
  { value: "STAFF", label: "Staff", semanticKey: "STAFF" },
  { value: "SEATING_GUEST", label: "Guest", semanticKey: "GUEST" },
  { value: "VIP", label: "VIP", semanticKey: "VIP" },
  { value: "PRESS", label: "Press", semanticKey: "PRESS" },
];

export const ROLE_LABELS: Record<DirectoryRole, string> = {
  ATTENDEE: "Attendee",
  REGISTRANT: "Attendee",
  SPEAKER: "Speaker",
  EXHIBITOR_CONTACT: "Exhibitor",
  SPONSOR_CONTACT: "Sponsor",
  VENDOR: "Vendor",
  STAFF: "Staff",
  VIP: "VIP",
  PRESS: "Press",
  PROSPECT: "Contact",
  MARKETING_CONTACT: "Contact",
  SEATING_GUEST: "Guest",
};

export function canonicalRoleKey(role: DirectoryRole): DirectoryRoleOption["semanticKey"] {
  switch (role) {
    case "PROSPECT":
    case "MARKETING_CONTACT":
      return "CONTACT";
    case "REGISTRANT":
    case "ATTENDEE":
      return "ATTENDEE";
    case "EXHIBITOR_CONTACT":
      return "EXHIBITOR";
    case "SPONSOR_CONTACT":
      return "SPONSOR";
    case "VENDOR":
      return "VENDOR";
    case "SEATING_GUEST":
      return "GUEST";
    case "SPEAKER":
    case "STAFF":
    case "VIP":
    case "PRESS":
      return role;
  }
}

export function uniqueDisplayRoles(roles: DirectoryRole[]): DirectoryRole[] {
  const seen = new Set<DirectoryRoleOption["semanticKey"]>();
  const out: DirectoryRole[] = [];
  for (const role of roles) {
    const key = canonicalRoleKey(role);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(role);
  }
  return out;
}

export function roleChipClasses(role: DirectoryRole): string {
  switch (canonicalRoleKey(role)) {
    case "ATTENDEE":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "SPEAKER":
      return "border-violet-200 bg-violet-50 text-violet-700";
    case "VIP":
    case "PRESS":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "SPONSOR":
    case "EXHIBITOR":
    case "VENDOR":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "STAFF":
      return "border-slate-200 bg-slate-100 text-slate-700";
    case "CONTACT":
      return "border-orange-200 bg-orange-50 text-orange-700";
    case "GUEST":
      return "border-teal-200 bg-teal-50 text-teal-700";
    default:
      return "border-slate-200 bg-slate-100 text-slate-700";
  }
}

export const SOURCE_TYPE_LABELS: Record<string, string> = {
  MANUAL: "Manual",
  CSV_IMPORT: "CSV upload",
  REGISTRATION_INTEGRATION: "Registration integration",
  SPEAKER_INTAKE: "Speaker intake",
  SPEAKER_MODULE: "Backfilled",
  SEATING_MODULE: "Backfilled",
  STAFFING_MODULE: "Backfilled",
  MARKETING_AUDIENCE: "Marketing audience",
  EXHIBITOR_PORTAL: "Exhibitor portal",
  SPONSOR_IMPORT: "Sponsor import",
};

export const MODULE_USAGE_LABELS: Record<string, string> = {
  SPEAKER: "Speakers",
  SEATING_ATTENDEE: "Seating",
  EVENT_PERSON: "Staffing",
  MARKETING_RECIPIENT: "Marketing",
  EXHIBITOR_CONTACT: "Exhibitors",
  SPONSOR_CONTACT: "Sponsors",
};

export const STATUS_LABELS: Record<DirectoryStatus, string> = {
  ACTIVE: "Active",
  NEEDS_REVIEW: "Needs review",
  DUPLICATE_REVIEW: "Duplicate review",
  REMOVED: "Removed",
  MERGED: "Merged",
};

export function statusChipClasses(status: DirectoryStatus): string {
  switch (status) {
    case "ACTIVE":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "NEEDS_REVIEW":
    case "DUPLICATE_REVIEW":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "REMOVED":
    case "MERGED":
      return "border-rose-200 bg-rose-50 text-rose-700";
    default:
      return "border-slate-200 bg-slate-100 text-slate-600";
  }
}
