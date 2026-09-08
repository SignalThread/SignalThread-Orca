import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/session";
import { EXHIBITOR_WEB_ENTRY_RESOLVER_PATH } from "@/lib/exhibitor/exhibitor-web-home";

export default async function DashboardRedirectPage() {
  const sessionUser = await requireAuth();
  if (!sessionUser.role) {
    redirect("/login?error=role");
  }

  if (sessionUser.role === "platform_admin") {
    redirect("/admin");
  }

  if (sessionUser.role === "organizer_admin") {
    redirect("/app/organizer");
  }
  if (sessionUser.role === "exhibitor_admin" || sessionUser.role === "exhibitor_viewer") {
    redirect(EXHIBITOR_WEB_ENTRY_RESOLVER_PATH);
  }
  redirect("/login?error=role");
}
