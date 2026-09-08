import { PutObjectCommand } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import { resolveApiSession } from "@/lib/auth/resolveApiSession";
import { R2_BUCKET, r2Client } from "@/lib/r2";
import { createAdminClient } from "@/lib/supabase/admin";

type DocumentRow = {
  id: string;
  account_id: string;
  title: string;
  type: string;
  asset_kind: "file" | "link";
  event_id: string | null;
  tags: string[] | null;
  storage_path: string | null;
  file_url: string | null;
  mime_type: string | null;
  uploaded_by: string | null;
  rep_sendable: boolean;
  sent_count: number;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  event: { id: string; name: string } | { id: string; name: string }[] | null;
  uploaded_by_user:
    | { id: string; full_name: string | null; email: string | null }
    | { id: string; full_name: string | null; email: string | null }[]
    | null;
};

function isMissingDocumentsTableError(error: unknown) {
  const code = String((error as { code?: unknown } | null)?.code ?? "").trim();
  const message = String((error as { message?: unknown } | null)?.message ?? "").toLowerCase();
  return (
    code === "PGRST205" ||
    message.includes("could not find the table") ||
    message.includes("schema cache") ||
    message.includes("relation \"documents\" does not exist") ||
    message.includes("relation \"document_sends\" does not exist")
  );
}

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

function sanitizeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
}

function toRepSendable(value: FormDataEntryValue | null) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "on" || normalized === "true" || normalized === "1";
}

function isDocumentAdminRole(role: string) {
  return role === "exhibitor_admin" || role === "platform_admin";
}

function normalizeAssetKind(value: FormDataEntryValue | null): "file" | "link" {
  return String(value ?? "").trim().toLowerCase() === "link" ? "link" : "file";
}

function normalizeHttpUrl(value: string) {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

async function assertEventBelongsToAccount(input: {
  supabase: any;
  eventId: string;
  accountId: string;
}) {
  const { data, error } = await input.supabase
    .from("events")
    .select("id")
    .eq("id", input.eventId)
    .eq("company_id", input.accountId)
    .maybeSingle();

  if (error || !data) {
    return false;
  }
  return true;
}

export async function GET(request: Request) {
  const loadtestDebug = process.env.LOADTEST_DEBUG === "true";
  const routeName = "documents";
  const routeStart = Date.now();
  let responseStatus = 500;
  let queryCount = 0;
  const incrementQueryCount = (label: string) => {
    queryCount += 1;
    if (loadtestDebug) {
      console.log(`[SUPABASE QUERY ${queryCount}] ${label}`);
    }
  };
  if (loadtestDebug) {
    console.log(`[LOADTEST] route=${routeName} phase=start start_ts=${new Date(routeStart).toISOString()}`);
  }
  const respond = (response: NextResponse) => {
    responseStatus = response.status;
    return response;
  };
  try {
      const isDev = process.env.NODE_ENV !== "production";
      if (isDev) {
        console.log("[exhibitor/documents] request received", {
          method: request.method,
          url: request.url,
          contentType: request.headers.get("content-type")
        });
      }

      const sessionUser = await resolveApiSession(request);
      const role = String(sessionUser.role ?? "").trim().toLowerCase();

      if (!isDocumentAdminRole(role)) {
        return respond(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
      }

      const accountId = String(sessionUser.companyId ?? "").trim();
      if (!accountId) {
        return respond(NextResponse.json({ error: "Missing exhibitor scope." }, { status: 400 }));
      }

      const { searchParams } = new URL(request.url);
      const q = String(searchParams.get("q") ?? "").trim();
      const type = String(searchParams.get("type") ?? "").trim();
      const eventId = String(searchParams.get("eventId") ?? "").trim();
      const requestedCompanyId = String(searchParams.get("companyId") ?? "").trim();
      const tag = String(searchParams.get("tag") ?? "").trim();

      if (isDev) {
        console.log("[exhibitor/documents] resolved scope", {
          userId: sessionUser.userId,
          role,
          accountId,
          companyId: sessionUser.companyId ?? null,
          exhibitorCompanyId: sessionUser.companyId ?? null,
          requestedCompanyId: requestedCompanyId || null,
          eventId: eventId || null
        });
      }

      const supabase = createAdminClient();
      let documentsQuery = (supabase as any)
        .from("documents")
        .select(
          "id, account_id, title, type, asset_kind, event_id, tags, storage_path, file_url, mime_type, uploaded_by, rep_sendable, sent_count, is_archived, created_at, updated_at, event:events(id, name), uploaded_by_user:users(id, full_name, email)"
        )
        .eq("account_id", accountId)
        .eq("is_archived", false)
        .order("updated_at", { ascending: false });

      if (q) {
        const escaped = q.replace(/[%_]/g, "\\$&");
        documentsQuery = documentsQuery.or(`title.ilike.%${escaped}%,type.ilike.%${escaped}%`);
      }

      if (type) {
        documentsQuery = documentsQuery.eq("type", type);
      }

      if (eventId) {
        // Include event-scoped docs + account-level global docs.
        documentsQuery = documentsQuery.or(`event_id.eq.${eventId},event_id.is.null`);
      }

      if (tag) {
        documentsQuery = documentsQuery.contains("tags", [tag]);
      }

      incrementQueryCount("documents main fetch");
      const { data: docsData, error: docsError } = (await documentsQuery) as {
        data: DocumentRow[] | null;
        error: { message?: string } | null;
      };

      if (docsError) {
        const missingTable = isMissingDocumentsTableError(docsError);
        if (missingTable) {
          return respond(NextResponse.json({
            documents: [],
            filters: {
              types: [],
              tags: [],
              events: [],
            },
            fallback: true,
            fallback_reason: "documents_tables_unavailable",
            warning:
              "Documents & Links Hub tables are not available in this environment yet. Showing an empty state until migrations are applied.",
          }));
        }

        return respond(NextResponse.json(
          { error: docsError?.message ?? "Failed loading documents and links." },
          { status: 500 }
        ));
      }

      const docs = (docsData ?? []) as DocumentRow[];

      if (isDev) {
        console.log("[exhibitor/documents] query result", {
          finalQueryFilters: {
            account_id: accountId,
            is_archived: false,
            q: q || null,
            type: type || null,
            eventId: eventId || null,
            eventScopeMode: eventId ? "event_or_global" : "all_events",
            tag: tag || null
          },
          rawRowCount: docs.length
        });
      }

      const mappedDocuments = docs.map((doc) => ({
          id: doc.id,
          title: doc.title,
          type: doc.type,
          asset_kind: doc.asset_kind ?? "file",
          event_id: doc.event_id,
          event_name:
            doc.event_id
              ? (Array.isArray(doc.event) ? doc.event[0] : doc.event)?.name ?? "Unknown Event"
              : null,
          tags: Array.isArray(doc.tags) ? doc.tags : [],
          storage_path: doc.storage_path,
          file_url: doc.file_url,
          mime_type: doc.mime_type,
          uploaded_by: doc.uploaded_by,
          uploaded_by_name:
            ((Array.isArray(doc.uploaded_by_user) ? doc.uploaded_by_user[0] : doc.uploaded_by_user)?.full_name ??
              (Array.isArray(doc.uploaded_by_user) ? doc.uploaded_by_user[0] : doc.uploaded_by_user)?.email ??
              "Unknown user"),
          rep_sendable: Boolean(doc.rep_sendable),
          sent_count: Number(doc.sent_count ?? 0),
          is_archived: Boolean(doc.is_archived),
          created_at: doc.created_at,
          updated_at: doc.updated_at,
          preview_href: `/api/exhibitor/documents/${doc.id}/preview`,
        }));

      if (isDev) {
        console.log("[exhibitor/documents] response counts", {
          mappedRowCount: mappedDocuments.length,
          returnedRowCount: mappedDocuments.length
        });
      }

      return respond(NextResponse.json({
        documents: mappedDocuments,
        filters: {
          types: [],
          tags: [],
          events: [],
        },
      }));
  } catch (error) {
    if (error instanceof Response) {
      responseStatus = error.status;
      return error;
    }
    return respond(NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected error" },
      { status: 500 }
    ));
  } finally {
    if (loadtestDebug) {
      console.log(`[LOADTEST] route=${routeName} status=${responseStatus} duration_ms=${Date.now() - routeStart} query_count=${queryCount}`);
    }
  }
}

export async function POST(request: Request) {
  const loadtestDebug = process.env.LOADTEST_DEBUG === "true";
  const routeName = "documents_post";
  const routeStart = Date.now();
  let responseStatus = 500;
  let queryCount = 0;
  const incrementQueryCount = (label: string) => {
    queryCount += 1;
    if (loadtestDebug) {
      console.log(`[SUPABASE QUERY ${queryCount}] ${label}`);
    }
  };
  if (loadtestDebug) {
    console.log(`[LOADTEST] route=${routeName} phase=start start_ts=${new Date(routeStart).toISOString()}`);
  }
  const respond = (response: NextResponse) => {
    responseStatus = response.status;
    return response;
  };
  try {
      const sessionUser = await resolveApiSession(request);
      const role = String(sessionUser.role ?? "").trim().toLowerCase();

      if (!isDocumentAdminRole(role)) {
        return respond(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
      }

      const accountId = String(sessionUser.companyId ?? "").trim();
      if (!accountId) {
        return respond(NextResponse.json({ error: "Missing exhibitor scope." }, { status: 400 }));
      }

      const formData = await request.formData();
      const assetKind = normalizeAssetKind(formData.get("assetKind"));
      const file = formData.get("file");
      const explicitTitle = String(formData.get("title") ?? "").trim();
      const type = String(formData.get("type") ?? "").trim();
      const eventId = String(formData.get("eventId") ?? "").trim();
      const urlValue = String(formData.get("url") ?? "").trim();
      const tags = parseCommaSeparatedTags(String(formData.get("tags") ?? ""));
      const repSendable = toRepSendable(formData.get("repSendable"));

      const fileName =
        file && typeof file === "object" && "name" in file ? sanitizeFileName(String(file.name ?? "document")) : null;
      const title = explicitTitle || fileName || "";

      if (!title) {
        return respond(NextResponse.json({ error: "Name is required." }, { status: 400 }));
      }

      if (!type) {
        return respond(NextResponse.json({ error: "Type is required." }, { status: 400 }));
      }

      const supabase = createAdminClient();
      if (eventId) {
        const eventOk = await assertEventBelongsToAccount({ supabase, eventId, accountId });
        if (!eventOk) {
          return respond(NextResponse.json({ error: "Event access denied." }, { status: 403 }));
        }
      }

      let storagePath: string | null = null;
      let fileUrl: string | null = null;
      let mimeType: string | null = null;
      let uploadMode: "stored" | "stubbed" = "stubbed";
      let uploadWarning: string | null = null;

      if (assetKind === "link") {
        const normalizedUrl = normalizeHttpUrl(urlValue);
        if (!normalizedUrl) {
          return respond(NextResponse.json({ error: "A valid http(s) URL is required." }, { status: 400 }));
        }
        fileUrl = normalizedUrl;
        uploadMode = "stored";
      } else if (file && typeof file === "object" && "arrayBuffer" in file && "name" in file) {
        const nextFile = file as File;
        if (!nextFile.name || nextFile.size <= 0) {
          return respond(NextResponse.json({ error: "File is required." }, { status: 400 }));
        }
        mimeType = nextFile.type || null;
        storagePath = `documents/${accountId}/${Date.now()}-${sanitizeFileName(nextFile.name || "document")}`;

        try {
          if (!R2_BUCKET) {
            return respond(NextResponse.json({ error: "R2 bucket is not configured." }, { status: 500 }));
          }

          const bytes = Buffer.from(await nextFile.arrayBuffer());
          await r2Client.send(
            new PutObjectCommand({
              Bucket: R2_BUCKET,
              Key: storagePath,
              Body: bytes,
              ContentType: mimeType ?? undefined,
            })
          );
          uploadMode = "stored";
          fileUrl = null;
        } catch (error) {
          return respond(NextResponse.json(
            {
              error: error instanceof Error ? error.message : "Failed uploading file to R2.",
            },
            { status: 500 }
          ));
        }
      } else {
        return respond(NextResponse.json({ error: "File is required." }, { status: 400 }));
      }

      const payload = {
        account_id: accountId,
        title,
        type,
        asset_kind: assetKind,
        event_id: eventId || null,
        tags,
        storage_path: storagePath,
        file_url: fileUrl,
        mime_type: mimeType,
        uploaded_by: sessionUser.userId,
        rep_sendable: repSendable,
        sent_count: 0,
        is_archived: false,
      };

      incrementQueryCount("documents insert");
      const { data, error } = await (supabase as any)
        .from("documents")
        .insert(payload)
        .select(
          "id, account_id, title, type, asset_kind, event_id, tags, storage_path, file_url, mime_type, uploaded_by, rep_sendable, sent_count, is_archived, created_at, updated_at"
        )
        .maybeSingle();

      if (error || !data) {
        if (isMissingDocumentsTableError(error)) {
          return respond(NextResponse.json(
            {
              error:
                "Documents & Links Hub is not initialized in this environment yet. Apply the documents migration before saving items.",
              fallback: true,
            },
            { status: 503 }
          ));
        }
        return respond(NextResponse.json({ error: error?.message ?? "Failed creating item." }, { status: 500 }));
      }

      return respond(NextResponse.json({
        document: data,
        upload: {
          mode: uploadMode,
          warning: uploadWarning,
        },
      }));
  } catch (error) {
    if (error instanceof Response) {
      responseStatus = error.status;
      return error;
    }
    return respond(NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected error" },
      { status: 500 }
    ));
  } finally {
    if (loadtestDebug) {
      console.log(`[LOADTEST] route=${routeName} status=${responseStatus} duration_ms=${Date.now() - routeStart} query_count=${queryCount}`);
    }
  }
}
