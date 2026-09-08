import { NextResponse } from "next/server";
import { getCurrentSessionUser } from "@/lib/auth/session";
import { SalesforceIntegrationError, salesforceFetch } from "@/lib/integrations/salesforce/client";

export const runtime = "nodejs";

export async function GET() {
  const sessionUser = await getCurrentSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!sessionUser.company_id) {
    return NextResponse.json({ error: "Missing account scope." }, { status: 400 });
  }

  let salesforceResponse: Response;
  try {
    salesforceResponse = await salesforceFetch(sessionUser.company_id, "/services/data/v60.0/sobjects/Lead", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        FirstName: "Ali",
        LastName: "Test Lead",
        Company: "Lead Intel",
        Email: "ali@testleadintel.com"
      })
    });
  } catch (error) {
    if (error instanceof SalesforceIntegrationError) {
      return NextResponse.json({ error: error.message }, { status: error.status ?? 400 });
    }
    return NextResponse.json({ error: "Salesforce test request failed." }, { status: 500 });
  }

  let rawPayload: unknown = null;
  try {
    rawPayload = await salesforceResponse.json();
  } catch {
    rawPayload = { error: "Non-JSON response from Salesforce." };
  }

  return NextResponse.json(rawPayload, { status: salesforceResponse.status });
}
