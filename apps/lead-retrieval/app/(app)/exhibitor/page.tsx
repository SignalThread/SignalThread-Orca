import { redirect } from "next/navigation";
import { getCurrentSessionUser } from "@/lib/auth/session";
import { getExhibitorWebEntryPathAfterSignIn } from "@/lib/server/exhibitor-web-entry-redirect";
import { EXHIBITOR_WEB_ENTRY_RESOLVER_PATH } from "@/lib/exhibitor/exhibitor-web-home";

export default async function ExhibitorRootSegmentPage() {
  const session = await getCurrentSessionUser();
  if (!session) {
    redirect("/login");
  }
  const role = session.role;
  if (role === "exhibitor_admin" || role === "exhibitor_viewer") {
    const path = await getExhibitorWebEntryPathAfterSignIn({
      userId: session.id,
      companyId: session.company_id,
      role
    });
    redirect(path);
  }
  redirect(EXHIBITOR_WEB_ENTRY_RESOLVER_PATH);
}
