import { NextResponse } from "next/server";
import { authorizeInternalHealthRequest } from "@/lib/internal-health/internal-health-auth";
import { isLeadRetrievalInternalHealthPath } from "@/lib/internal-health/lead-retrieval/paths";

export function authorizeLeadRetrievalInternalHealthRequest(request: Request):
  | { ok: true }
  | { ok: false; response: NextResponse } {
  const pathname = new URL(request.url).pathname;

  if (!isLeadRetrievalInternalHealthPath(pathname)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    };
  }

  const authResult = authorizeInternalHealthRequest({
    headers: request.headers,
    pathname,
    secret: process.env.INTERNAL_HEALTH_SIGNING_SECRET
  });

  if (authResult.ok) {
    return { ok: true };
  }

  if (authResult.reason === "missing_secret_env") {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Internal health endpoint is not configured." },
        { status: 503 }
      )
    };
  }

  return {
    ok: false,
    response: NextResponse.json(
      { error: "Unauthorized" },
      { status: authResult.reason === "invalid_signature" ? 403 : 401 }
    )
  };
}
