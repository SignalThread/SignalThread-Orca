import { Readable } from "node:stream";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import Busboy from "busboy";
import { NextResponse } from "next/server";
import { processConversationUpload } from "@/lib/conversations/process-upload";
import { resolveApiSession } from "@/lib/auth/resolveApiSession";
import { assertLeadUploadAccess } from "@/lib/conversations/upload-access";
import { createAdminClient } from "@/lib/supabase/admin";
import { markConversationAudioFinalized } from "@/lib/conversations/conversation-readiness";
import { runConversationReadinessSideEffect } from "@/lib/conversations/readiness-side-effects";
import { resumeWaitingWorkflowStepsForLead } from "@/lib/workflows/runner/resume-waiting";
import { attemptLeadCapturedWorkflowEmitForLeadId } from "@/lib/workflows/emit/lead-captured-emit-for-lead";
import { R2_BUCKET, r2Client } from "@/lib/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

type ParsedMultipartFields = {
  file: FormDataEntryValue | null;
  leadIdRaw: FormDataEntryValue | null;
  formDataSucceeded: boolean;
};

function normalizeContentType(file: File) {
  const raw = file.type.split(";")[0].trim();
  return raw || "audio/m4a";
}

function isFileLike(value: unknown): value is File {
  if (!value || typeof value !== "object") return false;
  const maybe = value as {
    name?: unknown;
    type?: unknown;
    size?: unknown;
    arrayBuffer?: unknown;
  };
  return (
    typeof maybe.name === "string" &&
    typeof maybe.type === "string" &&
    typeof maybe.size === "number" &&
    typeof maybe.arrayBuffer === "function"
  );
}

async function parseMultipartWithBusboy(request: Request): Promise<{ file: File | null; leadIdRaw: string | null }> {
  const contentTypeHeader = request.headers.get("content-type") || "";
  const body = request.body;

  if (!body) {
    throw new Error("Request body stream is missing.");
  }

  return await new Promise((resolve, reject) => {
    const bb = Busboy({
      headers: {
        "content-type": contentTypeHeader
      },
      limits: {
        files: 1,
        fileSize: MAX_FILE_SIZE_BYTES
      }
    });

    let leadIdRaw: string | null = null;
    let fileFound = false;
    let fileName = "conversation.m4a";
    let fileMimeType = "audio/m4a";
    const fileChunks: Buffer[] = [];
    let fileLimitExceeded = false;

    bb.on("field", (name: string, value: string) => {
      if (name === "leadId") {
        leadIdRaw = value;
      }
    });

    bb.on(
      "file",
      (
        name: string,
        fileStream: NodeJS.ReadableStream,
        info: { filename: string; mimeType: string }
      ) => {
      if (name !== "file") {
        fileStream.resume();
        return;
      }

      fileFound = true;
      fileName = info.filename || fileName;
      fileMimeType = info.mimeType || fileMimeType;

      fileStream.on("data", (chunk: Buffer | string) => {
        fileChunks.push(Buffer.from(chunk));
      });

      fileStream.on("limit", () => {
        fileLimitExceeded = true;
      });

      fileStream.on("error", (error: Error) => {
        reject(error);
      });
      }
    );

    bb.on("error", (error: Error) => {
      reject(error);
    });

    bb.on("finish", () => {
      if (fileLimitExceeded) {
        reject(new Error(`file exceeds ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB limit`));
        return;
      }

      if (!fileFound) {
        resolve({ file: null, leadIdRaw });
        return;
      }

      const fileBuffer = Buffer.concat(fileChunks);
      const parsedFile = new File([fileBuffer], fileName, { type: fileMimeType });
      resolve({ file: parsedFile, leadIdRaw });
    });

    const nodeStream = Readable.fromWeb(body as any);
    nodeStream.on("error", (error: Error) => reject(error));
    nodeStream.pipe(bb);
  });
}

async function parseMultipartFields(request: Request): Promise<ParsedMultipartFields> {
  try {
    const formData = await request.clone().formData();
    return {
      file: formData.get("file"),
      leadIdRaw: formData.get("leadId"),
      formDataSucceeded: true
    };
  } catch (parseError) {
    const message =
      parseError instanceof Error ? parseError.message : "Failed to parse multipart form data";
    console.error("[conversations/upload] request.formData parse failed, using busboy fallback", {
      message,
      stack: parseError instanceof Error ? parseError.stack : null
    });

    const fallback = await parseMultipartWithBusboy(request);
    return {
      file: fallback.file,
      leadIdRaw: fallback.leadIdRaw,
      formDataSucceeded: false
    };
  }
}

export async function POST(request: Request) {
  try {
    console.warn("[conversations/upload] deprecated multipart route hit; prefer signed-url + finalize flow");
    console.log("[conversations/upload] route entered", {
      method: request.method,
      contentType: request.headers.get("content-type"),
      contentLength: request.headers.get("content-length"),
      authHeaderPresent: Boolean(request.headers.get("authorization"))
    });

    console.log("[conversations/upload] resolving auth");
    const sessionUser = await resolveApiSession(request);
    const userId = sessionUser.userId;
    console.log("[conversations/upload] auth resolved", { userId });

    const contentTypeHeader = request.headers.get("content-type") || "";
    if (!contentTypeHeader.includes("multipart/form-data")) {
      return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
    }

    console.log("[conversations/upload] parsing multipart formData");
    let parsedFields: ParsedMultipartFields;
    try {
      parsedFields = await parseMultipartFields(request);
      console.log("[conversations/upload] multipart parse completed", {
        formDataSucceeded: parsedFields.formDataSucceeded
      });
    } catch (parseError) {
      const message =
        parseError instanceof Error ? parseError.message : "Failed to parse multipart form data";
      console.error("[conversations/upload] formData parse failed", {
        message,
        stack: parseError instanceof Error ? parseError.stack : null
      });
      return NextResponse.json(
        {
          error:
            "Invalid multipart form data. Ensure the request is sent as multipart/form-data with a valid file field."
        },
        { status: 400 }
      );
    }

    const { file, leadIdRaw, formDataSucceeded } = parsedFields;

    console.log("[conversations/upload] form fields extracted", {
      formDataSucceeded,
      fileFieldType: file === null ? "null" : typeof file,
      fileFieldCtor:
        file && typeof file === "object" && "constructor" in file
          ? (file as { constructor?: { name?: string } }).constructor?.name ?? null
          : null,
      leadIdRawType: leadIdRaw === null ? "null" : typeof leadIdRaw
    });

    console.log("[conversations/upload][multipart]", {
      hasFileField: Boolean(file),
      fileName: isFileLike(file) ? file.name : null,
      fileType: isFileLike(file) ? file.type : null,
      fileSize: isFileLike(file) ? file.size : null
    });

    if (!isFileLike(file)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    const leadId = String(leadIdRaw ?? "").trim();
    if (!leadId) {
      return NextResponse.json({ error: "leadId is required" }, { status: 400 });
    }

    if (file.size <= 0) {
      return NextResponse.json({ error: "file is empty" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: `file exceeds ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB limit` },
        { status: 400 }
      );
    }

    console.log("[conversations/upload] verifying scoped lead access", { leadId });
    await assertLeadUploadAccess(sessionUser, leadId);

    const timestamp = Date.now();
    const storagePath = `conversations/${leadId}/${timestamp}.m4a`;
    const body = Buffer.from(await file.arrayBuffer());
    const contentType = normalizeContentType(file);

    console.log("[conversations/upload] uploading to R2", {
      bucket: R2_BUCKET,
      key: storagePath,
      contentType,
      bytes: body.byteLength
    });
    await r2Client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: storagePath,
        Body: body,
        ContentType: contentType
      })
    );
    console.log("[conversations/upload] R2 upload complete", { key: storagePath });

    console.log("[conversations/upload] inserting lead_conversations row");
    const admin = createAdminClient();
    const { data: insertedConversation, error: insertError } = await (admin as any)
      .from("lead_conversations")
      .insert({
        lead_id: leadId,
        storage_path: storagePath,
        content_type: contentType,
        transcription_status: "pending",
        transcription_error: null,
        transcript: null,
        transcribed_at: null,
        created_at: new Date().toISOString()
      })
      .select("id")
      .single();

    if (insertError) {
      throw new Error(insertError.message ?? "Failed creating lead conversation.");
    }

    const conversationId = String(insertedConversation?.id ?? "").trim();
    if (!conversationId) {
      throw new Error("Failed creating lead conversation.");
    }

    console.log("[conversations/upload] upload succeeded", {
      conversationId,
      storagePath
    });

    await runConversationReadinessSideEffect("audio_finalized", () =>
      markConversationAudioFinalized({
        supabase: admin,
        leadId,
        conversationId
      })
    );
    await runConversationReadinessSideEffect("resume_after_audio_finalized", () =>
      resumeWaitingWorkflowStepsForLead({ supabase: admin, leadId })
    );

    await processConversationUpload({
      conversationId,
      leadId,
      storagePath,
      contentType
    });

    const { data: finalRow } = await (admin as any)
      .from("lead_conversations")
      .select("transcription_status, synthesis_status")
      .eq("id", conversationId)
      .maybeSingle();

    const workflowEmit = await attemptLeadCapturedWorkflowEmitForLeadId({
      leadId,
      source: "conversation_upload",
      logContext: "app/api/conversations/upload:conversation_upload"
    });

    console.log("[conversations/upload] returning after processing", {
      conversationId,
      storagePath,
      workflowEmitAttempted: workflowEmit.attempted,
      workflowEmitStatus: workflowEmit.status,
      workflowEmitReason: workflowEmit.reason ?? null
    });

    return NextResponse.json({
      success: true,
      conversationId,
      storagePath,
      transcriptionStatus: String(finalRow?.transcription_status ?? "pending"),
      synthesisStatus: finalRow?.synthesis_status != null ? String(finalRow.synthesis_status) : null
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error("[conversations/upload] fatal error", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : null
    });
    const message = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
