import { getCurrentScopedUserContext } from "@/lib/data/exhibitor-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type Campaign = {
  id: string;
  name: string;
  status: string;
  created_at: string;
};

export async function getCampaigns() {
  const context = await getCurrentScopedUserContext();
  if (!context.companyId) {
    return [] as Campaign[];
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("campaigns")
    .select("id, name, status, created_at")
    .eq("company_id", context.companyId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("SUPABASE_ERROR", { fn: "getCampaigns", error });
    throw new Error(`${error.message} (${error.code ?? "no_code"})`);
  }

  return (data ?? []) as Campaign[];
}

export async function createCampaign(name: string) {
  const context = await getCurrentScopedUserContext();

  if (!context.companyId) {
    throw new Error("No company assigned");
  }

  if (context.role !== "organizer_admin" && context.role !== "platform_admin") {
    throw new Error("Only event organizers can create campaigns");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("campaigns")
    .insert({ company_id: context.companyId, name: name.trim() } as never);

  if (error) {
    throw new Error("Failed to create campaign");
  }
}
