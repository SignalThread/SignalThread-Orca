export type RegistrationStatus =
  | "NOT_REGISTERED"
  | "INVITED"
  | "REGISTERED"
  | "PENDING_APPROVAL"
  | "WAITLISTED"
  | "CANCELLED"
  | "TRANSFERRED"
  | "CHECKED_IN"
  | "NO_SHOW";

export type AttendanceStatus = "EXPECTED" | "CONFIRMED" | "ATTENDED" | "CANCELLED" | "NO_SHOW";

export type AttendeeSource =
  | "MANUAL"
  | "CSV_IMPORT"
  | "REGISTRATION_INTEGRATION"
  | "MARKETING_CAMPAIGN"
  | "SPEAKER_INTAKE"
  | "EXHIBITOR_PORTAL"
  | "SPONSOR_UPLOAD"
  | "BACKFILLED"
  | "PORTAL_SELF_UPDATE";

export type SyncStatus =
  | "LOCAL_ONLY"
  | "SYNCED"
  | "PENDING_WRITEBACK"
  | "WRITEBACK_FAILED"
  | "CONFLICT"
  | "READ_ONLY_EXTERNAL"
  | "STALE";

export const REGISTRATION_STATUSES: RegistrationStatus[] = [
  "NOT_REGISTERED", "INVITED", "REGISTERED", "PENDING_APPROVAL", "WAITLISTED", "CANCELLED", "TRANSFERRED", "CHECKED_IN", "NO_SHOW",
];

export const ATTENDANCE_STATUSES: AttendanceStatus[] = ["EXPECTED", "CONFIRMED", "ATTENDED", "CANCELLED", "NO_SHOW"];

export const REGISTRATION_STATUS_LABELS: Record<RegistrationStatus, string> = {
  NOT_REGISTERED: "Not registered",
  INVITED: "Invited",
  REGISTERED: "Registered",
  PENDING_APPROVAL: "Pending approval",
  WAITLISTED: "Waitlisted",
  CANCELLED: "Cancelled",
  TRANSFERRED: "Transferred",
  CHECKED_IN: "Checked in",
  NO_SHOW: "No-show",
};

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  EXPECTED: "Expected",
  CONFIRMED: "Confirmed",
  ATTENDED: "Attended",
  CANCELLED: "Cancelled",
  NO_SHOW: "No-show",
};

export function registrationStatusChip(status: RegistrationStatus): string {
  switch (status) {
    case "REGISTERED":
    case "CHECKED_IN":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "INVITED":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "PENDING_APPROVAL":
    case "WAITLISTED":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "CANCELLED":
    case "NO_SHOW":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "TRANSFERRED":
      return "border-slate-200 bg-slate-100 text-slate-600";
    default:
      return "border-slate-200 bg-slate-50 text-slate-500";
  }
}

export const SOURCE_LABELS: Record<AttendeeSource, string> = {
  MANUAL: "Manual",
  CSV_IMPORT: "CSV import",
  REGISTRATION_INTEGRATION: "Registration",
  MARKETING_CAMPAIGN: "Marketing",
  SPEAKER_INTAKE: "Speaker intake",
  EXHIBITOR_PORTAL: "Exhibitor portal",
  SPONSOR_UPLOAD: "Sponsor upload",
  BACKFILLED: "Backfilled",
  PORTAL_SELF_UPDATE: "Portal",
};

export const SYNC_LABELS: Record<SyncStatus, string> = {
  LOCAL_ONLY: "Local only",
  SYNCED: "Synced",
  PENDING_WRITEBACK: "Pending sync",
  WRITEBACK_FAILED: "Sync failed",
  CONFLICT: "Conflict",
  READ_ONLY_EXTERNAL: "Read-only",
  STALE: "Stale",
};

export function syncStatusChip(status: SyncStatus): string {
  switch (status) {
    case "SYNCED":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "CONFLICT":
    case "WRITEBACK_FAILED":
    case "STALE":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "PENDING_WRITEBACK":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "READ_ONLY_EXTERNAL":
      return "border-slate-200 bg-slate-100 text-slate-600";
    default:
      return "border-slate-200 bg-slate-50 text-slate-500";
  }
}
