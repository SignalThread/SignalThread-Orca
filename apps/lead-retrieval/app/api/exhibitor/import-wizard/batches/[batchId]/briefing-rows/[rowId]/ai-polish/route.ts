import { NextResponse } from "next/server";
import { resolveApiSession } from "@/lib/auth/resolveApiSession";
import { buildDeterministicBriefBundle } from "@/lib/import-wizard/briefing-deterministic-bundle";
import type { BriefingEventKnowledgeItem } from "@/lib/server/briefing-event-knowledge-service";
import { listBriefingKnowledgeForEvent } from "@/lib/server/briefing-event-knowledge-service";
import { loadBatchBriefingContext } from "@/lib/server/import-wizard/batch-briefing-context-service";
import { runBriefingAiPolish } from "@/lib/server/import-wizard/briefing-ai-polish";
import {
  loadBatchBriefingDetail,
  savePolishedBriefingForBatchRow,
} from "@/lib/server/import-wizard/import-batch-briefing-service";
import {
  EventAccessDeniedError,
  resolveValidatedActiveEventIdForUser
} from "@/lib/server/company-event-access";

type RouteCtx = { params: Promise<{ batchId: string; rowId: string }> };

const MAX_SNIPPETS = 24;
const SNIPPET_LEN = 900;

function truncateSnippet(s: string, max: number): string {
  const t = s.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function knowledgeToSnippets(items: BriefingEventKnowledgeItem[]): string[] {
  const out: string[] = [];
  for (const it of items) {
    if (out.length >= MAX_SNIPPETS) break;
    if (it.kind === "notes" && (it.notes_title || it.notes_body)) {
      const title = (it.notes_title ?? "").trim();
      const body = truncateSnippet(it.notes_body ?? "", SNIPPET_LEN);
      out.push(title ? `[Notes] ${title}: ${body}` : `[Notes] ${body}`);
      continue;
    }
    if (it.url) {
      out.push(`[URL] ${truncateSnippet(it.url, SNIPPET_LEN)}`);
    }
    if (it.file_name) {
      out.push(`[File] ${it.file_name}${it.notes_body ? ` — ${truncateSnippet(it.notes_body, 400)}` : ""}`);
    }
  }
  return out;
}

function mapError(e: unknown): NextResponse {
  if (e instanceof EventAccessDeniedError) {
    return NextResponse.json({ error: "Event access denied" }, { status: 403 });
  }
  const msg = e instanceof Error ? e.message : "";
  if (msg === "batch_not_found" || msg === "briefing_row_not_found") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (msg === "briefing_manual_edits_present") {
    return NextResponse.json(
      { error: "This brief has manual edits. Confirm before polishing again.", code: "manual_edits_present" },
      { status: 409 }
    );
  }
  if (/OPENAI_API_KEY is not configured/i.test(msg)) {
    return NextResponse.json({ error: "AI polish is not configured (missing API key).", code: "openai_unconfigured" }, { status: 503 });
  }
  return NextResponse.json({ error: msg || "Internal error" }, { status: 500 });
}

export async function POST(request: Request, ctx: RouteCtx) {
  try {
    const body = (await request.json().catch(() => null)) as { forceOverwriteManualEdits?: boolean } | null;
    const session = await resolveApiSession(request);
    if (String(session.role ?? "").toLowerCase() !== "exhibitor_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const userId = String(session.userId ?? "").trim();
    const companyId = String(session.companyId ?? "").trim();
    if (!userId || !companyId) {
      return NextResponse.json({ error: "Missing exhibitor scope." }, { status: 400 });
    }

    const { batchId, rowId } = await ctx.params;
    const b = String(batchId ?? "").trim();
    const r = String(rowId ?? "").trim();
    if (!b || !r) {
      return NextResponse.json({ error: "Missing batch or row id." }, { status: 400 });
    }

    const detail = await loadBatchBriefingDetail(b, companyId, r);
    if (!detail) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    let preferredEventId: string | null = null;
    try {
      const url = new URL(request.url);
      preferredEventId = String(url.searchParams.get("eventId") ?? "").trim() || null;
    } catch {
      preferredEventId = null;
    }
    const { eventId } = await resolveValidatedActiveEventIdForUser(userId, preferredEventId);

    if (process.env.NODE_ENV === "development") {
      console.log("[event-access-check]", { userId, eventId });
    }

    const foundations = await loadBatchBriefingContext(b, companyId, eventId);
    const bundle = buildDeterministicBriefBundle(detail, foundations);

    let sourceSnippets: string[] = [];
    if (eventId) {
      const knowledge = await listBriefingKnowledgeForEvent(companyId, eventId);
      sourceSnippets = knowledgeToSnippets(knowledge);
    }

    const polished = await runBriefingAiPolish({
      foundations,
      bundle,
      batchNotes: foundations.batchNotes ?? "",
      sourceSnippets,
      manualContext: detail.manualContext,
    });
    const saved = await savePolishedBriefingForBatchRow(b, companyId, r, polished, {
      forceOverwriteManualEdits: body?.forceOverwriteManualEdits === true,
    });

    return NextResponse.json({ polished: saved });
  } catch (e) {
    return mapError(e);
  }
}
