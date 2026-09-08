export type BriefingKnowledgeContentGroup = "website_sources" | "documents" | "briefing_notes";
export type BriefingKnowledgeKind = "url" | "file" | "notes";

export type BriefingEventKnowledgeItem = {
  id: string;
  company_id: string;
  event_id: string;
  content_group: BriefingKnowledgeContentGroup;
  kind: BriefingKnowledgeKind;
  url: string | null;
  storage_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  byte_size: number | null;
  notes_title: string | null;
  notes_body: string | null;
  created_at: string;
  updated_at: string;
};
