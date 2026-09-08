import "server-only";

import type { BriefingEventKnowledgeItem } from "@/lib/import-wizard/briefing-event-knowledge-types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type { BriefingEventKnowledgeItem } from "@/lib/import-wizard/briefing-event-knowledge-types";

/** Primary event for this exhibitor company (first exhibitor row by recency). */
export async function getPrimaryEventIdForCompany(companyId: string): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("exhibitors")
    .select("event_id")
    .eq("company_id", companyId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return String((data as { event_id: string }).event_id);
}

export async function listBriefingKnowledgeForEvent(
  companyId: string,
  eventId: string
): Promise<BriefingEventKnowledgeItem[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("briefing_event_knowledge_items")
    .select(
      "id, company_id, event_id, content_group, kind, url, storage_path, file_name, mime_type, byte_size, notes_title, notes_body, created_at, updated_at"
    )
    .eq("company_id", companyId)
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as BriefingEventKnowledgeItem[];
}

export async function countBriefingKnowledgeForEvent(
  companyId: string,
  eventId: string
): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { count, error } = await supabase
    .from("briefing_event_knowledge_items")
    .select("*", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("event_id", eventId);

  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function insertBriefingKnowledgeUrl(opts: {
  companyId: string;
  eventId: string;
  userId: string;
  url: string;
}): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("briefing_event_knowledge_items").insert({
    company_id: opts.companyId,
    event_id: opts.eventId,
    content_group: "website_sources",
    kind: "url",
    url: opts.url.trim(),
    created_by: opts.userId,
  } as never);

  if (error) throw new Error(error.message);
}

export async function insertBriefingKnowledgeNotes(opts: {
  companyId: string;
  eventId: string;
  userId: string;
  title?: string | null;
  body: string;
}): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("briefing_event_knowledge_items").insert({
    company_id: opts.companyId,
    event_id: opts.eventId,
    content_group: "briefing_notes",
    kind: "notes",
    notes_title: opts.title?.trim() || null,
    notes_body: opts.body.trim(),
    created_by: opts.userId,
  } as never);

  if (error) throw new Error(error.message);
}

export async function insertBriefingKnowledgeFile(opts: {
  companyId: string;
  eventId: string;
  userId: string;
  storagePath: string;
  fileName: string;
  mimeType: string | null;
  byteSize: number;
}): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("briefing_event_knowledge_items").insert({
    company_id: opts.companyId,
    event_id: opts.eventId,
    content_group: "documents",
    kind: "file",
    storage_path: opts.storagePath,
    file_name: opts.fileName,
    mime_type: opts.mimeType,
    byte_size: opts.byteSize,
    created_by: opts.userId,
  } as never);

  if (error) throw new Error(error.message);
}

export async function deleteBriefingKnowledgeItem(
  id: string,
  companyId: string
): Promise<{ storagePath: string | null } | null> {
  const supabase = await createSupabaseServerClient();
  const { data: row, error: fetchErr } = await supabase
    .from("briefing_event_knowledge_items")
    .select("id, storage_path")
    .eq("id", id)
    .eq("company_id", companyId)
    .maybeSingle();

  if (fetchErr || !row) return null;

  const { error: delErr } = await supabase.from("briefing_event_knowledge_items").delete().eq("id", id).eq("company_id", companyId);

  if (delErr) throw new Error(delErr.message);

  const sp = (row as { storage_path: string | null }).storage_path;
  return { storagePath: sp };
}
