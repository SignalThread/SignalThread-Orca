import type { ReactNode } from "react";
import { UserRole } from "@prisma/client";
import { redirect } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { createServerSupabaseClient } from "@/src/lib/supabase/server";

function normalizeEmail(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const normalizedEmail = normalizeEmail(user.email);
  if (!normalizedEmail) {
    redirect("/dashboard");
  }

  const appUser = await getPrisma().user.findUnique({
    where: { email: normalizedEmail },
    select: { role: true },
  });

  if (!appUser || appUser.role !== UserRole.SUPER_ADMIN) {
    redirect("/dashboard");
  }

  return children;
}
