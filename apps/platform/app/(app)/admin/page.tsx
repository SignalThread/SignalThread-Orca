import { redirect } from "next/navigation";
import { getPlatformAdminClient } from "@/lib/server/admin-client";
import { requireUser } from "@/lib/server/guards";
import { isPlatformAdmin, getOrganizationAccessForUser } from "@/lib/server/registry";
import {
  createEvent,
  createOrganization,
  reconcileAllClaims,
  setEventMembership,
  setOrganizationMembership,
  setProductEntitlement,
} from "@/lib/server/admin-actions";
import { AdminForm, Field, SelectField } from "./_components/admin-form";
import { ReconcileButton } from "./_components/reconcile-button";

export const dynamic = "force-dynamic";

/**
 * Platform admin console.
 *
 * Every mutation is a server action behind `requirePlatformAdmin`; this page only
 * renders. Authority is checked against the canonical `platform_admins` table
 * rather than the JWT claim, so a stale token cannot open the console.
 */
export default async function AdminPage() {
  const user = await requireUser();
  if (!(await isPlatformAdmin(user.id))) redirect("/home");

  const supabase = getPlatformAdminClient();
  const [{ data: orgs }, { data: events }, { data: products }, { data: memberships }] =
    await Promise.all([
      supabase.from("organizations").select("id, slug, name, status").order("name"),
      supabase.from("events").select("id, slug, name, status, organization_id").order("name"),
      supabase.from("products").select("key, name").order("key"),
      supabase.from("organization_product_entitlements").select("organization_id, product_key, status"),
    ]);

  const orgOptions = (orgs ?? []).map((o) => ({ value: String(o.id), label: `${o.name} (${o.slug})` }));
  const eventOptions = (events ?? []).map((e) => ({ value: String(e.id), label: `${e.name} (${e.slug})` }));
  const productOptions = (products ?? []).map((p) => ({ value: String(p.key), label: String(p.name) }));

  // Effective access for the acting admin, so "inspect effective access" is answerable
  // without leaving the console.
  const effective = await getOrganizationAccessForUser(user.id);

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold" style={{ color: "var(--signalthread-ink)" }}>
          Platform admin
        </h1>
        <p className="text-sm" style={{ color: "var(--signalthread-muted)" }}>
          Registry management. All writes are server-side and re-derive affected claims.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold" style={{ color: "var(--signalthread-ink)" }}>
          Effective access
        </h2>
        <div
          className="overflow-x-auto rounded-xl border"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          <table className="w-full text-left text-xs">
            <thead>
              <tr style={{ color: "var(--signalthread-muted)" }}>
                <th className="px-4 py-2 font-medium">Organization</th>
                <th className="px-4 py-2 font-medium">Role</th>
                <th className="px-4 py-2 font-medium">Entitled products</th>
              </tr>
            </thead>
            <tbody data-testid="effective-access">
              {effective.length === 0 ? (
                <tr>
                  <td className="px-4 py-2" colSpan={3} style={{ color: "var(--signalthread-muted)" }}>
                    No organization access.
                  </td>
                </tr>
              ) : (
                effective.map((row) => (
                  <tr key={row.organizationId} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="px-4 py-2">{row.organizationName}</td>
                    <td className="px-4 py-2">{row.organizationRole}</td>
                    <td className="px-4 py-2">
                      {row.products.length > 0 ? row.products.join(", ") : "— none —"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <ReconcileButton action={reconcileAllClaims} />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <AdminForm
          action={createOrganization}
          title="Create organization"
          submitLabel="Create organization"
        >
          <Field label="Slug" name="slug" required />
          <Field label="Name" name="name" required />
        </AdminForm>

        <AdminForm
          action={setOrganizationMembership}
          title="Add or update organization membership"
          description="Changes authorization, so affected claims are re-derived immediately."
          submitLabel="Save membership"
        >
          <SelectField label="Organization" name="organizationId" options={orgOptions} />
          <Field label="User email" name="email" type="email" required />
          <SelectField
            label="Role"
            name="role"
            options={[
              { value: "MEMBER", label: "MEMBER" },
              { value: "ADMIN", label: "ADMIN" },
              { value: "OWNER", label: "OWNER" },
            ]}
          />
        </AdminForm>

        <AdminForm action={createEvent} title="Create event" submitLabel="Create event">
          <SelectField label="Organization" name="organizationId" options={orgOptions} />
          <Field label="Slug" name="slug" required />
          <Field label="Name" name="name" required />
        </AdminForm>

        <AdminForm
          action={setEventMembership}
          title="Add event membership"
          description="Event access is not carried in the JWT, so no session refresh is needed."
          submitLabel="Save event membership"
        >
          <SelectField label="Event" name="eventId" options={eventOptions} />
          <Field label="User email" name="email" type="email" required />
          <SelectField
            label="Role"
            name="role"
            options={[
              { value: "VIEWER", label: "VIEWER" },
              { value: "CONTRIBUTOR", label: "CONTRIBUTOR" },
              { value: "ORGANIZER", label: "ORGANIZER" },
            ]}
          />
        </AdminForm>

        <AdminForm
          action={setProductEntitlement}
          title="Enable or disable a product"
          description="Entitlement is organization-wide; every member's claim is re-derived."
          submitLabel="Apply entitlement"
        >
          <SelectField label="Organization" name="organizationId" options={orgOptions} />
          <SelectField label="Product" name="productKey" options={productOptions} />
          <SelectField
            label="State"
            name="enabled"
            options={[
              { value: "true", label: "Enabled" },
              { value: "false", label: "Disabled (suspended)" },
            ]}
          />
        </AdminForm>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold" style={{ color: "var(--signalthread-ink)" }}>
          Current entitlements
        </h2>
        <div
          className="overflow-x-auto rounded-xl border"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          <table className="w-full text-left text-xs">
            <thead>
              <tr style={{ color: "var(--signalthread-muted)" }}>
                <th className="px-4 py-2 font-medium">Organization</th>
                <th className="px-4 py-2 font-medium">Product</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {(memberships ?? []).map((row, index) => {
                const org = (orgs ?? []).find((o) => o.id === row.organization_id);
                return (
                  <tr key={index} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="px-4 py-2">{org?.name ?? String(row.organization_id)}</td>
                    <td className="px-4 py-2">{String(row.product_key)}</td>
                    <td className="px-4 py-2">{String(row.status)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
