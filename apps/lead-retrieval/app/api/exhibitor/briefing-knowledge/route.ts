import { NextResponse } from "next/server";
import { resolveApiSession } from "@/lib/auth/resolveApiSession";
import { getBatchByIdForCompany } from "@/lib/server/import-wizard/import-batch-service";
import {
  insertBriefingKnowledgeNotes,
  insertBriefingKnowledgeUrl,
  listBriefingKnowledgeForEvent,
} from "@/lib/server/briefing-event-knowledge-service";
import {
  EventAccessDeniedError,
  resolveValidatedActiveEventIdForUser
} from "@/lib/server/company-event-access";

function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** GET ?batchId= — list items + counts for the event scoped to this exhibitor company. */
export async function GET(request: Request) {
  try {
    const session = await resolveApiSession(request);
    if (String(session.role ?? "").toLowerCase() !== "exhibitor_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const userId = String(session.userId ?? "").trim();
    const companyId = String(session.companyId ?? "").trim();
    if (!userId || !companyId) {
      return NextResponse.json({ error: "Missing exhibitor scope." }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const batchId = String(searchParams.get("batchId") ?? "").trim();
    const setupOnly = searchParams.get("setup") === "1";
    const preferredEventId = String(searchParams.get("eventId") ?? "").trim() || null;
    if (!batchId && !setupOnly) {
      return NextResponse.json({ error: "batchId is required unless setup=1." }, { status: 400 });
    }

    if (batchId) {
      const batch = await getBatchByIdForCompany(batchId, companyId);
      if (!batch) {
        return NextResponse.json({ error: "Not found." }, { status: 404 });
      }
    }

    const { eventId } = await resolveValidatedActiveEventIdForUser(userId, preferredEventId);

    if (process.env.NODE_ENV === "development") {
      console.log("[event-access-check]", { userId, eventId });
    }

    if (!eventId) {
      return NextResponse.json({
        items: [],
        counts: { total: 0, website_sources: 0, documents: 0, briefing_notes: 0 },
        eventId: null,
        message: "No event is linked to this exhibitor account yet. Briefing Knowledge requires an event scope.",
      });
    }

    const items = await listBriefingKnowledgeForEvent(companyId, eventId);
    const counts = {
      total: items.length,
      website_sources: items.filter((i) => i.content_group === "website_sources").length,
      documents: items.filter((i) => i.content_group === "documents").length,
      briefing_notes: items.filter((i) => i.content_group === "briefing_notes").length,
    };

    return NextResponse.json({ items, counts, eventId });
  } catch (e) {
    if (e instanceof EventAccessDeniedError) {
      return NextResponse.json({ error: "Event access denied" }, { status: 403 });
    }
    const msg = e instanceof Error ? e.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** POST JSON: { batchId, kind: 'url' | 'notes', url?, title?, body? } */
export async function POST(request: Request) {
  try {
    const session = await resolveApiSession(request);
    if (String(session.role ?? "").toLowerCase() !== "exhibitor_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const companyId = String(session.companyId ?? "").trim();
    const userId = String(session.userId ?? "").trim();
    if (!companyId || !userId) {
      return NextResponse.json({ error: "Missing exhibitor scope." }, { status: 400 });
    }

    const body = (await request.json().catch(() => null)) as {
      batchId?: string;
      setup?: boolean;
      kind?: string;
      url?: string;
      title?: string;
      body?: string;
      eventId?: string;
    } | null;

    const batchId = String(body?.batchId ?? "").trim();
    const setupOnly = body?.setup === true;
    if (!batchId && !setupOnly) {
      return NextResponse.json({ error: "batchId is required unless setup is true." }, { status: 400 });
    }

    if (batchId) {
      const batch = await getBatchByIdForCompany(batchId, companyId);
      if (!batch) {
        return NextResponse.json({ error: "Not found." }, { status: 404 });
      }
    }

    const preferredEventId = body?.eventId != null ? String(body.eventId).trim() || null : null;
    const { eventId } = await resolveValidatedActiveEventIdForUser(userId, preferredEventId);

    if (process.env.NODE_ENV === "development") {
      console.log("[event-access-check]", { userId, eventId });
    }

    if (!eventId) {
      return NextResponse.json(
        { error: "No event linked to this account. Briefing Knowledge requires an exhibitor event." },
        { status: 400 }
      );
    }

    const kind = String(body?.kind ?? "").trim();
    if (kind === "url") {
      const url = String(body?.url ?? "").trim();
      if (!url || !isHttpUrl(url)) {
        return NextResponse.json({ error: "A valid http(s) URL is required." }, { status: 400 });
      }
      await insertBriefingKnowledgeUrl({ companyId, eventId, userId, url });
      return NextResponse.json({ ok: true });
    }

    if (kind === "notes") {
      const notesBody = String(body?.body ?? "").trim();
      if (!notesBody) {
        return NextResponse.json({ error: "Notes text is required." }, { status: 400 });
      }
      const title = body?.title != null ? String(body.title).trim() : "";
      await insertBriefingKnowledgeNotes({
        companyId,
        eventId,
        userId,
        title: title || null,
        body: notesBody,
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "kind must be 'url' or 'notes'. Use multipart upload for files." }, { status: 400 });
  } catch (e) {
    if (e instanceof EventAccessDeniedError) {
      return NextResponse.json({ error: "Event access denied" }, { status: 403 });
    }
    const msg = e instanceof Error ? e.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
