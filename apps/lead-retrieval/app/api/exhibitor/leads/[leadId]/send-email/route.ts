import { handleCanonicalEmailSend } from "@/lib/integrations/email/send-route";

export const runtime = "nodejs";

// Authentication and validated companyId scoping are enforced inside the
// shared handler through resolveApiSession; this route intentionally stays thin.

export async function POST(
  request: Request,
  { params }: { params: Promise<{ leadId: string }> }
) {
  return handleCanonicalEmailSend(request, params);
}
