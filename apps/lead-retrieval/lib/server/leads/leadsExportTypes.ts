export type ExportSession = {
  userId: string;
  companyId: string;
  role: string;
};

export type ExportScope =
  | { kind: "exhibitor"; companyId: string; eventId: string | null }
  | { kind: "organizer"; eventId: string }
  | { kind: "platform"; companyId: string; eventId: string | null };

export type ExportFilters = {
  q: string | null;
  status: string | null;
  /** When set, export is limited to these lead ids (must still satisfy scope). */
  leadIds?: string[] | null;
};
