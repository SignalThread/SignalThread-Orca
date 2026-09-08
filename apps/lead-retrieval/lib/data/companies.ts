import { getCurrentScopedUserContext } from "@/lib/data/exhibitor-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type CompanyRow = {
  id: string;
  name: string;
  organizer_id: string;
  created_at: string;
};

export async function createCompany(input: { name: string }) {
  const context = await getCurrentScopedUserContext();
  if (context.role !== "organizer_admin" && context.role !== "platform_admin") {
    throw new Error("Only event organizers can create companies");
  }

  const companyName = input.name.trim();
  if (!companyName) {
    throw new Error("Company name is required");
  }

  const supabase = await createSupabaseServerClient();
  const { data: company, error: createCompanyError } = (await supabase
    .from("companies")
    .insert({
      name: companyName,
      organizer_id: context.id
    } as never)
    .select("id, name, organizer_id, created_at")
    .single()) as { data: CompanyRow | null; error: { message: string; code?: string } | null };

  if (createCompanyError || !company) {
    throw new Error(
      `Failed to create company (${createCompanyError?.code ?? "no_code"}): ${createCompanyError?.message ?? "unknown"}`
    );
  }

  return { company, license: null };
}
