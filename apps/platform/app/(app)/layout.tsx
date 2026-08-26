import { redirect } from "next/navigation";
import { createPlatformServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * The authenticated Platform shell.
 *
 * Middleware already gates these routes, but the check is repeated here on
 * purpose: a layout that renders authenticated chrome must not depend on
 * middleware matcher configuration staying correct forever. `getUser()` verifies
 * with the auth server rather than trusting the cookie's contents.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createPlatformServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/signin");

  return (
    <div className="min-h-screen">
      <header className="border-b" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <span className="text-sm font-semibold tracking-tight" style={{ color: "var(--signalthread-ink)" }}>
            SignalThread
          </span>

          <div className="flex items-center gap-4">
            <span className="text-xs" style={{ color: "var(--signalthread-muted)" }}>
              {user.email}
            </span>
            {/* A form POST, so no prefetch or embedded resource can trigger sign-out. */}
            <form action="/signout" method="post">
              <button
                type="submit"
                className="rounded-md border px-3 py-1.5 text-xs font-medium"
                style={{ borderColor: "var(--border)" }}
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
