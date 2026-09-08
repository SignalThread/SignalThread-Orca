import { redirect } from "next/navigation";
import { requireExhibitorScope } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getUserHasExhibitorAppAccess,
  getUserHasExhibitorWebAdminAccess
} from "@/lib/server/exhibitor-permission-aggregates";
import { resolveExhibitorWebAdminLandingPath } from "@/lib/server/exhibitor-web-entry-redirect";

export const dynamic = "force-dynamic";

export default async function ExhibitorAppAccessReadyPage() {
  const sessionUser = await requireExhibitorScope();
  const companyId = String(sessionUser.company_id ?? "").trim();
  if (companyId) {
    const hasWeb = await getUserHasExhibitorWebAdminAccess(sessionUser.id, companyId);
    if (hasWeb) {
      redirect(
        await resolveExhibitorWebAdminLandingPath({
          userId: sessionUser.id,
          companyId,
          role: sessionUser.role
        })
      );
    }
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const email = String(user?.email ?? "").trim();
  const hasApp =
    companyId.length > 0 ? await getUserHasExhibitorAppAccess(sessionUser.id, companyId) : false;

  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-lg flex-col justify-center gap-4 px-4 py-10">
      <h1 className="text-2xl font-semibold text-slate-900">Your mobile app access is ready.</h1>
      <p className="text-sm leading-relaxed text-slate-600">
        Open the <span className="font-medium">SignalThread Scan</span> mobile app and sign in with
        {email ? (
          <>
            {" "}
            <span className="font-mono text-slate-800">{email}</span>.
          </>
        ) : (
          " the same email you use for this account."
        )}
      </p>
      {hasApp ? (
        <p className="text-sm text-slate-500">Use the app for scanning and lead capture. Web admin uses a browser separately.</p>
      ) : null}
    </main>
  );
}
