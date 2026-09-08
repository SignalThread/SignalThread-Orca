import { PutObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { resolveApiSession } from "@/lib/auth/resolveApiSession";
import { getBatchByIdForCompany } from "@/lib/server/import-wizard/import-batch-service";
import { insertBriefingKnowledgeFile } from "@/lib/server/briefing-event-knowledge-service";
import {
  EventAccessDeniedError,
  resolveValidatedActiveEventIdForUser
} from "@/lib/server/company-event-access";
import { R2_BUCKET, r2Client } from "@/lib/r2";

const ALLOWED_MIME = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 180) || "document";
}

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

    const formData = await request.formData();
    const batchId = String(formData.get("batchId") ?? "").trim();
    const setupOnly = String(formData.get("setup") ?? "") === "1";
    const preferredEventId = String(formData.get("eventId") ?? "").trim() || null;
    const file = formData.get("file");

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
      return NextResponse.json(
        { error: "No event linked to this account. Briefing Knowledge requires an exhibitor event." },
        { status: 400 }
      );
    }

    if (!file || typeof file !== "object" || !("arrayBuffer" in file)) {
      return NextResponse.json({ error: "file is required." }, { status: 400 });
    }

    const nextFile = file as File;
    const mimeType = nextFile.type || null;
    if (mimeType && !ALLOWED_MIME.has(mimeType)) {
      return NextResponse.json(
        { error: "Unsupported file type. Use PDF, Word, or plain text for now." },
        { status: 400 }
      );
    }

    const bytes = Buffer.from(await nextFile.arrayBuffer());
    if (bytes.length > 20 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (max 20 MB)." }, { status: 400 });
    }

    if (!R2_BUCKET) {
      return NextResponse.json({ error: "File storage is not configured." }, { status: 500 });
    }

    const safeName = sanitizeName(nextFile.name || "document");
    const storagePath = `briefing-knowledge/${companyId}/${eventId}/${randomUUID()}-${safeName}`;

    await r2Client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: storagePath,
        Body: bytes,
        ContentType: mimeType ?? undefined,
      })
    );

    await insertBriefingKnowledgeFile({
      companyId,
      eventId,
      userId,
      storagePath,
      fileName: nextFile.name || safeName,
      mimeType,
      byteSize: bytes.length,
    });

    return NextResponse.json({ ok: true, storagePath });
  } catch (e) {
    if (e instanceof EventAccessDeniedError) {
      return NextResponse.json({ error: "Event access denied" }, { status: 403 });
    }
    const msg = e instanceof Error ? e.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
