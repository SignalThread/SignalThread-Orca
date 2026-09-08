import { NextResponse } from "next/server";
import { getCurrentSessionUser } from "@/lib/auth/session";

export const runtime = "nodejs";

type TestPayload = {
  baseUrl?: string;
  token?: string;
};

function normalizeBaseUrl(value: string) {
  const trimmed = value.trim().replace(/\/+$/, "");
  const parsed = new URL(trimmed);
  return parsed.toString().replace(/\/+$/, "");
}

export async function POST(request: Request) {
  try {
    const sessionUser = await getCurrentSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    if (sessionUser.role !== "platform_admin") {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const payload = (await request.json().catch(() => ({}))) as TestPayload;
    const rawBaseUrl = String(payload.baseUrl ?? "").trim();
    const token = String(payload.token ?? "").trim();

    if (!rawBaseUrl || !token) {
      return NextResponse.json(
        { success: false, error: "baseUrl and token are required." },
        { status: 400 }
      );
    }

    let baseUrl: string;
    try {
      baseUrl = normalizeBaseUrl(rawBaseUrl);
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid base URL." },
        { status: 400 }
      );
    }

    const response = await fetch(`${baseUrl}/registrants`, {
      method: "GET",
      headers: {
        "x-auth-token": token
      },
      cache: "no-store"
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return NextResponse.json(
        {
          success: false,
          error: body || `Connection failed (${response.status})`
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Connection successful."
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
