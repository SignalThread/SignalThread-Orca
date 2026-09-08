import { NextResponse } from "next/server";
import { getCurrentSessionUser } from "@/lib/auth/session";
import {
  lookupSalesforceLeads,
  SalesforceIntegrationError,
} from "@/lib/integrations/salesforce/client";

export const runtime = "nodejs";

type LookupPayload = {
  email?: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  limit?: number;
};

export async function POST(request: Request) {
  const sessionUser = await getCurrentSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  if (sessionUser.role !== "platform_admin" && sessionUser.role !== "exhibitor_admin") {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  if (!sessionUser.company_id) {
    return NextResponse.json({ success: false, error: "Missing account scope." }, { status: 400 });
  }

  try {
    const payload = (await request.json().catch(() => ({}))) as LookupPayload;

    const results = await lookupSalesforceLeads({
      accountId: sessionUser.company_id,
      email: payload.email,
      firstName: payload.firstName,
      lastName: payload.lastName,
      company: payload.company,
      limit: payload.limit,
    });

    return NextResponse.json({
      success: true,
      count: results.length,
      records: results,
    });
  } catch (error) {
    if (error instanceof SalesforceIntegrationError) {
      const status =
        error.code === "INVALID_QUERY"
          ? 400
          : error.code === "MISSING_INTEGRATION" || error.code === "MISSING_TOKEN"
            ? 404
            : error.status ?? 500;

      return NextResponse.json({ success: false, error: error.message }, { status });
    }

    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
