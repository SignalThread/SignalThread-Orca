import { AdminPageHeader } from "@/components/admin/admin-ui";

export function CompanyLicensesPageShell({
  title,
  subtitle,
  children
}: {
  title: string;
  subtitle: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="space-y-7">
      <AdminPageHeader
        title={title}
        subtitle={subtitle}
        tag="Company-Scoped License Dashboard"
      />

      <article className="rounded-2xl border border-border bg-card p-5 shadow-[0_1px_2px_rgba(15,23,42,0.06)] md:p-6">
        <div className="space-y-3 text-sm text-slate-600 md:text-base">
          <p>
            This route is reserved for the company-scoped access and licensing dashboard foundation.
          </p>
          {children ?? (
            <p>
              Product-specific company license workflows, reporting, and management surfaces will land
              here in a follow-up step.
            </p>
          )}
        </div>
      </article>
    </section>
  );
}
