import { GetObjectCommand } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import { getCurrentSessionUser } from "@/lib/auth/session";
import { R2_BUCKET, r2Client } from "@/lib/r2";
import { createAdminClient } from "@/lib/supabase/admin";

function toR2Key(storagePath: string | null) {
  const value = String(storagePath ?? "").trim();
  if (!value || value.startsWith("stub://")) return null;

  if (value.toLowerCase().startsWith("r2://")) {
    const raw = value.slice(5).replace(/^\/+/, "");
    if (!raw) return null;
    if (R2_BUCKET && raw.startsWith(`${R2_BUCKET}/`)) {
      return raw.slice(R2_BUCKET.length + 1);
    }
    return raw;
  }

  if (R2_BUCKET && value.startsWith(`${R2_BUCKET}/`)) {
    return value.slice(R2_BUCKET.length + 1);
  }

  return value.replace(/^\/+/, "");
}

function isMissingObjectError(error: unknown) {
  const code = String((error as { code?: unknown } | null)?.code ?? "").toLowerCase();
  const name = String((error as { name?: unknown } | null)?.name ?? "").toLowerCase();
  const message = String((error as { message?: unknown } | null)?.message ?? "").toLowerCase();
  return (
    code.includes("nosuchkey") ||
    name.includes("nosuchkey") ||
    message.includes("no such key") ||
    message.includes("not found")
  );
}

function isMissingDocumentsTableError(error: unknown) {
  const code = String((error as { code?: unknown } | null)?.code ?? "").trim();
  const message = String((error as { message?: unknown } | null)?.message ?? "").toLowerCase();
  return (
    code === "PGRST205" ||
    message.includes("could not find the table") ||
    message.includes("schema cache") ||
    message.includes("relation \"documents\" does not exist")
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ documentId: string }> }
) {
  try {
    const sessionUser = await getCurrentSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const role = String(sessionUser.role ?? "").trim().toLowerCase();
    if (role !== "exhibitor_admin" && role !== "platform_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const accountId = String(sessionUser.company_id ?? "").trim();
    if (!accountId) {
      return NextResponse.json({ error: "Missing exhibitor scope." }, { status: 400 });
    }

    const { documentId: rawDocumentId } = await params;
    const documentId = String(rawDocumentId ?? "").trim();
    if (!documentId) {
      return NextResponse.json({ error: "Missing document id." }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data, error } = await (supabase as any)
      .from("documents")
      .select("id, account_id, asset_kind, storage_path, file_url")
      .eq("id", documentId)
      .eq("account_id", accountId)
      .eq("is_archived", false)
      .maybeSingle();

    if (error || !data) {
      if (isMissingDocumentsTableError(error)) {
        return NextResponse.json(
          {
            error:
              "Documents & Links Hub is not initialized in this environment yet. Apply the documents migration before previewing items.",
            fallback: true,
          },
          { status: 503 }
        );
      }
      return NextResponse.json({ error: error?.message ?? "Item not found." }, { status: 404 });
    }

    const storagePath = String(data.storage_path ?? "").trim() || null;
    const fileUrl = String(data.file_url ?? "").trim() || null;
    const assetKind = String(data.asset_kind ?? "file").trim().toLowerCase();
    const r2Key = assetKind === "link" ? null : toR2Key(storagePath);

    if (r2Key) {
      if (!R2_BUCKET) {
        return NextResponse.json({ error: "R2 bucket is not configured." }, { status: 500 });
      }

      try {
        const object = await r2Client.send(
          new GetObjectCommand({
            Bucket: R2_BUCKET,
            Key: r2Key,
          })
        );

        const body = object.Body as
          | {
              transformToWebStream?: () => ReadableStream;
              transformToByteArray?: () => Promise<Uint8Array>;
            }
          | null
          | undefined;

        if (!body) {
          return NextResponse.json({ error: "Document object body is empty." }, { status: 404 });
        }

        const headers = new Headers();
        headers.set("Content-Type", String(object.ContentType ?? "application/octet-stream"));
        if (typeof object.ContentLength === "number") {
          headers.set("Content-Length", String(object.ContentLength));
        }

        const nameFromKey = r2Key.split("/").pop() || "document";
        headers.set("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(nameFromKey)}`);

        if (typeof body.transformToWebStream === "function") {
          return new NextResponse(body.transformToWebStream(), { status: 200, headers });
        }

        if (typeof body.transformToByteArray === "function") {
          const bytes = await body.transformToByteArray();
          return new NextResponse(Buffer.from(bytes), { status: 200, headers });
        }

        return NextResponse.json({ error: "Unsupported document body stream." }, { status: 500 });
      } catch (error) {
        if (isMissingObjectError(error)) {
          return NextResponse.json({ error: "Document file not found in storage." }, { status: 404 });
        }
        return NextResponse.json(
          { error: error instanceof Error ? error.message : "Failed loading file from storage." },
          { status: 500 }
        );
      }
    }

    if (fileUrl) {
      return NextResponse.redirect(fileUrl, { status: 302 });
    }

    return NextResponse.json({ error: "Document is available, but no playable storage path is configured." }, { status: 404 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected error" },
      { status: 500 }
    );
  }
}
