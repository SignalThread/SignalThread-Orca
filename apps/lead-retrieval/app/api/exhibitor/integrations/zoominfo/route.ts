import { NextResponse } from "next/server";
import { getCurrentSessionUser, isCompanyAccountAdminSession } from "@/lib/auth/session";
import {
  disconnectZoomInfoConnection,
  getZoomInfoConnectionForCompany,
  toZoomInfoPublicStatus
} from "@/lib/server/integrations/zoominfo";

export const runtime = "nodejs";

export async function GET() {
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

  const { row, error } = await getZoomInfoConnectionForCompany(sessionUser.company_id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const pub = toZoomInfoPublicStatus(row);
  return NextResponse.json(pub);
}

export async function DELETE() {
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

  const { deleted, error } = await disconnectZoomInfoConnection(sessionUser.company_id);
  if (error) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: 500 });
  }

  return NextResponse.json({ success: true, disconnected: deleted });
}
