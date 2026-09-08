import { NextResponse } from "next/server";
import { resolveApiSession } from "@/lib/auth/resolveApiSession";
import { abortMultipartUploadWithVerification } from "@/lib/conversations/r2-multipart-abort";
import {
  assertLeadUploadAccess,
  isValidConversationStoragePath
} from "@/lib/conversations/upload-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const sessionUser = await resolveApiSession(request);
    const payload = (await request.json().catch(() => ({}))) as {
      leadId?: unknown;
      storagePath?: unknown;
      uploadId?: unknown;
      reason?: unknown;
    };

    const leadId = String(payload.leadId ?? "").trim();
    const storagePath = String(payload.storagePath ?? "").trim();
    const uploadId = String(payload.uploadId ?? "").trim();
    const reason = String(payload.reason ?? "").trim() || "client_cleanup";

    if (!leadId) {
      return NextResponse.json({ error: "leadId is required" }, { status: 400 });
    }
    if (!storagePath) {
      return NextResponse.json({ error: "storagePath is required" }, { status: 400 });
    }
    if (!uploadId) {
      return NextResponse.json({ error: "uploadId is required" }, { status: 400 });
    }
    if (!isValidConversationStoragePath(leadId, storagePath)) {
      return NextResponse.json({ error: "Invalid storagePath for leadId" }, { status: 400 });
    }

    await assertLeadUploadAccess(sessionUser, leadId);

    const aborted = await abortMultipartUploadWithVerification({
      leadId,
      storagePath,
      uploadId,
      stage: "abort",
      reason
    });

    if (!aborted) {
      return NextResponse.json({ error: "Failed to abort multipart upload." }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      aborted: true,
      leadId,
      storagePath,
      uploadId
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    const message = error instanceof Error ? error.message : "Failed to abort multipart upload";
    const status =
      message === "Forbidden"
        ? 403
        : message === "Lead not found"
          ? 404
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

