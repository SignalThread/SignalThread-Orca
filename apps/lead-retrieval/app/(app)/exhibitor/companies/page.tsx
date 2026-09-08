import Link from "next/link";
import { PageHeader, PageShell } from "@/components/layout/page-header";
import { requireRole } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type SearchParams = {
  eventId?: string;
};

type CompanyRow = {
  id: string;
  name: string;
};

export default async function ExhibitorCompaniesPage({ searchParams }: { searchParams?: SearchParams }) {
  const sessionUser = await requireRole("exhibitor_admin");
  const supabase = await createSupabaseServerClient();

  const { data: currentUser } = (await supabase
    .from("users")
    .select("company_id")
    .eq("id", sessionUser.id)
    .maybeSingle()) as { data: { company_id: string | null } | null };

  const companyId = currentUser?.company_id ?? null;

  if (!companyId) {
    return (
      <PageShell>
        <PageHeader title="Companies" subtitle="Company list for your exhibitor account." />
        <div className="rounded-xl border bg-card p-6 text-sm text-slate-600">Your account is not assigned to a company yet.</div>
      </PageShell>
    );
  }

  const [{ data: companies, error: companiesError }, { count: leadCount }] = (await Promise.all([
    supabase.from("companies").select("id, name").eq("id", companyId),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("company_id", companyId)
  ])) as [
    { data: CompanyRow[] | null; error: { message: string } | null },
    { count: number | null; error: { message: string } | null }
  ];

  if (companiesError) {
    return (
      <PageShell>
        <PageHeader title="Companies" subtitle="Company list for your exhibitor account." />
        <div className="rounded-xl border bg-card p-6 text-sm text-rose-600">Failed to load companies: {companiesError.message}</div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader title="Companies" subtitle="Company list for your exhibitor account." />

      <div className="overflow-hidden rounded-xl border bg-card">
        <table className="w-full table-fixed text-left text-sm">
          <thead className="bg-slate-50 text-slate-700">
            <tr>
              <th className="w-[50%] px-3 py-3 font-semibold sm:px-4">Company</th>
              <th className="w-[20%] px-3 py-3 font-semibold sm:px-4">Total Leads</th>
              <th className="w-[30%] px-3 py-3 font-semibold sm:px-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(companies ?? []).map((company) => (
              <tr key={company.id} className="border-t">
                <td className="px-3 py-3 font-medium text-slate-900 sm:px-4">
                  <span className="block truncate" title={company.name}>
                    {company.name}
                  </span>
                </td>
                <td className="px-3 py-3 text-slate-700 sm:px-4">{leadCount ?? 0}</td>
                <td className="px-3 py-3 sm:px-4">
                  <Link
                    href={`/exhibitor/leads?companyId=${encodeURIComponent(company.id)}${
                      searchParams?.eventId ? `&eventId=${encodeURIComponent(searchParams.eventId)}` : ""
                    }`}
                    className="inline-flex rounded-lg border px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    View Leads
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageShell>
  );
}
