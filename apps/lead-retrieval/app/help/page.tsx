import type { ReactNode } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { HelpHome } from "@/components/help/help-home";
import { AppShell } from "@/components/layout/app-shell";
import { requireAuth } from "@/lib/auth/session";
import { getAllHelpArticles, getHelpCategories } from "@/lib/help/help-content";

const SUPPORT_EMAIL = "support@signalthread.ai";
const MOBILE_APP_URL =
  process.env.NEXT_PUBLIC_MOBILE_APP_DOWNLOAD_URL ??
  "https://apps.apple.com/app/signalthread-lead-retrieval/id6768739448";

type HelpSessionUser = Awaited<ReturnType<typeof requireAuth>>;

export default async function HelpPage() {
  const sessionUser = await requireAuth();
  const categories = getHelpCategories();
  const articles = getAllHelpArticles();

  return renderHelpShell(
    sessionUser,
    <HelpHome
      categories={categories}
      articles={articles}
      supportEmail={SUPPORT_EMAIL}
      mobileAppUrl={MOBILE_APP_URL}
      adminPortalUrl={getHelpAdminPortalUrl(sessionUser.role)}
    />
  );
}

function getHelpAdminPortalUrl(role: HelpSessionUser["role"]) {
  if (role === "platform_admin") return "/admin";
  if (role === "organizer_admin") return "/app/organizer";
  return "/exhibitor/dashboard";
}

function renderHelpShell(sessionUser: HelpSessionUser, children: ReactNode) {
  if (sessionUser.role === "platform_admin") {
    return <AdminShell sessionUser={sessionUser}>{children}</AdminShell>;
  }

  return <AppShell sessionUser={sessionUser}>{children}</AppShell>;
}
