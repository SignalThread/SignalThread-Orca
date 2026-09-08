import { handleCanonicalEmailSend } from "@/lib/integrations/email/send-route";

export const runtime = "nodejs";

/** Temporary rolling-deployment compatibility route. It does not force Google. */
// Authentication and validated companyId scoping are enforced inside the
// shared handler through resolveApiSession.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ leadId: string }> }
) {
  return handleCanonicalEmailSend(request, params);
}
