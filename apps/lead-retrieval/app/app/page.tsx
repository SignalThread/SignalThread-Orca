import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/session";
import { EXHIBITOR_WEB_ENTRY_RESOLVER_PATH } from "@/lib/exhibitor/exhibitor-web-home";

export default async function AppHomePage() {
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

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-6">
      <h1 className="text-2xl font-semibold text-slate-950">Read-only access</h1>
      <p className="text-sm text-slate-600">
        Your account is signed in as an app user. Contact an administrator for exhibitor admin access if needed.
      </p>
      <div>
        <Link href="/login" className="text-sm font-semibold text-accent hover:underline">
          Switch account
        </Link>
      </div>
    </section>
  );
}
