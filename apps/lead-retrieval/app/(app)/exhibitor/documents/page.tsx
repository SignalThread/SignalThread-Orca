import { requireRole } from "@/lib/auth/session";
import {
  DocumentsLinksWorkspace,
  type DocumentsLinksTab,
} from "@/components/exhibitor/documents-links-workspace";
import { getGoogleWorkspaceConnectionStatus } from "@/lib/integrations/google/connection-status";

export default async function ExhibitorDocumentsPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  const user = await requireRole("exhibitor_admin");
  const companyId = String(user.company_id ?? "");
  const google = await getGoogleWorkspaceConnectionStatus(user.id, companyId).catch(() => null);
  const requestedTab = (await searchParams)?.tab;
  const activeTab: DocumentsLinksTab = requestedTab === "email-templates" ? "email-templates" : "resources";
  return (
    <DocumentsLinksWorkspace
      activeTab={activeTab}
      googleWorkspace={{
        ready: Boolean(google?.connected && google.capabilities.gmailSend && google.identity?.email),
        senderEmail: google?.identity?.email ?? null
      }}
    />
  );
}
