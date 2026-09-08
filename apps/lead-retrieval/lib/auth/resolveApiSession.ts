import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUserHasExhibitorAppAccess } from "@/lib/server/exhibitor-permission-aggregates";
import { getValidatedPlatformAdminAccountContext } from "@/lib/server/platform-admin-account-context";
import { projectAccountContextOntoPrincipal } from "@/lib/auth/platform-admin-account-context-core";

type SessionUser = {
  userId: string;
  companyId: string;
  role: string;
  authenticatedCompanyId: string;
  activeCompanyId: string | null;
};
type ResolveApiSessionOptions = {
  enforceMobileAppAccess?: boolean;
};

function parseBearerToken(authorizationHeader: string | null) {
  if (!authorizationHeader) return null;
  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

function throwUnauthorized(): never {
  throw NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function resolveApiSession(
  request: Request,
  options: ResolveApiSessionOptions = {}
): Promise<SessionUser> {
  const enforceMobileAppAccess = options.enforceMobileAppAccess ?? true;
  const devBypassHeader = String(request.headers.get("x-dev-bypass") ?? "")
    .trim()
    .toLowerCase();

  if (devBypassHeader === "true" && process.env.NODE_ENV === "development") {
    console.log("DEV BYPASS HEADER: true");
    return {
      userId: "11111111-1111-1111-1111-111111111111",
      companyId: "ff131a4e-aa4e-450d-9d13-c75aa0ce6337",
      role: "exhibitor_admin",
      authenticatedCompanyId: "ff131a4e-aa4e-450d-9d13-c75aa0ce6337",
      activeCompanyId: null
    };
  }

  const bearerToken = parseBearerToken(request.headers.get("authorization"));
  const authClient = bearerToken ? createAdminClient() : await createSupabaseServerClient();
  const {
    data: { user },
    error: authError
  } = bearerToken
    ? await authClient.auth.getUser(bearerToken)
    : await authClient.auth.getUser();

  if (authError || !user?.id) {
    throwUnauthorized();
  }

  const { data: userRow, error: userRowError } = await (createAdminClient() as any)
    .from("users")
    .select("id, role, company_id, full_name")
    .eq("id", user.id)
    .maybeSingle();

  if (userRowError) {
    throwUnauthorized();
  }

  if (!userRow?.id) {
    return {
      userId: String(user.id),
      companyId: "",
      role: "",
      authenticatedCompanyId: "",
      activeCompanyId: null
    };
  }

  const role = String(userRow.role ?? "");
  const authenticatedCompanyId = String(userRow.company_id ?? "");
  const accountContext = bearerToken
    ? null
    : await getValidatedPlatformAdminAccountContext({ userId: String(userRow.id), role });
  const projection = projectAccountContextOntoPrincipal({
    principal: { userId: String(userRow.id), role, companyId: authenticatedCompanyId || null },
    context: accountContext
  });
  const companyId = projection.companyId ?? "";
  const isExhibitorScoped = role === "exhibitor_admin" || role === "exhibitor_viewer";

  if (bearerToken && isExhibitorScoped && enforceMobileAppAccess) {
    const hasApp = await getUserHasExhibitorAppAccess(String(userRow.id), companyId);
    if (!hasApp) {
      throw NextResponse.json(
        { error: "Mobile app access is not enabled for this account." },
        { status: 403 }
      );
    }
  }

  return {
    userId: String(userRow.id),
    companyId,
    role,
    authenticatedCompanyId: projection.authenticatedCompanyId ?? "",
    activeCompanyId: projection.activeCompanyId
  };
}
