import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import { getCurrentSessionUser } from "@/lib/auth/session";
import { r2Client, R2_BUCKET } from "@/lib/r2";
import { createAdminClient } from "@/lib/supabase/admin";

function parseCommaSeparatedTags(value: string) {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
    )
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

function isMissingStorageObjectError(error: unknown) {
  const code = String((error as { code?: unknown } | null)?.code ?? "").toLowerCase();
  const name = String((error as { name?: unknown } | null)?.name ?? "").toLowerCase();
  const message = String((error as { message?: unknown } | null)?.message ?? "").toLowerCase();
  return (
    code.includes("nosuchkey") ||
    name.includes("nosuchkey") ||
    message.includes("not found") ||
    message.includes("does not exist") ||
    message.includes("no such key") ||
    message.includes("404")
  );
}

function deriveR2Key(storagePath: string | null) {
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

function isDocumentAdminRole(role: string) {
  return role === "exhibitor_admin" || role === "platform_admin";
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ documentId: string }> }
) {
  try {
    const sessionUser = await getCurrentSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const role = String(sessionUser.role ?? "").trim().toLowerCase();
    if (!isDocumentAdminRole(role)) {
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
    const { data: documentRow, error: documentError } = await (supabase as any)
      .from("documents")
      .select("id, account_id, asset_kind, storage_path, file_url")
      .eq("id", documentId)
      .eq("account_id", accountId)
      .maybeSingle();

    if (documentError || !documentRow) {
      if (isMissingDocumentsTableError(documentError)) {
        return NextResponse.json(
          {
            error:
              "Documents & Links Hub is not initialized in this environment yet. Apply the documents migration before deleting items.",
            fallback: true,
          },
          { status: 503 }
        );
      }
      return NextResponse.json({ error: documentError?.message ?? "Item not found." }, { status: 404 });
    }

    const assetKind = String(documentRow.asset_kind ?? "file").trim().toLowerCase();
    const r2Key = assetKind === "link" ? null : deriveR2Key(documentRow.storage_path ?? null);

    let storageProvider: "none" | "r2" = "none";
    let storageMissing = false;

    if (r2Key) {
      storageProvider = "r2";
      if (!R2_BUCKET) {
        return NextResponse.json({ error: "R2 bucket is not configured." }, { status: 500 });
      }
      try {
        await r2Client.send(
          new DeleteObjectCommand({
            Bucket: R2_BUCKET,
            Key: r2Key,
          })
        );
      } catch (storageError) {
        if (isMissingStorageObjectError(storageError)) {
          storageMissing = true;
        } else {
          return NextResponse.json(
            {
              error:
                storageError instanceof Error
                  ? storageError.message
                  : "Failed deleting file storage object.",
            },
            { status: 500 }
          );
        }
      }
    }

    const { error: deleteError } = await (supabase as any)
      .from("documents")
      .delete()
      .eq("id", documentId)
      .eq("account_id", accountId);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message ?? "Failed deleting item." }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      documentId,
      storage: {
        provider: storageProvider,
        missingObject: storageMissing,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected error" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ documentId: string }> }
) {
  try {
    const sessionUser = await getCurrentSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const role = String(sessionUser.role ?? "").trim().toLowerCase();
    if (!isDocumentAdminRole(role)) {
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

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};

    if (typeof body.title === "string") {
      const t = body.title.trim();
      if (!t) {
        return NextResponse.json({ error: "title cannot be empty." }, { status: 400 });
      }
      patch.title = t;
    }
    if (typeof body.type === "string") {
      const t = body.type.trim();
      if (!t) {
        return NextResponse.json({ error: "type cannot be empty." }, { status: 400 });
      }
      patch.type = t;
    }
    if (Array.isArray(body.tags)) {
      patch.tags = body.tags.map((t) => String(t).trim()).filter(Boolean);
    } else if (typeof body.tags === "string") {
      patch.tags = parseCommaSeparatedTags(body.tags);
    }
    if (typeof body.rep_sendable === "boolean") {
      patch.rep_sendable = body.rep_sendable;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data, error } = await (supabase as any)
      .from("documents")
      .update(patch)
      .eq("id", documentId)
      .eq("account_id", accountId)
      .select(
        "id, account_id, title, type, asset_kind, event_id, tags, storage_path, file_url, mime_type, uploaded_by, rep_sendable, sent_count, is_archived, created_at, updated_at"
      )
      .maybeSingle();

    if (error) {
      if (isMissingDocumentsTableError(error)) {
        return NextResponse.json(
          {
            error:
              "Documents & Links Hub is not initialized in this environment yet. Apply the documents migration before updating items.",
            fallback: true,
          },
          { status: 503 }
        );
      }
      return NextResponse.json({ error: error.message ?? "Failed updating item." }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "Item not found." }, { status: 404 });
    }

    return NextResponse.json({ success: true, document: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected error" },
      { status: 500 }
    );
  }
}
