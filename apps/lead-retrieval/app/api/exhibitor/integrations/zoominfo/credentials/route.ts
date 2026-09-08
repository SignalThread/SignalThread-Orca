import { NextResponse } from "next/server";
import { getCurrentSessionUser, isCompanyAccountAdminSession } from "@/lib/auth/session";
import { saveZoomInfoBearerTokenForCompany } from "@/lib/server/integrations/zoominfo";

export const runtime = "nodejs";

type Body = {
  bearerToken?: string | null;
  connectionLabel?: string | null;
};

export async function POST(request: Request) {
  const sessionUser = await getCurrentSessionUser();
  if (!sessionUser?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isCompanyAccountAdminSession(sessionUser)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!sessionUser.company_id) {
    return NextResponse.json({ error: "Missing company context." }, { status: 400 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { error } = await saveZoomInfoBearerTokenForCompany({
    companyId: sessionUser.company_id,
    userId: sessionUser.id,
    bearerToken: body.bearerToken,
    connectionLabel: body.connectionLabel
  });

  if (error) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
