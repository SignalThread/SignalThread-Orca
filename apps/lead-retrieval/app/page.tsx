import { redirect } from "next/navigation";
import { getCurrentSessionUser } from "@/lib/auth/session";
import { EXHIBITOR_WEB_ENTRY_RESOLVER_PATH } from "@/lib/exhibitor/exhibitor-web-home";

export default async function HomePage() {
  const authUser = await getCurrentSessionUser();

  if (!authUser) {
    redirect("/login");
  }

  if (authUser.role === "platform_admin") {
    redirect("/admin");
  }

  if (authUser.role === "organizer_admin") {
    redirect("/app/organizer");
  }

  if (authUser.role === "exhibitor_admin" || authUser.role === "exhibitor_viewer") {
    redirect(EXHIBITOR_WEB_ENTRY_RESOLVER_PATH);
  }

  redirect("/login?error=role");
}
