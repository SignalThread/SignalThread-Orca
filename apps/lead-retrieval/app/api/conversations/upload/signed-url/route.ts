import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextResponse } from "next/server";
import { resolveApiSession } from "@/lib/auth/resolveApiSession";
import { assertLeadUploadAccess, buildConversationStoragePath } from "@/lib/conversations/upload-access";
import { R2_BUCKET, r2Client } from "@/lib/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIGNED_UPLOAD_URL_TTL_SECONDS = 15 * 60;

function normalizeIncomingContentType(value: unknown) {
  const raw = String(value ?? "").split(";")[0].trim().toLowerCase();
  if (!raw) return "audio/m4a";
  if (!raw.startsWith("audio/")) {
    throw new Error("contentType must be an audio/* mime type");
  }
  return raw;
}

export async function POST(request: Request) {
  try {
    console.log("[conversations/upload/signed-url] route entered", {
      method: request.method,
      contentType: request.headers.get("content-type"),
      contentLength: request.headers.get("content-length"),
      authHeaderPresent: Boolean(request.headers.get("authorization"))
    });

    const sessionUser = await resolveApiSession(request);
    const payload = (await request.json().catch(() => ({}))) as {
      leadId?: unknown;
      contentType?: unknown;
    };

    const leadId = String(payload.leadId ?? "").trim();
    if (!leadId) {
      return NextResponse.json({ error: "leadId is required" }, { status: 400 });
    }

    const uploadContentType = normalizeIncomingContentType(payload.contentType);
    await assertLeadUploadAccess(sessionUser, leadId);

    const storagePath = buildConversationStoragePath(leadId);
    const signedCommand = new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: storagePath,
      ContentType: uploadContentType
    });

    const uploadUrl = await getSignedUrl(r2Client, signedCommand, {
      expiresIn: SIGNED_UPLOAD_URL_TTL_SECONDS
    });

    console.log("[conversations/upload/signed-url] signed URL issued", {
      leadId,
      storagePath,
      expiresInSeconds: SIGNED_UPLOAD_URL_TTL_SECONDS
    });

    return NextResponse.json({
      success: true,
      storagePath,
      uploadUrl,
      uploadMethod: "PUT",
      uploadHeaders: {
        "Content-Type": uploadContentType
      },
      expiresInSeconds: SIGNED_UPLOAD_URL_TTL_SECONDS
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    const message = error instanceof Error ? error.message : "Failed creating signed upload URL";
    const status = message === "Forbidden" ? 403 : message === "Lead not found" ? 404 : 500;
    console.error("[conversations/upload/signed-url] error", {
      message,
      stack: error instanceof Error ? error.stack : null
    });
    return NextResponse.json({ error: message }, { status });
  }
}
