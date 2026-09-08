import { createAdminClient } from "@/lib/supabase/admin";
import { userHasExhibitorMobileAppEventAccess } from "@/lib/server/exhibitor-permission-aggregates";
import { requireLeadEventIdForExhibitorViewerUpload } from "@/lib/conversations/conversation-upload-lead-scope";

type SessionUser = {
  userId: string;
  companyId: string;
  role: string;
};

export {
  buildConversationStoragePath,
  isValidConversationStoragePath
} from "@/lib/conversations/conversation-storage-path";

export { requireLeadEventIdForExhibitorViewerUpload } from "@/lib/conversations/conversation-upload-lead-scope";

export async function assertLeadUploadAccess(sessionUser: SessionUser, leadId: string) {
  const role = String(sessionUser.role ?? "").trim().toLowerCase();

  const isPlatform = role === "platform_admin";
  const isExhibitorAdmin = role === "exhibitor_admin";
  const isExhibitorViewer = role === "exhibitor_viewer";

  if (!isPlatform && !isExhibitorAdmin && !isExhibitorViewer) {
    throw new Error("Forbidden");
  }

  const companyId = String(sessionUser.companyId ?? "").trim();
  if (!isPlatform && !companyId) {
    throw new Error("Missing exhibitor scope.");
  }

  const admin = createAdminClient();

  let query = (admin as any).from("leads").select("id, company_id, event_id").eq("id", leadId);

  if (!isPlatform) {
    query = query.eq("company_id", companyId);
  }

  const { data: leadRow, error: leadError } = await query.maybeSingle();
  if (leadError) {
    throw new Error(leadError.message ?? "Failed loading lead.");
  }

  if (!leadRow?.id) {
    throw new Error("Lead not found");
  }

  if (isExhibitorViewer) {
    const eventId = requireLeadEventIdForExhibitorViewerUpload(leadRow.event_id);
    const ok = await userHasExhibitorMobileAppEventAccess({
      userId: sessionUser.userId,
      exhibitorCompanyId: companyId,
      eventId
    });
    if (!ok) {
      throw new Error("Forbidden");
    }
  }

  return {
    id: String(leadRow.id),
    companyId: String(leadRow.company_id ?? "")
  };
}
