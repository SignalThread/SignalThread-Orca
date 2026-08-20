import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { resolveAuthAuthorityConfig } from "@/src/lib/supabase/auth-authority";

export default async function ProtectedAppLayout({ children }: { children: ReactNode }) {
  // Session presence is decided by the authentication authority, not by the operational DB.
  const authAuthority = resolveAuthAuthorityConfig();
  const supabaseUrl = authAuthority?.url;
  const supabaseAnonKey = authAuthority?.anonKey;
  if (!supabaseUrl || !supabaseAnonKey) {
    redirect("/login");
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {},
      },
    },
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect("/login");
  }

  return <>{children}</>;
}
