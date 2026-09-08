import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import { resolveApiSession } from "@/lib/auth/resolveApiSession";
import { deleteBriefingKnowledgeItem } from "@/lib/server/briefing-event-knowledge-service";
import { R2_BUCKET, r2Client } from "@/lib/r2";

type RouteCtx = { params: Promise<{ itemId: string }> };

export async function DELETE(request: Request, ctx: RouteCtx) {
  try {
    const session = await resolveApiSession(request);
    if (String(session.role ?? "").toLowerCase() !== "exhibitor_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const companyId = String(session.companyId ?? "").trim();
    if (!companyId) {
      return NextResponse.json({ error: "Missing exhibitor scope." }, { status: 400 });
    }

    const { itemId } = await ctx.params;
    const id = String(itemId ?? "").trim();
    if (!id) {
      return NextResponse.json({ error: "Missing id." }, { status: 400 });
    }

    const result = await deleteBriefingKnowledgeItem(id, companyId);
    if (!result) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    if (result.storagePath && R2_BUCKET) {
      try {
        await r2Client.send(
          new DeleteObjectCommand({
            Bucket: R2_BUCKET,
            Key: result.storagePath,
          })
        );
      } catch {
        /* row already deleted; storage cleanup best-effort */
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
